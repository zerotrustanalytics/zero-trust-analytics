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

// Mock auth library
let authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn((headers) => authResult)
}));

// Mock hash library
jest.unstable_mockModule('../../netlify/functions/lib/hash.js', () => ({
  generateSiteId: jest.fn(() => 'site_mock123')
}));

// Mock jsonwebtoken for delete/update endpoints
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn((token, secret) => {
      if (token === 'valid_token') {
        return { id: 'user_123', email: 'testuser@example.com' };
      }
      if (token === 'other_user_token') {
        return { id: 'user_other', email: 'otheruser@example.com' };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Sites CRUD Endpoints', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('testuser@example.com', {
      id: 'user_123',
      email: 'testuser@example.com',
      passwordHash: 'hashed',
      createdAt: new Date().toISOString()
    });

    await usersStore.setJSON('otheruser@example.com', {
      id: 'user_other',
      email: 'otheruser@example.com',
      passwordHash: 'hashed',
      createdAt: new Date().toISOString()
    });

    // Create existing site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_existing', {
      id: 'site_existing',
      userId: 'user_123',
      domain: 'existing.example.com',
      createdAt: new Date().toISOString()
    });

    // Create user_sites mapping
    const userSitesStore = getStore({ name: 'user_sites' });
    await userSitesStore.setJSON('user_123', ['site_existing']);
  });

  describe('Sites Create - POST /api/sites/create', () => {
    it('should create a new site and return embed code', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ]),
        json: async () => ({ domain: 'newsite.example.com' })
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

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.site).toBeDefined();
      expect(data.embedCode).toContain('script');
      expect(data.embedCode).toContain('data-site-id');
    });

    it('should normalize domain by removing protocol and trailing slash', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ]),
        json: async () => ({ domain: 'https://example.com/' })
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

      expect(response.status).toBe(201);
      expect(data.site.domain).toBe('example.com');
    });

    it('should convert domain to lowercase', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ]),
        json: async () => ({ domain: 'EXAMPLE.COM' })
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

      expect(data.site.domain).toBe('example.com');
    });

    it('should return 400 when domain is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'POST',
        headers: new Map([
          ['authorization', 'Bearer valid_token'],
          ['content-type', 'application/json']
        ]),
        json: async () => ({})
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
      expect(data.error).toContain('Domain');
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'POST',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ domain: 'example.com' })
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

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-create.js');

      const req = {
        method: 'GET',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });

  describe('Sites List - GET /api/sites/list', () => {
    it('should return list of user sites', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-list.js');

      const req = {
        method: 'GET',
        headers: new Map([
          ['authorization', 'Bearer valid_token']
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
      expect(data.success).toBe(true);
      expect(Array.isArray(data.sites)).toBe(true);
    });

    it('should return empty array for user with no sites', async () => {
      authResult = { user: { id: 'user_new', email: 'newuser@example.com' } };

      const { default: handler } = await import('../../netlify/functions/sites-list.js');

      const req = {
        method: 'GET',
        headers: new Map([
          ['authorization', 'Bearer valid_token']
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
      expect(data.sites).toEqual([]);
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/sites-list.js');

      const req = {
        method: 'GET',
        headers: new Map()
      };
      req.headers.get = (name) => null;
      req.headers[Symbol.iterator] = function* () {};
      req.headers.entries = function () {
        return this[Symbol.iterator]();
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-list.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-list.js');

      const req = {
        method: 'POST',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });

  describe('Sites Delete - POST /api/sites/delete', () => {
    it('should delete site owned by user', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({ siteId: 'site_existing' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should return 404 when site does not exist', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({ siteId: 'site_nonexistent' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should return 403 when trying to delete another user\'s site', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer other_user_token' : null
        },
        json: async () => ({ siteId: 'site_existing' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Not authorized');
    });

    it('should return 401 when authorization header is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({ siteId: 'site_existing' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid token', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer invalid_token' : null
        },
        json: async () => ({ siteId: 'site_existing' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'GET',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });

  describe('Sites Update - POST /api/sites/update', () => {
    it('should update site domain', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_existing',
          domain: 'updated.example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.site.domain).toBe('updated.example.com');
    });

    it('should update site nickname', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_existing',
          nickname: 'My Site'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should normalize domain on update', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_existing',
          domain: 'https://UPDATED.EXAMPLE.COM/'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site.domain).toBe('updated.example.com');
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({ domain: 'example.com' })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should return 404 when site does not exist', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_nonexistent',
          domain: 'example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should return 403 when trying to update another user\'s site', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer other_user_token' : null
        },
        json: async () => ({
          siteId: 'site_existing',
          domain: 'hacked.example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Not authorized');
    });

    it('should return 401 when authorization header is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => null
        },
        json: async () => ({
          siteId: 'site_existing',
          domain: 'example.com'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should set nickname to null when empty string is provided', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_existing',
          nickname: '   '
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site.nickname).toBeNull();
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'GET',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
