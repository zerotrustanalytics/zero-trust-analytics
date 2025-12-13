import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';
import crypto from 'crypto';

// Mock crypto.subtle for API key hashing using Node.js crypto
global.crypto = {
  subtle: {
    digest: async (algorithm, data) => {
      // Use Node.js crypto to create a consistent hash
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from(data));
      return hash.digest().buffer;
    }
  }
};

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
      async list() {
        const blobs = Array.from(data.keys()).map(key => ({ key }));
        return { blobs };
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear()
  };
});

// Mock turso database with comprehensive stats
jest.unstable_mockModule('../../netlify/functions/lib/turso.js', () => ({
  getStats: jest.fn(() => Promise.resolve({
    summary: {
      pageviews: 1250,
      unique_visitors: 450,
      bounce_rate: 42,
      avg_duration: 135
    },
    daily: [
      { date: '2024-12-11', pageviews: 180, unique_visitors: 65, bounces: 75, avg_duration: 125 },
      { date: '2024-12-10', pageviews: 175, unique_visitors: 62, bounces: 73, avg_duration: 130 },
      { date: '2024-12-09', pageviews: 165, unique_visitors: 58, bounces: 69, avg_duration: 140 },
      { date: '2024-12-08', pageviews: 170, unique_visitors: 60, bounces: 71, avg_duration: 135 },
      { date: '2024-12-07', pageviews: 160, unique_visitors: 56, bounces: 67, avg_duration: 138 },
      { date: '2024-12-06', pageviews: 195, unique_visitors: 70, bounces: 82, avg_duration: 128 },
      { date: '2024-12-05', pageviews: 205, unique_visitors: 79, bounces: 86, avg_duration: 142 }
    ],
    pages: { '/': 550, '/blog': 320, '/about': 210, '/contact': 170 },
    referrers: { 'google.com': 420, 'twitter.com': 180, 'facebook.com': 150 },
    devices: { desktop: 780, mobile: 370, tablet: 100 },
    browsers: { Chrome: 720, Firefox: 310, Safari: 220 },
    countries: { US: 625, UK: 280, CA: 200, DE: 145 }
  })),
  getRealtime: jest.fn(() => Promise.resolve({
    active_visitors: 12,
    pageviews_last_5min: 25,
    recent_pageviews: [],
    visitors_per_minute: [],
    traffic_sources: []
  }))
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Stats API Endpoint', () => {
  let validApiKey;

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

    // Create API key for testing
    const apiKeysStore = getStore({ name: 'api_keys' });
    validApiKey = 'zta_test_1234567890abcdef'; // The actual API key

    // Calculate the hash that would be stored
    const encoder = new TextEncoder();
    const data = encoder.encode(validApiKey);
    const hashBuffer = await global.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await apiKeysStore.setJSON('key_1', {
      id: 'key_1',
      userId: 'user_123',
      keyHash: keyHash,
      name: 'Test API Key',
      permissions: ['read'],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      isActive: true
    });
  });

  describe('Authentication', () => {
    it('should accept valid API key in Bearer token format', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors,pageviews');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      if (response.status !== 200) {
        const data = await response.json();
        console.log('Error response:', data);
      }
      expect(response.status).toBe(200);
    });

    it('should reject requests without API key', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toMatch(/api key/i);
    });

    it('should reject requests with invalid API key', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer invalid_key_xyz' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toMatch(/invalid|unauthorized/i);
    });

    it('should reject malformed authorization header', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'InvalidFormat' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(401);
    });
  });

  describe('Parameter Validation', () => {
    it('should require site_id parameter', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?period=7d&metrics=visitors');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/site_id.*required/i);
    });

    it('should reject invalid period values', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=invalid_period');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/invalid.*period/i);
    });

    it('should reject unauthorized site access', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=unauthorized_site&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toMatch(/access denied|forbidden/i);
    });
  });

  describe('Period Options', () => {
    it('should support realtime period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=realtime');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.query.period).toBe('realtime');
    });

    it('should support day period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=day');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.query.period).toBe('day');
    });

    it('should support 7d period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.query.period).toBe('7d');
    });

    it('should support 30d period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=30d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support 6mo period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=6mo');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support 12mo period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=12mo');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support custom period with date_from and date_to', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=custom&date_from=2024-12-01&date_to=2024-12-10');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.query.period).toBe('custom');
    });

    it('should require date_from and date_to for custom period', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=custom');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/date_from.*date_to/i);
    });
  });

  describe('Metrics Support', () => {
    it('should support visitors metric', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0].visitors).toBeDefined();
    });

    it('should support pageviews metric', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=pageviews');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].pageviews).toBeDefined();
    });

    it('should support bounce_rate metric', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=bounce_rate');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].bounce_rate).toBeDefined();
    });

    it('should support visit_duration metric', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visit_duration');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].visit_duration).toBeDefined();
    });

    it('should support multiple metrics', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors,pageviews,bounce_rate');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].visitors).toBeDefined();
      expect(data.results[0].pageviews).toBeDefined();
      expect(data.results[0].bounce_rate).toBeDefined();
    });

    it('should default to visitors and pageviews if no metrics specified', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].visitors).toBeDefined();
      expect(data.results[0].pageviews).toBeDefined();
    });
  });

  describe('Property Breakdowns', () => {
    it('should support page property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=page');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0].page).toBeDefined();
    });

    it('should support source property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=source');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].source).toBeDefined();
    });

    it('should support country property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=country');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support device property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=device');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support browser property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=browser');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support os property breakdown', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&property=os');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });
  });

  describe('Filters', () => {
    it('should support page filter with exact match', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&filters=page==/blog');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support wildcard filters', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&filters=page==/blog/*');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });

    it('should support multiple filters', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&filters=page==/blog/*;country==US');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      expect(response.status).toBe(200);
    });
  });

  describe('Response Format', () => {
    it('should return results array and query object', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d&metrics=visitors,pageviews');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.query).toBeDefined();
      expect(data.query.site_id).toBe('site_test');
      expect(data.query.period).toBe('7d');
      expect(data.query.metrics).toEqual(['visitors', 'pageviews']);
    });

    it('should include date field in results', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.results[0].date).toBeDefined();
      expect(typeof data.results[0].date).toBe('string');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({
          authorization: `Bearer ${validApiKey}`,
          'x-forwarded-for': '192.168.1.1'
        }),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should enforce rate limits', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      // Make requests up to and exceeding the limit
      const requests = [];
      for (let i = 0; i < 102; i++) {
        const req = {
          method: 'GET',
          headers: createHeaders({
            authorization: `Bearer ${validApiKey}`,
            'x-forwarded-for': '192.168.1.100'
          }),
          url: url.toString()
        };
        requests.push(handler(req, {}));
      }

      const responses = await Promise.all(requests);

      // Last response should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);

      const data = await lastResponse.json();
      expect(data.error).toMatch(/too many requests/i);
    });
  });

  describe('Error Handling', () => {
    it('should return 405 for unsupported methods', async () => {
      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toMatch(/method not allowed/i);
    });

    it('should handle database errors gracefully', async () => {
      const { getStats } = await import('../../netlify/functions/lib/turso.js');
      getStats.mockImplementationOnce(() => Promise.reject(new Error('Database error')));

      const { default: handler } = await import('../../netlify/functions/stats-api.js');

      const url = new URL('https://example.com/api/stats-api?site_id=site_test&period=7d');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: `Bearer ${validApiKey}` }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });
});
