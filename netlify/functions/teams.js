import { authenticateRequest } from './lib/auth.js';
import {
  getUser,
  createTeam,
  getTeam,
  updateTeam,
  getUserTeams,
  getTeamMembers,
  getTeamMemberRole,
  createTeamInvite,
  getTeamInvites,
  revokeTeamInvite,
  updateTeamMemberRole,
  removeTeamMember,
  leaveTeam,
  addSiteToTeam,
  getTeamSites,
  getUserSites,
  TeamRoles
} from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Authenticate request
  const auth = authenticateRequest(req.headers);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = auth.user.id;
  const userEmail = auth.user.email;
  const url = new URL(req.url);

  // GET - List user's teams or get team details
  if (req.method === 'GET') {
    const teamId = url.searchParams.get('teamId');

    try {
      if (teamId) {
        // Get specific team details
        const role = await getTeamMemberRole(teamId, userId);
        if (!role) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const team = await getTeam(teamId);
        const members = await getTeamMembers(teamId);
        const invites = role === TeamRoles.OWNER || role === TeamRoles.ADMIN
          ? await getTeamInvites(teamId)
          : [];
        const sites = await getTeamSites(teamId);

        return new Response(JSON.stringify({
          team,
          members,
          invites,
          sites,
          userRole: role
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } else {
        // List all user's teams
        const teams = await getUserTeams(userId);

        return new Response(JSON.stringify({ teams }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

    } catch (err) {
      console.error('Get teams error:', err);
      return new Response(JSON.stringify({ error: 'Failed to get teams' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Create team, invite member, or add site
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { action, teamId, name, email, role, siteId } = body;

      // Create new team
      if (action === 'create' || (!action && name && !teamId)) {
        const team = await createTeam(userId, userEmail, name);

        return new Response(JSON.stringify({ team }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Invite member
      if (action === 'invite') {
        if (!teamId || !email) {
          return new Response(JSON.stringify({ error: 'Team ID and email required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Check permission
        const userRole = await getTeamMemberRole(teamId, userId);
        if (userRole !== TeamRoles.OWNER && userRole !== TeamRoles.ADMIN) {
          return new Response(JSON.stringify({ error: 'Only owners and admins can invite members' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const inviteRole = role || TeamRoles.VIEWER;

        // Validate role
        if (!Object.values(TeamRoles).includes(inviteRole) || inviteRole === TeamRoles.OWNER) {
          return new Response(JSON.stringify({ error: 'Invalid role' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await createTeamInvite(teamId, userId, email, inviteRole);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Get team name for invite URL
        const team = await getTeam(teamId);
        const inviteUrl = `${url.origin}/accept-invite?token=${result.token}`;

        return new Response(JSON.stringify({
          invite: {
            id: result.id,
            email: result.email,
            role: result.role,
            expiresAt: result.expiresAt
          },
          inviteUrl,
          teamName: team.name
        }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Add site to team
      if (action === 'addSite') {
        if (!teamId || !siteId) {
          return new Response(JSON.stringify({ error: 'Team ID and site ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Verify user owns the site
        const userSites = await getUserSites(userId);
        if (!userSites.includes(siteId)) {
          return new Response(JSON.stringify({ error: 'You must own the site to add it to a team' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await addSiteToTeam(teamId, siteId, userId);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Team POST error:', err);
      return new Response(JSON.stringify({ error: 'Failed to process request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH - Update team or member role
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { action, teamId, name, memberId, role } = body;

      if (!teamId) {
        return new Response(JSON.stringify({ error: 'Team ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update team settings
      if (action === 'updateTeam' || name) {
        const updated = await updateTeam(teamId, userId, { name });

        if (!updated) {
          return new Response(JSON.stringify({ error: 'Failed to update team' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ team: updated }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Update member role
      if (action === 'updateRole') {
        if (!memberId || !role) {
          return new Response(JSON.stringify({ error: 'Member ID and role required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await updateTeamMemberRole(teamId, memberId, role, userId);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, member: result.member }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Team PATCH error:', err);
      return new Response(JSON.stringify({ error: 'Failed to update' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Remove member, revoke invite, or leave team
  if (req.method === 'DELETE') {
    const teamId = url.searchParams.get('teamId');
    const memberId = url.searchParams.get('memberId');
    const inviteId = url.searchParams.get('inviteId');
    const action = url.searchParams.get('action');

    if (!teamId) {
      return new Response(JSON.stringify({ error: 'Team ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Leave team
      if (action === 'leave') {
        const result = await leaveTeam(teamId, userId);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Remove member
      if (memberId) {
        const result = await removeTeamMember(teamId, memberId, userId);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Revoke invite
      if (inviteId) {
        const success = await revokeTeamInvite(inviteId, userId);

        if (!success) {
          return new Response(JSON.stringify({ error: 'Failed to revoke invite' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(JSON.stringify({ error: 'Specify memberId, inviteId, or action=leave' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Team DELETE error:', err);
      return new Response(JSON.stringify({ error: 'Failed to delete' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/teams'
};
