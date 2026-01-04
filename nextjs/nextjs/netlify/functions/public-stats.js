import { getPublicShare, getSite } from './lib/storage.js';
import { getStats } from './lib/turso.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const shareToken = url.searchParams.get('token');
  const period = url.searchParams.get('period') || '7d';

  if (!shareToken) {
    return new Response(JSON.stringify({ error: 'Share token required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate share token
  const share = await getPublicShare(shareToken);
  if (!share) {
    return new Response(JSON.stringify({ error: 'Invalid or expired share link' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if period is allowed
  if (share.allowedPeriods && !share.allowedPeriods.includes(period)) {
    return new Response(JSON.stringify({ error: 'Period not allowed for this share' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  switch (period) {
    case '24h': startDate.setDate(startDate.getDate() - 1); break;
    case '7d': startDate.setDate(startDate.getDate() - 7); break;
    case '30d': startDate.setDate(startDate.getDate() - 30); break;
    case '90d': startDate.setDate(startDate.getDate() - 90); break;
    case '365d': startDate.setDate(startDate.getDate() - 365); break;
    default: startDate.setDate(startDate.getDate() - 7);
  }

  try {
    const siteId = share.siteId;
    const site = await getSite(siteId);

    // Get stats from Turso
    const stats = await getStats(
      siteId,
      startDate.toISOString(),
      endDate.toISOString()
    );

    return new Response(JSON.stringify({
      site: {
        domain: site?.domain || 'Unknown',
        nickname: site?.nickname
      },
      period,
      allowedPeriods: share.allowedPeriods,
      // Return limited stats for public view
      uniqueVisitors: stats.summary.unique_visitors,
      pageviews: stats.summary.pageviews,
      bounceRate: stats.summary.bounce_rate,
      avgSessionDuration: stats.summary.avg_duration,
      pages: stats.pages,
      referrers: stats.referrers,
      devices: stats.devices,
      browsers: stats.browsers,
      countries: stats.countries,
      daily: stats.daily
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (err) {
    console.error('Public stats error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/public/stats'
};
