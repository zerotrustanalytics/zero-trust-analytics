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

    // Check if already subscribed
    if (user.subscription && user.subscription.status === 'active') {
      return new Response(JSON.stringify({ error: 'Already subscribed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: auth.user.email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // $10/month price ID
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

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/stripe/checkout'
};
