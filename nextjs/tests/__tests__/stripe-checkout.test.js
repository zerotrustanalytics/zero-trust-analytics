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
let mockSessionUrl = 'https://checkout.stripe.com/pay/cs_test_123';
let stripeError = null;

jest.unstable_mockModule('stripe', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: jest.fn(async () => {
            if (stripeError) {
              throw stripeError;
            }
            return { url: mockSessionUrl };
          })
        }
      }
    }))
  };
});

// Mock auth library
let authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn((headers) => {
    if (authResult.error) {
      return authResult;
    }
    return authResult;
  })
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Stripe Checkout Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    stripeError = null;
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };

    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_PRICE_ID = 'price_mock123';
    process.env.URL = 'https://zta.io';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('testuser@example.com', {
      id: 'user_123',
      email: 'testuser@example.com',
      passwordHash: 'hashed',
      subscription: null,
      createdAt: new Date().toISOString()
    });

    // User with active subscription
    await usersStore.setJSON('subscribed@example.com', {
      id: 'user_456',
      email: 'subscribed@example.com',
      passwordHash: 'hashed',
      subscription: {
        status: 'active',
        customerId: 'cus_456',
        subscriptionId: 'sub_456'
      },
      createdAt: new Date().toISOString()
    });
  });

  describe('POST /api/stripe/checkout', () => {
    it('should create checkout session and return URL', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBe(mockSessionUrl);
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Invalid token', status: 401 };

      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('should return 400 when user already has active subscription', async () => {
      authResult = { user: { id: 'user_456', email: 'subscribed@example.com' } };

      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Already subscribed');
    });

    it('should handle Stripe API errors', async () => {
      stripeError = new Error('Stripe API error');

      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to create checkout session');
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'OPTIONS',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should allow checkout for user with canceled subscription', async () => {
      // Update user to have canceled subscription
      const usersStore = getStore({ name: 'users' });
      await usersStore.setJSON('testuser@example.com', {
        id: 'user_123',
        email: 'testuser@example.com',
        subscription: {
          status: 'canceled',
          customerId: 'cus_123'
        }
      });

      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
    });

    it('should allow checkout for user with past_due subscription', async () => {
      const usersStore = getStore({ name: 'users' });
      await usersStore.setJSON('testuser@example.com', {
        id: 'user_123',
        email: 'testuser@example.com',
        subscription: {
          status: 'past_due',
          customerId: 'cus_123'
        }
      });

      const { default: handler } = await import('../../netlify/functions/stripe-checkout.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ])
      };
      req.headers.get = (name) => req.headers.get(name.toLowerCase()) || null;
      req.headers[Symbol.iterator] = function* () {
        for (const [key, value] of this.entries()) {
          yield [key, value];
        }
      };
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.url).toBeDefined();
    });
  });
});
