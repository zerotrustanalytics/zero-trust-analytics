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
let mockUser = {
  id: 'user_123',
  email: 'testuser@example.com',
  plan: 'pro',
  subscription: {
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  trialEndsAt: null
};

let mockStatus = {
  plan: 'pro',
  status: 'active',
  canAccess: true,
  trialEndsAt: null,
  daysLeft: null,
  subscription: {
    status: 'active',
    currentPeriodEnd: mockUser.subscription.currentPeriodEnd
  }
};

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getUser: jest.fn(() => Promise.resolve(mockUser)),
  getUserStatus: jest.fn(() => mockStatus)
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { getUser, getUserStatus } = await import('../../netlify/functions/lib/storage.js');

describe('User Status Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    mockUser = {
      id: 'user_123',
      email: 'testuser@example.com',
      plan: 'pro',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
    mockStatus = {
      plan: 'pro',
      status: 'active',
      canAccess: true,
      trialEndsAt: null,
      daysLeft: null,
      subscription: mockUser.subscription
    };
  });

  describe('GET /api/user/status', () => {
    it('should return user status for authenticated user', async () => {
      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('user_123');
      expect(data.email).toBe('testuser@example.com');
      expect(data.plan).toBe('pro');
      expect(data.status).toBe('active');
      expect(data.canAccess).toBe(true);
    });

    it('should include subscription info for subscribed users', async () => {
      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription).toBeDefined();
      expect(data.subscription.status).toBe('active');
      expect(data.subscription.currentPeriodEnd).toBeDefined();
    });

    it('should return trial info for users on trial', async () => {
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      mockStatus = {
        plan: 'pro',
        status: 'trial',
        canAccess: true,
        trialEndsAt,
        daysLeft: 7,
        subscription: null
      };

      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.trialEndsAt).toBe(trialEndsAt);
      expect(data.daysLeft).toBe(7);
    });

    it('should return canAccess=false for expired users', async () => {
      mockStatus = {
        plan: 'pro',
        status: 'expired',
        canAccess: false,
        trialEndsAt: new Date(Date.now() - 1000).toISOString(),
        daysLeft: 0,
        subscription: null
      };

      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.canAccess).toBe(false);
      expect(data.status).toBe('expired');
    });

    it('should return null subscription when user has no subscription', async () => {
      mockStatus = {
        plan: 'solo',
        status: 'trial',
        canAccess: true,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        daysLeft: 14,
        subscription: null
      };

      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription).toBeNull();
    });

    it('should return 404 when user not found', async () => {
      getUser.mockResolvedValueOnce(null);

      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('User not found');
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('Common', () => {
    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('should reject non-GET requests', async () => {
      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/user-status.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/status',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
