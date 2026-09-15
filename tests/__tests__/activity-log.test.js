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

// Mock auth library
let authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn(() => authResult)
}));

// Mock storage library
const mockActivities = [
  { id: 'act_1', type: 'site_created', siteId: 'site_1', createdAt: new Date().toISOString() },
  { id: 'act_2', type: 'login', createdAt: new Date().toISOString() }
];

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getUserActivityLog: jest.fn(() => Promise.resolve({
    activities: mockActivities,
    total: 2,
    hasMore: false
  })),
  formatActivityMessage: jest.fn((activity) => {
    const messages = {
      site_created: 'Created a new site',
      login: 'Logged in'
    };
    return messages[activity.type] || 'Unknown activity';
  })
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { getUserActivityLog } = await import('../../netlify/functions/lib/storage.js');

describe('Activity Log Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
  });

  describe('GET /api/activity', () => {
    it('should return activity log for authenticated user', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.activities).toBeDefined();
      expect(Array.isArray(data.activities)).toBe(true);
      expect(data.total).toBe(2);
      expect(data.hasMore).toBe(false);
    });

    it('should format activity messages', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(data.activities[0].message).toBeDefined();
    });

    it('should support limit and offset parameters', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity?limit=10&offset=5',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      await handler(req, {});

      expect(getUserActivityLog).toHaveBeenCalledWith('user_123', 10, 5);
    });

    it('should use default limit and offset when not provided', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      await handler(req, {});

      expect(getUserActivityLog).toHaveBeenCalledWith('user_123', 50, 0);
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity',
        headers: {
          get: () => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'POST',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/activity-log.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/activity',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
