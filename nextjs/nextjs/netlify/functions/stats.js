import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites } from './lib/storage.js';
import { getStats } from './lib/turso.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, ForbiddenError } from './lib/error-handler.js';
import { validateRequest, statsQuerySchema, validateDateRangeInData } from './lib/schemas.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('stats', req, context);

  // Handle CORS preflight
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
    logger.warn('Authentication failed', {
      error: auth.error,
      status: auth.status
    });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  logger.info('Stats request authenticated', {
    userId: auth.user.id
  });

  try {
    const url = new URL(req.url);
    const queryParams = {
      siteId: url.searchParams.get('siteId'),
      period: url.searchParams.get('period'),
      startDate: url.searchParams.get('startDate'),
      endDate: url.searchParams.get('endDate')
    };

    // SECURITY: Comprehensive input validation with sanitization
    const validated = validateRequest(statsQuerySchema, queryParams, logger);
    const { siteId, period, startDate: customStart, endDate: customEnd } = validated;

    logger.debug('Input validation successful', { siteId, period });

    // Verify user owns this site
    const userSites = await getUserSites(auth.user.id);
    if (!userSites.includes(siteId)) {
      logger.warn('Access denied - user does not own site', {
        userId: auth.user.id,
        siteId,
        userSiteCount: userSites.length
      });
      return Errors.forbidden('Access denied');
    }

    logger.debug('Site ownership verified', {
      userId: auth.user.id,
      siteId,
      period,
      hasCustomDates: !!(customStart && customEnd)
    });

    // Calculate date range
    let endDate, startDate;

    if (customStart && customEnd) {
      // Additional validation for custom date range
      const dateRangeValidation = validateDateRangeInData({ startDate: customStart, endDate: customEnd });
      startDate = dateRangeValidation.startDate || new Date(customStart);
      endDate = dateRangeValidation.endDate || new Date(customEnd);
    } else {
      endDate = new Date();
      startDate = new Date();

      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '365d':
          startDate.setDate(startDate.getDate() - 365);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }
    }

    // Format dates for database query
    const startStr = startDate.toISOString().replace('T', ' ').split('.')[0];
    const endStr = endDate.toISOString().replace('T', ' ').split('.')[0];

    logger.info('Querying stats from database', {
      siteId,
      startDate: startStr,
      endDate: endStr,
      period
    });

    // Query database for stats
    const stats = await getStats(siteId, startStr, endStr);

    logger.info('Stats query successful', {
      siteId,
      hasData: !!stats,
      resultKeys: stats ? Object.keys(stats) : []
    });

    return successResponse(stats, 200, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/stats'
};
