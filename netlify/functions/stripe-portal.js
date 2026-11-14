import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { getBilling, ensureMigrated } from './lib/billing.js';
import { billingErrorResponse, notConfigured } from './lib/billing-http.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-portal', req, context);
  const origin = req.headers.get('origin');

  logger.info('Stripe portal request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate (supports Clerk and legacy JWT)
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const ctx = getBilling();
    if (!ctx) return notConfigured(origin);
    await ensureMigrated(ctx);

    const userEmail = auth.user.email;
    let url = null;
    if (userEmail) {
      try {
        url = await ctx.billing.portal(userEmail, {
          returnUrl: `${process.env.URL || 'https://app.ztas.io'}/dashboard/`
        });
      } catch (err) {
        if (err.code !== 'no-customer') throw err;
      }
    }

    if (!url) {
      logger.warn('Portal access failed - no active subscription', { userId: auth.user.id });
      return Errors.badRequest('No active subscription');
    }

    logger.info('Stripe portal session created successfully', { userId: auth.user.id });
    return successResponse({ url }, 200, origin);
  } catch (err) {
    logger.error('Stripe portal failed', err, { userId: auth.user.id });
    return billingErrorResponse(err, logger, origin);
  }
}

export const config = {
  path: '/api/stripe/portal'
};
