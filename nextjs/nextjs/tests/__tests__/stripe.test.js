import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

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
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear()
  };
});

// Mock auth module
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn((headers) => {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader === 'Bearer valid_token') {
      return { user: { id: 'user_123', email: 'user@example.com' } };
    }
    if (authHeader === 'Bearer subscribed_token') {
      return { user: { id: 'user_subscribed', email: 'subscribed@example.com' } };
    }
    return { error: 'Unauthorized', status: 401 };
  })
}));

// Mock Stripe
const mockStripeCheckoutCreate = jest.fn();
const mockStripeWebhookConstruct = jest.fn();
const mockStripeBillingPortalCreate = jest.fn();

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate
      }
    },
    webhooks: {
      constructEvent: mockStripeWebhookConstruct
    },
    billingPortal: {
      sessions: {
        create: mockStripeBillingPortalCreate
      }
    }
  }))
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Stripe Endpoints', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();

    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    process.env.STRIPE_PRICE_ID = 'price_xxx';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx';
    process.env.URL = 'https://zta.io';

    // Create test users
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com',
      subscription: null
    });
    await usersStore.setJSON('subscribed@example.com', {
      id: 'user_subscribed',
      email: 'subscribed@example.com',
      subscription: {
        status: 'active',
        customerId: 'cus_xxx',
        subscriptionId: 'sub_xxx'
      }
    });

    // Configure mock responses
    mockStripeCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/session_xxx'
    });

    mockStripeBillingPortalCreate.mockResolvedValue({
      url: 'https://billing.stripe.com/portal_xxx'
    });
  });

  describe('POST /api/stripe/checkout', () => {
    it('should create checkout session for non-subscribed user', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toContain('stripe.com');
      expect(mockStripeCheckoutCreate).toHaveBeenCalled();
    });

    it('should reject checkout for already subscribed user', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer subscribed_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Already subscribed');
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should include proper metadata in checkout session', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({})
      };

      await handler(req, {});

      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer_email: 'user@example.com',
          metadata: expect.objectContaining({
            email: 'user@example.com'
          })
        })
      );
    });
  });

  describe('POST /api/stripe/webhook', () => {
    it('should process checkout.session.completed event', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_email: 'user@example.com',
            customer: 'cus_new',
            subscription: 'sub_new'
          }
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'checkout.session.completed' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should activate subscription after checkout completion', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_email: 'user@example.com',
            customer: 'cus_new',
            subscription: 'sub_new'
          }
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'checkout.session.completed' })
      };

      await handler(req, {});

      // Verify user subscription was updated
      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('user@example.com', { type: 'json' });

      expect(user.subscription).toBeDefined();
      expect(user.subscription.status).toBe('active');
      expect(user.subscription.customerId).toBe('cus_new');
    });

    it('should reject webhook with invalid signature', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'invalid_sig' }),
        text: async () => JSON.stringify({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid signature');
    });

    it('should handle customer.subscription.updated event', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_xxx',
            status: 'active'
          }
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'customer.subscription.updated' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle customer.subscription.deleted event', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_xxx'
          }
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'customer.subscription.deleted' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle invoice.payment_failed event', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer_email: 'user@example.com'
          }
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'invoice.payment_failed' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle unknown event types gracefully', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      mockStripeWebhookConstruct.mockReturnValue({
        type: 'unknown.event.type',
        data: {
          object: {}
        }
      });

      const req = {
        method: 'POST',
        headers: createHeaders({ 'stripe-signature': 'valid_sig' }),
        text: async () => JSON.stringify({ type: 'unknown.event.type' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-webhook.js');

      const req = {
        method: 'GET',
        headers: createHeaders({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });

  describe('POST /api/stripe/portal', () => {
    it('should create billing portal session for subscribed user', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-portal.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer subscribed_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toContain('stripe.com');
    });

    it('should reject portal access for non-subscribed user', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-portal.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('No active subscription');
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-portal.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });
});
