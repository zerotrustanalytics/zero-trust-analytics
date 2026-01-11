import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { createSite, getUser, getUserById, getUserSites } from './lib/storage.js';
import { generateSiteId } from './lib/hash.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { validateRequest, siteCreateSchema } from './lib/schemas.js';
import { Config } from './lib/config.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('sites-create', req, context);

  logger.info('Site creation request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate (supports both Clerk and legacy JWT)
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', {
      error: auth.error,
      status: auth.status
    });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  logger.info('Request authenticated', { userId: auth.user.id });

  // SECURITY: Validate CSRF token for legacy auth (Clerk handles its own CSRF)
  if (!auth.user.clerkUserId) {
    const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
    if (!csrfValidation.valid) {
      logger.warn('CSRF validation failed', { userId: auth.user.id });
      return Errors.csrfInvalid();
    }
  }

  try {
    const body = await req.json();

    // SECURITY: Comprehensive input validation with sanitization
    const validated = validateRequest(siteCreateSchema, body, logger);
    const { domain } = validated;

    logger.debug('Input validation successful', { domain });

    // Check site limit based on plan (use getUserById since Clerk JWT doesn't include email)
    const user = await getUserById(auth.user.id);
    const plan = user?.plan || 'free';
    const siteLimit = Config.pricing.siteLimits[plan] || Config.pricing.siteLimits.free;
    const currentSites = await getUserSites(auth.user.id);
    const currentSiteCount = currentSites?.length || 0;

    logger.debug('Site limit check', { plan, siteLimit, currentSiteCount });

    if (siteLimit !== Infinity && currentSiteCount >= siteLimit) {
      logger.warn('Site limit reached', {
        userId: auth.user.id,
        plan,
        siteLimit,
        currentSiteCount
      });
      return new Response(JSON.stringify({
        error: 'Site limit reached',
        message: `Your ${plan} plan allows ${siteLimit} site${siteLimit !== 1 ? 's' : ''}. Upgrade to add more.`,
        currentCount: currentSiteCount,
        limit: siteLimit
      }), {
        status: 403,
        headers: getSecurityHeaders(origin)
      });
    }

    // Generate site ID and create
    const siteId = generateSiteId();
    const site = await createSite(auth.user.id, siteId, domain);

    logger.info('Site created successfully', {
      userId: auth.user.id,
      siteId,
      domain
    });

    return successResponse({
      success: true,
      site,
      embedCode: `<script src="https://ztas.io/js/analytics.js" data-site-id="${siteId}"></script>`
    }, 201, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/create'
};
