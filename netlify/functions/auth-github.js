import { corsPreflightResponse, Errors } from './lib/auth.js';
import { storeOAuthState } from './lib/storage.js';
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

    // SECURITY: Generate unique state ID and store server-side
    // This prevents OAuth CSRF attacks and ensures one-time use
    const stateId = crypto.randomUUID();
    const stateData = { csrf: crypto.randomUUID(), plan, provider: 'github' };

    // Store state server-side with 10-minute TTL
    await storeOAuthState(stateId, stateData);

    logger.debug('OAuth state stored server-side', { stateId, plan });

    // Build GitHub authorization URL
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_REDIRECT_URI,
      scope: 'user:email',
      state: stateId // Use stateId as the state parameter
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params}`;

    logger.info('Redirecting to GitHub OAuth', { redirectUri: GITHUB_REDIRECT_URI });
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl
        // No longer storing state in cookie - server-side storage instead
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
