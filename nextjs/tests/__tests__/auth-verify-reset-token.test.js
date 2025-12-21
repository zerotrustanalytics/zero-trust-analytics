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

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Auth Verify Reset Token Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();

    // Create a valid token
    const tokensStore = getStore({ name: 'password_reset_tokens' });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    await tokensStore.setJSON('valid_token_123', {
      email: 'user@example.com',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    // Create an expired token
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await tokensStore.setJSON('expired_token_456', {
      email: 'user@example.com',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: expiredAt.toISOString()
    });
  });

  describe('GET /api/auth/verify-reset-token', () => {
    it('should validate a valid token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token?token=valid_token_123'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
      expect(data.expiresAt).toBeDefined();
    });

    it('should reject an invalid token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token?token=nonexistent_token'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toContain('Invalid or expired');
    });

    it('should reject an expired token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token?token=expired_token_456'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.error).toContain('Invalid or expired');
    });

    it('should reject request without token parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Token');
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'OPTIONS',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token?token=valid_token_123',
        json: async () => ({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should include CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const req = {
        method: 'GET',
        headers: {
          get: (name) => null
        },
        url: 'https://example.com/api/auth/verify-reset-token?token=valid_token_123'
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
