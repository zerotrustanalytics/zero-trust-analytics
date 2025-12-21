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
let mockAnnotations = [
  { id: 'ann_1', date: '2024-01-15', title: 'Launch Day', description: 'Product launch' }
];
let mockUpdateResult = { id: 'ann_1', title: 'Updated Title' };
let mockDeleteResult = true;

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getUserSites: jest.fn(() => Promise.resolve(mockUserSites)),
  createAnnotation: jest.fn((siteId, userId, data) => Promise.resolve({
    id: 'ann_new',
    siteId,
    userId,
    ...data,
    createdAt: new Date().toISOString()
  })),
  getSiteAnnotations: jest.fn(() => Promise.resolve(mockAnnotations)),
  updateAnnotation: jest.fn(() => Promise.resolve(mockUpdateResult)),
  deleteAnnotation: jest.fn(() => Promise.resolve(mockDeleteResult))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { updateAnnotation, deleteAnnotation } = await import('../../netlify/functions/lib/storage.js');

describe('Annotations Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    mockUserSites = ['site_123'];
    mockUpdateResult = { id: 'ann_1', title: 'Updated Title' };
    mockDeleteResult = true;
  });

  describe('GET /api/annotations', () => {
    it('should return annotations for a site', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/annotations?siteId=site_123',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.annotations).toBeDefined();
      expect(Array.isArray(data.annotations)).toBe(true);
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/annotations',
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

      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/annotations?siteId=site_123',
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

  describe('POST /api/annotations', () => {
    it('should create a new annotation', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          date: '2024-01-20',
          title: 'New Feature',
          description: 'Released new feature'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.annotation).toBeDefined();
      expect(data.annotation.title).toBe('New Feature');
    });

    it('should return 400 when siteId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          date: '2024-01-20',
          title: 'New Feature'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Site ID');
    });

    it('should return 400 when date is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          title: 'New Feature'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('date');
    });

    it('should return 400 for invalid date format', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          date: '01/20/2024', // Wrong format
          title: 'New Feature'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('YYYY-MM-DD');
    });

    it('should return 403 when user does not own site', async () => {
      mockUserSites = ['other_site'];

      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          date: '2024-01-20',
          title: 'New Feature'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(403);
    });

    it('should use default values for optional fields', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          siteId: 'site_123',
          date: '2024-01-20'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.annotation.title).toBe('Event');
      expect(data.annotation.color).toBe('#0d6efd');
      expect(data.annotation.icon).toBe('star');
    });
  });

  describe('PATCH /api/annotations', () => {
    it('should update an annotation', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          annotationId: 'ann_1',
          title: 'Updated Title'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.annotation).toBeDefined();
    });

    it('should return 400 when annotationId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          title: 'Updated Title'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Annotation ID');
    });

    it('should return 404 when annotation not found', async () => {
      mockUpdateResult = null;
      updateAnnotation.mockResolvedValueOnce(null);

      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          annotationId: 'ann_nonexistent',
          title: 'Updated Title'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/annotations', () => {
    it('should delete an annotation', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/annotations?annotationId=ann_1',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 when annotationId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Annotation ID');
    });

    it('should return 404 when annotation not found', async () => {
      deleteAnnotation.mockResolvedValueOnce(false);

      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/annotations?annotationId=ann_nonexistent',
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

      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/annotations?siteId=site_123',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });

    it('should reject unsupported methods', async () => {
      const { default: handler } = await import('../../netlify/functions/annotations.js');

      const req = {
        method: 'PUT',
        url: 'https://zta.io/api/annotations',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });
  });
});
