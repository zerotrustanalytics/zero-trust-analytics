import { authenticateRequest } from './lib/auth.js';
import {
  getUserSites,
  createFunnel,
  getSiteFunnels,
  updateFunnel,
  deleteFunnel,
  getStats,
  calculateFunnelData
} from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  // GET - List funnels with calculated data
  if (req.method === 'GET') {
    const siteId = url.searchParams.get('siteId');
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

    try {
      const funnels = await getSiteFunnels(siteId);

      // Get stats for the date range
      const now = new Date();
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
      const statsStartDate = startDate || defaultStart.toISOString().split('T')[0];
      const statsEndDate = endDate || now.toISOString().split('T')[0];

      const stats = await getStats(siteId, statsStartDate, statsEndDate);

      // Calculate funnel data for each funnel
      const funnelsWithData = funnels.map(funnel => {
        const data = calculateFunnelData(funnel, stats);
        return {
          ...funnel,
          data,
          dateRange: {
            startDate: statsStartDate,
            endDate: statsEndDate
          }
        };
      });

      return new Response(JSON.stringify({
        funnels: funnelsWithData
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('List funnels error:', err);
      return new Response(JSON.stringify({ error: 'Failed to list funnels' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Create funnel
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, name, steps } = body;

      if (!siteId) {
        return new Response(JSON.stringify({ error: 'Site ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!steps || steps.length < 2) {
        return new Response(JSON.stringify({ error: 'At least 2 steps required' }), {
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

      const result = await createFunnel(siteId, userId, {
        name,
        steps
      });

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ funnel: result.funnel }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Create funnel error:', err);
      return new Response(JSON.stringify({ error: 'Failed to create funnel' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH - Update funnel
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { funnelId, ...updates } = body;

      if (!funnelId) {
        return new Response(JSON.stringify({ error: 'Funnel ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updated = await updateFunnel(funnelId, userId, updates);

      if (!updated) {
        return new Response(JSON.stringify({ error: 'Funnel not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ funnel: updated }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Update funnel error:', err);
      return new Response(JSON.stringify({ error: 'Failed to update funnel' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Delete funnel
  if (req.method === 'DELETE') {
    const funnelId = url.searchParams.get('funnelId');

    if (!funnelId) {
      return new Response(JSON.stringify({ error: 'Funnel ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const success = await deleteFunnel(funnelId, userId);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Funnel not found' }), {
          status: 404,
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
      console.error('Delete funnel error:', err);
      return new Response(JSON.stringify({ error: 'Failed to delete funnel' }), {
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
  path: '/api/funnels'
};
