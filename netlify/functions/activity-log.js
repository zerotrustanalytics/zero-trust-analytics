import { authenticateRequest } from './lib/auth.js';
import { getUserActivityLog, formatActivityMessage } from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // GET - List activity log
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const result = await getUserActivityLog(userId, limit, offset);

      // Format activities for display
      const formattedActivities = result.activities.map(activity => ({
        ...activity,
        message: formatActivityMessage(activity)
      }));

      return new Response(JSON.stringify({
        activities: formattedActivities,
        total: result.total,
        hasMore: result.hasMore
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Activity log error:', err);
      return new Response(JSON.stringify({ error: 'Failed to get activity log' }), {
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
  path: '/api/activity'
};
