import { authenticateRequest } from './lib/auth.js';
import { getUserSites, createWebhook, getSiteWebhooks, updateWebhook, deleteWebhook, getWebhook, recordWebhookDelivery, WebhookEvents } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('webhooks', req, context);

  logger.info('Webhooks request received', { method: req.method });

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

  // GET - List webhooks for a site
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
      const webhooks = await getSiteWebhooks(siteId);

      return new Response(JSON.stringify({
        webhooks,
        availableEvents: Object.values(WebhookEvents)
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('List webhooks failed', err);
      return handleError(err, logger);
    }
  }

  // POST - Create webhook or test webhook
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      // Test webhook endpoint
      if (body.action === 'test') {
        const webhookId = body.webhookId;
        const webhook = await getWebhook(webhookId);

        if (!webhook || webhook.userId !== userId) {
          return new Response(JSON.stringify({ error: 'Webhook not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Send test payload
        const testPayload = {
          event: 'test',
          timestamp: new Date().toISOString(),
          site_id: webhook.siteId,
          data: {
            message: 'This is a test webhook from Zero Trust Analytics',
            webhook_id: webhookId
          }
        };

        try {
          const signature = await signPayload(testPayload, webhook.secret);
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ZTA-Signature': signature,
              'X-ZTA-Event': 'test'
            },
            body: JSON.stringify(testPayload)
          });

          const success = response.ok;
          await recordWebhookDelivery(webhookId, success);

          return new Response(JSON.stringify({
            success,
            status: response.status,
            message: success ? 'Test webhook delivered successfully' : `Delivery failed: ${response.status}`
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });

        } catch (fetchErr) {
          await recordWebhookDelivery(webhookId, false);
          return new Response(JSON.stringify({
            success: false,
            message: 'Failed to reach webhook URL: ' + fetchErr.message
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      // Create new webhook
      const { siteId, url: webhookUrl, events, name } = body;

      if (!siteId || !webhookUrl) {
        return new Response(JSON.stringify({ error: 'Site ID and URL required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate URL
      try {
        new URL(webhookUrl);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid webhook URL' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Must be HTTPS
      if (!webhookUrl.startsWith('https://')) {
        return new Response(JSON.stringify({ error: 'Webhook URL must use HTTPS' }), {
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

      const webhook = await createWebhook(siteId, userId, {
        url: webhookUrl,
        events: events || ['event'],
        name
      });

      return new Response(JSON.stringify({
        webhook,
        message: 'Webhook created. Save the signing secret - you won\'t see it again!'
      }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('Create webhook failed', err);
      return handleError(err, logger);
    }
  }

  // PATCH - Update webhook
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { webhookId, ...updates } = body;

      if (!webhookId) {
        return new Response(JSON.stringify({ error: 'Webhook ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updated = await updateWebhook(webhookId, userId, updates);

      if (!updated) {
        return new Response(JSON.stringify({ error: 'Webhook not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ webhook: updated }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      logger.error('Update webhook failed', err);
      return handleError(err, logger);
    }
  }

  // DELETE - Delete webhook
  if (req.method === 'DELETE') {
    const webhookId = url.searchParams.get('webhookId');

    if (!webhookId) {
      return new Response(JSON.stringify({ error: 'Webhook ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const success = await deleteWebhook(webhookId, userId);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Webhook not found' }), {
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
      logger.error('Delete webhook failed', err);
      return handleError(err, logger);
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Sign payload with webhook secret for verification
async function signPayload(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(JSON.stringify(payload))
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const config = {
  path: '/api/webhooks'
};
