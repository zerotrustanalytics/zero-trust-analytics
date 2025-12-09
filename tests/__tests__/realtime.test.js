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

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn((token) => {
      if (token === 'valid_token') {
        return { id: 'user_123', email: 'user@example.com' };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Realtime Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com'
    });

    // Create test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test', {
      id: 'site_test',
      userId: 'user_123',
      domain: 'example.com'
    });
    await sitesStore.setJSON('user_sites_user_123', ['site_test']);

    // Add active visitors
    const realtimeStore = getStore({ name: 'realtime' });
    await realtimeStore.setJSON('site_test:active', {
      visitors: {
        'visitor_1': {
          sessionId: 'session_1',
          path: '/home',
          lastSeen: Date.now()
        },
        'visitor_2': {
          sessionId: 'session_2',
          path: '/about',
          lastSeen: Date.now()
        }
      }
    });
  });

  describe('GET /api/realtime', () => {
    it('should return active visitor count', async () => {
      const { default: handler } = await import('../../netlify/functions/realtime.js');

      const url = new URL('https://example.com/api/realtime?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.activeVisitors).toBe(2);
    });

    it('should return 0 for site with no activity', async () => {
      const { default: handler } = await import('../../netlify/functions/realtime.js');

      // Create another site with no activity
      const sitesStore = getStore({ name: 'sites' });
      await sitesStore.setJSON('site_empty', {
        id: 'site_empty',
        userId: 'user_123',
        domain: 'empty.com'
      });
      // Add to user's site list for ownership check
      await sitesStore.setJSON('user_sites_user_123', ['site_test', 'site_empty']);

      const url = new URL('https://example.com/api/realtime?siteId=site_empty');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.activeVisitors).toBe(0);
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/realtime.js');

      const url = new URL('https://example.com/api/realtime?siteId=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/realtime.js');

      const url = new URL('https://example.com/api/realtime');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });
  });
});
