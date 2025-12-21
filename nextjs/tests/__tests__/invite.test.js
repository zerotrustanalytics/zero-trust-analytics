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
let authResult = { user: { id: 'user_123', email: 'invitee@example.com' } };
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn(() => authResult)
}));

// Mock storage library
let mockInvite = {
  email: 'invitee@example.com',
  role: 'member',
  teamId: 'team_123',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
};
let mockTeam = { id: 'team_123', name: 'Test Team' };
let mockAcceptResult = { team: mockTeam };
let mockDeclineResult = {};

jest.unstable_mockModule('../../netlify/functions/lib/storage.js', () => ({
  getTeamInviteByToken: jest.fn(() => Promise.resolve(mockInvite)),
  getTeam: jest.fn(() => Promise.resolve(mockTeam)),
  acceptTeamInvite: jest.fn(() => Promise.resolve(mockAcceptResult)),
  declineTeamInvite: jest.fn(() => Promise.resolve(mockDeclineResult))
}));

const { __clearAllStores } = await import('@netlify/blobs');
const { getTeamInviteByToken, acceptTeamInvite, declineTeamInvite } = await import('../../netlify/functions/lib/storage.js');

describe('Invite Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    authResult = { user: { id: 'user_123', email: 'invitee@example.com' } };
    mockInvite = {
      email: 'invitee@example.com',
      role: 'member',
      teamId: 'team_123',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    mockAcceptResult = { team: mockTeam };
    mockDeclineResult = {};
  });

  describe('GET /api/invite', () => {
    it('should return invite details for valid token', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/invite?token=valid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.invite).toBeDefined();
      expect(data.invite.email).toBe('invitee@example.com');
      expect(data.invite.role).toBe('member');
      expect(data.team).toBeDefined();
      expect(data.team.name).toBe('Test Team');
    });

    it('should return 400 when token is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/invite',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Token');
    });

    it('should return 404 for invalid or expired invite', async () => {
      getTeamInviteByToken.mockResolvedValueOnce(null);

      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/invite?token=invalid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Invalid or expired');
    });
  });

  describe('POST /api/invite - Accept', () => {
    it('should accept invite successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          token: 'invite_token',
          action: 'accept'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('accepted');
      expect(data.team).toBeDefined();
    });

    it('should accept invite when action is not specified (default)', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          token: 'invite_token'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('accepted');
    });

    it('should return 400 when token is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({})
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Token');
    });

    it('should return 400 when accept fails', async () => {
      acceptTeamInvite.mockResolvedValueOnce({ error: 'Invite already used' });

      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          token: 'invite_token',
          action: 'accept'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('already used');
    });
  });

  describe('POST /api/invite - Decline', () => {
    it('should decline invite successfully', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          token: 'invite_token',
          action: 'decline'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('declined');
    });

    it('should return 400 when decline fails', async () => {
      declineTeamInvite.mockResolvedValueOnce({ error: 'Invite not found' });

      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: {
          get: (name) => name === 'authorization' ? 'Bearer valid_token' : null
        },
        json: async () => ({
          token: 'invite_token',
          action: 'decline'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('not found');
    });
  });

  describe('Common', () => {
    it('should return 401 when not authenticated for POST', async () => {
      authResult = { error: 'Unauthorized', status: 401 };

      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'POST',
        url: 'https://zta.io/api/invite',
        headers: { get: () => null },
        json: async () => ({ token: 'invite_token' })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should handle OPTIONS preflight request', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'OPTIONS',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should reject unsupported methods', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'DELETE',
        url: 'https://zta.io/api/invite',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(405);
    });

    it('should return CORS headers on success', async () => {
      const { default: handler } = await import('../../netlify/functions/invite.js');

      const req = {
        method: 'GET',
        url: 'https://zta.io/api/invite?token=valid_token',
        headers: { get: () => null }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
