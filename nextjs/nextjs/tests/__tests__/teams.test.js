import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

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
      async set(key, value) {
        data.set(key, value);
      },
      async list() {
        return {
          blobs: Array.from(data.keys()).map(key => ({ key }))
        };
      },
      async delete(key) {
        data.delete(key);
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
    verify: jest.fn((token) => {
      if (token === 'valid_token') {
        return { id: 'user_123', email: 'user@example.com' };
      }
      if (token === 'admin_token') {
        return { id: 'user_456', email: 'admin@example.com' };
      }
      if (token === 'member_token') {
        return { id: 'user_789', email: 'member@example.com' };
      }
      throw new Error('Invalid token');
    }),
    sign: jest.fn(() => 'mock_invite_token')
  }
}));

// Mock crypto for random token generation
jest.unstable_mockModule('crypto', () => ({
  default: {
    randomBytes: jest.fn(() => ({
      toString: jest.fn(() => 'mock_random_token')
    }))
  }
}));

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Teams Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test users
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('user@example.com', {
      id: 'user_123',
      email: 'user@example.com'
    });
    await usersStore.setJSON('admin@example.com', {
      id: 'user_456',
      email: 'admin@example.com'
    });
    await usersStore.setJSON('member@example.com', {
      id: 'user_789',
      email: 'member@example.com'
    });

    // Create test sites
    const sitesStore = getStore({ name: 'sites' });
    await sitesStore.setJSON('site_test', {
      id: 'site_test',
      userId: 'user_123',
      domain: 'example.com'
    });
    await sitesStore.setJSON('user_sites_user_123', ['site_test']);
  });

  describe('OPTIONS /api/teams', () => {
    it('should handle CORS preflight requests', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const req = {
        method: 'OPTIONS',
        headers: createHeaders({}),
        url: 'https://example.com/api/teams'
      };

      const response = await handler(req, {});

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });

  describe('GET /api/teams', () => {
    it('should return empty list when user has no teams', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.teams).toEqual([]);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should return list of user teams', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_1',
        name: 'Test Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_1', team);
      await teamsStore.setJSON('user_teams_user_123', ['team_1']);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.teams).toHaveLength(1);
      expect(data.teams[0].id).toBe('team_1');
      expect(data.teams[0].name).toBe('Test Team');
    });

    it('should return team details including members and invites for team owner', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_2',
        name: 'Detailed Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_2', team);

      // Add team members
      const members = [{
        teamId: 'team_2',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      }];
      await teamsStore.setJSON('team_members_team_2', members);

      // Add pending invites
      const invite = {
        id: 'invite_1',
        teamId: 'team_2',
        email: 'newmember@example.com',
        role: 'viewer',
        token: 'invite_token',
        invitedBy: 'user_123',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('invite_1', invite);
      await teamsStore.setJSON('team_invites_team_2', ['invite_1']);

      const url = new URL('https://example.com/api/teams?teamId=team_2');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.team).toBeDefined();
      expect(data.team.id).toBe('team_2');
      expect(data.members).toHaveLength(1);
      expect(data.invites).toHaveLength(1);
      expect(data.userRole).toBe('owner');
    });

    it('should deny access to teams user is not a member of', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team owned by another user
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_other',
        name: 'Other Team',
        ownerId: 'user_456',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_other', team);

      const url = new URL('https://example.com/api/teams?teamId=team_other');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'GET',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should hide invites from non-admin members', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_3',
        name: 'Team with Viewer',
        ownerId: 'user_456',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_3', team);

      // Add user as viewer
      const member = {
        teamId: 'team_3',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'viewer',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_3', [member]);

      const url = new URL('https://example.com/api/teams?teamId=team_3');

      const req = {
        method: 'GET',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.invites).toEqual([]);
      expect(data.userRole).toBe('viewer');
    });
  });

  describe('POST /api/teams - Create Team', () => {
    it('should create a new team', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'create',
          name: 'New Team'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.team).toBeDefined();
      expect(data.team.name).toBe('New Team');
      expect(data.team.ownerId).toBe('user_123');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should create team without explicit action when name is provided', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          name: 'Another Team'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.team).toBeDefined();
      expect(data.team.name).toBe('Another Team');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({ 'content-type': 'application/json' }),
        url: url.toString(),
        json: async () => ({
          action: 'create',
          name: 'New Team'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/teams - Invite Member', () => {
    it('should invite a member as team owner', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_invite',
        name: 'Invite Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_invite', team);

      // Add owner as member
      const member = {
        teamId: 'team_invite',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_invite', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_invite',
          email: 'newmember@example.com',
          role: 'viewer'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.invite).toBeDefined();
      expect(data.invite.email).toBe('newmember@example.com');
      expect(data.invite.role).toBe('viewer');
      expect(data.inviteUrl).toContain('accept-invite?token=');
      expect(data.teamName).toBe('Invite Team');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should invite a member as team admin', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_admin_invite',
        name: 'Admin Invite Team',
        ownerId: 'user_456',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_admin_invite', team);

      // Add admin member
      const member = {
        teamId: 'team_admin_invite',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'admin',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_admin_invite', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_admin_invite',
          email: 'newmember@example.com',
          role: 'viewer'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.invite).toBeDefined();
    });

    it('should deny invite permission to viewers', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_viewer',
        name: 'Viewer Team',
        ownerId: 'user_456',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_viewer', team);

      // Add viewer member
      const member = {
        teamId: 'team_viewer',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'viewer',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_viewer', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_viewer',
          email: 'newmember@example.com',
          role: 'viewer'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Only owners and admins can invite members');
    });

    it('should require teamId and email for invites', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Team ID and email required');
    });

    it('should validate role values', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_invalid_role',
        name: 'Invalid Role Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_invalid_role', team);

      const member = {
        teamId: 'team_invalid_role',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_invalid_role', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_invalid_role',
          email: 'newmember@example.com',
          role: 'invalid_role'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid role');
    });

    it('should prevent inviting as owner role', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_owner_role',
        name: 'Owner Role Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_owner_role', team);

      const member = {
        teamId: 'team_owner_role',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_owner_role', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_owner_role',
          email: 'newmember@example.com',
          role: 'owner'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid role');
    });

    it('should default to viewer role when not specified', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_default_role',
        name: 'Default Role Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_default_role', team);

      const member = {
        teamId: 'team_default_role',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_default_role', [member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invite',
          teamId: 'team_default_role',
          email: 'newmember@example.com'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.invite.role).toBe('viewer');
    });
  });

  describe('POST /api/teams - Add Site', () => {
    it('should add a site to team', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_add_site',
        name: 'Add Site Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_add_site', team);

      // Add owner as member
      const owner = {
        teamId: 'team_add_site',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_add_site', [owner]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'addSite',
          teamId: 'team_add_site',
          siteId: 'site_test'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require teamId and siteId', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'addSite'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Team ID and site ID required');
    });

    it('should verify user owns the site', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create another site owned by different user
      const sitesStore = getStore({ name: 'sites' });
      await sitesStore.setJSON('site_other', {
        id: 'site_other',
        userId: 'user_456',
        domain: 'other.com'
      });

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_site_perm',
        name: 'Site Permission Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_site_perm', team);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'addSite',
          teamId: 'team_site_perm',
          siteId: 'site_other'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('You must own the site');
    });
  });

  describe('PATCH /api/teams - Update Team', () => {
    it('should update team name as owner', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_update',
        name: 'Original Name',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_update', team);

      // Add owner as member
      const owner = {
        teamId: 'team_update',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_update', [owner]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'updateTeam',
          teamId: 'team_update',
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.team).toBeDefined();
      expect(data.team.name).toBe('Updated Name');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require teamId', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Team ID required');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({ 'content-type': 'application/json' }),
        url: url.toString(),
        json: async () => ({
          teamId: 'team_update',
          name: 'Updated Name'
        })
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/teams - Update Member Role', () => {
    it('should update member role as owner', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_role_update',
        name: 'Role Update Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_role_update', team);

      // Add team members
      const owner = {
        teamId: 'team_role_update',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };

      const member = {
        teamId: 'team_role_update',
        userId: 'user_456',
        email: 'admin@example.com',
        role: 'viewer',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_role_update', [owner, member]);

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'updateRole',
          teamId: 'team_role_update',
          memberId: 'user_456',
          role: 'admin'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.member).toBeDefined();
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require memberId and role', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'updateRole',
          teamId: 'team_role_update'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Member ID and role required');
    });
  });

  describe('DELETE /api/teams - Remove Member', () => {
    it('should remove team member as owner', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create a team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_remove',
        name: 'Remove Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_remove', team);

      // Add members
      const owner = {
        teamId: 'team_remove',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };

      const member = {
        teamId: 'team_remove',
        userId: 'user_456',
        email: 'admin@example.com',
        role: 'viewer',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_remove', [owner, member]);

      const url = new URL('https://example.com/api/teams?teamId=team_remove&memberId=user_456');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams?teamId=team_remove&memberId=user_456');

      const req = {
        method: 'DELETE',
        headers: createHeaders({}),
        url: url.toString()
      };

      const response = await handler(req, {});

      expect(response.status).toBe(401);
    });

    it('should require teamId', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams?memberId=user_456');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Team ID required');
    });
  });

  describe('DELETE /api/teams - Revoke Invite', () => {
    it('should revoke team invite', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create team with invite
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_revoke',
        name: 'Revoke Team',
        ownerId: 'user_123',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_revoke', team);

      // Add owner as member
      const owner = {
        teamId: 'team_revoke',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'owner',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_revoke', [owner]);

      const invite = {
        id: 'invite_revoke',
        teamId: 'team_revoke',
        email: 'invited@example.com',
        role: 'viewer',
        token: 'invite_token',
        invitedBy: 'user_123',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('invite_revoke', invite);
      await teamsStore.setJSON('team_invites_team_revoke', ['invite_revoke']);

      const url = new URL('https://example.com/api/teams?teamId=team_revoke&inviteId=invite_revoke');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('DELETE /api/teams - Leave Team', () => {
    it('should allow user to leave team', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      // Create team
      const teamsStore = getStore({ name: 'teams' });
      const team = {
        id: 'team_leave',
        name: 'Leave Team',
        ownerId: 'user_456',
        createdAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_leave', team);

      // Add user as member
      const member = {
        teamId: 'team_leave',
        userId: 'user_123',
        email: 'user@example.com',
        role: 'viewer',
        joinedAt: new Date().toISOString()
      };
      await teamsStore.setJSON('team_members_team_leave', [member]);

      const url = new URL('https://example.com/api/teams?teamId=team_leave&action=leave');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Invalid Actions', () => {
    it('should reject invalid POST action', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'POST',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invalid_action',
          teamId: 'team_test'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });

    it('should reject invalid PATCH action', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PATCH',
        headers: createHeaders({
          authorization: 'Bearer valid_token',
          'content-type': 'application/json'
        }),
        url: url.toString(),
        json: async () => ({
          action: 'invalid_action',
          teamId: 'team_test'
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });

    it('should reject DELETE without proper parameters', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams?teamId=team_test');

      const req = {
        method: 'DELETE',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Specify memberId, inviteId, or action=leave');
    });

    it('should reject invalid HTTP methods', async () => {
      const { default: handler } = await import('../../netlify/functions/teams.js');

      const url = new URL('https://example.com/api/teams');

      const req = {
        method: 'PUT',
        headers: createHeaders({ authorization: 'Bearer valid_token' }),
        url: url.toString()
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toContain('Method not allowed');
    });
  });
});
