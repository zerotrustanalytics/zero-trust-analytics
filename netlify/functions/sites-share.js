import { authenticateRequest } from './lib/auth.js';
import { getSite, getUserSites, createPublicShare, getSiteShares, deletePublicShare } from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  // GET - List shares for a site
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify ownership
    const userSites = await getUserSites(userId);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const shares = await getSiteShares(siteId);

    return new Response(JSON.stringify({ shares }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // POST - Create a new share
  if (req.method === 'POST') {
    try {
      const { siteId, expiresIn, password } = await req.json();

      if (!siteId) {
        return new Response(JSON.stringify({ error: 'Site ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify ownership
      const userSites = await getUserSites(userId);
      if (!userSites.includes(siteId)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Calculate expiration if specified
      let expiresAt = null;
      if (expiresIn) {
        const now = new Date();
        switch (expiresIn) {
          case '1d': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
          case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
          case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
          case '90d': expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); break;
        }
        if (expiresAt) expiresAt = expiresAt.toISOString();
      }

      const share = await createPublicShare(siteId, userId, {
        expiresAt,
        password: password || null
      });

      // Get site info for the response
      const site = await getSite(siteId);

      return new Response(JSON.stringify({
        share,
        shareUrl: `https://ztas.io/shared/${share.token}`,
        site: { domain: site?.domain }
      }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Create share error:', err);
      return new Response(JSON.stringify({ error: 'Failed to create share' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Revoke a share
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const shareToken = url.searchParams.get('token');

    if (!shareToken) {
      return new Response(JSON.stringify({ error: 'Share token required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const success = await deletePublicShare(shareToken, userId);

    if (!success) {
      return new Response(JSON.stringify({ error: 'Share not found or access denied' }), {
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
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/sites/share'
};
