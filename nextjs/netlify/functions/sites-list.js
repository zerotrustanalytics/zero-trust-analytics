import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites, getSite } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-list', req, context);
  const origin = req.headers.get('origin');

  logger.info('Sites list request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const siteIds = await getUserSites(auth.user.id);
    logger.debug('Retrieved user site IDs', { userId: auth.user.id, count: siteIds.length });

    // Fetch full site details
    const sites = await Promise.all(
      siteIds.map(async (siteId) => {
        const site = await getSite(siteId);
        return site;
      })
    );

    const filteredSites = sites.filter(Boolean);
    logger.info('Sites list retrieved successfully', { userId: auth.user.id, count: filteredSites.length });

    return successResponse({
      success: true,
      sites: filteredSites
    }, 200, origin);
  } catch (err) {
    logger.error('Failed to list sites', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/list'
};
