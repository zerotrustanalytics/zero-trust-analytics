import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getSite } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { createClient } from '@libsql/client';
import { Config } from './lib/config.js';

const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, context) {
  const logger = createFunctionLogger('sites-data-delete', req, context);
  const origin = req.headers.get('origin');

  logger.info('Site data deletion request received');

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
    const { siteId, mode, startDate, endDate } = await req.json();

    if (!siteId) {
      return Errors.validationError('Site ID required');
    }

    if (!mode || (mode !== 'range' && mode !== 'all')) {
      return Errors.validationError('Mode must be "range" or "all"');
    }

    if (mode === 'range') {
      if (!startDate || !endDate) {
        return Errors.validationError('startDate and endDate are required for range mode');
      }
      if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
        return Errors.validationError('Dates must be in YYYY-MM-DD format');
      }
      if (startDate > endDate) {
        return Errors.validationError('startDate must be before or equal to endDate');
      }
    }

    // Verify site belongs to user
    const site = await getSite(siteId);
    if (!site) {
      logger.warn('Data deletion failed - site not found', { userId: auth.user.id, siteId });
      return Errors.notFound('Site');
    }

    if (site.userId !== auth.user.id) {
      logger.warn('Data deletion failed - unauthorized', { userId: auth.user.id, siteId, siteUserId: site.userId });
      return Errors.forbidden('Not authorized to delete data for this site');
    }

    let statements;

    if (mode === 'all') {
      statements = [
        { sql: 'DELETE FROM pageviews WHERE site_id = ?', args: [siteId] },
        { sql: 'DELETE FROM daily_rollups WHERE site_id = ?', args: [siteId] },
        { sql: 'DELETE FROM page_rollups WHERE site_id = ?', args: [siteId] },
        { sql: 'DELETE FROM dimension_rollups WHERE site_id = ?', args: [siteId] },
        { sql: 'DELETE FROM utm_rollups WHERE site_id = ?', args: [siteId] },
        { sql: 'DELETE FROM monthly_usage WHERE site_id = ?', args: [siteId] },
      ];
    } else {
      // For pageviews, timestamp is ISO datetime; for rollups, date is YYYY-MM-DD
      const rangeStart = `${startDate}T00:00:00.000Z`;
      const rangeEnd = `${endDate}T23:59:59.999Z`;
      // monthly_usage uses YYYY-MM format
      const monthStart = startDate.substring(0, 7);
      const monthEnd = endDate.substring(0, 7);

      statements = [
        { sql: 'DELETE FROM pageviews WHERE site_id = ? AND timestamp BETWEEN ? AND ?', args: [siteId, rangeStart, rangeEnd] },
        { sql: 'DELETE FROM daily_rollups WHERE site_id = ? AND date BETWEEN ? AND ?', args: [siteId, startDate, endDate] },
        { sql: 'DELETE FROM page_rollups WHERE site_id = ? AND date BETWEEN ? AND ?', args: [siteId, startDate, endDate] },
        { sql: 'DELETE FROM dimension_rollups WHERE site_id = ? AND date BETWEEN ? AND ?', args: [siteId, startDate, endDate] },
        { sql: 'DELETE FROM utm_rollups WHERE site_id = ? AND date BETWEEN ? AND ?', args: [siteId, startDate, endDate] },
        { sql: 'DELETE FROM monthly_usage WHERE site_id = ? AND month BETWEEN ? AND ?', args: [siteId, monthStart, monthEnd] },
      ];
    }

    const results = await turso.batch(statements);

    const deleted = {
      pageviews: results[0].rowsAffected,
      daily_rollups: results[1].rowsAffected,
      page_rollups: results[2].rowsAffected,
      dimension_rollups: results[3].rowsAffected,
      utm_rollups: results[4].rowsAffected,
      monthly_usage: results[5].rowsAffected,
    };

    const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);

    logger.info('Site data deleted successfully', {
      userId: auth.user.id,
      siteId,
      mode,
      startDate: startDate || null,
      endDate: endDate || null,
      deleted,
      totalDeleted
    });

    return successResponse({
      success: true,
      mode,
      startDate: startDate || null,
      endDate: endDate || null,
      deleted,
      totalDeleted,
      message: mode === 'all'
        ? `All analytics data purged for this site (${totalDeleted} rows deleted).`
        : `Data from ${startDate} to ${endDate} deleted (${totalDeleted} rows deleted).`
    }, 200, origin);
  } catch (err) {
    logger.error('Site data deletion failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/sites/data/delete'
};
