import { authenticateRequest } from './lib/auth.js';
import {
  getUserSites,
  recordHeatmapClick,
  recordHeatmapScroll,
  getHeatmapClicks,
  getHeatmapScroll,
  getHeatmapPages
} from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  const url = new URL(req.url);

  // POST - Record heatmap data (clicks or scroll)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, type, data } = body;

      if (!siteId || !type || !data) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify user owns site
      const userSites = await getUserSites(userId);
      if (!userSites.includes(siteId)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let result;
      if (type === 'click') {
        result = await recordHeatmapClick(siteId, data);
      } else if (type === 'scroll') {
        result = await recordHeatmapScroll(siteId, data);
      } else {
        return new Response(JSON.stringify({ error: 'Invalid type. Use "click" or "scroll"' }), {
          status: 400,
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

    } catch (err) {
      console.error('Record heatmap error:', err);
      return new Response(JSON.stringify({ error: 'Failed to record heatmap data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // GET - Retrieve heatmap data
  if (req.method === 'GET') {
    const siteId = url.searchParams.get('siteId');
    const type = url.searchParams.get('type'); // clicks, scroll, pages
    const path = url.searchParams.get('path');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user owns site
    const userSites = await getUserSites(userId);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default date range: last 7 days
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start = startDate || defaultStart.toISOString().split('T')[0];
    const end = endDate || now.toISOString().split('T')[0];

    try {
      // Get list of pages with heatmap data
      if (type === 'pages' || !type) {
        const pages = await getHeatmapPages(siteId, start, end);
        return new Response(JSON.stringify({
          pages,
          dateRange: { startDate: start, endDate: end }
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Get click heatmap for a specific page
      if (type === 'clicks') {
        if (!path) {
          return new Response(JSON.stringify({ error: 'Path required for click heatmap' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const clickData = await getHeatmapClicks(siteId, path, start, end);
        return new Response(JSON.stringify(clickData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Get scroll heatmap for a specific page
      if (type === 'scroll') {
        if (!path) {
          return new Response(JSON.stringify({ error: 'Path required for scroll heatmap' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const scrollData = await getHeatmapScroll(siteId, path, start, end);
        return new Response(JSON.stringify(scrollData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid type. Use "pages", "clicks", or "scroll"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Get heatmap error:', err);
      return new Response(JSON.stringify({ error: 'Failed to get heatmap data' }), {
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
  path: '/api/heatmaps'
};
