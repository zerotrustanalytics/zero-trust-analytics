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
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

// Mock storage library
let mockShare = {
  siteId: 'site_123',
  allowedPeriods: ['7d', '30d']
};
let mockSite = { domain: 'example.com', nickname: 'My Site' };

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getPublicShare: jest.fn(() => Promise.resolve(mockShare)),
  getSite: jest.fn(() => Promise.resolve(mockSite))
}));

// Mock Turso
const mockStats = {
  summary: {
    unique_visitors: 1250,
    pageviews: 5000,
    bounce_rate: 35.5,
    avg_duration: 180
  },
  pages: [{ path: '/', views: 2000 }],
  referrers: [{ source: 'google.com', visits: 500 }],
  devices: [{ type: 'desktop', count: 800 }],
  browsers: [{ name: 'Chrome', count: 600 }],
  countries: [{ code: 'US', count: 400 }],
  daily: [{ date: '2024-01-15', visitors: 100 }]
};

jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({
  getStats: jest.fn(() => Promise.resolve(mockStats))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { getPublicShare } = await import('../../netlify/functions/lib/storage.js');

describe('Public Stats Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    mockShare = {
      siteId: 'site_123',
      allowedPeriods: ['7d', '30d']
    };
    mockSite = { domain: 'example.com', nickname: 'My Site' };
  });

  describe('GET /api/public/stats', () => {
    it('should return stats for valid share token', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=7d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site).toBeDefined();
      expect(data.site.domain).toBe('example.com');
      expect(data.uniqueVisitors).toBe(1250);
      expect(data.pageviews).toBe(5000);
      expect(data.bounceRate).toBe(35.5);
      expect(data.pages).toBeDefined();
      expect(data.referrers).toBeDefined();
      expect(data.devices).toBeDefined();
    });

    it('should return 400 when token is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Share token');
    });

    it('should return 404 for invalid share token', async () => {
      getPublicShare.mockResolvedValueOnce(null);

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=invalid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Invalid or expired');
    });

    it('should return 403 when period is not allowed', async () => {
      mockShare.allowedPeriods = ['7d']; // Only 7d allowed

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=365d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Period not allowed');
    });

    it('should use default period of 7d when not specified', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('7d');
    });

    it('should support 24h period', async () => {
      mockShare.allowedPeriods = ['24h', '7d', '30d'];

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=24h',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('24h');
    });

    it('should support 30d period', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=30d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('30d');
    });

    it('should support 90d period', async () => {
      mockShare.allowedPeriods = ['7d', '30d', '90d'];

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=90d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('90d');
    });

    it('should support 365d period', async () => {
      mockShare.allowedPeriods = ['7d', '30d', '90d', '365d'];

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=365d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('365d');
    });

    it('should include allowedPeriods in response', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=7d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowedPeriods).toEqual(['7d', '30d']);
    });

    it('should work when allowedPeriods is not set on share', async () => {
      mockShare.allowedPeriods = null;

      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=7d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should include cache headers', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token&period=7d',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Cache-Control')).toContain('public');
      expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    });
  });

  describe('Common', () => {
    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/public/stats',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/public-stats.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/public/stats?token=valid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
