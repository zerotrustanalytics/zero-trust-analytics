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
      if (token === 'other_user_token') {
        return { id: 'user_456', email: 'other@example.com' };
      }
      throw new Error('Invalid token');
    })
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Sites Management Endpoints', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test users
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com',
      passwordHash: 'hashed_password',
      createdAt: new Date().toISOString()
    });
    await usersStore.setJSON('other@example.com', {
      id: 'user_456',
      email: 'other@example.com',
      passwordHash: 'hashed_password',
      createdAt: new Date().toISOString()
    });

    // Create test site
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test123', {
      id: 'site_test123',
      userId: 'user_123',
      domain: 'example.com',
      nickname: null,
      createdAt: new Date().toISOString()
    });
    await sitesStore.setJSON('user_sites_user_123', ['site_test123']);
  });

  describe('POST /api/sites/delete', () => {
    it('should delete a site owned by the user', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should remove site from storage after deletion', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123'
        })
      };

      await handler(req, {});

      // Verify site was deleted
      const sitesStore = getStore({ name: 'sites' });
      const site = await sitesStore.get('site_test123', { type: 'json' });

      expect(site).toBeNull();
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          siteId: 'site_test123'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should reject deleting non-existent site', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'nonexistent_site'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should reject deleting site owned by another user', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer other_user_token' }),
        json: async () => ({
          siteId: 'site_test123'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Not authorized');
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-delete.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });

  describe('POST /api/sites/update', () => {
    it('should update site domain', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123',
          domain: 'newdomain.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.site.domain).toBe('newdomain.com');
    });

    it('should update site nickname', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123',
          nickname: 'My Portfolio'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site.nickname).toBe('My Portfolio');
    });

    it('should normalize domain (strip protocol and trailing slash)', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123',
          domain: 'https://NEWSITE.COM/'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site.domain).toBe('newsite.com');
    });

    it('should clear nickname when set to empty string', async () => {
      // First set a nickname
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      await handler({
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123',
          nickname: 'My Site'
        })
      }, {});

      // Now clear it
      const response = await handler({
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'site_test123',
          nickname: ''
        })
      }, {});

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.site.nickname).toBeNull();
    });

    it('should reject requests without auth', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          siteId: 'site_test123',
          domain: 'newdomain.com'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should reject requests without siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          domain: 'newdomain.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should reject updating non-existent site', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        json: async () => ({
          siteId: 'nonexistent_site',
          domain: 'newdomain.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should reject updating site owned by another user', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'POST',
        headers: createHeaders({ authorization: 'Bearer other_user_token' }),
        json: async () => ({
          siteId: 'site_test123',
          domain: 'hacked.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Not authorized');
    });

    it('should reject non-POST requests', async () => {
      const { default: handler } = await import('../../netlify/functions/sites-update.js');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
