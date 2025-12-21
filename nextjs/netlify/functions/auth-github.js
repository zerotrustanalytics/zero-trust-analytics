import { corsPreflightResponse, Errors } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || `${process.env.URL}/api/auth/callback/github`;

export default async function handler(req, context) {
  const logger = createFunctionLogger('auth-github', req, context);
  const origin = req.headers.get('origin');

  logger.info('GitHub OAuth flow initiated');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (!GITHUB_CLIENT_ID) {
    logger.error('GitHub OAuth not configured - missing client ID');
    return Errors.internalError('GitHub OAuth not configured');
  }

  try {
    // Get plan from query params (for signup flow)
    const url = new URL(req.url);
    const plan = url.searchParams.get('plan') || 'pro';

    logger.debug('OAuth state generated', { plan });

    // Generate state for CSRF protection (include plan)
    const stateData = JSON.stringify({ csrf: crypto.randomUUID(), plan });
    const state = Buffer.from(stateData).toString('base64');

    // Store state in cookie for verification on callback
    const stateCookie = `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;

    // Build GitHub authorization URL
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_REDIRECT_URI,
      scope: 'user:email',
      state: state
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params}`;

    logger.info('Redirecting to GitHub OAuth', { redirectUri: GITHUB_REDIRECT_URI });
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl,
        'Set-Cookie': stateCookie
      }
    });
  } catch (err) {
    logger.error('GitHub OAuth initiation failed', err);
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/github'
};
