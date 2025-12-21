import { authenticateRequest } from './lib/auth.js';
import { getUserSites } from './lib/storage.js';
import { exportData } from './lib/turso.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('export', req, context);

  logger.info('Export request received');

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
    const dataType = url.searchParams.get('type') || 'summary'; // pageviews, events, summary
    const limit = parseInt(url.searchParams.get('limit') || '10000', 10);

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

    // Format dates for database query
    const startStr = startDate.toISOString().replace('T', ' ').split('.')[0];
    const endStr = endDate.toISOString().replace('T', ' ').split('.')[0];

    // Query database for export data
    const data = await exportData(siteId, startStr, endStr, dataType, limit);

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      let csv = '';

      switch (dataType) {
        case 'pageviews':
          csv = 'Timestamp,Page,Referrer,UTM Source,UTM Medium,UTM Campaign,Device,Browser,OS,Country,Region,Time on Page,Is Bounce\n';
          for (const row of data) {
            csv += `"${row.timestamp}","${escapeCSV(row.page_path)}","${escapeCSV(row.referrer)}","${row.utm_source}","${row.utm_medium}","${row.utm_campaign}","${row.device}","${row.browser}","${row.os}","${row.country}","${row.region}",${row.time_on_page},${row.is_bounce}\n`;
          }
          break;

        case 'events':
          csv = 'Timestamp,Event Type,Event Name,Event Data,Page,Device,Country\n';
          for (const row of data) {
            csv += `"${row.timestamp}","${row.event_type}","${escapeCSV(row.event_name)}","${escapeCSV(row.event_data)}","${escapeCSV(row.page_path)}","${row.device}","${row.country}"\n`;
          }
          break;

        case 'summary':
        default:
          csv = 'Date,Pageviews,Unique Visitors,Sessions,Bounces,Bounce Rate,Avg Time on Page\n';
          for (const row of data) {
            csv += `${row.date},${row.pageviews},${row.unique_visitors},${row.sessions},${row.bounces},${row.bounce_rate}%,${row.avg_time_on_page}s\n`;
          }
          break;
      }

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="zta-${dataType}-${timestamp}.csv"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // JSON format
    return new Response(JSON.stringify({
      site_id: siteId,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      type: dataType,
      count: data.length,
      data
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zta-${dataType}-${timestamp}.json"`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    logger.error('Export failed', err);
    return handleError(err, logger);
  }
}

function escapeCSV(str) {
  if (!str) return '';
  return str.replace(/"/g, '""');
}

export const config = {
  path: '/api/export'
};
