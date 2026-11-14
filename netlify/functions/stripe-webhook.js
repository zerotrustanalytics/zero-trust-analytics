import { createFunctionLogger } from './lib/logger.js';
import { getBilling, ensureMigrated } from './lib/billing.js';
import { BillingError } from '../../vendor/launchkit/billing.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-webhook', req, context);

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return json({ error: 'Method not allowed' }, 405);
  }

  const ctx = getBilling();
  if (!ctx || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    logger.error('Stripe billing is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)');
    return json({ error: 'Webhook not configured' }, 500);
  }

  try {
    // The signature covers the exact bytes: read the body raw, before anything parses it.
    const raw = new Uint8Array(await req.arrayBuffer());
    await ensureMigrated(ctx);
    const out = await ctx.billing.handleWebhook(raw, req.headers.get('stripe-signature'));
    logger.info('Webhook processed', { eventType: out.type, handled: out.handled, duplicate: !!out.duplicate, ignored: out.ignored });
    return json({ received: true });
  } catch (err) {
    if (err instanceof BillingError) {
      // Bad signature, stale timestamp, bad payload: Stripe sees the 4xx; our own configuration trouble is a 5xx.
      logger.error('Webhook rejected', { code: err.code });
      return json({ error: err.status >= 500 ? 'Webhook error' : err.code === 'bad-signature' || err.code === 'stale-timestamp' ? 'Invalid signature' : err.message }, err.status || 400);
    }
    // Anything else (store or Stripe trouble): 500, so Stripe retries the event.
    logger.error('Webhook failed', err);
    return json({ error: 'Webhook processing failed' }, 500);
  }
}

export const config = {
  path: '/api/stripe/webhook'
};
