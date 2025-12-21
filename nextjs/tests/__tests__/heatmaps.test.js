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
      },
      async list() {
        const blobs = [];
        for (const [key, value] of data.entries()) {
          blobs.push({ key, value });
        }
        return { blobs };
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

describe('Heatmaps Endpoint', () => {
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

    // Create a test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_123', {
      id: 'site_123',
      domain: 'example.com',
      userId: 'user_123',
      createdAt: new Date().toISOString()
    });

    // Associate site with user
    await sitesStore.setJSON('user_sites_user_123', ['site_123']);
  });

  describe('OPTIONS - CORS preflight', () => {
    it('should handle CORS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({}),
        url: 'https://example.com/api/heatmaps'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);

      // Get headers - Response object stores headers differently
      const headers = Object.fromEntries(response.headers);
      expect(headers['access-control-allow-origin']).toBe('*');
      expect(headers['access-control-allow-methods']).toContain('GET');
      expect(headers['access-control-allow-methods']).toContain('POST');
      expect(headers['access-control-allow-headers']).toContain('Authorization');
    });
  });

  describe('POST - Record heatmap data', () => {
    it('should reject requests without authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'click',
          data: {
            path: '/',
            xPercent: 50,
            yPercent: 30,
            viewportWidth: 1920,
            viewportHeight: 1080
          }
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should record click data successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'click',
          data: {
            path: '/home',
            xPercent: 45.5,
            yPercent: 67.8,
            element: 'button.cta',
            viewportWidth: 1920,
            viewportHeight: 1080
          }
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify data was stored
      const heatmapsStore = getStore({ name: 'heatmaps' });
      const today = new Date().toISOString().split('T')[0];
      const key = `site_123:clicks:${today}:${encodeURIComponent('/home')}`;
      const stored = await heatmapsStore.get(key, { type: 'json' });

      expect(stored).toBeDefined();
      expect(stored.clicks).toHaveLength(1);
      expect(stored.clicks[0].x).toBe(45.5);
      expect(stored.clicks[0].y).toBe(67.8);
      expect(stored.clicks[0].element).toBe('button.cta');
      expect(stored.totalClicks).toBe(1);
      expect(stored.viewport['1920x1080']).toBe(1);
    });

    it('should record scroll data successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'scroll',
          data: {
            path: '/about',
            maxScrollDepth: 85,
            foldPosition: 70
          }
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify data was stored
      const heatmapsStore = getStore({ name: 'heatmaps' });
      const today = new Date().toISOString().split('T')[0];
      const key = `site_123:scroll:${today}:${encodeURIComponent('/about')}`;
      const stored = await heatmapsStore.get(key, { type: 'json' });

      expect(stored).toBeDefined();
      expect(stored.maxDepths).toContain(85);
      expect(stored.depths['80-90']).toBe(1);
      expect(stored.totalSessions).toBe(1);
    });

    it('should reject requests with missing required fields', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'click'
          // Missing 'data' field
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject invalid heatmap type', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'invalid_type',
          data: { path: '/' }
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid type');
    });

    it('should validate site ownership', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'unauthorized_site',
          type: 'click',
          data: {
            path: '/',
            xPercent: 50,
            yPercent: 50,
            viewportWidth: 1920,
            viewportHeight: 1080
          }
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should aggregate multiple clicks on same page', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const headers = createHeaders({ authorization: 'Bearer valid_token' });

      // Record first click
      await handler({
        method: 'POST',
        headers,
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'click',
          data: {
            path: '/product',
            xPercent: 25,
            yPercent: 30,
            viewportWidth: 1920,
            viewportHeight: 1080
          }
        })
      }, {});

      // Record second click
      await handler({
        method: 'POST',
        headers,
        url: 'https://example.com/api/heatmaps',
        json: async () => ({
          siteId: 'site_123',
          type: 'click',
          data: {
            path: '/product',
            xPercent: 75,
            yPercent: 60,
            viewportWidth: 1366,
            viewportHeight: 768
          }
        })
      }, {});

      // Verify aggregated data
      const heatmapsStore = getStore({ name: 'heatmaps' });
      const today = new Date().toISOString().split('T')[0];
      const key = `site_123:clicks:${today}:${encodeURIComponent('/product')}`;
      const stored = await heatmapsStore.get(key, { type: 'json' });

      expect(stored.clicks).toHaveLength(2);
      expect(stored.totalClicks).toBe(2);
      expect(stored.viewport['1920x1080']).toBe(1);
      expect(stored.viewport['1366x768']).toBe(1);
    });
  });

  describe('GET - Retrieve heatmap data', () => {
    beforeEach(async () => {
      // Pre-populate some heatmap data
      const heatmapsStore = getStore({ name: 'heatmaps' });
      const today = new Date().toISOString().split('T')[0];

      // Add click data
      await heatmapsStore.setJSON(`site_123:clicks:${today}:${encodeURIComponent('/')}`, {
        siteId: 'site_123',
        path: '/',
        date: today,
        clicks: [
          { x: 50, y: 30, element: 'button', timestamp: Date.now() },
          { x: 60, y: 40, element: 'link', timestamp: Date.now() }
        ],
        totalClicks: 2,
        viewport: { '1920x1080': 2 }
      });

      // Add scroll data
      await heatmapsStore.setJSON(`site_123:scroll:${today}:${encodeURIComponent('/')}`, {
        siteId: 'site_123',
        path: '/',
        date: today,
        depths: { '50-60': 3, '80-90': 2 },
        maxDepths: [55, 58, 85, 88, 90],
        totalSessions: 5,
        avgFold: 65,
        foldCount: 5
      });
    });

    it('should reject requests without authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: 'https://example.com/api/heatmaps?siteId=site_123'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require siteId parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should validate site ownership for GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps?siteId=unauthorized_site'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should get list of pages with heatmap data', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps?siteId=site_123&type=pages'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pages).toBeDefined();
      expect(data.dateRange).toBeDefined();
    });

    it('should get click heatmap data for a specific page', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const today = new Date().toISOString().split('T')[0];
      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: `https://example.com/api/heatmaps?siteId=site_123&type=clicks&path=/&startDate=${today}&endDate=${today}`
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.path).toBe('/');
      expect(data.clicks).toBeDefined();
      expect(data.clicks.length).toBeGreaterThan(0);
      expect(data.totalClicks).toBe(2);
      expect(data.density).toBeDefined();
      expect(data.maxDensity).toBeDefined();
    });

    it('should get scroll heatmap data for a specific page', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const today = new Date().toISOString().split('T')[0];
      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: `https://example.com/api/heatmaps?siteId=site_123&type=scroll&path=/&startDate=${today}&endDate=${today}`
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.path).toBe('/');
      expect(data.depths).toBeDefined();
      expect(data.totalSessions).toBe(5);
      expect(data.avgMaxDepth).toBeGreaterThan(0);
      expect(data.reach).toBeDefined();
    });

    it('should require path parameter for click heatmaps', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps?siteId=site_123&type=clicks'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Path required');
    });

    it('should require path parameter for scroll heatmaps', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps?siteId=site_123&type=scroll'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Path required');
    });

    it('should filter data by date range', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      // Use a past date range where no data exists
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      const startDate = pastDate.toISOString().split('T')[0];
      const endDate = pastDate.toISOString().split('T')[0];

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: `https://example.com/api/heatmaps?siteId=site_123&type=clicks&path=/&startDate=${startDate}&endDate=${endDate}`
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalClicks).toBe(0);
      expect(data.clicks).toHaveLength(0);
    });

    it('should aggregate data across multiple days', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const heatmapsStore = getStore({ name: 'heatmaps' });
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayStr = today.toISOString().split('T')[0];
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Add data for yesterday
      await heatmapsStore.setJSON(`site_123:clicks:${yesterdayStr}:${encodeURIComponent('/test')}`, {
        siteId: 'site_123',
        path: '/test',
        date: yesterdayStr,
        clicks: [{ x: 10, y: 20, timestamp: Date.now() }],
        totalClicks: 1,
        viewport: { '1920x1080': 1 }
      });

      // Add data for today
      await heatmapsStore.setJSON(`site_123:clicks:${todayStr}:${encodeURIComponent('/test')}`, {
        siteId: 'site_123',
        path: '/test',
        date: todayStr,
        clicks: [{ x: 30, y: 40, timestamp: Date.now() }],
        totalClicks: 1,
        viewport: { '1366x768': 1 }
      });

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: `https://example.com/api/heatmaps?siteId=site_123&type=clicks&path=/test&startDate=${yesterdayStr}&endDate=${todayStr}`
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalClicks).toBe(2);
      expect(data.clicks).toHaveLength(2);
      expect(data.viewport['1920x1080']).toBe(1);
      expect(data.viewport['1366x768']).toBe(1);
    });
  });

  describe('Method validation', () => {
    it('should reject unsupported HTTP methods', async () => {
      const { default: handler } = await import('../../netlify/functions/heatmaps.js');

      const req = {
        method: 'PUT',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/heatmaps'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain('Method not allowed');
    });
  });
});
