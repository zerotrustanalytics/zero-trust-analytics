/**
 * ADMIN USAGE METRICS ENDPOINT
 * ============================
 * Internal endpoint for viewing usage metrics, customer tags, and support tracking.
 * Protected by admin authentication (env var ADMIN_SECRET).
 *
 * Endpoints:
 * GET /api/admin/usage - Get usage overview
 * GET /api/admin/usage/sites - Get top sites by usage
 * GET /api/admin/usage/storage - Get storage metrics
 * GET /api/admin/usage/pilots - Get pilot customers
 * GET /api/admin/usage/support - Get high support customers
 * POST /api/admin/usage/tag - Tag a customer
 * POST /api/admin/usage/support-log - Log support time
 * GET /api/admin/usage/cache - Get cache metrics
 */

import { createFunctionLogger } from './lib/logger.js';
import { handleError, ForbiddenError } from './lib/error-handler.js';
import { getCacheMetrics, resetCacheMetrics } from './lib/cache.js';
import {
  initUsageMetricsSchema,
  getAdminUsageReport,
  getTopSitesByUsage,
  getTotalStorage,
  getStorageGrowth,
  getPilotCustomers,
  getHighSupportCustomers,
  tagCustomer,
  getCustomerTags,
  logSupportTime,
  getSupportTime,
  getDailyUsage,
  getUserDailyUsage,
  backfillUsageFromPageviews
} from './lib/usage-metrics.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Verify admin authentication
 */
function authenticateAdmin(req) {
  const authHeader = req.headers.get('authorization');
  const apiKey = req.headers.get('x-admin-key');

  // Check bearer token or API key
  const token = authHeader?.replace('Bearer ', '') || apiKey;

  if (!ADMIN_SECRET) {
    return { error: 'Admin access not configured', status: 503 };
  }

  if (!token || token !== ADMIN_SECRET) {
    return { error: 'Unauthorized', status: 401 };
  }

  return { authenticated: true };
}

export default async function handler(req, context) {
  const logger = createFunctionLogger('admin-usage', req, context);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key'
      }
    });
  }

  // Authenticate admin
  const auth = authenticateAdmin(req);
  if (auth.error) {
    logger.warn('Admin authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/api/admin/usage', '');

    // Ensure schema is initialized
    await initUsageMetricsSchema();

    // Route handling
    switch (req.method) {
      case 'GET':
        return await handleGet(path, url, logger);
      case 'POST':
        return await handlePost(path, req, logger);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (err) {
    return handleError(err, logger, '*');
  }
}

async function handleGet(path, url, logger) {
  const days = parseInt(url.searchParams.get('days') || '30');
  const siteId = url.searchParams.get('siteId');
  const userId = url.searchParams.get('userId');

  switch (path) {
    case '':
    case '/': {
      // Full usage report
      logger.info('Admin usage report requested', { days });
      const report = await getAdminUsageReport(days);
      return jsonResponse(report);
    }

    case '/sites': {
      // Top sites by usage
      const limit = parseInt(url.searchParams.get('limit') || '20');
      logger.info('Top sites report requested', { days, limit });
      const sites = await getTopSitesByUsage(days, limit);
      return jsonResponse({ sites });
    }

    case '/storage': {
      // Storage metrics
      logger.info('Storage report requested');
      const storage = await getTotalStorage();

      // If siteId provided, get detailed growth
      if (siteId) {
        const weeks = parseInt(url.searchParams.get('weeks') || '4');
        const growth = await getStorageGrowth(siteId, weeks);
        return jsonResponse({ ...storage, siteGrowth: growth });
      }

      return jsonResponse(storage);
    }

    case '/pilots': {
      // Pilot customers
      logger.info('Pilot customers report requested');
      const pilots = await getPilotCustomers();
      return jsonResponse({ pilots });
    }

    case '/support': {
      // High support customers
      const threshold = parseFloat(url.searchParams.get('threshold') || '2');
      logger.info('High support customers requested', { threshold });
      const customers = await getHighSupportCustomers(threshold);
      return jsonResponse({ customers, threshold });
    }

    case '/customer': {
      // Get customer tags and support time
      if (!userId) {
        return jsonResponse({ error: 'userId required' }, 400);
      }
      logger.info('Customer details requested', { userId });
      const [tags, support, usage] = await Promise.all([
        getCustomerTags(userId),
        getSupportTime(userId),
        getUserDailyUsage(userId, days)
      ]);
      return jsonResponse({ userId, tags, support, usage });
    }

    case '/site': {
      // Get site daily usage
      if (!siteId) {
        return jsonResponse({ error: 'siteId required' }, 400);
      }
      logger.info('Site usage requested', { siteId, days });
      const usage = await getDailyUsage(siteId, days);
      return jsonResponse({ siteId, usage });
    }

    case '/cache': {
      // Cache metrics
      logger.info('Cache metrics requested');
      const metrics = getCacheMetrics();
      return jsonResponse(metrics);
    }

    default:
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
  }
}

async function handlePost(path, req, logger) {
  // Some endpoints don't need a body (like /backfill)
  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    // No body or invalid JSON - that's ok for some endpoints
  }

  switch (path) {
    case '/tag': {
      // Tag a customer
      const { userId, isPilot, isInternal, customerType, notes } = body;
      if (!userId) {
        return jsonResponse({ error: 'userId required' }, 400);
      }
      logger.info('Tagging customer', { userId, isPilot, isInternal, customerType });
      const tags = await tagCustomer(userId, { isPilot, isInternal, customerType, notes });
      return jsonResponse({ success: true, tags });
    }

    case '/support-log': {
      // Log support time
      const { userId, durationMinutes, category, notes } = body;
      if (!userId || !durationMinutes) {
        return jsonResponse({ error: 'userId and durationMinutes required' }, 400);
      }
      logger.info('Logging support time', { userId, durationMinutes, category });
      const result = await logSupportTime(userId, durationMinutes, category, notes);
      return jsonResponse({ success: true, ...result });
    }

    case '/cache/reset': {
      // Reset cache metrics
      logger.info('Resetting cache metrics');
      resetCacheMetrics();
      return jsonResponse({ success: true, message: 'Cache metrics reset' });
    }

    case '/init': {
      // Initialize schema (useful for first setup)
      logger.info('Initializing usage metrics schema');
      await initUsageMetricsSchema();
      return jsonResponse({ success: true, message: 'Schema initialized' });
    }

    case '/backfill': {
      // Backfill daily_usage from existing pageviews
      logger.info('Starting backfill from pageviews');
      try {
        const result = await backfillUsageFromPageviews();
        logger.info('Backfill completed', result);
        return jsonResponse(result);
      } catch (err) {
        logger.error('Backfill failed', err);
        return jsonResponse({
          error: 'Backfill failed',
          message: err.message,
          stack: err.stack
        }, 500);
      }
    }

    default:
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const config = {
  path: ['/api/admin/usage', '/api/admin/usage/*']
};
