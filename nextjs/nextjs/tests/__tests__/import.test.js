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
      async set(key, value) {
        data.set(key, value);
      },
      async list() {
        return {
          blobs: Array.from(data.keys()).map(key => ({ key }))
        };
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

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn((token) => {
      if (token === 'valid_token') {
        return { id: 'user_123', email: 'user@example.com' };
      }
      throw new Error('Invalid token');
    }),
    sign: jest.fn(() => 'mock_token')
  }
}));

const { getStore } = await import('@netlify/blobs');

describe('Import Endpoint', () => {
  beforeEach(async () => {
    // Clear all stores before each test
    const { __clearAllStores } = await import('@netlify/blobs');
    __clearAllStores();

    // Set up a test site owned by user_123
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test123', {
      id: 'site_test123',
      domain: 'example.com',
      userId: 'user_123',
      createdAt: new Date().toISOString()
    });
  });

  describe('OPTIONS /api/import', () => {
    it('should handle CORS preflight requests', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({}),
        url: 'https://example.com/api/import'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('GET /api/import', () => {
    it('should return empty import history for new user', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/import'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.imports).toEqual([]);
      expect(data.supportedFormats).toContain('csv');
      expect(data.supportedFormats).toContain('json');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: 'https://example.com/api/import'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/import', () => {
    it('should import CSV data successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const csvData = `date,pageviews,sessions,visitors
20241201,150,100,80
20241202,200,120,95
20241203,175,110,88`;

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: csvData,
          source: 'google-analytics'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.recordsProcessed).toBe(3);
      expect(data.recordsStored).toBe(3);
      expect(data.dateRange).toBeDefined();
      expect(data.dateRange.start).toBe('2024-12-01');
      expect(data.dateRange.end).toBe('2024-12-03');
    });

    it('should import JSON array data successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const jsonData = [
        { date: '20241201', pageviews: 150, sessions: 100 },
        { date: '20241202', pageviews: 200, sessions: 120 }
      ];

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'json',
          data: jsonData
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.recordsProcessed).toBe(2);
    });

    it('should import GA4 API response format', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const ga4Data = {
        dimensionHeaders: [{ name: 'date' }, { name: 'pagePath' }],
        metricHeaders: [{ name: 'screenPageViews' }, { name: 'sessions' }],
        rows: [
          {
            dimensionValues: [{ value: '20241201' }, { value: '/home' }],
            metricValues: [{ value: '150' }, { value: '100' }]
          },
          {
            dimensionValues: [{ value: '20241202' }, { value: '/about' }],
            metricValues: [{ value: '75' }, { value: '50' }]
          }
        ]
      };

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'ga4-api',
          data: ga4Data
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.recordsProcessed).toBe(2);
    });

    it('should require siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          format: 'csv',
          data: 'date,pageviews\n20241201,100'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('siteId');
    });

    it('should require data', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('data');
    });

    it('should reject invalid format', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'invalid_format',
          data: 'some data'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('format');
    });

    it('should deny access to sites user does not own', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      // Create a site owned by a different user
      const sitesStore = getStore({ name: 'sites' });
      await sitesStore.setJSON('site_other', {
        id: 'site_other',
        domain: 'other.com',
        userId: 'other_user',
        createdAt: new Date().toISOString()
      });

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_other',
          format: 'csv',
          data: 'date,pageviews\n20241201,100'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('denied');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: 'date,pageviews\n20241201,100'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should store import record in history', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      // First import
      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: 'date,pageviews\n20241201,100'
        })
      };

      await handler(req, {});

      // Get import history
      const getReq = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/import'
      };

      const { default: handler2 } = await import('../../netlify/functions/import.js');
      const response = await handler2(getReq, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.imports.length).toBe(1);
      expect(data.imports[0].siteId).toBe('site_test123');
      expect(data.imports[0].recordCount).toBe(1);
    });
  });

  describe('DELETE /api/import', () => {
    it('should delete import and associated data', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      // First create an import
      const importReq = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: 'date,pageviews\n20241201,100'
        })
      };

      const importResponse = await handler(importReq, {});
      const importData = await importResponse.json();
      const importId = importData.importId;

      // Now delete it
      const { default: handler2 } = await import('../../netlify/functions/import.js');
      const deleteReq = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: `https://example.com/api/import?importId=${importId}`
      };

      const deleteResponse = await handler2(deleteReq, {});
      const deleteData = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(deleteData.success).toBe(true);
    });

    it('should require importId', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/import'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('importId');
    });

    it('should return 404 for non-existent import', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/import?importId=nonexistent_123'
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'DELETE',
        headers: createHeaders({}),
        url: 'https://example.com/api/import?importId=some_id'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('CSV Parsing', () => {
    it('should handle quoted CSV values', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const csvData = `date,page,pageviews
20241201,"/blog/hello,world",150
20241202,"/about ""us""",200`;

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: csvData
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.recordsProcessed).toBe(2);
    });

    it('should normalize date formats', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      // Test YYYYMMDD format (GA default)
      const csvData = `date,pageviews
20241201,150
20241215,200`;

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: csvData
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.dateRange.start).toBe('2024-12-01');
      expect(data.dateRange.end).toBe('2024-12-15');
    });
  });

  describe('GA Field Mapping', () => {
    it('should map GA4 field names to ZTA field names', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const jsonData = [
        {
          date: '20241201',
          pagePath: '/home',
          screenPageViews: 150,
          sessions: 100,
          totalUsers: 80,
          bounceRate: 45.5,
          averageSessionDuration: 120,
          country: 'US',
          deviceCategory: 'desktop',
          browser: 'Chrome'
        }
      ];

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'json',
          data: jsonData
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);

      // Verify the data was stored with mapped field names
      const historicalStore = getStore({ name: 'historical' });
      const storedData = await historicalStore.get('site_test123_2024-12-01_imported', { type: 'json' });

      expect(storedData).toBeDefined();
      expect(storedData.page).toBe('/home');
      expect(storedData.pageviews).toBe(150);
      expect(storedData.visitors).toBe(80);
      expect(storedData.bounce_rate).toBe(45.5);
      expect(storedData.device).toBe('desktop');
    });

    it('should map Universal Analytics (ga:) field names', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const jsonData = [
        {
          'ga:date': '20241201',
          'ga:pagePath': '/about',
          'ga:pageviews': 200,
          'ga:sessions': 150,
          'ga:users': 120,
          'ga:bounceRate': 35.2
        }
      ];

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'json',
          data: jsonData
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);

      // Verify mapping
      const historicalStore = getStore({ name: 'historical' });
      const storedData = await historicalStore.get('site_test123_2024-12-01_imported', { type: 'json' });

      expect(storedData.page).toBe('/about');
      expect(storedData.pageviews).toBe(200);
      expect(storedData.visitors).toBe(120);
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid CSV format', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: 'https://example.com/api/import',
        json: async () => ({
          siteId: 'site_test123',
          format: 'csv',
          data: 'just one line with no data'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('parse');
    });

    it('should reject method not allowed', async () => {
      const { default: handler } = await import('../../netlify/functions/import.js');

      const req = {
        method: 'PUT',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: 'https://example.com/api/import'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
