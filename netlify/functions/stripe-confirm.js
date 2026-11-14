import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { getBilling, ensureMigrated } from './lib/billing.js';
import { billingErrorResponse, notConfigured } from './lib/billing-http.js';

/**
 * The return-from-checkout page asks here: POST { sessionId }. Stripe is asked about the session (the URL's word
 * is never trusted), so the plan is active when the customer lands back on the dashboard even before the webhook.
 */
export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-confirm', req, context);
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return corsPreflightResponse(origin, 'POST, OPTIONS');
  if (req.method !== 'POST') return Errors.methodNotAllowed();

  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: getSecurityHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !auth.user.email) return Errors.badRequest('Invalid checkout session');

    const ctx = getBilling();
    if (!ctx) return notConfigured(origin);
    await ensureMigrated(ctx);
    const { status, applied } = await ctx.billing.confirm(auth.user.email, sessionId);
    return successResponse({ status: status.status, plan: status.plan, applied }, 200, origin);
  } catch (err) {
    logger.error('Stripe confirm failed', err, { userId: auth.user.id });
    return billingErrorResponse(err, logger, origin);
  }
}

export const config = {
  path: '/api/stripe/confirm'
};
