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

// Mock auth module
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn((headers) => {
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader === 'Bearer valid_token') {
      return { user: { id: 'user_123', email: 'user@example.com' } };
    }
    if (authHeader === 'Bearer other_user_token') {
      return { user: { id: 'user_456', email: 'other@example.com' } };
    }
    return { error: 'Unauthorized', status: 401 };
  })
}));

// Mock turso database module
jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({
  exportData: jest.fn((siteId, startStr, endStr, dataType, limit) => {
    if (dataType === 'pageviews') {
      return Promise.resolve([
        {
          timestamp: '2025-01-01 12:00:00',
          page_path: '/home',
          referrer: 'https://google.com',
          utm_source: 'google',
          utm_medium: 'organic',
          utm_campaign: '',
          device: 'desktop',
          browser: 'Chrome',
          os: 'Windows',
          country: 'US',
          region: 'California',
          time_on_page: 120,
          is_bounce: false
        }
      ]);
    }
    if (dataType === 'events') {
      return Promise.resolve([
        {
          timestamp: '2025-01-01 12:00:00',
          event_type: 'custom',
          event_name: 'signup',
          event_data: '{"plan":"pro"}',
          page_path: '/pricing',
          device: 'mobile',
          country: 'UK'
        }
      ]);
    }
    // summary
    return Promise.resolve([
      {
        date: '2025-01-01',
        pageviews: 100,
        unique_visitors: 50,
        sessions: 60,
        bounces: 20,
        bounce_rate: 33.3,
        avg_time_on_page: 45
      }
    ]);
  })
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Export Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com'
    });

    // Create test site and link to user
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test123', {
      id: 'site_test123',
      userId: 'user_123',
      domain: 'example.com'
    });
    await sitesStore.setJSON('user_sites_user_123', ['site_test123']);
  });

  describe('GET /api/export', () => {
    it('should export summary data as JSON by default', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site_id).toBe('site_test123');
      expect(data.type).toBe('summary');
      expect(data.data).toHaveLength(1);
      expect(data.data[0].pageviews).toBe(100);
    });

    it('should export pageviews data as JSON', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&type=pageviews');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.type).toBe('pageviews');
      expect(data.data[0].page_path).toBe('/home');
    });

    it('should export events data as JSON', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&type=events');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.type).toBe('events');
      expect(data.data[0].event_name).toBe('signup');
    });

    it('should export summary data as CSV', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&format=csv');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(text).toContain('Date,Pageviews,Unique Visitors');
      expect(text).toContain('2025-01-01');
    });

    it('should export pageviews as CSV', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&format=csv&type=pageviews');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toContain('Timestamp,Page,Referrer');
      expect(text).toContain('/home');
    });

    it('should export events as CSV', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&format=csv&type=events');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toContain('Timestamp,Event Type,Event Name');
      expect(text).toContain('signup');
    });

    it('should include Content-Disposition header for downloads', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123&format=csv');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('.csv');
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export');

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

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject export for site user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const url = new URL('https://example.com/api/export?siteId=site_test123');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer other_user_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should support different period options', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const periods = ['7d', '30d', '90d', '365d'];

      for (const period of periods) {
        const url = new URL(`https://example.com/api/export?siteId=site_test123&period=${period}`);

        const req = {
          method: 'GET',
          headers: createHeaders({ authorization: 'Bearer valid_token' }),
          url: url.toString()
        };

        const response = await handler(req, {});
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.period).toBeDefined();
      }
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/export.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
