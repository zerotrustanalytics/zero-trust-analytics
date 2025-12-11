import { authenticateRequest } from './lib/auth.js';
import { getUserSites } from './lib/storage.js';
import { getStats } from './lib/tinybird.js';

export default async function handler(req, context) {
  // Handle CORS preflight
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

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');
    const period = url.searchParams.get('period') || '7d';
    const customStart = url.searchParams.get('startDate');
    const customEnd = url.searchParams.get('endDate');

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user owns this site
    const userSites = await getUserSites(auth.user.id);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate date range
    let endDate, startDate;

    if (customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
    } else {
      endDate = new Date();
      startDate = new Date();

      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '365d':
          startDate.setDate(startDate.getDate() - 365);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }
    }

    // Format dates for Tinybird (DateTime format)
    const startStr = startDate.toISOString().replace('T', ' ').split('.')[0];
    const endStr = endDate.toISOString().replace('T', ' ').split('.')[0];

    // Query Tinybird for stats
    const stats = await getStats(siteId, startStr, endStr);

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Stats error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Internal error', debug: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/stats'
};
