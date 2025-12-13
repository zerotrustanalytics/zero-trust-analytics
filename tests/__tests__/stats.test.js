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
  getStats: jest.fn(() => Promise.resolve({
    pageviews: 100,
    uniqueVisitors: 50,
    sessions: 60,
    bounces: 20,
    bounceRate: 33.3,
    avgTimeOnPage: 45,
    pages: { '/': 50, '/about': 30, '/contact': 20 },
    referrers: { 'google.com': 40, 'twitter.com': 10 },
    devices: { desktop: 70, mobile: 25, tablet: 5 },
    browsers: { Chrome: 60, Firefox: 25, Safari: 15 },
    operatingSystems: { Windows: 50, macOS: 30 },
    countries: { US: 60, UK: 20, CA: 20 }
  }))
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Stats Endpoint', () => {
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

    // Add some pageview data
    const pageviewsStore = getStore({ name: 'pageviews' });
    const today = new Date().toISOString().split('T')[0];
    await pageviewsStore.setJSON(`site_test:${today}`, {
      siteId: 'site_test',
      date: today,
      pageviews: 100,
      visitors: ['v1', 'v2', 'v3'],
      sessions: ['s1', 's2', 's3'],
      uniqueVisitors: 3,
      uniqueSessions: 3,
      newVisitors: 2,
      returningVisitors: 1,
      bounces: 1,
      pages: { '/': 50, '/about': 30, '/contact': 20 },
      referrers: { 'google.com': 40, 'twitter.com': 10 },
      landingPages: { '/': 80, '/about': 20 },
      exitPages: { '/contact': 60, '/': 40 },
      trafficSources: { organic: 40, direct: 30, referral: 20, social: 10 },
      devices: { desktop: 70, mobile: 25, tablet: 5 },
      browsers: { Chrome: 60, Firefox: 25, Safari: 15 },
      operatingSystems: { Windows: 50, macOS: 30, iOS: 15, Android: 5 },
      screenResolutions: { '1920x1080': 40, '1366x768': 30 },
      languages: { en: 80, es: 15, fr: 5 },
      countries: { US: 60, UK: 20, CA: 20 },
      cities: { 'New York': 30, 'London': 20 },
      campaigns: { 'summer-sale': 15 },
      timeOnPage: { '/': { total: 6000, count: 50 }, '/about': { total: 3600, count: 30 } },
      scrollDepth: { total: 7500, count: 100 },
      sessionDuration: { total: 18000, count: 100 },
      pagesPerSession: { total: 300, count: 100 }
    });
  });

  describe('GET /api/stats', () => {
    it('should return stats for a valid site', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pageviews).toBeGreaterThanOrEqual(100);
      expect(data.uniqueVisitors).toBeGreaterThanOrEqual(3);
    });

    it('should calculate bounce rate correctly', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.bounceRate).toBeDefined();
      expect(typeof data.bounceRate).toBe('number');
    });

    it('should return top pages', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.pages).toBeDefined();
      expect(data.pages['/']).toBeGreaterThan(0);
    });

    it('should return referrer data', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.referrers).toBeDefined();
      expect(data.referrers['google.com']).toBeGreaterThan(0);
    });

    it('should return device breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.devices).toBeDefined();
      expect(data.browsers).toBeDefined();
      expect(data.operatingSystems).toBeDefined();
    });

    it('should return geographic data', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.countries).toBeDefined();
      expect(data.countries['US']).toBeGreaterThan(0);
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?siteId=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const url = new URL('https://example.com/api/stats?period=7d');

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

    it('should support custom date ranges', async () => {
      const { default: handler } = await import('../../netlify/functions/stats.js');

      const today = new Date().toISOString().split('T')[0];
      const url = new URL(`https://example.com/api/stats?siteId=site_test&startDate=${today}&endDate=${today}`);

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pageviews).toBe(100);
    });
  });
});
