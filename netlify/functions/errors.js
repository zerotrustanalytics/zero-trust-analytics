import { authenticateRequest } from './lib/auth.js';
import { getUserSites, getSite } from './lib/storage.js';
import { getStore } from '@netlify/blobs';

const ERRORS_STORE = 'errors';
const DEDUP_WINDOW_MS = 3600000; // 1 hour deduplication window

// Valid error types
const VALID_ERROR_TYPES = ['404', '403', '401', '500', '502', '503', 'js_error', 'network_error'];

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

  const url = new URL(req.url);

  // POST - Log an error
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { site_id, type, url: errorUrl, referrer, user_agent, message, stack, metadata } = body;

      // Validate required fields
      if (!site_id) {
        return new Response(JSON.stringify({ error: 'site_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if (!type) {
        return new Response(JSON.stringify({ error: 'type is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if (!errorUrl) {
        return new Response(JSON.stringify({ error: 'url is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Validate site exists
      const site = await getSite(site_id);
      if (!site) {
        return new Response(JSON.stringify({ error: 'Site not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const errorsStore = getStore({ name: ERRORS_STORE });
      const now = new Date();
      const timestamp = now.toISOString();

      // Create error ID based on site, type, and URL for deduplication
      const errorKey = `${site_id}_${type}_${errorUrl.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const errorId = `error_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

      // Check for existing error (deduplication)
      const existing = await errorsStore.get(errorKey, { type: 'json' });

      if (existing && existing.last_seen) {
        const lastSeenTime = new Date(existing.last_seen).getTime();
        const timeDiff = now.getTime() - lastSeenTime;

        // If within deduplication window, just update count and last_seen
        if (timeDiff < DEDUP_WINDOW_MS) {
          existing.count = (existing.count || 1) + 1;
          existing.last_seen = timestamp;
          await errorsStore.setJSON(errorKey, existing);

          return new Response(JSON.stringify({
            success: true,
            deduplicated: true,
            error_id: existing.id
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      // Create new error record
      const errorRecord = {
        id: errorId,
        site_id,
        type,
        url: errorUrl,
        referrer: referrer || null,
        user_agent: user_agent || null,
        message: message || null,
        stack: stack || null,
        metadata: metadata || null,
        count: 1,
        first_seen: timestamp,
        last_seen: timestamp
      };

      await errorsStore.setJSON(errorKey, errorRecord);

      // Also add to site's error index for easier listing
      const siteErrorsKey = `site_errors_${site_id}`;
      const siteErrors = await errorsStore.get(siteErrorsKey, { type: 'json' }) || [];

      // Add to beginning (most recent first)
      siteErrors.unshift({
        key: errorKey,
        timestamp
      });

      // Keep only last 1000 error references per site
      if (siteErrors.length > 1000) {
        siteErrors.length = 1000;
      }

      await errorsStore.setJSON(siteErrorsKey, siteErrors);

      return new Response(JSON.stringify({
        success: true,
        error_id: errorId
      }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Log error error:', err);
      return new Response(JSON.stringify({ error: 'Failed to log error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  // GET - List errors (requires authentication)
  if (req.method === 'GET') {
    // Authenticate request
    const auth = authenticateRequest(req.headers);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const userId = auth.user.id;
    const siteId = url.searchParams.get('siteId');
    const typeFilter = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'siteId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Verify user owns site
    const userSites = await getUserSites(userId);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const errorsStore = getStore({ name: ERRORS_STORE });
      const siteErrorsKey = `site_errors_${siteId}`;
      const siteErrors = await errorsStore.get(siteErrorsKey, { type: 'json' }) || [];

      // Fetch all error records
      const errors = [];
      for (const { key } of siteErrors) {
        const error = await errorsStore.get(key, { type: 'json' });
        if (error) {
          // Apply type filter if specified
          if (!typeFilter || error.type === typeFilter) {
            errors.push(error);
          }
        }

        // Stop if we've reached the limit
        if (errors.length >= limit) {
          break;
        }
      }

      // Sort by last_seen descending (most recent first)
      errors.sort((a, b) => {
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      });

      return new Response(JSON.stringify({
        errors: errors.slice(0, limit)
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('List errors error:', err);
      return new Response(JSON.stringify({ error: 'Failed to list errors' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export const config = {
  path: '/api/errors'
};
