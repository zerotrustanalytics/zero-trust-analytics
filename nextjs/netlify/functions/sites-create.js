import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { createSite, getUser } from './lib/storage.js';
import { generateSiteId } from './lib/hash.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { validateRequest, siteCreateSchema } from './lib/schemas.js';

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

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
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

  // SECURITY: Validate CSRF token for state-changing operations
  const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
  if (!csrfValidation.valid) {
    logger.warn('CSRF validation failed', { userId: auth.user.id });
    return Errors.csrfInvalid();
  }

  try {
    const body = await req.json();

    // SECURITY: Comprehensive input validation with sanitization
    const validated = validateRequest(siteCreateSchema, body, logger);
    const { domain } = validated;

    logger.debug('Input validation successful', { domain });

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
