import { authenticateRequest } from './lib/auth.js';
import { getUserSites } from './lib/storage.js';
import { getRealtime } from './lib/turso.js';

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

    // Get realtime data from database
    const realtime = await getRealtime(siteId);

    // Build page breakdown from recent pageviews
    const pageBreakdown = {};
    for (const pv of realtime.recent_pageviews || []) {
      const path = pv.page || '/';
      pageBreakdown[path] = (pageBreakdown[path] || 0) + 1;
    }

    // Build traffic sources breakdown from recent pageviews if not provided by pipe
    let trafficSources = realtime.traffic_sources || [];
    if (trafficSources.length === 0 && realtime.recent_pageviews?.length > 0) {
      const sourceCount = {};
      for (const pv of realtime.recent_pageviews) {
        const source = pv.traffic_source || pv.referrer_domain || 'direct';
        sourceCount[source] = (sourceCount[source] || 0) + 1;
      }
      trafficSources = Object.entries(sourceCount)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    }

    return new Response(JSON.stringify({
      activeVisitors: realtime.active_visitors,
      pageviewsLast5Min: realtime.pageviews_last_5min,
      pageBreakdown,
      recentPageviews: realtime.recent_pageviews,
      visitorsPerMinute: realtime.visitors_per_minute,
      trafficSources,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err) {
    console.error('Realtime error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/realtime'
};
