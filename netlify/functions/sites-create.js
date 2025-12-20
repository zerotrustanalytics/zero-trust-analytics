import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { createSite, getUser } from './lib/storage.js';
import { generateSiteId } from './lib/hash.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed();
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  // SECURITY: Validate CSRF token for state-changing operations
  const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
  if (!csrfValidation.valid) {
    return Errors.csrfInvalid();
  }

  try {
    const { domain } = await req.json();

    if (!domain) {
      return Errors.validationError('Domain required');
    }

    // Normalize domain: remove protocol and trailing slash
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    // Generate site ID and create
    const siteId = generateSiteId();
    const site = await createSite(auth.user.id, siteId, normalizedDomain);

    return successResponse({
      success: true,
      site,
      embedCode: `<script src="https://ztas.io/js/analytics.js" data-site-id="${siteId}"></script>`
    }, 201, origin);
  } catch (err) {
    console.error('Site create error:', err);
    return Errors.internalError('Failed to create site');
  }
}

export const config = {
  path: '/api/sites/create'
};
