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
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Track Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();

    // Create a test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test123', {
      id: 'site_test123',
      userId: 'user_1',
      domain: 'example.com',
      createdAt: new Date().toISOString()
    });
  });

  describe('CORS Handling', () => {
    it('should respond to OPTIONS preflight request', async () => {
      const { default: handler } = await import('../track.js');

      const req = {
        method: 'OPTIONS',
        headers: new Map([['origin', 'https://example.com']])
      };
      req.headers.get = (key) => req.headers.get(key);

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should allow requests from registered domain', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'pageview',
          siteId: 'site_test123',
          path: '/'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(200);
    });

    it('should block requests from unauthorized domain', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://malicious-site.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'pageview',
          siteId: 'site_test123',
          path: '/'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(403);
    });
  });

  describe('Pageview Tracking', () => {
    it('should track pageview successfully', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'pageview',
          siteId: 'site_test123',
          path: '/home',
          url: 'https://example.com/home',
          sessionId: 'session_123'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'pageview',
          path: '/'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should reject requests with invalid siteId', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'pageview',
          siteId: 'invalid_site_id',
          path: '/'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Invalid site');
    });
  });

  describe('Event Tracking', () => {
    it('should track custom events', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'event',
          siteId: 'site_test123',
          category: 'custom',
          action: 'signup',
          label: 'newsletter'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should track event values', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'event',
          siteId: 'site_test123',
          category: 'ecommerce',
          action: 'purchase',
          value: 99.99
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(200);
    });
  });

  describe('Engagement Tracking', () => {
    it('should track engagement data', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'engagement',
          siteId: 'site_test123',
          sessionId: 'session_123',
          path: '/article',
          timeOnPage: 120,
          maxScrollDepth: 80
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(200);
    });
  });

  describe('Heartbeat Tracking', () => {
    it('should track heartbeat for realtime analytics', async () => {
      const { default: handler } = await import('../track.js');

      const headers = new Map([
        ['origin', 'https://example.com'],
        ['user-agent', 'Mozilla/5.0']
      ]);

      const req = {
        method: 'POST',
        headers: { get: (key) => headers.get(key) },
        json: async () => ({
          type: 'heartbeat',
          siteId: 'site_test123',
          sessionId: 'session_123',
          path: '/current-page'
        })
      };

      const response = await handler(req, { ip: '192.168.1.1' });

      expect(response.status).toBe(200);
    });
  });

  describe('HTTP Methods', () => {
    it('should reject GET requests', async () => {
      const { default: handler } = await import('../track.js');

      const req = {
        method: 'GET',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
