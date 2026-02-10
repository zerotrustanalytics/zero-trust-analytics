import { debugGetCount, debugGetRecent } from './lib/turso.js';

export default async function handler(req, context) {
  // Auth check - require INIT_DB_SECRET env var (no default fallback)
  const expectedSecret = process.env.INIT_DB_SECRET;
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: 'Debug endpoint not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authHeader = req.headers.get('x-init-secret');
  if (authHeader !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'siteId parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [count, recent] = await Promise.all([
      debugGetCount(siteId),
      debugGetRecent(siteId, 5)
    ]);

    return new Response(JSON.stringify({
      siteId,
      count: count.count,
      latestTimestamp: count.latest,
      recentRows: recent
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[debug] Error:', err.message, err.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/debug'
};
