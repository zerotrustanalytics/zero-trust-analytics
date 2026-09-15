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

// Mock rate-limit to allow requests by default
let rateLimitAllowed = true;
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({
    allowed: rateLimitAllowed,
    remaining: rateLimitAllowed ? 9 : 0,
    resetTime: Date.now() + 60000,
    retryAfter: rateLimitAllowed ? 0 : 60
  })),
  rateLimitResponse: jest.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  })),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

// Mock jsonwebtoken for 2FA temp token
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn(() => 'mock_temp_token_123')
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');
const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

describe('Auth Login Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    rateLimitAllowed = true;
    process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing';

    // Create a test user with hashed password
    // Using a pre-hashed password that matches 'ValidPassword123'
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('testuser@example.com', {
      id: 'user_123',
      email: 'testuser@example.com',
      // This is a mock hash - the verifyPassword function will be mocked
      passwordHash: '$2b$10$mockhashedpassword',
      twoFactorEnabled: false,
      subscription: { status: 'active', plan: 'pro' },
      createdAt: new Date().toISOString()
    });

    // Create a 2FA-enabled user
    await usersStore.setJSON('twofa@example.com', {
      id: 'user_2fa',
      email: 'twofa@example.com',
      passwordHash: '$2b$10$mockhashedpassword',
      twoFactorEnabled: true,
      subscription: { status: 'active', plan: 'pro' },
      createdAt: new Date().toISOString()
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return JWT token for valid credentials', async () => {
      // Mock verifyPassword to return true for valid password
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(true)),
        createToken: jest.fn(() => 'mock_jwt_token_123'),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'testuser@example.com',
          password: 'ValidPassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('testuser@example.com');
    });

    it('should return 401 for invalid password', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(false)),
        createToken: jest.fn(),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'testuser@example.com',
          password: 'WrongPassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid');
    });

    it('should return 401 for non-existent user', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(true)),
        createToken: jest.fn(),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'nonexistent@example.com',
          password: 'SomePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid');
    });

    it('should return 400 when email is missing', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(),
        createToken: jest.fn(),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          password: 'SomePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Email');
    });

    it('should return 400 when password is missing', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(),
        createToken: jest.fn(),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'testuser@example.com'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('password');
    });

    it('should require 2FA when user has it enabled', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(true)),
        createToken: jest.fn(() => 'mock_jwt_token_123'),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'twofa@example.com',
          password: 'ValidPassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.requires_2fa).toBe(true);
      expect(data.tempToken).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      rateLimitAllowed = false;

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'x-forwarded-for' ? '192.168.1.1' : null
        },
        json: async () => ({
          email: 'testuser@example.com',
          password: 'ValidPassword123'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(429);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-login.js');

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
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(),
        createToken: jest.fn(),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should include user subscription info in response', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(true)),
        createToken: jest.fn(() => 'mock_jwt_token_123'),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'testuser@example.com',
          password: 'ValidPassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.subscription).toBeDefined();
    });

    it('should return CORS headers', async () => {
      jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
        verifyPassword: jest.fn(() => Promise.resolve(true)),
        createToken: jest.fn(() => 'mock_jwt_token_123'),
        Errors: {
          methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
          validationError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
          unauthorized: (msg) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
          internalError: (msg) => new Response(JSON.stringify({ error: msg }), { status: 500 })
        }
      }));

      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'testuser@example.com',
          password: 'ValidPassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
