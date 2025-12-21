import Stripe from 'stripe';
import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

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

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const user = await getUser(auth.user.email);

    // Check if already subscribed
    if (user.subscription && user.subscription.status === 'active') {
      logger.warn('Checkout failed - already subscribed', { userId: user.id });
      return Errors.badRequest('Already subscribed');
    }

    logger.info('Creating Stripe checkout session', { userId: user.id });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: auth.user.email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // Stripe price ID from env
          quantity: 1
        }
      ],
      success_url: `${process.env.URL || 'https://zero-trust-analytics.netlify.app'}/dashboard/?success=true`,
      cancel_url: `${process.env.URL || 'https://zero-trust-analytics.netlify.app'}/dashboard/?canceled=true`,
      metadata: {
        userId: user.id,
        email: auth.user.email
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
