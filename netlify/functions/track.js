import { hashVisitor } from './lib/hash.js';
import { recordPageview, getSite } from './lib/storage.js';

export default async function handler(req, context) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await req.json();
    const { siteId, path, referrer, url } = data;

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify site exists
    const site = await getSite(siteId);
    if (!site) {
      return new Response(JSON.stringify({ error: 'Invalid site ID' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get client IP (Netlify provides this)
    const ip = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Hash visitor for anonymous tracking
    const visitorHash = hashVisitor(ip, userAgent);

    // Record the pageview
    const stats = await recordPageview(siteId, visitorHash, path || '/', referrer);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Track error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/track'
};
