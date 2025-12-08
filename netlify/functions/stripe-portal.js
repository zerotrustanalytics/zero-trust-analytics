import Stripe from 'stripe';
import { authenticateRequest } from './lib/auth.js';
import { getUser } from './lib/storage.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const user = await getUser(auth.user.email);

    if (!user.subscription || !user.subscription.customerId) {
      return new Response(JSON.stringify({ error: 'No active subscription' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.subscription.customerId,
      return_url: `${process.env.URL || 'https://zero-trust-analytics.netlify.app'}/dashboard/`
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create portal session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/stripe/portal'
};
