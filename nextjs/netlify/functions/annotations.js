import { authenticateRequest } from './lib/auth.js';
import { getUserSites, createAnnotation, getSiteAnnotations, updateAnnotation, deleteAnnotation } from './lib/storage.js';

export default async function handler(req, context) {
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

  // GET - List annotations for a site
  if (req.method === 'GET') {
    const siteId = url.searchParams.get('siteId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

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
      const annotations = await getSiteAnnotations(siteId, startDate, endDate);

      return new Response(JSON.stringify({ annotations }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('List annotations error:', err);
      return new Response(JSON.stringify({ error: 'Failed to list annotations' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Create annotation
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, date, title, description, color, icon } = body;

      if (!siteId || !date) {
        return new Response(JSON.stringify({ error: 'Site ID and date required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD' }), {
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

      const annotation = await createAnnotation(siteId, userId, {
        date,
        title: title || 'Event',
        description: description || '',
        color: color || '#0d6efd',
        icon: icon || 'star'
      });

      return new Response(JSON.stringify({ annotation }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Create annotation error:', err);
      return new Response(JSON.stringify({ error: 'Failed to create annotation' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH - Update annotation
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { annotationId, ...updates } = body;

      if (!annotationId) {
        return new Response(JSON.stringify({ error: 'Annotation ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updated = await updateAnnotation(annotationId, userId, updates);

      if (!updated) {
        return new Response(JSON.stringify({ error: 'Annotation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ annotation: updated }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Update annotation error:', err);
      return new Response(JSON.stringify({ error: 'Failed to update annotation' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Delete annotation
  if (req.method === 'DELETE') {
    const annotationId = url.searchParams.get('annotationId');

    if (!annotationId) {
      return new Response(JSON.stringify({ error: 'Annotation ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const success = await deleteAnnotation(annotationId, userId);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Annotation not found' }), {
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
      console.error('Delete annotation error:', err);
      return new Response(JSON.stringify({ error: 'Failed to delete annotation' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/annotations'
};
