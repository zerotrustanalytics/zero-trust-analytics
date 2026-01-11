import { initSchema } from './lib/turso.js';

export default async function handler(req, context) {
  // Allow GET or POST for flexibility
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Simple auth check - require a secret in header or query param
  const url = new URL(req.url);
  const authHeader = req.headers.get('x-init-secret');
  const authQuery = url.searchParams.get('secret');
  const expectedSecret = process.env.INIT_DB_SECRET || 'init-secret-change-me';

  if (authHeader !== expectedSecret && authQuery !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await initSchema();

    return new Response(JSON.stringify({
      success: true,
      message: 'Database schema initialized successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Schema init error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to initialize schema',
      details: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/init-db'
};
