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
 * GET /api/admin/usage/customer?userId=X - Get customer details
 * GET /api/admin/usage/site?siteId=X - Get site daily usage
 * GET /api/admin/usage/cache - Get cache metrics
 * GET /api/admin/usage/debug-sites - Debug: all sites with domain mapping
 * POST /api/admin/usage/tag - Tag a customer
 * POST /api/admin/usage/support-log - Log support time
 * POST /api/admin/usage/init - Initialize schema
 * POST /api/admin/usage/backfill - Backfill daily_usage from pageviews
 * POST /api/admin/usage/wipe-usage - Wipe daily_usage table only
 * POST /api/admin/usage/wipe-pageviews - DANGER: Wipe ALL data (pageviews + usage)
 * POST /api/admin/usage/delete-site - Delete a site and all its data
 * POST /api/admin/usage/delete-user - Delete a user and all their sites/data
 * POST /api/admin/usage/list-users - List all users
 * POST /api/admin/usage/cache/reset - Reset cache metrics
 */

import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { getCacheMetrics, resetCacheMetrics } from './lib/cache.js';
import { turso } from './lib/turso.js';
import { getStore } from '@netlify/blobs';
import { getUserById } from './lib/storage.js';
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
        'Access-Control-Allow-Origin': process.env.CORS_ADMIN_ORIGIN || 'https://ztas.io',
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

    case '/debug-sites': {
      // Debug: show all sites in pageviews table WITH domain mapping
      logger.info('Debug sites requested');
      const sitesStore = getStore({ name: 'sites', consistency: 'strong' });

      const result = await turso.execute({
        sql: `SELECT site_id, COUNT(*) as pageviews, MIN(timestamp) as first, MAX(timestamp) as last
              FROM pageviews
              GROUP BY site_id
              ORDER BY pageviews DESC`
      });

      // Get domain mapping for each site
      const sitesWithDomains = await Promise.all(
        result.rows.map(async (row) => {
          let domain = 'unknown';
          let userId = 'unknown';
          try {
            const site = await sitesStore.get(row.site_id, { type: 'json' });
            if (site) {
              domain = site.domain || 'unknown';
              userId = site.userId || 'unknown';
            }
          } catch (e) {}
          return { ...row, domain, userId };
        })
      );

      return jsonResponse({ sites: sitesWithDomains });
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
          error: 'Backfill failed'
        }, 500);
      }
    }

    case '/wipe-usage': {
      // Wipe daily_usage table (use before backfill to get clean data)
      logger.info('Wiping daily_usage table');
      try {
        await turso.execute('DELETE FROM daily_usage');
        logger.info('daily_usage table wiped');
        return jsonResponse({ success: true, message: 'daily_usage table wiped' });
      } catch (err) {
        logger.error('Wipe failed', err);
        return jsonResponse({ error: 'Wipe failed', message: err.message }, 500);
      }
    }

    case '/wipe-pageviews': {
      // Wipe all pageviews (DANGER: use only for full reset)
      logger.info('Wiping pageviews table');
      try {
        // Get count before delete
        const countResult = await turso.execute('SELECT COUNT(*) as count FROM pageviews');
        const count = countResult.rows[0]?.count || 0;

        await turso.execute('DELETE FROM pageviews');
        await turso.execute('DELETE FROM daily_usage');
        await turso.execute('DELETE FROM monthly_usage');

        logger.info('All usage data wiped', { deletedPageviews: count });
        return jsonResponse({
          success: true,
          message: 'All usage data wiped',
          deletedPageviews: Number(count)
        });
      } catch (err) {
        logger.error('Wipe failed', err);
        return jsonResponse({ error: 'Wipe failed', message: err.message }, 500);
      }
    }

    case '/delete-site': {
      // Hard delete a site and all its data
      const { siteId } = body;
      if (!siteId) {
        return jsonResponse({ error: 'siteId required' }, 400);
      }
      logger.info('Admin deleting site', { siteId });
      try {
        const sitesStore = getStore({ name: 'sites', consistency: 'strong' });

        // Get site info before deleting
        const site = await sitesStore.get(siteId, { type: 'json' });

        // Delete from Turso (pageviews, daily_usage)
        await turso.execute({ sql: 'DELETE FROM pageviews WHERE site_id = ?', args: [siteId] });
        await turso.execute({ sql: 'DELETE FROM daily_usage WHERE site_id = ?', args: [siteId] });
        await turso.execute({ sql: 'DELETE FROM storage_metrics WHERE site_id = ?', args: [siteId] });

        // Delete from Netlify Blobs
        await sitesStore.delete(siteId);

        // Remove from user's site list if we have userId
        if (site?.userId) {
          const userSitesKey = `user_sites_${site.userId}`;
          try {
            let userSites = await sitesStore.get(userSitesKey, { type: 'json' }) || [];
            userSites = userSites.filter(id => id !== siteId);
            await sitesStore.setJSON(userSitesKey, userSites);
          } catch (e) {}

          // Also remove from deleted sites list
          const deletedSitesKey = `user_deleted_sites_${site.userId}`;
          try {
            let deletedSites = await sitesStore.get(deletedSitesKey, { type: 'json' }) || [];
            deletedSites = deletedSites.filter(id => id !== siteId);
            await sitesStore.setJSON(deletedSitesKey, deletedSites);
          } catch (e) {}
        }

        logger.info('Site deleted', { siteId, domain: site?.domain });
        return jsonResponse({
          success: true,
          message: 'Site deleted',
          siteId,
          domain: site?.domain
        });
      } catch (err) {
        logger.error('Delete site failed', err);
        return jsonResponse({ error: 'Delete failed', message: err.message }, 500);
      }
    }

    case '/delete-user': {
      // Hard delete a user and all their sites/data
      const { userId } = body;
      if (!userId) {
        return jsonResponse({ error: 'userId required' }, 400);
      }
      logger.info('Admin deleting user', { userId });
      try {
        const usersStore = getStore({ name: 'users', consistency: 'strong' });
        const sitesStore = getStore({ name: 'sites', consistency: 'strong' });

        // Get user info
        const user = await getUserById(userId);
        const deletedSites = [];

        // Get user's sites
        const userSitesKey = `user_sites_${userId}`;
        let userSites = [];
        try {
          userSites = await sitesStore.get(userSitesKey, { type: 'json' }) || [];
        } catch (e) {}

        // Also get deleted sites
        const deletedSitesKey = `user_deleted_sites_${userId}`;
        try {
          const deleted = await sitesStore.get(deletedSitesKey, { type: 'json' }) || [];
          userSites = [...userSites, ...deleted];
        } catch (e) {}

        // Delete all user's sites
        for (const siteId of userSites) {
          try {
            await turso.execute({ sql: 'DELETE FROM pageviews WHERE site_id = ?', args: [siteId] });
            await turso.execute({ sql: 'DELETE FROM daily_usage WHERE site_id = ?', args: [siteId] });
            await turso.execute({ sql: 'DELETE FROM storage_metrics WHERE site_id = ?', args: [siteId] });
            await sitesStore.delete(siteId);
            deletedSites.push(siteId);
          } catch (e) {
            logger.warn('Failed to delete site', { siteId, error: e.message });
          }
        }

        // Delete user site lists
        await sitesStore.delete(userSitesKey).catch(() => {});
        await sitesStore.delete(deletedSitesKey).catch(() => {});

        // Delete customer tags and support log
        await turso.execute({ sql: 'DELETE FROM customer_tags WHERE user_id = ?', args: [userId] });
        await turso.execute({ sql: 'DELETE FROM support_log WHERE user_id = ?', args: [userId] });

        // Delete user from users store
        if (user?.email) {
          await usersStore.delete(user.email);
          await usersStore.delete(`user_id_map_${userId}`).catch(() => {});
        }

        logger.info('User deleted', { userId, email: user?.email, sitesDeleted: deletedSites.length });
        return jsonResponse({
          success: true,
          message: 'User and all data deleted',
          userId,
          email: user?.email,
          sitesDeleted: deletedSites
        });
      } catch (err) {
        logger.error('Delete user failed', err);
        return jsonResponse({ error: 'Delete failed', message: err.message }, 500);
      }
    }

    case '/list-users': {
      // List all users for admin
      logger.info('Admin listing users');
      try {
        const usersStore = getStore({ name: 'users', consistency: 'strong' });
        const sitesStore = getStore({ name: 'sites', consistency: 'strong' });

        const { blobs } = await usersStore.list();
        const users = [];

        for (const blob of blobs) {
          // Skip non-user keys
          if (blob.key.startsWith('user_id_map_') || blob.key.startsWith('user_sites_') ||
              blob.key.startsWith('user_teams_') || blob.key.startsWith('user_log_') ||
              blob.key.startsWith('user_sessions_') || blob.key.startsWith('user_keys_')) {
            continue;
          }

          try {
            const user = await usersStore.get(blob.key, { type: 'json' });
            if (user?.id) {
              // Get site count
              let siteCount = 0;
              try {
                const userSites = await sitesStore.get(`user_sites_${user.id}`, { type: 'json' });
                siteCount = userSites?.length || 0;
              } catch (e) {}

              users.push({
                id: user.id,
                email: blob.key,
                plan: user.plan,
                createdAt: user.createdAt,
                siteCount
              });
            }
          } catch (e) {}
        }

        return jsonResponse({ users, count: users.length });
      } catch (err) {
        logger.error('List users failed', err);
        return jsonResponse({ error: 'List failed', message: err.message }, 500);
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
      'Access-Control-Allow-Origin': process.env.CORS_ADMIN_ORIGIN || 'https://ztas.io'
    }
  });
}

export const config = {
  path: ['/api/admin/usage', '/api/admin/usage/*']
};
