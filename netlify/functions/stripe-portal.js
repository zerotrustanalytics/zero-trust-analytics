import Stripe from 'stripe';
import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    // Get user email - fetch from Clerk if not in auth token
    let userEmail = auth.user.email;
    if (!userEmail && auth.user.id?.startsWith('user_')) {
      try {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.user.id}`, {
          headers: {
            'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          const primaryEmail = clerkUser.email_addresses?.find(e => e.id === clerkUser.primary_email_address_id);
          userEmail = primaryEmail?.email_address || clerkUser.email_addresses?.[0]?.email_address;
        }
      } catch (clerkErr) {
        logger.warn('Failed to fetch email from Clerk', { error: clerkErr.message });
      }
    }

    const user = userEmail ? await getUser(userEmail) : null;

    if (!user || !user.subscription || !user.subscription.customerId) {
      logger.warn('Portal access failed - no active subscription', { userId: user?.id, hasUser: !!user });
      return Errors.badRequest('No active subscription');
    }

    logger.info('Creating Stripe portal session', { userId: user.id, customerId: user.subscription.customerId });

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.subscription.customerId,
      return_url: `${process.env.URL || 'https://app.ztas.io'}/dashboard/`
    });

    logger.info('Stripe portal session created successfully', { userId: user.id });
    return successResponse({ url: session.url }, 200, origin);
  } catch (err) {
    logger.error('Stripe portal failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/stripe/portal'
};
