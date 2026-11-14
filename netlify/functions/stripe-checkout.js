import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser, getUserById } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { Config } from './lib/config.js';
import { getBilling, ensureMigrated } from './lib/billing.js';
import { billingErrorResponse, notConfigured } from './lib/billing-http.js';
import { keyPart } from '../../vendor/launchkit/store.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-checkout', req, context);
  const origin = req.headers.get('origin');

  logger.info('Stripe checkout request received');

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
    // Parse request body for plan selection
    const body = await req.json().catch(() => ({}));
    const selectedPlan = body.plan || 'starter';

    // Validate plan exists and has a price
    const planConfig = Config.pricing.tiers[selectedPlan];
    if (!planConfig) {
      logger.warn('Invalid plan selected', { plan: selectedPlan });
      return Errors.badRequest('Invalid plan selected');
    }

    if (!planConfig.stripePriceId) {
      logger.warn('Plan has no Stripe price', { plan: selectedPlan });
      return Errors.badRequest('This plan is not available for purchase');
    }

    // Get user - try email first, then by ID
    let user = null;
    let customerEmail = auth.user.email;

    if (auth.user.email) {
      user = await getUser(auth.user.email);
    }
    if (!user && auth.user.id) {
      user = await getUserById(auth.user.id);
      customerEmail = customerEmail || user?.email;
    }

    logger.info('User lookup result', {
      authEmail: auth.user.email,
      userEmail: user?.email,
      customerEmail,
      userId: auth.user.id
    });

    if (!customerEmail) {
      logger.warn('No email available for checkout', { userId: auth.user.id });
      return Errors.badRequest('Email address required for checkout. Please update your profile.');
    }

    const ctx = getBilling();
    if (!ctx) return notConfigured(origin);
    const { billing, kv } = ctx;
    await ensureMigrated(ctx);

    // Already on this plan: say so. (A different plan is changed in the billing portal; launchkit refuses a second
    // live subscription, which is what stops a customer paying for two.)
    const current = await billing.status(customerEmail);
    if (['active', 'trialing'].includes(current.status) && current.plan === selectedPlan) {
      logger.warn('Checkout failed - already subscribed to this plan', { userId: user?.id, plan: selectedPlan });
      return Errors.badRequest('Already subscribed to this plan. Use the billing portal to manage your subscription.');
    }

    // So a first-time (gatekeep/Clerk) customer's webhook can create their user record with their own id.
    if (auth.user.id) await kv.set(`profiles/${keyPart(customerEmail)}`, { userId: auth.user.id });

    logger.info('Creating Stripe checkout session', { userId: auth.user.id, plan: selectedPlan, email: customerEmail });

    const base = process.env.URL || 'https://app.ztas.io';
    let url;
    try {
      url = await billing.checkout(customerEmail, {
        planId: selectedPlan,
        customerEmail,
        successUrl: `${base}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/dashboard/billing?canceled=true`
      });
    } catch (err) {
      if (err.code === 'already-subscribed') {
        return Errors.badRequest('You already have a subscription. Use the billing portal to change your plan.');
      }
      throw err;
    }

    logger.info('Stripe checkout session created successfully', { userId: auth.user.id });
    return successResponse({ url }, 200, origin);
  } catch (err) {
    logger.error('Stripe checkout failed', err, { userId: auth.user.id });
    return billingErrorResponse(err, logger, origin);
  }
}

export const config = {
  path: '/api/stripe/checkout'
};
