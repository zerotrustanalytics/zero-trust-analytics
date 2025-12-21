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
let mockSessions = [
  {
    id: 'sess_1',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    device: 'Chrome on Mac',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh)'
  },
  {
    id: 'sess_2',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
    device: 'Firefox on Windows',
    ipAddress: '10.0.0.50',
    userAgent: 'Mozilla/5.0 (Windows)'
  }
];
let mockRevokeResult = true;
let mockRevokeAllResult = 1;

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getUserSessions: jest.fn(() => Promise.resolve(mockSessions)),
  revokeSession: jest.fn(() => Promise.resolve(mockRevokeResult)),
  revokeAllSessions: jest.fn(() => Promise.resolve(mockRevokeAllResult))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { revokeSession, getUserSessions } = await import('../../netlify/functions/lib/storage.js');

describe('User Sessions Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'testuser@example.com' } };
    mockRevokeResult = true;
    mockRevokeAllResult = 1;
  });

  describe('GET /api/user/sessions', () => {
    it('should return list of user sessions', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0 (Macintosh)';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessions).toBeDefined();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBe(2);
    });

    it('should mask IP addresses for privacy', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      // IP should be masked (192.168.***.*** format)
      expect(data.sessions[0].ipAddress).toContain('***');
    });

    it('should identify current session', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0 (Macintosh)';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      // First session should be marked as current (matching user agent)
      expect(data.sessions[0].isCurrent).toBe(true);
      expect(data.sessions[1].isCurrent).toBe(false);
    });

    it('should return 401 when not authenticated', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/sessions',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/user/sessions - Single session', () => {
    it('should revoke a specific session', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/user/sessions?sessionId=sess_2',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 404 when session not found', async () => {
      revokeSession.mockResolvedValueOnce(false);

      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/user/sessions?sessionId=sess_nonexistent',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            return null;
          }
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/user/sessions - All sessions', () => {
    it('should revoke all sessions except current', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/user/sessions?all=true',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0 (Macintosh)';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Revoked');
    });

    it('should return 400 when neither sessionId nor all=true is provided', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            return null;
          }
        }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Session ID or all=true');
    });
  });

  describe('Common', () => {
    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });

    it('should reject unsupported methods', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers', async () => {
      const { default: handler } = await import('../../netlify/functions/user-sessions.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/user/sessions',
        headers: {
          get: (name) => {
            if (name === 'authorization') return 'Bearer valid_token';
            if (name === 'user-agent') return 'Mozilla/5.0';
            return null;
          }
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
