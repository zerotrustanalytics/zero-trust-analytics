import { authenticateRequest } from './lib/auth.js';
import { getUserSites, getSite } from './lib/storage.js';
import { getStore } from './lib/blob-store.js';
import { scrubPII, originMatchesDomain, parseContext } from './lib/zero-trust-core.js';

const ERRORS_STORE = 'errors';
const DEDUP_WINDOW_MS = 3600000; // 1 hour deduplication window
const MAX_SITE_ERRORS = 1000;    // error records kept per site

// Valid error types
const VALID_ERROR_TYPES = ['404', '403', '401', '500', '502', '503', 'js_error', 'network_error'];

// Client-supplied text: PII-scrubbed and length-capped (null when absent).
function cleanText(value, max) {
  if (value === null || value === undefined || value === '') return null;
  return scrubPII(typeof value === 'string' ? value : JSON.stringify(value)).slice(0, max);
}

// Path only — query strings and fragments routinely carry tokens/emails.
function cleanUrlPath(value) {
  let path = String(value);
  try {
    path = new URL(path, 'https://placeholder.invalid').pathname;
  } catch {
    path = path.split(/[?#]/)[0];
  }
  return cleanText(path, 500);
}

// Referrer origin only.
function cleanReferrer(value) {
  if (!value) return null;
  try {
    return new URL(value).origin.slice(0, 300);
  } catch {
    return null;
  }
}

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
      const { site_id, type, user_agent } = body;
      const errorUrl = body.url ? cleanUrlPath(body.url) : null;
      const referrer = cleanReferrer(body.referrer);
      const message = cleanText(body.message, 500);
      const stack = cleanText(body.stack, 4000);
      const metadata = cleanText(body.metadata, 2000);

      // Validate required fields
      if (!site_id) {
        return new Response(JSON.stringify({ error: 'site_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if (!VALID_ERROR_TYPES.includes(type)) {
        return new Response(JSON.stringify({ error: `type must be one of ${VALID_ERROR_TYPES.join(', ')}` }), {
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

      // Browsers must post from the site's own domain (same rule as /api/track)
      const origin = req.headers.get('origin');
      if (origin && !originMatchesDomain(origin, site.domain)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' }
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
        referrer,
        // Coarse browser/OS only — the full user-agent string is a
        // fingerprinting signal and is never stored.
        client: user_agent ? parseContext(String(user_agent)) : null,
        message,
        stack,
        metadata,
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

      // Keep only the most recent error records per site. Delete the records
      // that fall off the index too — otherwise every distinct URL leaves a
      // record behind forever.
      if (siteErrors.length > MAX_SITE_ERRORS) {
        const evicted = siteErrors.splice(MAX_SITE_ERRORS);
        const kept = new Set(siteErrors.map(e => e.key));
        await Promise.all(evicted
          .filter(e => !kept.has(e.key))
          .map(e => errorsStore.delete(e.key)));
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
    const auth = await authenticateRequest(Object.fromEntries(req.headers));
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
