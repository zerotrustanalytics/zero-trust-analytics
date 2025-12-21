import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getSite, updateSite, getUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-update', req, context);
  const origin = req.headers.get('origin');

  logger.info('Site update request received');

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
    const { siteId, domain, nickname } = await req.json();

    if (!siteId) {
      logger.warn('Site update failed - no site ID provided', { userId: auth.user.id });
      return Errors.validationError('Site ID required');
    }

    // Verify site belongs to user
    const site = await getSite(siteId);
    if (!site) {
      logger.warn('Site update failed - site not found', { userId: auth.user.id, siteId });
      return Errors.notFound('Site');
    }

    const user = await getUser(auth.user.email);
    if (!user || site.userId !== user.id) {
      logger.warn('Site update failed - unauthorized', { userId: auth.user.id, siteId, siteUserId: site.userId });
      return Errors.forbidden('Not authorized to update this site');
    }

    // Build update object
    const updates = {};
    if (domain) {
      updates.domain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    if (nickname !== undefined) {
      updates.nickname = nickname.trim() || null;
    }

    logger.debug('Updating site', { userId: user.id, siteId, updates });
    const updated = await updateSite(siteId, updates);

    logger.info('Site updated successfully', { userId: user.id, siteId });
    return successResponse({ success: true, site: updated }, 200, origin);
  } catch (err) {
    logger.error('Site update failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/update'
};
