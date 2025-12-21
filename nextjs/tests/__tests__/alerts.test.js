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
      async list(options = {}) {
        const prefix = options.prefix || '';
        const entries = [];
        for (const [key, value] of data.entries()) {
          if (key.startsWith(prefix)) {
            entries.push({ key, value });
          }
        }
        return { blobs: entries };
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
    sign: jest.fn((payload) => `token_${payload.email}`),
    verify: jest.fn((token) => {
      if (token.startsWith('token_')) {
        return { id: 'user-123', email: token.replace('token_', '') };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores } = await import('@netlify/blobs');

describe('Alerts API', () => {
  const testToken = 'token_test@example.com';
  const validAuthHeaders = {
    'Authorization': `Bearer ${testToken}`,
    'Content-Type': 'application/json'
  };

  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user and site
    const { getStore } = await import('@netlify/blobs');
    const usersStore = getStore({ name: 'users' });
    const sitesStore = getStore({ name: 'sites' });

    await usersStore.setJSON('user:user-123', {
      id: 'user-123',
      email: 'test@example.com',
      sites: ['site-1']
    });

    await sitesStore.setJSON('site:site-1', {
      id: 'site-1',
      userId: 'user-123',
      domain: 'example.com'
    });

    // Set up user's sites list (required by getUserSites)
    await sitesStore.setJSON('user_sites_user-123', ['site-1']);
  });

  describe('GET /api/alerts - List alerts', () => {
    it('should list alerts for a site', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/alerts?siteId=site-1',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alerts).toBeDefined();
      expect(Array.isArray(data.alerts)).toBe(true);
      expect(data.baseline).toBeDefined();
    });

    it('should return 400 if siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should return 403 if user does not own the site', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/alerts?siteId=site-999',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/alerts?siteId=site-1',
        headers: createHeaders({})
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/alerts - Create alert', () => {
    it('should create a traffic spike alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          name: 'Traffic Spike Alert',
          type: 'traffic_spike',
          threshold: 200,
          timeWindow: 60,
          cooldown: 60,
          notifyEmail: true,
          notifyWebhook: false
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert).toBeDefined();
      expect(data.alert.type).toBe('traffic_spike');
      expect(data.alert.threshold).toBe(200);
      expect(data.alert.timeWindow).toBe(60);
    });

    it('should create an anomaly detection alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          name: 'Anomaly Alert',
          type: 'anomaly',
          threshold: 150,
          timeWindow: 30,
          cooldown: 60,
          notifyEmail: true,
          notifyWebhook: true
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert).toBeDefined();
      expect(data.alert.type).toBe('anomaly');
      expect(data.alert.notifyWebhook).toBe(true);
    });

    it('should create a comparison alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          name: 'Comparison Alert',
          type: 'comparison',
          threshold: 100,
          timeWindow: 120,
          cooldown: 120,
          notifyEmail: true
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert).toBeDefined();
      expect(data.alert.type).toBe('comparison');
    });

    it('should require siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          name: 'Alert',
          type: 'traffic_spike'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should validate threshold range (50-1000)', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      // Test with threshold below minimum
      const req1 = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          threshold: 10
        })
      };

      const response1 = await handler(req1, { ip: '127.0.0.1' });
      const data1 = await response1.json();

      expect(response1.status).toBe(201);
      expect(data1.alert.threshold).toBe(50); // Should be clamped to minimum

      // Test with threshold above maximum
      const req2 = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          threshold: 5000
        })
      };

      const response2 = await handler(req2, { ip: '127.0.0.1' });
      const data2 = await response2.json();

      expect(response2.status).toBe(201);
      expect(data2.alert.threshold).toBe(1000); // Should be clamped to maximum
    });

    it('should validate time window range (15-1440 minutes)', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      // Test with timeWindow below minimum
      const req1 = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          timeWindow: 5
        })
      };

      const response1 = await handler(req1, { ip: '127.0.0.1' });
      const data1 = await response1.json();

      expect(response1.status).toBe(201);
      expect(data1.alert.timeWindow).toBe(15); // Should be clamped to minimum

      // Test with timeWindow above maximum
      const req2 = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          timeWindow: 3000
        })
      };

      const response2 = await handler(req2, { ip: '127.0.0.1' });
      const data2 = await response2.json();

      expect(response2.status).toBe(201);
      expect(data2.alert.timeWindow).toBe(1440); // Should be clamped to maximum
    });

    it('should validate notification channels', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          notifyEmail: true,
          notifyWebhook: true
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert.notifyEmail).toBe(true);
      expect(data.alert.notifyWebhook).toBe(true);
    });

    it('should default notifyEmail to true if not specified', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alert.notifyEmail).toBe(true);
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders({}),
        json: async () => ({
          siteId: 'site-1'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      expect(response.status).toBe(401);
    });

    it('should reject if user does not own the site', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-999'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });
  });

  describe('PATCH /api/alerts - Update alert', () => {
    it('should update an alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      // First create an alert
      const createReq = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          threshold: 200
        })
      };

      const createResponse = await handler(createReq, { ip: '127.0.0.1' });
      const createData = await createResponse.json();
      const alertId = createData.alert.id;

      // Now update it
      const updateReq = {
        method: 'PATCH',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          alertId,
          threshold: 300,
          enabled: false
        })
      };

      const response = await handler(updateReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alert).toBeDefined();
      expect(data.alert.id).toBe(alertId);
    });

    it('should toggle enabled status', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      // First create an alert
      const createReq = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1'
        })
      };

      const createResponse = await handler(createReq, { ip: '127.0.0.1' });
      const createData = await createResponse.json();
      const alertId = createData.alert.id;

      // Disable the alert
      const updateReq = {
        method: 'PATCH',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          alertId,
          enabled: false
        })
      };

      const response = await handler(updateReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alert).toBeDefined();
    });

    it('should require alertId', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'PATCH',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          enabled: false
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should return 404 for non-existent alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'PATCH',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          alertId: 'non-existent-alert',
          enabled: false
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /api/alerts - Delete alert', () => {
    it('should delete an alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      // First create an alert
      const createReq = {
        method: 'POST',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1'
        })
      };

      const createResponse = await handler(createReq, { ip: '127.0.0.1' });
      const createData = await createResponse.json();
      const alertId = createData.alert.id;

      // Now delete it
      const deleteReq = {
        method: 'DELETE',
        url: `http://localhost/api/alerts?alertId=${alertId}`,
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(deleteReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should require alertId', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'DELETE',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should return 404 for non-existent alert', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'DELETE',
        url: 'http://localhost/api/alerts?alertId=non-existent-alert',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('OPTIONS /api/alerts - CORS preflight', () => {
    it('should handle OPTIONS request', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'OPTIONS',
        url: 'http://localhost/api/alerts',
        headers: createHeaders({})
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      expect(response.status).toBe(204);
    });
  });

  describe('Invalid HTTP methods', () => {
    it('should reject PUT requests', async () => {
      const { default: handler } = await import('../../netlify/functions/alerts.js');

      const req = {
        method: 'PUT',
        url: 'http://localhost/api/alerts',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain('not allowed');
    });
  });
});
