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

// Mock turso database
jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({
  getRealtime: jest.fn(() => Promise.resolve({
    active_visitors: 5,
    pageviews_last_5min: 10,
    recent_pageviews: [
      { path: '/home', timestamp: new Date().toISOString() },
      { path: '/about', timestamp: new Date().toISOString() }
    ],
    visitors_per_minute: [
      { minute: '2025-01-01 12:00', visitors: 3 },
      { minute: '2025-01-01 12:01', visitors: 2 }
    ],
    traffic_sources: []
  }))
}));

// Mock zero-trust-core
jest.unstable_mockModule('../../netlify/functions/lib/zero-trust-core.js', () => ({
  createZTRecord: jest.fn(({ siteId, eventType, payload }) => ({
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    site_id: siteId,
    identity_hash: 'mock_identity_hash_abc123',
    session_hash: payload?.sessionId || 'mock_session_hash',
    event_type: eventType || 'pageview',
    payload: JSON.stringify(payload || {}),
    context_device: 'desktop',
    context_browser: 'chrome',
    context_os: 'macos',
    context_country: 'US',
    context_region: 'CA',
    meta_is_bounce: 0,
    meta_duration: 0
  })),
  createIdentityHash: jest.fn(() => 'mock_identity_hash'),
  createSessionHash: jest.fn(() => 'mock_session_hash'),
  parseContext: jest.fn(() => ({ device: 'desktop', browser: 'chrome', os: 'macos' })),
  parseGeo: jest.fn(() => ({ country: 'US', region: 'CA' })),
  validateNoPII: jest.fn(() => true),
  getDailySalt: jest.fn(() => 'mock_daily_salt')
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
    it('should return active visitor count from database', async () => {
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
      // Value comes from mocked getRealtime
      expect(data.activeVisitors).toBe(5);
      expect(data.pageviewsLast5Min).toBe(10);
      expect(data.timestamp).toBeDefined();
    });

    it('should return realtime data for authorized site', async () => {
      const { default: handler } = await import('../../netlify/functions/realtime.js');

      // Create another site
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
      // Data comes from database mock
      expect(data.activeVisitors).toBeDefined();
      expect(data.visitorsPerMinute).toBeDefined();
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
