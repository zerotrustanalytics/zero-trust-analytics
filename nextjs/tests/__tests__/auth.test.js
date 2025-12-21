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

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn((payload) => `token_${payload.email}`),
    verify: jest.fn((token) => {
      if (token.startsWith('token_')) {
        return { email: token.replace('token_', '') };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores } = await import('@netlify/blobs');

describe('Auth Endpoints', () => {
  beforeEach(() => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'newuser@example.com',
          password: 'securePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe('newuser@example.com');
    });

    it('should reject registration with missing email', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          password: 'securePassword123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject registration with missing password', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'user@example.com'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject duplicate email registration', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req1 = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'duplicate@example.com',
          password: 'password123'
        })
      };

      await handler(req1, { ip: '127.0.0.1' });

      const req2 = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'duplicate@example.com',
          password: 'differentPassword'
        })
      };

      const response = await handler(req2, { ip: '127.0.0.2' });
      const data = await response.json();

      expect(response.status).toBe(409);  // 409 Conflict for duplicate
      expect(data.error).toContain('registered');
    });

    it('should reject GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const req = {
        method: 'GET',
        json: async () => ({})
      };

      const response = await handler(req, {});
      expect(response.status).toBe(405);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login existing user successfully', async () => {
      // First register a user
      const { default: registerHandler } = await import('../../netlify/functions/auth-register.js');
      const { default: loginHandler } = await import('../../netlify/functions/auth-login.js');

      await registerHandler({
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'login@example.com',
          password: 'password123'
        })
      }, { ip: '127.0.0.1' });

      const loginReq = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'login@example.com',
          password: 'password123'
        })
      };

      const response = await loginHandler(loginReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const { default: registerHandler } = await import('../../netlify/functions/auth-register.js');
      const { default: loginHandler } = await import('../../netlify/functions/auth-login.js');

      await registerHandler({
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'wrongpass@example.com',
          password: 'correctPassword'
        })
      }, { ip: '127.0.0.1' });

      const loginReq = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'wrongpass@example.com',
          password: 'wrongPassword'
        })
      };

      const response = await loginHandler(loginReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('should reject login for non-existent user', async () => {
      const { default: loginHandler } = await import('../../netlify/functions/auth-login.js');

      const loginReq = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
      };

      const response = await loginHandler(loginReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
    });
  });
});
