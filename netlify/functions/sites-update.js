import jwt from 'jsonwebtoken';
import { getSite, updateSite, getUser } from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { siteId, domain, nickname } = await req.json();

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify site belongs to user
    const site = await getSite(siteId);
    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await getUser(decoded.email);
    if (!user || site.userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized to update this site' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build update object
    const updates = {};
    if (domain) {
      updates.domain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    if (nickname !== undefined) {
      updates.nickname = nickname.trim() || null;
    }

    const updated = await updateSite(siteId, updates);

    return new Response(JSON.stringify({ success: true, site: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Update site error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/sites/update'
};
