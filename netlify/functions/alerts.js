import { authenticateRequest } from './lib/auth.js';
import { getUserSites, createAlert, getSiteAlerts, updateAlert, deleteAlert, getTrafficBaseline } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('alerts', req, context);

  logger.info('Alerts request received', { method: req.method });

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

  // GET - List alerts for a site + traffic baseline
  if (req.method === 'GET') {
    const siteId = url.searchParams.get('siteId');

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
      const alerts = await getSiteAlerts(siteId);
      const baseline = await getTrafficBaseline(siteId);

      return new Response(JSON.stringify({
        alerts,
        baseline
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('List alerts failed', err);
      return handleError(err, logger);
    }
  }

  // POST - Create alert
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, name, type, threshold, timeWindow, cooldown, notifyWebhook, notifyEmail } = body;

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

      // Validate threshold
      const validThreshold = Math.max(50, Math.min(1000, parseInt(threshold) || 200));

      const alert = await createAlert(siteId, userId, {
        name,
        type: type || 'traffic_spike',
        threshold: validThreshold,
        timeWindow: Math.max(15, Math.min(1440, parseInt(timeWindow) || 60)),
        cooldown: Math.max(15, Math.min(1440, parseInt(cooldown) || 60)),
        notifyWebhook: !!notifyWebhook,
        notifyEmail: notifyEmail !== false
      });

      return new Response(JSON.stringify({ alert }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('Create alert failed', err);
      return handleError(err, logger);
    }
  }

  // PATCH - Update alert
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { alertId, ...updates } = body;

      if (!alertId) {
        return new Response(JSON.stringify({ error: 'Alert ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updated = await updateAlert(alertId, userId, updates);

      if (!updated) {
        return new Response(JSON.stringify({ error: 'Alert not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ alert: updated }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('Update alert failed', err);
      return handleError(err, logger);
    }
  }

  // DELETE - Delete alert
  if (req.method === 'DELETE') {
    const alertId = url.searchParams.get('alertId');

    if (!alertId) {
      return new Response(JSON.stringify({ error: 'Alert ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const success = await deleteAlert(alertId, userId);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Alert not found' }), {
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
      logger.error('Delete alert failed', err);
      return handleError(err, logger);
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/alerts'
};
