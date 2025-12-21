import { jest } from '@jest/globals';

// Mock @netlify/blobs
jest.unstable_mockModule('@netlify/blobs', () => {
  const stores = new Map();

  function createMockStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const data = stores.get(name);

    return {
      async get(key, options = {}) {
        const value = data.get(key);
        if (value === undefined) return null;
        if (options.type === 'json') {
          return JSON.parse(value);
        }
        return value;
      },
      async setJSON(key, value) {
        data.set(key, JSON.stringify(value));
      },
      async delete(key) {
        data.delete(key);
      },
      async list(options = {}) {
        const keys = Array.from(data.keys());
        return { blobs: keys.map(key => ({ key })) };
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

// Mock Stripe
let mockStripeEvent = null;
let shouldVerifySignature = true;

jest.unstable_mockModule('stripe', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: jest.fn((body, sig, secret) => {
          if (!shouldVerifySignature) {
            throw new Error('Invalid signature');
          }
          return mockStripeEvent;
        })
      }
    }))
  };
});

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Stripe Webhook Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    shouldVerifySignature = true;
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';

    // Create test users
    const usersStore = getStore({ name: 'users' });

    await usersStore.setJSON('testuser@example.com', {
      id: 'user_123',
      email: 'testuser@example.com',
      passwordHash: 'hashed',
      subscription: {
        status: 'trialing',
        customerId: 'cus_123',
        subscriptionId: null
      },
      createdAt: new Date().toISOString()
    });

    // Create customer lookup store
    const customersStore = getStore({ name: 'customers' });
    await customersStore.setJSON('cus_123', {
      email: 'testuser@example.com',
      userId: 'user_123'
    });
  });

  describe('POST /api/stripe/webhook', () => {
    it('should handle checkout.session.completed event', async () => {
      mockStripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_123',
            customer_email: 'testuser@example.com',
            subscription: 'sub_123',
            metadata: {}
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);

      // Verify user was updated
      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('active');
      expect(user.subscription.subscriptionId).toBe('sub_123');
    });

    it('should use metadata email if customer_email is not available', async () => {
      mockStripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_456',
            customer: 'cus_123',
            customer_email: null,
            subscription: 'sub_456',
            metadata: {
              email: 'testuser@example.com'
            }
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('active');
    });

    it('should handle customer.subscription.updated event', async () => {
      mockStripeEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            cancel_at_period_end: false
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('active');
      expect(user.subscription.currentPeriodEnd).toBeDefined();
    });

    it('should handle trialing subscription status', async () => {
      mockStripeEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'trialing',
            current_period_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
            cancel_at_period_end: false
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      // trialing maps to 'active' in the status map
      expect(user.subscription.status).toBe('active');
    });

    it('should handle customer.subscription.deleted event', async () => {
      mockStripeEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'canceled'
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('canceled');
      expect(user.subscription.canceledAt).toBeDefined();
    });

    it('should handle invoice.payment_failed event', async () => {
      mockStripeEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'inv_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            last_finalization_error: {
              message: 'Your card was declined.'
            }
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('past_due');
      expect(user.subscription.lastPaymentError).toContain('declined');
    });

    it('should return 400 for invalid webhook signature', async () => {
      shouldVerifySignature = false;

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'invalid_sig' : null
        },
        text: async () => JSON.stringify({ type: 'test' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid signature');
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should handle unknown event types gracefully', async () => {
      mockStripeEvent = {
        type: 'unknown.event.type',
        data: {
          object: {}
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);
    });

    it('should handle past_due subscription status', async () => {
      mockStripeEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'past_due',
            current_period_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            cancel_at_period_end: false
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.status).toBe('past_due');
    });

    it('should set cancelAtPeriodEnd flag when subscription is scheduled to cancel', async () => {
      mockStripeEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            cancel_at_period_end: true
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.cancelAtPeriodEnd).toBe(true);
    });

    it('should handle payment failed without error message', async () => {
      mockStripeEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'inv_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            last_finalization_error: null
          }
        }
      };

      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
        },
        text: async () => JSON.stringify(mockStripeEvent)
      };

      const response = await handler(req, {});

      expect(response.status).toBe(200);

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('testuser@example.com', { type: 'json' });
      expect(user.subscription.lastPaymentError).toBe('Payment failed');
    });

    it('should handle all Stripe subscription statuses correctly', async () => {
      const statusTests = [
        { stripeStatus: 'active', expectedStatus: 'active' },
        { stripeStatus: 'past_due', expectedStatus: 'past_due' },
        { stripeStatus: 'canceled', expectedStatus: 'canceled' },
        { stripeStatus: 'unpaid', expectedStatus: 'unpaid' },
        { stripeStatus: 'trialing', expectedStatus: 'active' },
        { stripeStatus: 'incomplete', expectedStatus: 'incomplete' },
        { stripeStatus: 'incomplete_expired', expectedStatus: 'expired' },
        { stripeStatus: 'paused', expectedStatus: 'paused' }
      ];

      for (const { stripeStatus, expectedStatus } of statusTests) {
        // Reset user state
        const usersStore = getStore({ name: 'users' });
        await usersStore.setJSON('testuser@example.com', {
          id: 'user_123',
          email: 'testuser@example.com',
          subscription: { customerId: 'cus_123' }
        });

        mockStripeEvent = {
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: stripeStatus,
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
              cancel_at_period_end: false
            }
          }
        };

        const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

        const req = {
          method: 'POST',
          headers: {
            get: (name) => name === 'stripe-signature' ? 'sig_test_123' : null
          },
          text: async () => JSON.stringify(mockStripeEvent)
        };

        const response = await handler(req, {});
        expect(response.status).toBe(200);

        const user = await usersStore.get('testuser@example.com', { type: 'json' });
        expect(user.subscription.status).toBe(expectedStatus);
      }
    });
  });
});
