import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getSite, deleteSite, getUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

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

  // Authenticate using shared helper
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
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

    const user = await getUser(auth.user.email);
    if (!user || site.userId !== user.id) {
      logger.warn('Site deletion failed - unauthorized', { userId: auth.user.id, siteId, siteUserId: site.userId });
      return Errors.forbidden('Not authorized to delete this site');
    }

    await deleteSite(siteId, user.id);

    logger.info('Site deleted successfully', { userId: user.id, siteId });
    return successResponse({ success: true }, 200, origin);
  } catch (err) {
    logger.error('Site deletion failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/delete'
};
