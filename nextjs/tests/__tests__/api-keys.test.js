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
let mockApiKeys = [
  { id: 'key_1', name: 'My API Key', permissions: ['read'], prefix: 'zta_', createdAt: new Date().toISOString() }
];
let mockUpdateResult = { id: 'key_1', name: 'Updated Key Name' };
let mockRevokeResult = true;

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  createApiKey: jest.fn((userId, name, permissions) => Promise.resolve({
    id: 'key_new',
    key: 'zta_newkey123456789',
    name: name || 'API Key',
    permissions,
    prefix: 'zta_new...',
    createdAt: new Date().toISOString()
  })),
  getUserApiKeys: jest.fn(() => Promise.resolve(mockApiKeys)),
  updateApiKeyName: jest.fn(() => Promise.resolve(mockUpdateResult)),
  revokeApiKey: jest.fn(() => Promise.resolve(mockRevokeResult))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { updateApiKeyName, revokeApiKey } = await import('../../netlify/functions/lib/storage.js');

describe('API Keys Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    mockUpdateResult = { id: 'key_1', name: 'Updated Key Name' };
    mockRevokeResult = true;
  });

  describe('GET /api/keys', () => {
    it('should return list of API keys for user', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.keys).toBeDefined();
      expect(Array.isArray(data.keys)).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/keys',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/keys', () => {
    it('should create a new API key', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'My New Key',
          permissions: ['read', 'write']
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.key).toBeDefined();
      expect(data.message).toContain('Save the key');
    });

    it('should filter invalid permissions', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'My Key',
          permissions: ['read', 'invalid_permission', 'write']
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.key.permissions).toContain('read');
      expect(data.key.permissions).toContain('write');
      expect(data.key.permissions).not.toContain('invalid_permission');
    });

    it('should default to read permission when no valid permissions provided', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'My Key',
          permissions: ['invalid_only']
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.key.permissions).toContain('read');
    });

    it('should default to read permission when permissions not provided', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'My Key'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.key.permissions).toContain('read');
    });

    it('should accept admin permission', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'Admin Key',
          permissions: ['admin']
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.key.permissions).toContain('admin');
    });
  });

  describe('PATCH /api/keys', () => {
    it('should update API key name', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          keyId: 'key_1',
          name: 'Updated Key Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.key).toBeDefined();
    });

    it('should return 400 when keyId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Key ID');
    });

    it('should return 400 when name is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          keyId: 'key_1'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('name');
    });

    it('should return 404 when key not found', async () => {
      updateApiKeyName.mockResolvedValueOnce(null);

      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'PATCH',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          keyId: 'key_nonexistent',
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/keys', () => {
    it('should revoke an API key', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/keys?keyId=key_1',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 when keyId is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Key ID');
    });

    it('should return 404 when key not found', async () => {
      revokeApiKey.mockResolvedValueOnce(false);

      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/keys?keyId=key_nonexistent',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(404);
    });
  });

  describe('Common', () => {
    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

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
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'PUT',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/api-keys.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/keys',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
