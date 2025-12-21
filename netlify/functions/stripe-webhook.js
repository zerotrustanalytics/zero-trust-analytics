import Stripe from 'stripe';
import { getUser, updateUser, getUserByCustomerId } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, ExternalServiceError } from './lib/error-handler.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, context) {
  const logger = createFunctionLogger('stripe-webhook', req, context);

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
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
    logger.info('Stripe webhook signature verified', {
      eventType: event.type,
      eventId: event.id
    });
  } catch (err) {
    logger.error('Webhook signature verification failed', err);
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

        logger.info('Processing checkout.session.completed', {
          sessionId: session.id,
          customerId: session.customer,
          hasEmail: !!email
        });

        if (email) {
          await updateUser(email, {
            subscription: {
              status: 'active',
              customerId: session.customer,
              subscriptionId: session.subscription,
              createdAt: new Date().toISOString()
            }
          });
          logger.info('User subscription activated', {
            customerId: session.customer
          });
        } else {
          logger.warn('Checkout completed but no email found', {
            sessionId: session.id
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const user = await getUserByCustomerId(subscription.customer);

        logger.info('Processing customer.subscription.updated', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          userFound: !!user
        });

        if (user) {
          // Map Stripe subscription status to our status
          const statusMap = {
            'active': 'active',
            'past_due': 'past_due',
            'canceled': 'canceled',
            'unpaid': 'unpaid',
            'trialing': 'active',
            'incomplete': 'incomplete',
            'incomplete_expired': 'expired',
            'paused': 'paused'
          };

          const mappedStatus = statusMap[subscription.status] || subscription.status;

          await updateUser(user.email, {
            subscription: {
              ...user.subscription,
              status: mappedStatus,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: new Date().toISOString()
            }
          });

          logger.info('Subscription updated successfully', {
            userId: user.id,
            customerId: subscription.customer,
            newStatus: mappedStatus,
            cancelAtPeriodEnd: subscription.cancel_at_period_end
          });
        } else {
          logger.warn('Subscription update received but user not found', {
            customerId: subscription.customer
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await getUserByCustomerId(subscription.customer);

        logger.info('Processing customer.subscription.deleted', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          userFound: !!user
        });

        if (user) {
          await updateUser(user.email, {
            subscription: {
              ...user.subscription,
              status: 'canceled',
              canceledAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          });

          logger.info('Subscription canceled successfully', {
            userId: user.id,
            customerId: subscription.customer
          });
        } else {
          logger.warn('Subscription deletion received but user not found', {
            customerId: subscription.customer
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await getUserByCustomerId(invoice.customer);

        logger.warn('Processing invoice.payment_failed', {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          userFound: !!user,
          attemptCount: invoice.attempt_count
        });

        if (user) {
          await updateUser(user.email, {
            subscription: {
              ...user.subscription,
              status: 'past_due',
              lastPaymentError: invoice.last_finalization_error?.message || 'Payment failed',
              updatedAt: new Date().toISOString()
            }
          });

          logger.warn('User subscription marked as past_due', {
            userId: user.id,
            customerId: invoice.customer,
            errorMessage: invoice.last_finalization_error?.message
          });
        } else {
          logger.warn('Payment failed but user not found', {
            customerId: invoice.customer
          });
        }
        break;
      }

      default:
        logger.debug('Unhandled webhook event type', {
          eventType: event.type,
          eventId: event.id
        });
    }

    logger.info('Webhook processed successfully', {
      eventType: event.type,
      eventId: event.id
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return handleError(err, logger, null);
  }
}

export const config = {
  path: '/api/stripe/webhook'
};
