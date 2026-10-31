import { listSitesWithEvents, purgeEventsBefore } from './lib/turso.js';
import { getSite, getUserById } from './lib/storage.js';
import { Config, effectivePlan } from './lib/config.js';
import { createFunctionLogger } from './lib/logger.js';

const CLEANUP_SECRET = process.env.CLEANUP_SECRET || process.env.ADMIN_SECRET;

// Raw events are only deleted when explicitly enabled; otherwise every run is
// a dry run that reports what it would delete per site.
const ENFORCE = process.env.RETENTION_PURGE === 'enforce';

/**
 * Enforce per-plan data retention (Config.pricing.dataRetention)
 *
 * Deletes raw events older than the site owner's plan window. Rollup tables
 * (daily/page/dimension/utm) are kept, so historical charts and totals survive;
 * only row-level detail ages out.
 *
 * Can be triggered by:
 * - The self-host server's scheduler (config.schedule)
 * - Manual call with admin/cleanup secret
 *
 * Usage:
 * POST /api/retention-purge
 * Headers: { "X-Cleanup-Key": "your-cleanup-secret" }
 *
 * Set RETENTION_PURGE=enforce to actually delete.
 */
export default async function handler(req, context) {
  const logger = createFunctionLogger('retention-purge', req, context);

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
    logger.warn('Retention purge unauthorized');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const retention = Config.pricing.dataRetention;
    const results = [];
    const skipped = [];

    for (const siteId of await listSitesWithEvents()) {
      const site = await getSite(siteId);
      if (!site) {
        // Deleted or unknown site — cleanup-expired owns deleted-site data.
        skipped.push({ siteId, reason: 'site not found' });
        continue;
      }
      const owner = site.userId ? await getUserById(site.userId) : null;
      const plan = effectivePlan(owner);
      const days = retention[plan] ?? retention.free;
      if (!Number.isFinite(days)) continue; // unlimited retention

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').split('.')[0];
      const result = await purgeEventsBefore(siteId, cutoff, { dryRun: !ENFORCE });
      if (result.rows > 0) results.push({ ...result, plan, retentionDays: days });
    }

    const total = results.reduce((sum, r) => sum + r.rows, 0);
    logger.info(ENFORCE ? 'Retention purge completed' : 'Retention purge dry run completed', {
      enforce: ENFORCE,
      sites: results.length,
      rows: total,
      skipped: skipped.length
    });
    for (const r of results) {
      logger.info(ENFORCE ? 'Purged site events' : 'Would purge site events', r);
    }

    return new Response(JSON.stringify({
      success: true,
      enforce: ENFORCE,
      rows: total,
      sites: results,
      skipped
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.error('Retention purge failed', err);
    return new Response(JSON.stringify({ error: 'Retention purge failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  schedule: '@daily'
};
