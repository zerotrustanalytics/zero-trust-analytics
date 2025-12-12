import { authenticateRequest } from './lib/auth.js';
import {
  getTeamInviteByToken,
  acceptTeamInvite,
  declineTeamInvite,
  getTeam
} from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  const url = new URL(req.url);

  // GET - Get invite details (for preview page)
  if (req.method === 'GET') {
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const invite = await getTeamInviteByToken(token);

      if (!invite) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invite' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const team = await getTeam(invite.teamId);

      return new Response(JSON.stringify({
        invite: {
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt
        },
        team: {
          name: team.name
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Get invite error:', err);
      return new Response(JSON.stringify({ error: 'Failed to get invite' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Accept or decline invite
  if (req.method === 'POST') {
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

    try {
      const body = await req.json();
      const { token, action } = body;

      if (!token) {
        return new Response(JSON.stringify({ error: 'Token required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (action === 'decline') {
        const result = await declineTeamInvite(token, userEmail);

        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true, message: 'Invite declined' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Default: accept invite
      const result = await acceptTeamInvite(token, userId, userEmail);

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Invite accepted',
        team: result.team
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Process invite error:', err);
      return new Response(JSON.stringify({ error: 'Failed to process invite' }), {
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
  path: '/api/invite'
};
