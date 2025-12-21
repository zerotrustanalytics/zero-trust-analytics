import { debugGetCount, debugGetRecent } from './lib/turso.js';

export default async function handler(req, context) {
  // Simple auth
  const authHeader = req.headers.get('x-init-secret');
  if (authHeader !== (process.env.INIT_DB_SECRET || 'init-secret-change-me')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId') || 'site_577f4b1efc8b5758';

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
    return new Response(JSON.stringify({
      error: err.message,
      stack: err.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/debug'
};
