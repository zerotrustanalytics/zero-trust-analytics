import Stripe from 'stripe';
import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { Config } from './lib/config.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    const user = await getUser(auth.user.email);

    // Check if already subscribed to same or higher plan
    if (user.subscription && user.subscription.status === 'active') {
      logger.warn('Checkout failed - already subscribed', { userId: user.id });
      return Errors.badRequest('Already subscribed. Use the billing portal to change plans.');
    }

    logger.info('Creating Stripe checkout session', { userId: user.id, plan: selectedPlan });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: auth.user.email,
      line_items: [
        {
          price: planConfig.stripePriceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.URL || 'https://app.ztas.io'}/dashboard/billing?success=true`,
      cancel_url: `${process.env.URL || 'https://app.ztas.io'}/dashboard/billing?canceled=true`,
      metadata: {
        userId: user.id,
        email: auth.user.email,
        plan: selectedPlan
      }
    });

    logger.info('Stripe checkout session created successfully', { userId: user.id, sessionId: session.id });
    return successResponse({ url: session.url }, 200, origin);
  } catch (err) {
    logger.error('Stripe checkout failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/stripe/checkout'
};
