import { authenticateRequest } from './lib/auth.js';
import { getUserSites, getUser } from './lib/storage.js';
import { getRealtime, getActualUsageFromPageviews, getCurrentMonth } from './lib/turso.js';
import { Config } from './lib/config.js';

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
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');

    console.log('[realtime] Request received', { siteId, userId: auth.user?.id });

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user owns this site
    const userSites = await getUserSites(auth.user.id);
    console.log('[realtime] User sites check', { userId: auth.user.id, siteId, userSites, hasSite: userSites.includes(siteId) });
    if (!userSites.includes(siteId)) {
      console.log('[realtime] Access denied - user does not own site');
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check usage limits - return frozen/zeroed data if over limit
    let usageLimitReached = false;
    try {
      const user = await getUser(auth.user.email);
      const plan = user?.plan || 'free';
      const planConfig = Config.pricing.tiers[plan] || Config.pricing.tiers.free;
      const monthlyLimit = planConfig.monthlyPageviews;

      const currentMonth = getCurrentMonth();
      const actualUsage = await getActualUsageFromPageviews(userSites, currentMonth);
      const currentPageviews = actualUsage?.pageviews || 0;

      console.log('[realtime] Usage check', {
        email: auth.user.email,
        plan,
        monthlyLimit,
        currentPageviews,
        overLimit: currentPageviews >= monthlyLimit
      });

      if (currentPageviews >= monthlyLimit) {
        usageLimitReached = true;
      }
    } catch (usageErr) {
      console.warn('[realtime] Failed to check usage limits:', usageErr.message);
    }

    // If over limit, return frozen realtime data (zeros)
    if (usageLimitReached) {
      return new Response(JSON.stringify({
        activeVisitors: 0,
        last30Minutes: 0,
        today: 0,
        visitors: [],
        pageviewsLast5Min: 0,
        pageBreakdown: {},
        recentPageviews: [],
        visitorsPerMinute: [],
        trafficSources: [],
        timestamp: new Date().toISOString(),
        _meta: {
          usageLimitReached: true,
          message: 'Real-time data frozen. Upgrade to see live visitors.'
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Get realtime data from database
    console.log('[realtime] Calling getRealtime', { siteId });
    const realtime = await getRealtime(siteId);
    console.log('[realtime] Got realtime data', {
      siteId,
      active_visitors: realtime.active_visitors,
      recent_count: realtime.recent_pageviews?.length
    });

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

    // Map recent pageviews to visitor format for frontend
    const visitors = (realtime.recent_pageviews || []).map(pv => ({
      id: pv.id || Math.random().toString(36).substr(2, 9),
      page: pv.page || '/',
      referrer: pv.referrer || '',
      country: pv.country || '',
      device: pv.device || '',
      timestamp: pv.timestamp
    }));

    return new Response(JSON.stringify({
      activeVisitors: realtime.active_visitors,
      last30Minutes: realtime.last_30_minutes || 0,
      today: realtime.today || 0,
      visitors,
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
