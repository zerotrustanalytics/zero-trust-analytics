import { createFunctionLogger } from './lib/logger.js';
import { getBilling, ensureMigrated } from './lib/billing.js';

const CLEANUP_SECRET = process.env.CLEANUP_SECRET || process.env.ADMIN_SECRET;

/**
 * Ask Stripe about every account with billing state and apply it the way the webhook would (launchkit syncAll).
 * Backstop for a missed webhook, and the way a server Stripe can't reach (the self-host box) stays in step.
 *
 * Runs hourly (config.schedule), or POST with X-Cleanup-Key (/api/stripe-sync on the self-host server). Idempotent.
 */
export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-sync', req, context);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const key = req.headers.get('x-cleanup-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (context?.triggerType !== 'scheduled' && (!CLEANUP_SECRET || key !== CLEANUP_SECRET)) return json({ error: 'Unauthorized' }, 401);

  const ctx = getBilling();
  if (!ctx) return json({ skipped: 'STRIPE_SECRET_KEY not set' }, 200);

  try {
    await ensureMigrated(ctx);
    const out = await ctx.billing.syncAll();
    if (out.failed.length) logger.warn('Stripe sync: some accounts failed', { failed: out.failed });
    logger.info('Stripe sync finished', { synced: out.synced.length, failed: out.failed.length });
    return json({ synced: out.synced.length, failed: out.failed.length });
  } catch (err) {
    logger.error('Stripe sync failed', err);
    return json({ error: 'Stripe sync failed' }, 500);
  }
}

export const config = {
  // Scheduled functions can't have custom paths on Netlify; manual: POST /.netlify/functions/stripe-sync
  schedule: '@hourly'
};
