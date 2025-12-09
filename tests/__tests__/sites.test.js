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
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear()
  };
});

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn((token) => {
      if (token === 'valid_token') {
        return { email: 'user@example.com', userId: 'user_123' };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Sites Endpoints', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create a test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com',
      passwordHash: 'hashed_password',
      createdAt: new Date().toISOString(),
      subscription: null
    });
  });

  describe('POST /api/sites/create', () => {
    it('should create a new site', async () => {
      const { default: handler } = await import('../sites-create.js');

      const headers = new Map([
        ['authorization', 'Bearer valid_token']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key.toLowerCase()) },
        json: async () => ({
          domain: 'mynewsite.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.site.domain).toBe('mynewsite.com');
      expect(data.site.id).toMatch(/^site_/);
      expect(data.embedCode).toContain('data-site-id');
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../sites-create.js');

      const req = {
        method: 'POST',
        headers: { get: () => null },
        json: async () => ({
          domain: 'example.com'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject requests without domain', async () => {
      const { default: handler } = await import('../sites-create.js');

      const headers = new Map([
        ['authorization', 'Bearer valid_token']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key.toLowerCase()) },
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Domain');
    });

    it('should normalize domain (remove protocol, trailing slash)', async () => {
      const { default: handler } = await import('../sites-create.js');

      const headers = new Map([
        ['authorization', 'Bearer valid_token']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key.toLowerCase()) },
        json: async () => ({
          domain: 'https://example.com/'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.site.domain).toBe('example.com');
    });
  });

  describe('GET /api/sites/list', () => {
    it('should return empty array for user with no sites', async () => {
      const { default: handler } = await import('../sites-list.js');

      const headers = new Map([
        ['authorization', 'Bearer valid_token']
      ]);

      const req = {
        method: 'GET',
        headers: { get: (key) => headers.get(key.toLowerCase()) }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sites).toEqual([]);
    });

    it('should return list of user sites', async () => {
      // First create a site
      const { default: createHandler } = await import('../sites-create.js');
      const { default: listHandler } = await import('../sites-list.js');

      const headers = new Map([
        ['authorization', 'Bearer valid_token']
      ]);

      await createHandler({
        method: 'POST',
        headers: { get: (key) => headers.get(key.toLowerCase()) },
        json: async () => ({ domain: 'site1.com' })
      }, {});

      await createHandler({
        method: 'POST',
        headers: { get: (key) => headers.get(key.toLowerCase()) },
        json: async () => ({ domain: 'site2.com' })
      }, {});

      const response = await listHandler({
        method: 'GET',
        headers: { get: (key) => headers.get(key.toLowerCase()) }
      }, {});

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sites).toHaveLength(2);
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../sites-list.js');

      const req = {
        method: 'GET',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });
});
