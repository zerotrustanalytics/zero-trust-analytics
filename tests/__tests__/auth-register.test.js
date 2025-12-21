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

// Mock rate-limit
let rateLimitAllowed = true;
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({
    allowed: rateLimitAllowed,
    remaining: rateLimitAllowed ? 4 : 0,
    resetTime: Date.now() + 60000,
    retryAfter: rateLimitAllowed ? 0 : 60
  })),
  rateLimitResponse: jest.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  })),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

// Mock auth library
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  hashPassword: jest.fn(() => Promise.resolve('$2b$10$hashedpassword')),
  createToken: jest.fn(() => 'mock_jwt_token_123')
}));

// Mock hash library
jest.unstable_mockModule('../../netlify/functions/lib/hash.js', () => ({
  generateSiteId: jest.fn(() => 'site_mock123')
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Auth Register Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    rateLimitAllowed = true;
    process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing';

    // Create an existing user to test duplicate email
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('existing@example.com', {
      id: 'user_existing',
      email: 'existing@example.com',
      passwordHash: '$2b$10$mockhashedpassword',
      createdAt: new Date().toISOString()
    });
  });

  describe('POST /api/auth/register', () => {
    it('should create new user and return JWT token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'newuser@example.com',
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('newuser@example.com');
    });

    it('should reject registration with existing email', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'existing@example.com',
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('already registered');
    });

    it('should return 400 when email is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Email');
    });

    it('should return 400 when password is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'newuser@example.com'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('password');
    });

    it('should reject password shorter than 8 characters', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'newuser@example.com',
          password: 'short'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('8 characters');
    });

    it('should accept valid plan parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'planuser@example.com',
          password: 'SecurePassword123',
          plan: 'business'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.user.plan).toBe('business');
    });

    it('should default to pro plan for invalid plan', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'invalidplan@example.com',
          password: 'SecurePassword123',
          plan: 'invalid_plan'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.user.plan).toBe('pro');
    });

    it('should include trial end date in response', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'trialuser@example.com',
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.user.trialEndsAt).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      rateLimitAllowed = false;

      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'x-forwarded-for' ? '192.168.1.1' : null
        },
        json: async () => ({
          email: 'ratelimited@example.com',
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(429);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

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
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

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
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'corsuser@example.com',
          password: 'SecurePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should store user in database', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'storeduser@example.com',
          password: 'SecurePassword123'
        })
      };

      await handler(req, { ip: '127.0.0.1' });

      // Verify user was stored
      const usersStore = getStore({ name: 'users' });
      const storedUser = await usersStore.get('storeduser@example.com', { type: 'json' });

      expect(storedUser).not.toBeNull();
      expect(storedUser.email).toBe('storeduser@example.com');
      expect(storedUser.passwordHash).toBeDefined();
    });

    it('should accept all valid plan options', async () => {
      const validPlans = ['solo', 'starter', 'pro', 'business', 'scale'];

      for (const plan of validPlans) {
        __clearAllStores();

        const { default: handler } = await import('../../netlify/functions/auth-register.js');

        const req = {
          method: 'POST',
          headers: {
            get: (name) => null
          },
          json: async () => ({
            email: `${plan}user@example.com`,
            password: 'SecurePassword123',
            plan
          })
        };

        const response = await handler(req, { ip: '127.0.0.1' });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.user.plan).toBe(plan);
      }
    });
  });
});
