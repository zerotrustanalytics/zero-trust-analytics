import { cleanupExpiredSites } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';

const CLEANUP_SECRET = process.env.CLEANUP_SECRET || process.env.ADMIN_SECRET;

/**
 * Cleanup expired soft-deleted sites
 *
 * Can be triggered by:
 * - Netlify scheduled function (cron)
 * - Manual call with admin/cleanup secret
 *
 * Usage:
 * POST /api/cleanup/expired
 * Headers: { "X-Cleanup-Key": "your-cleanup-secret" }
 */
export default async function handler(req, context) {
  const logger = createFunctionLogger('cleanup-expired', req, context);

  // Allow GET for Netlify scheduled functions, POST for manual triggers
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify authorization
  const cleanupKey = req.headers.get('x-cleanup-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  const isScheduled = context.triggerType === 'scheduled';

  if (!isScheduled && (!CLEANUP_SECRET || cleanupKey !== CLEANUP_SECRET)) {
    logger.warn('Cleanup unauthorized');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    logger.info('Starting cleanup of expired soft-deleted sites');

    const result = await cleanupExpiredSites();

    logger.info('Cleanup completed', {
      cleaned: result.cleaned,
      timestamp: result.timestamp
    });

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.error('Cleanup failed', err);
    return new Response(JSON.stringify({
      error: 'Cleanup failed',
      message: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/cleanup/expired',
  // Run daily at 3 AM UTC
  schedule: '@daily'
};
