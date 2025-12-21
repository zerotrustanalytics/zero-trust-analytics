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

// Mock crypto
jest.unstable_mockModule('crypto', () => ({
  default: {
    randomBytes: jest.fn(() => ({
      toString: () => 'mock_reset_token_123456789'
    }))
  }
}));

// Mock email service
jest.unstable_mockModule('../../netlify/functions/lib/email.js', () => ({
  sendPasswordResetEmail: jest.fn(() => Promise.resolve({ provider: 'mock', id: 'email_123' }))
}));

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');
const { sendPasswordResetEmail } = await import('../../netlify/functions/lib/email.js');

describe('Auth Forgot Password Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    process.env.URL = 'https://zta.io';

    // Create a test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('existing@example.com', {
      id: 'user_123',
      email: 'existing@example.com',
      passwordHash: 'hashed_password',
      createdAt: new Date().toISOString()
    });
  });

  describe('POST /api/auth/forgot', () => {
    it('should return success for existing user', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'existing@example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('If an account');
    });

    it('should return success even for non-existent email (prevents enumeration)', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'nonexistent@example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      // Security: always return success to prevent email enumeration
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should call email service for existing user', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'existing@example.com'
        })
      };

      await handler(req, {});

      expect(sendPasswordResetEmail).toHaveBeenCalled();
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        'existing@example.com',
        expect.stringContaining('https://zta.io/reset/')
      );
    });

    it('should NOT call email service for non-existent user', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'nonexistent@example.com'
        })
      };

      await handler(req, {});

      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should reject requests without email', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Email');
    });

    it('should store password reset token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          email: 'existing@example.com'
        })
      };

      await handler(req, {});

      // Verify token was stored
      const tokensStore = getStore({ name: 'password_reset_tokens' });
      const tokenData = await tokensStore.get('mock_reset_token_123456789', { type: 'json' });

      expect(tokenData).not.toBeNull();
      expect(tokenData.email).toBe('existing@example.com');
      expect(tokenData.expiresAt).toBeDefined();
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

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
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
