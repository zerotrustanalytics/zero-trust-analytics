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
let mockUserSites = ['site_123'];
let mockShares = [
  { token: 'share_1', siteId: 'site_123', createdAt: new Date().toISOString() }
];
let mockSite = { domain: 'example.com', nickname: 'My Site' };
let mockDeleteResult = true;

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getUserSites: jest.fn(() => Promise.resolve(mockUserSites)),
  getSite: jest.fn(() => Promise.resolve(mockSite)),
  getSiteShares: jest.fn(() => Promise.resolve(mockShares)),
  createPublicShare: jest.fn((siteId, userId, options) => Promise.resolve({
    token: 'share_new',
    siteId,
    userId,
    ...options,
    createdAt: new Date().toISOString()
  })),
  deletePublicShare: jest.fn(() => Promise.resolve(mockDeleteResult))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { deletePublicShare } = await import('../../netlify/functions/lib/storage.js');

describe('Sites Share Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    mockUserSites = ['site_123'];
    mockDeleteResult = true;
  });

  describe('GET /api/sites/share', () => {
    it('should return shares for a site', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/sites/share?siteId=site_123',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.shares).toBeDefined();
      expect(Array.isArray(data.shares)).toBe(true);
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should return 403 when user does not own site', async () => {
      mockUserSites = ['other_site'];

      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/sites/share?siteId=site_123',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });
  });

  describe('POST /api/sites/share', () => {
    it('should create a new share', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.share).toBeDefined();
      expect(data.shareUrl).toContain('ztas.io/shared/');
      expect(data.site).toBeDefined();
    });

    it('should create share with expiration', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          expiresIn: '7d'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.share.expiresAt).toBeDefined();
    });

    it('should support 1d expiration', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          expiresIn: '1d'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(201);
    });

    it('should support 30d expiration', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          expiresIn: '30d'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(201);
    });

    it('should support 90d expiration', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          expiresIn: '90d'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(201);
    });

    it('should create share with password', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          password: 'secret123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.share.password).toBe('secret123');
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should return 403 when user does not own site', async () => {
      mockUserSites = ['other_site'];

      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/sites/share', () => {
    it('should delete a share', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/sites/share?token=share_1',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 when token is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Share token');
    });

    it('should return 404 when share not found or access denied', async () => {
      deletePublicShare.mockResolvedValueOnce(false);

      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/sites/share?token=nonexistent',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(404);
    });
  });

  describe('Common', () => {
    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/sites/share?siteId=site_123',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });

    it('should reject unsupported methods', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/sites/share',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-share.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/sites/share?siteId=site_123',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
