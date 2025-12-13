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

describe('Funnels API', () => {
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
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({ origin: 'https://example.com' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });

    it('should include CORS headers in GET response', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}`,
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          origin: 'https://example.com'
        })
      };

      const response = await handler(req, {});
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}`,
        headers: createHeaders({})
      };

      const response = await handler(req, {});
      expect(response.status).toBe(401);

      const body = JSON.parse(await response.text());
      expect(body.error).toBeTruthy();
    });

    it('should reject invalid auth token', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: 'Bearer invalid_token' })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/funnels - List funnels', () => {
    it('should require siteId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Site ID required');
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: 'https://example.com/api/funnels?siteId=site_other',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(403);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Access denied');
    });

    it('should return empty array when no funnels exist', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.funnels).toEqual([]);
    });

    it('should return funnels with conversion data', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      // First create a funnel
      const createReq = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Test Funnel',
            steps: [
              { type: 'page', path: '/landing', name: 'Landing Page' },
              { type: 'page', path: '/signup', name: 'Signup Page' }
            ]
          };
        }
      };

      const createResponse = await handler(createReq, {});
      expect(createResponse.status).toBe(201);

      // Now list funnels
      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.funnels).toHaveLength(1);
      expect(body.funnels[0].name).toBe('Test Funnel');
      expect(body.funnels[0].steps).toHaveLength(2);
      expect(body.funnels[0].data).toBeDefined();
      expect(body.funnels[0].dateRange).toBeDefined();
    });

    it('should accept date range parameters', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'GET',
        url: `https://example.com/api/funnels?siteId=${testSiteId}&startDate=2024-01-01&endDate=2024-01-31`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.funnels).toBeDefined();
    });
  });

  describe('POST /api/funnels - Create funnel', () => {
    it('should require siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            name: 'Test Funnel',
            steps: [
              { type: 'page', path: '/step1' },
              { type: 'page', path: '/step2' }
            ]
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Site ID required');
    });

    it('should require at least 2 steps', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Invalid Funnel',
            steps: [
              { type: 'page', path: '/step1' }
            ]
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('At least 2 steps required');
    });

    it('should reject if steps array is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Invalid Funnel'
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('At least 2 steps required');
    });

    it('should create funnel with valid data', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Conversion Funnel',
            steps: [
              { type: 'page', path: '/landing', name: 'Landing' },
              { type: 'page', path: '/signup', name: 'Signup' },
              { type: 'page', path: '/complete', name: 'Complete' }
            ]
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);

      const body = JSON.parse(await response.text());
      expect(body.funnel).toBeDefined();
      expect(body.funnel.id).toBeDefined();
      expect(body.funnel.name).toBe('Conversion Funnel');
      expect(body.funnel.steps).toHaveLength(3);
      expect(body.funnel.siteId).toBe(testSiteId);
      expect(body.funnel.userId).toBe(testUserId);
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: 'site_other',
            name: 'Test Funnel',
            steps: [
              { type: 'page', path: '/step1' },
              { type: 'page', path: '/step2' }
            ]
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(403);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Access denied');
    });
  });

  describe('DELETE /api/funnels - Delete funnel', () => {
    let createdFunnelId;

    beforeEach(async () => {
      // Create a funnel to delete
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const createReq = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'To Delete',
            steps: [
              { type: 'page', path: '/step1' },
              { type: 'page', path: '/step2' }
            ]
          };
        }
      };

      const createResponse = await handler(createReq, {});
      const body = JSON.parse(await createResponse.text());
      createdFunnelId = body.funnel.id;
    });

    it('should require funnelId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'DELETE',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(400);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Funnel ID required');
    });

    it('should delete funnel successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'DELETE',
        url: `https://example.com/api/funnels?funnelId=${createdFunnelId}`,
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);

      const body = JSON.parse(await response.text());
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent funnel', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'DELETE',
        url: 'https://example.com/api/funnels?funnelId=funnel_nonexistent',
        headers: createHeaders({ authorization: `Bearer ${authToken}` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(404);

      const body = JSON.parse(await response.text());
      expect(body.error).toBe('Funnel not found');
    });

    it('should not allow deleting another user\'s funnel', async () => {
      // Create another user
      const otherUserId = 'user_other';
      const usersStore = getStore({ name: 'users' });
      await usersStore.setJSON(otherUserId, {
        id: otherUserId,
        email: 'other@example.com',
        passwordHash: 'hash456',
        sites: [],
        createdAt: new Date().toISOString()
      });

      // Mock JWT to return different user for other token
      const jwt = await import('jsonwebtoken');
      const originalVerify = jwt.default.verify;
      jwt.default.verify = jest.fn((token) => {
        if (token === 'other_token') {
          return { id: otherUserId, email: 'other@example.com' };
        }
        return originalVerify(token);
      });

      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'DELETE',
        url: `https://example.com/api/funnels?funnelId=${createdFunnelId}`,
        headers: createHeaders({ authorization: `Bearer other_token` })
      };

      const response = await handler(req, {});
      expect(response.status).toBe(404);

      // Restore original
      jwt.default.verify = originalVerify;
    });
  });

  describe('Step Validation', () => {
    it('should accept maximum 10 steps', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const steps = Array.from({ length: 10 }, (_, i) => ({
        type: 'page',
        path: `/step${i + 1}`,
        name: `Step ${i + 1}`
      }));

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Max Steps Funnel',
            steps
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);

      const body = JSON.parse(await response.text());
      expect(body.funnel.steps).toHaveLength(10);
    });

    it('should accept event-type steps', async () => {
      const { default: handler } = await import('../../netlify/functions/funnels.js');

      const req = {
        method: 'POST',
        url: 'https://example.com/api/funnels',
        headers: createHeaders({
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        }),
        async json() {
          return {
            siteId: testSiteId,
            name: 'Event Funnel',
            steps: [
              { type: 'page', path: '/landing', name: 'Landing' },
              { type: 'event', action: 'click_signup', name: 'Clicked Signup' },
              { type: 'page', path: '/complete', name: 'Complete' }
            ]
          };
        }
      };

      const response = await handler(req, {});
      expect(response.status).toBe(201);

      const body = JSON.parse(await response.text());
      expect(body.funnel.steps).toHaveLength(3);
      expect(body.funnel.steps[1].type).toBe('event');
    });
  });
});
