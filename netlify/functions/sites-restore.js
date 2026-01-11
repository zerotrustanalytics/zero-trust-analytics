import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { restoreSite } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-restore', req, context);
  const origin = req.headers.get('origin');

  logger.info('Site restore request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate using shared helper (supports Clerk and legacy JWT)
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  // SECURITY: Validate CSRF token for legacy auth (Clerk handles its own CSRF)
  if (!auth.user.clerkUserId) {
    const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
    if (!csrfValidation.valid) {
      logger.warn('CSRF validation failed', { userId: auth.user.id });
      return Errors.csrfInvalid();
    }
  }

  try {
    const { siteId } = await req.json();

    if (!siteId) {
      logger.warn('Site restore failed - no site ID provided', { userId: auth.user.id });
      return Errors.validationError('Site ID required');
    }

    const result = await restoreSite(siteId, auth.user.id);

    if (result.error) {
      logger.warn('Site restore failed', { userId: auth.user.id, siteId, error: result.error });
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: getSecurityHeaders(origin)
      });
    }

    logger.info('Site restored successfully', { userId: auth.user.id, siteId });
    return successResponse({
      success: true,
      restored: true,
      site: {
        id: result.site.id,
        name: result.site.name,
        domain: result.site.domain
      }
    }, 200, origin);
  } catch (err) {
    logger.error('Site restore failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/restore'
};
