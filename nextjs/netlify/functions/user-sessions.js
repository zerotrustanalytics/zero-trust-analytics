import { authenticateRequest } from './lib/auth.js';
import { getUserSessions, revokeSession, revokeAllSessions } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('user-sessions', req, context);

  logger.info('User sessions request received', { method: req.method });

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
    logger.warn('Authentication failed', { error: auth.error });
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
      logger.info('Sessions retrieved successfully', { userId, count: sessions.length });

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
      logger.error('Get sessions failed', err, { userId });
      return handleError(err, logger);
    }
  }

  // DELETE - Revoke session(s)
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const revokeAll = url.searchParams.get('all') === 'true';

    try {
      if (revokeAll) {
        logger.info('Revoking all sessions except current', { userId });
        // Revoke all sessions except current
        const currentUserAgent = req.headers.get('user-agent') || '';
        const sessions = await getUserSessions(userId);
        const currentSession = sessions.find(s => s.userAgent === currentUserAgent);

        const count = await revokeAllSessions(userId, currentSession?.id);

        logger.info('All sessions revoked successfully', { userId, count });
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
        logger.info('Revoking specific session', { userId, sessionId });
        // Revoke specific session
        const success = await revokeSession(sessionId, userId);

        if (!success) {
          logger.warn('Session revocation failed - not found', { userId, sessionId });
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        logger.info('Session revoked successfully', { userId, sessionId });
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } else {
        logger.warn('Session revocation failed - missing parameter', { userId });
        return new Response(JSON.stringify({ error: 'Session ID or all=true required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (err) {
      logger.error('Revoke session failed', err, { userId });
      return handleError(err, logger);
    }
  }

  logger.warn('Invalid HTTP method', { method: req.method });
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
