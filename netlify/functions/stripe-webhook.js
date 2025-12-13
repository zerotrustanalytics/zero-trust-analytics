import Stripe from 'stripe';
import { getUser, updateUser } from './lib/storage.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.metadata.email;

        if (email) {
          await updateUser(email, {
            subscription: {
              status: 'active',
              customerId: session.customer,
              subscriptionId: session.subscription,
              createdAt: new Date().toISOString()
            }
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        // Find user by customer ID and update status
        // This is a simplified version - in production you'd want to store
        // a mapping of Stripe customer IDs to user emails
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        // In production, find user and update subscription status to 'canceled'
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // In production, notify user and/or update subscription status
        break;
      }

      default:
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(JSON.stringify({ error: 'Webhook handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/stripe/webhook'
};
