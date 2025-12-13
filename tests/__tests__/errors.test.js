import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

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
      async list(options = {}) {
        const prefix = options.prefix || '';
        const results = [];
        for (const [key, value] of data.entries()) {
          if (key.startsWith(prefix)) {
            results.push({
              key,
              value: JSON.parse(value)
            });
          }
        }
        return { blobs: results };
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn((payload) => 'mocked_jwt_token'),
    verify: jest.fn((token) => {
      if (token === 'valid_token' || token.startsWith('session_test_token')) {
        return { id: 'user_test123', email: 'test@example.com' };
      }
      throw new Error('Invalid token');
    })
  }
}));

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn(async (password) => 'hashed_' + password),
    compare: jest.fn(async (password, hash) => hash === 'hashed_' + password)
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Errors API', () => {
  let authToken;
  const testUserId = 'user_test123';
  const testSiteId = 'site_test123';

  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON(testUserId, {
      id: testUserId,
      email: 'test@example.com',
      passwordHash: 'hash123',
      sites: [testSiteId],
      createdAt: new Date().toISOString()
    });

    // Create test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON(testSiteId, {
      id: testSiteId,
      userId: testUserId,
      domain: 'example.com',
      createdAt: new Date().toISOString()
    });

    // Link site to user
    const userSitesKey = `user_sites_${testUserId}`;
    await sitesStore.setJSON(userSitesKey, [testSiteId]);

    // Use JWT token for auth
    authToken = 'valid_token';
  });

  describe('CORS Headers', () => {
    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({ origin: 'https://example.com' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(response.headers['Access-Control-Allow-Methods']).toContain('POST');
    });

    it('should include CORS headers in POST response', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({
          origin: 'https://example.com',
          'content-type': 'application/json'
        }),
        async json() {
          return {
            site_id: testSiteId,
            type: '404',
            url: '/broken-page',
            referrer: 'https://google.com/search',
            user_agent: 'Mozilla/5.0'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('POST /api/errors - Log error', () => {
    it('should require site_id', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            type: '404',
            url: '/broken-page'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('site_id is required');
    });

    it('should require type', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            url: '/broken-page'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('type is required');
    });

    it('should require url', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            type: '404'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('url is required');
    });

    it('should validate site_id exists', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: 'site_nonexistent',
            type: '404',
            url: '/broken-page'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(404);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Site not found');
    });

    it('should accept valid 404 error', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            type: '404',
            url: '/broken-page',
            referrer: 'https://google.com/search',
            user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);

      const body = JSON.parse(await response.text());
      expect(body.success).toBe(true);
      expect(body.error_id).toBeDefined();
    });

    it('should accept 500 error type', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            type: '500',
            url: '/api/endpoint',
            referrer: 'https://example.com/page'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);
    });

    it('should accept js_error type', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            type: 'js_error',
            url: '/app.js',
            message: 'Uncaught TypeError: Cannot read property',
            stack: 'at app.js:123:45'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);
    });

    it('should handle deduplication for same URL within time window', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const errorData = {
        site_id: testSiteId,
        type: '404',
        url: '/same-broken-page',
        referrer: 'https://google.com'
      };

      // First error
      const req1 = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return errorData;
        }
      };

      const response1 = await handler(req1, {});
      expect(response1.status).toBe(201);

      // Second error (should be deduplicated)
      const req2 = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return errorData;
        }
      };

      const response2 = await handler(req2, {});
      expect(response2.status).toBe(200);

      const body2 = JSON.parse(await response2.text());
      expect(body2.deduplicated).toBe(true);
    });

    it('should store error metadata', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ 'content-type': 'application/json' }),
        async json() {
          return {
            site_id: testSiteId,
            type: '404',
            url: '/test-page',
            referrer: 'https://google.com',
            user_agent: 'Mozilla/5.0',
            metadata: {
              browser: 'Chrome',
              os: 'Windows'
            }
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);

      const body = JSON.parse(await response.text());
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/errors - List errors', () => {
    beforeEach(async () => {
      // Add some test errors
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const errors = [
        {
          site_id: testSiteId,
          type: '404',
          url: '/page1',
          referrer: 'https://google.com'
        },
        {
          site_id: testSiteId,
          type: '404',
          url: '/page2',
          referrer: 'https://facebook.com'
        },
        {
          site_id: testSiteId,
          type: '500',
          url: '/api/broken',
          referrer: 'https://example.com'
        }
      ];

      for (const errorData of errors) {
        const req = {
          method: 'POST',
          url: 'https://example.com/api/errors',
          headers: createHeaders({ 'content-type': 'application/json' }),
          async json() {
            return errorData;
          }
        };
        await handler(req, {});
      }
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}`,
        headers: createHeaders({})
      };

      const response = await handler(req, {});
      expect(response.status).toBe(401);
    });

    it('should require siteId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: 'https://example.com/api/errors',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('siteId is required');
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: 'https://example.com/api/errors?siteId=site_other',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(403);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Access denied');
    });

    it('should return list of errors for site', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should return error with count and last_seen', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.errors).toBeDefined();

      if (body.errors.length > 0) {
        const error = body.errors[0];
        expect(error.url).toBeDefined();
        expect(error.type).toBeDefined();
        expect(error.count).toBeDefined();
        expect(error.last_seen).toBeDefined();
      }
    });

    it('should filter by error type', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}&type=404`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.errors).toBeDefined();

      // All errors should be 404 type
      body.errors.forEach(error => {
        expect(error.type).toBe('404');
      });
    });

    it('should support pagination with limit', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}&limit=2`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeLessThanOrEqual(2);
    });

    it('should return errors sorted by last_seen descending', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/errors?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.errors).toBeDefined();

      if (body.errors.length > 1) {
        const dates = body.errors.map(e => new Date(e.last_seen).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });
  });

  describe('Error Type Validation', () => {
    it('should accept valid error types', async () => {
      const { default: handler } = await import('../../netlify/functions/errors.js');

      const validTypes = ['404', '500', '403', '401', 'js_error', 'network_error'];

      for (const type of validTypes) {
        const req = {
          method: 'POST',
          url: 'https://example.com/api/errors',
          headers: createHeaders({ 'content-type': 'application/json' }),
          async json() {
            return {
              site_id: testSiteId,
              type: type,
              url: `/test-${type}`
            };
          }
        };

        const response = await handler(req, {});
        expect(response.status).toBe(201);
      }
    });
  });
});
