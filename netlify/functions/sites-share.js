import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getSite, getUserSites, createPublicShare, getSiteShares, deletePublicShare } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-share', req, context);
  const origin = req.headers.get('origin');

  logger.info('Site share request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, POST, DELETE, OPTIONS');
  }

  // Authenticate request
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  const userId = auth.user.id;

  // SECURITY: Validate CSRF token for state-changing operations (POST, DELETE)
  if (req.method === 'POST' || req.method === 'DELETE') {
    const csrfValidation = validateCSRFFromRequest(req.headers, userId);
    if (!csrfValidation.valid) {
      logger.warn('CSRF validation failed', { userId });
      return Errors.csrfInvalid();
    }
  }

  // GET - List shares for a site
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');

    if (!siteId) {
      logger.warn('Get shares failed - no site ID', { userId });
      return Errors.validationError('Site ID required');
    }

    // Verify ownership
    const userSites = await getUserSites(userId);
    if (!userSites.includes(siteId)) {
      logger.warn('Get shares failed - access denied', { userId, siteId });
      return Errors.forbidden('Access denied');
    }

    const shares = await getSiteShares(siteId);
    logger.info('Shares retrieved successfully', { userId, siteId, count: shares.length });

    return successResponse({ shares }, 200, origin);
  }

  // POST - Create a new share
  if (req.method === 'POST') {
    try {
      const { siteId, expiresIn, password } = await req.json();

      if (!siteId) {
        logger.warn('Create share failed - no site ID', { userId });
        return Errors.validationError('Site ID required');
      }

      // Verify ownership
      const userSites = await getUserSites(userId);
      if (!userSites.includes(siteId)) {
        logger.warn('Create share failed - access denied', { userId, siteId });
        return Errors.forbidden('Access denied');
      }

      // Calculate expiration if specified
      let expiresAt = null;
      if (expiresIn) {
        const now = new Date();
        switch (expiresIn) {
          case '1d': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
          case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
          case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
          case '90d': expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); break;
        }
        if (expiresAt) expiresAt = expiresAt.toISOString();
      }

      logger.debug('Creating share', { userId, siteId, expiresIn, hasPassword: !!password });
      const share = await createPublicShare(siteId, userId, {
        expiresAt,
        password: password || null
      });

      // Get site info for the response
      const site = await getSite(siteId);

      logger.info('Share created successfully', { userId, siteId, shareToken: share.token });
      return successResponse({
        share,
        shareUrl: `https://ztas.io/shared/${share.token}`,
        site: { domain: site?.domain }
      }, 201, origin);

    } catch (err) {
      logger.error('Create share failed', err, { userId });
      return handleError(err, logger, origin);
    }
  }

  // DELETE - Revoke a share
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const shareToken = url.searchParams.get('token');

    if (!shareToken) {
      logger.warn('Delete share failed - no token', { userId });
      return Errors.validationError('Share token required');
    }

    const success = await deletePublicShare(shareToken, userId);

    if (!success) {
      logger.warn('Delete share failed - not found or access denied', { userId, shareToken });
      return Errors.notFound('Share not found or access denied');
    }

    logger.info('Share deleted successfully', { userId, shareToken });
    return successResponse({ success: true }, 200, origin);
  }

  logger.warn('Invalid HTTP method', { method: req.method });
  return Errors.methodNotAllowed();
}

export const config = {
  path: '/api/sites/share'
};
