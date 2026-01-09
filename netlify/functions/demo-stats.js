import { getStats } from './lib/turso.js';

// Hardcoded site ID for ztas.io demo - this is public data shown on the demo page
const DEMO_SITE_ID = 'site_f8b511bfa9ae7cb6';
const DEMO_DOMAIN = 'ztas.io';

export default async function handler(req, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get('period') || '7d';

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  switch (period) {
    case '24h': startDate.setDate(startDate.getDate() - 1); break;
    case '7d': startDate.setDate(startDate.getDate() - 7); break;
    case '30d': startDate.setDate(startDate.getDate() - 30); break;
    case '90d': startDate.setDate(startDate.getDate() - 90); break;
    default: startDate.setDate(startDate.getDate() - 7);
  }

  try {
    const stats = await getStats(
      DEMO_SITE_ID,
      startDate.toISOString(),
      endDate.toISOString()
    );

    return new Response(JSON.stringify({
      site: {
        domain: DEMO_DOMAIN
      },
      period,
      uniqueVisitors: stats.summary.unique_visitors,
      pageviews: stats.summary.pageviews,
      bounceRate: stats.summary.bounce_rate,
      avgSessionDuration: stats.summary.avg_duration,
      // Use array formats for frontend compatibility
      pages: stats.topPages || [],
      referrers: stats.sources || [],
      devices: stats.devicesList || [],
      browsers: stats.browsersList || [],
      countries: stats.countriesList || [],
      daily: stats.daily || []
    }), {
      status: 200,
      headers
    });

  } catch (err) {
    console.error('Demo stats error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load demo stats' }), {
      status: 500,
      headers
    });
  }
}

export const config = {
  path: '/api/demo/stats'
};
