import { corsPreflightResponse, Errors } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.URL}/api/auth/callback/google`;

export default async function handler(req, context) {
  const logger = createFunctionLogger('auth-google', req, context);
  const origin = req.headers.get('origin');

  logger.info('Google OAuth flow initiated');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (!GOOGLE_CLIENT_ID) {
    logger.error('Google OAuth not configured - missing client ID');
    return Errors.internalError('Google OAuth not configured');
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

    // Build Google authorization URL
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'email profile',
      state: state,
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    logger.info('Redirecting to Google OAuth', { redirectUri: GOOGLE_REDIRECT_URI });
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl,
        'Set-Cookie': stateCookie
      }
    });
  } catch (err) {
    logger.error('Google OAuth initiation failed', err);
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/google'
};
