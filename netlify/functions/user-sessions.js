import { authenticateRequest } from './lib/auth.js';
import { getUserSessions, revokeSession, revokeAllSessions } from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  // GET - List active sessions
  if (req.method === 'GET') {
    try {
      const sessions = await getUserSessions(userId);

      // Get current session from token (simplified - in production would track session ID in JWT)
      const currentUserAgent = req.headers.get('user-agent') || '';

      return new Response(JSON.stringify({
        sessions: sessions.map(s => ({
          id: s.id,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          device: s.device,
          ipAddress: maskIP(s.ipAddress),
          isCurrent: s.userAgent === currentUserAgent
        }))
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Get sessions error:', err);
      return new Response(JSON.stringify({ error: 'Failed to get sessions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Revoke session(s)
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const revokeAll = url.searchParams.get('all') === 'true';

    try {
      if (revokeAll) {
        // Revoke all sessions except current
        const currentUserAgent = req.headers.get('user-agent') || '';
        const sessions = await getUserSessions(userId);
        const currentSession = sessions.find(s => s.userAgent === currentUserAgent);

        const count = await revokeAllSessions(userId, currentSession?.id);

        return new Response(JSON.stringify({
          success: true,
          message: `Revoked ${count} session(s)`
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } else if (sessionId) {
        // Revoke specific session
        const success = await revokeSession(sessionId, userId);

        if (!success) {
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
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

      } else {
        return new Response(JSON.stringify({ error: 'Session ID or all=true required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (err) {
      console.error('Revoke session error:', err);
      return new Response(JSON.stringify({ error: 'Failed to revoke session' }), {
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

// Mask IP address for privacy (show partial)
function maskIP(ip) {
  if (!ip || ip === 'Unknown') return 'Unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip.substring(0, 10) + '***';
}

export const config = {
  path: '/api/user/sessions'
};
