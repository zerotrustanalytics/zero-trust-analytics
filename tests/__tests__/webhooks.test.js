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

// Mock global fetch for webhook testing
global.fetch = jest.fn();

describe('Webhooks API', () => {
  const testToken = 'token_test@example.com';
  const validAuthHeaders = {
    'Authorization': `Bearer ${testToken}`,
    'Content-Type': 'application/json'
  };

  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Reset fetch mock
    global.fetch.mockReset();

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

  describe('GET /api/webhooks - List webhooks', () => {
    it('should list webhooks for a site', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/webhooks?siteId=site-1',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.webhooks).toBeDefined();
      expect(Array.isArray(data.webhooks)).toBe(true);
      expect(data.availableEvents).toBeDefined();
    });

    it('should return 400 if siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID required');
    });

    it('should return 403 if user does not own the site', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/webhooks?siteId=site-999',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'GET',
        url: 'http://localhost/api/webhooks?siteId=site-1',
        headers: createHeaders({})
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/webhooks - Create webhook', () => {
    it('should create a webhook with valid URL and events', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook',
          events: ['pageview', 'event'],
          name: 'Test Webhook'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.webhook).toBeDefined();
      expect(data.webhook.url).toBe('https://example.com/webhook');
      expect(data.webhook.events).toContain('pageview');
      expect(data.webhook.secret).toBeDefined();
      expect(data.message).toContain('signing secret');
    });

    it('should reject non-HTTPS URLs', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'http://example.com/webhook',
          events: ['event']
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('HTTPS');
    });

    it('should reject invalid URLs', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'not-a-valid-url',
          events: ['event']
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid');
    });

    it('should require siteId and url', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          events: ['event']
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should generate a webhook secret', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook',
          events: ['event']
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.webhook.secret).toBeDefined();
      expect(typeof data.webhook.secret).toBe('string');
      expect(data.webhook.secret.length).toBeGreaterThan(20);
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders({}),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      expect(response.status).toBe(401);
    });

    it('should reject if user does not own the site', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-999',
          url: 'https://example.com/webhook'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });
  });

  describe('PATCH /api/webhooks - Update webhook', () => {
    it('should update a webhook', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      // First create a webhook
      const createReq = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook',
          events: ['event']
        })
      };

      const createResponse = await handler(createReq, { ip: '127.0.0.1' });
      const createData = await createResponse.json();
      const webhookId = createData.webhook.id;

      // Now update it
      const updateReq = {
        method: 'PATCH',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          webhookId,
          enabled: false
        })
      };

      const response = await handler(updateReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.webhook).toBeDefined();
      expect(data.webhook.id).toBe(webhookId);
    });

    it('should require webhookId', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'PATCH',
        url: 'http://localhost/api/webhooks',
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

    it('should return 404 for non-existent webhook', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'PATCH',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          webhookId: 'non-existent-webhook',
          enabled: false
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /api/webhooks - Delete webhook', () => {
    it('should delete a webhook', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      // First create a webhook
      const createReq = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook',
          events: ['event']
        })
      };

      const createResponse = await handler(createReq, { ip: '127.0.0.1' });
      const createData = await createResponse.json();
      const webhookId = createData.webhook.id;

      // Now delete it
      const deleteReq = {
        method: 'DELETE',
        url: `http://localhost/api/webhooks?webhookId=${webhookId}`,
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(deleteReq, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should require webhookId', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'DELETE',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should return 404 for non-existent webhook', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'DELETE',
        url: 'http://localhost/api/webhooks?webhookId=non-existent-webhook',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('Webhook event types validation', () => {
    it('should accept valid event types', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook',
          events: ['pageview', 'event', 'goal_completed']
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.webhook.events).toBeDefined();
    });

    it('should default to ["event"] if no events provided', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          siteId: 'site-1',
          url: 'https://example.com/webhook'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.webhook.events).toContain('event');
    });
  });

  describe('OPTIONS /api/webhooks - CORS preflight', () => {
    it('should handle OPTIONS request', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'OPTIONS',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders({})
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      expect(response.status).toBe(204);
    });
  });

  describe('Invalid HTTP methods', () => {
    it('should reject PUT requests', async () => {
      const { default: handler } = await import('../../netlify/functions/webhooks.js');

      const req = {
        method: 'PUT',
        url: 'http://localhost/api/webhooks',
        headers: createHeaders(validAuthHeaders)
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain('not allowed');
    });
  });
});
