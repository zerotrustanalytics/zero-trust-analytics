import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getSite, deleteSite, getUserById } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { Config } from './lib/config.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-delete', req, context);
  const origin = req.headers.get('origin');

  logger.info('Site deletion request received');

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
      logger.warn('Site deletion failed - no site ID provided', { userId: auth.user.id });
      return Errors.validationError('Site ID required');
    }

    // Verify site belongs to user
    const site = await getSite(siteId);
    if (!site) {
      logger.warn('Site deletion failed - site not found', { userId: auth.user.id, siteId });
      return Errors.notFound('Site');
    }

    // Check ownership: site.userId should match the authenticated user's ID
    if (site.userId !== auth.user.id) {
      logger.warn('Site deletion failed - unauthorized', { userId: auth.user.id, siteId, siteUserId: site.userId });
      return Errors.forbidden('Not authorized to delete this site');
    }

    // Get user's plan for soft delete retention period
    const user = await getUserById(auth.user.id);
    const plan = user?.plan || 'free';
    const result = await deleteSite(siteId, auth.user.id, plan);

    if (!result) {
      logger.warn('Site deletion failed - site not found', { userId: auth.user.id, siteId });
      return Errors.notFound('Site');
    }

    const retentionDays = Config.pricing.softDeleteRetention[plan] || 3;

    logger.info('Site soft-deleted successfully', {
      userId: auth.user.id,
      siteId,
      plan,
      expiresAt: result.expiresAt,
      retentionDays
    });

    return successResponse({
      success: true,
      softDeleted: true,
      expiresAt: result.expiresAt,
      retentionDays,
      message: `Site moved to trash. You can restore it within ${retentionDays} days.`
    }, 200, origin);
  } catch (err) {
    logger.error('Site deletion failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/delete'
};
