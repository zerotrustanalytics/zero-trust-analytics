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

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Auth Reset Password Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();

    // Create a test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com',
      passwordHash: 'hashed_oldpassword',
      createdAt: new Date().toISOString()
    });

    // Create a valid reset token
    const tokensStore = getStore({ name: 'password_reset_tokens' });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    await tokensStore.setJSON('valid_reset_token', {
      email: 'user@example.com',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    // Create an expired token
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await tokensStore.setJSON('expired_reset_token', {
      email: 'user@example.com',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: expiredAt.toISOString()
    });
  });

  describe('POST /api/auth/reset', () => {
    it('should reset password with valid token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token',
          password: 'newSecurePassword123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('reset successfully');
    });

    it('should update user password in storage', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token',
          password: 'newSecurePassword123'
        })
      };

      await handler(req, {});

      // Verify password was updated
      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('user@example.com', { type: 'json' });

      expect(user.passwordHash).toBe('hashed_newSecurePassword123');
    });

    it('should delete token after successful reset (one-time use)', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token',
          password: 'newSecurePassword123'
        })
      };

      await handler(req, {});

      // Verify token was deleted
      const tokensStore = getStore({ name: 'password_reset_tokens' });
      const token = await tokensStore.get('valid_reset_token', { type: 'json' });

      expect(token).toBeNull();
    });

    it('should reject invalid token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'invalid_token',
          password: 'newSecurePassword123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid or expired');
    });

    it('should reject expired token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'expired_reset_token',
          password: 'newSecurePassword123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid or expired');
    });

    it('should reject request without token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          password: 'newSecurePassword123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject request without password', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject password shorter than 8 characters', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token',
          password: 'short'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('8 characters');
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

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
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should include CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-reset.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          token: 'valid_reset_token',
          password: 'newSecurePassword123'
        })
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
