import { authenticateRequest } from './lib/auth.js';
import { getStats, getUserSites } from './lib/storage.js';

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
    const format = url.searchParams.get('format') || 'json';
    const period = url.searchParams.get('period') || '30d';
    const dataType = url.searchParams.get('type') || 'all';

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
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
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
        startDate.setDate(startDate.getDate() - 30);
    }

    const stats = await getStats(
      siteId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    // Filter data type if specified
    let exportData = stats;
    if (dataType !== 'all') {
      exportData = {
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        [dataType]: stats[dataType]
      };
    }

    if (format === 'csv') {
      // Generate CSV based on data type
      let csv = '';
      const timestamp = new Date().toISOString().split('T')[0];

      switch (dataType) {
        case 'pages':
          csv = 'Page,Views\n';
          csv += objectToCSV(stats.pages);
          break;
        case 'referrers':
          csv = 'Referrer,Count\n';
          csv += objectToCSV(stats.referrers);
          break;
        case 'landingPages':
          csv = 'Landing Page,Sessions\n';
          csv += objectToCSV(stats.landingPages);
          break;
        case 'exitPages':
          csv = 'Exit Page,Count\n';
          csv += objectToCSV(stats.exitPages);
          break;
        case 'devices':
          csv = 'Device Type,Count\n';
          csv += objectToCSV(stats.devices);
          break;
        case 'browsers':
          csv = 'Browser,Count\n';
          csv += objectToCSV(stats.browsers);
          break;
        case 'countries':
          csv = 'Country,Visitors\n';
          csv += objectToCSV(stats.countries);
          break;
        case 'daily':
          csv = 'Date,Pageviews,Unique Visitors,Sessions,Bounces\n';
          for (const day of stats.daily) {
            csv += `${day.date},${day.pageviews},${day.uniqueVisitors || 0},${day.uniqueSessions || 0},${day.bounces || 0}\n`;
          }
          break;
        default:
          // Summary CSV
          csv = 'Metric,Value\n';
          csv += `Pageviews,${stats.pageviews}\n`;
          csv += `Unique Visitors,${stats.uniqueVisitors}\n`;
          csv += `Sessions,${stats.uniqueSessions}\n`;
          csv += `Bounce Rate,${stats.bounceRate}%\n`;
          csv += `Avg Session Duration,${formatDuration(stats.avgSessionDuration)}\n`;
          csv += `Avg Pages/Session,${stats.avgPagesPerSession}\n`;
          csv += `Avg Scroll Depth,${stats.avgScrollDepth}%\n`;
          csv += `New Visitors,${stats.newVisitors}\n`;
          csv += `Returning Visitors,${stats.returningVisitors}\n`;
      }

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${dataType}-${timestamp}.csv"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // JSON format
    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="analytics-${dataType}-${new Date().toISOString().split('T')[0]}.json"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Export error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function objectToCSV(obj) {
  if (!obj) return '';
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `"${key.replace(/"/g, '""')}",${value}`)
    .join('\n');
}

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export const config = {
  path: '/api/export'
};
