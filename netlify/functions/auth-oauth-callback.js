import { createToken, Errors } from './lib/auth.js';
import { getUser, createOAuthUser, updateUser, validateOAuthState } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.URL}/api/auth/callback/google`;

export default async function handler(req, context) {
  const logger = createFunctionLogger('auth-oauth-callback', req, context);

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const provider = pathParts[pathParts.length - 1]; // 'github' or 'google'

  logger.info('OAuth callback received', { provider });

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    logger.warn('OAuth provider returned error', { provider, error });
    return redirectWithError(`OAuth error: ${error}`);
  }

  if (!code) {
    logger.warn('OAuth callback missing authorization code', { provider });
    return redirectWithError('No authorization code received');
  }

  if (!state) {
    logger.warn('OAuth callback missing state parameter', { provider });
    return redirectWithError('Missing state parameter');
  }

  // SECURITY: Validate state server-side (prevents CSRF and replay attacks)
  const stateValidation = await validateOAuthState(state);

  if (!stateValidation.valid) {
    logger.warn('OAuth state validation failed', { provider, error: stateValidation.error });
    return redirectWithError(`Security validation failed: ${stateValidation.error}`);
  }

  // Extract plan and verify provider matches
  const stateData = stateValidation.data;
  const plan = stateData.plan || 'pro';

  if (stateData.provider && stateData.provider !== provider) {
    logger.warn('OAuth provider mismatch', { expected: stateData.provider, received: provider });
    return redirectWithError('Provider mismatch');
  }

  logger.debug('OAuth state validated', { plan, provider });

  try {
    let userInfo;

    if (provider === 'github') {
      logger.info('Processing GitHub OAuth callback');
      userInfo = await handleGitHub(code, logger);
    } else if (provider === 'google') {
      logger.info('Processing Google OAuth callback');
      userInfo = await handleGoogle(code, logger);
    } else {
      logger.warn('Unknown OAuth provider', { provider });
      return redirectWithError('Unknown OAuth provider');
    }

    if (!userInfo || !userInfo.email) {
      logger.error('Failed to retrieve email from OAuth provider', { provider });
      return redirectWithError('Could not retrieve email from provider');
    }

    logger.info('OAuth user info retrieved', { provider, hasEmail: !!userInfo.email });

    // Get or create user
    let user = await getUser(userInfo.email);

    if (!user) {
      logger.info('Creating new OAuth user', { provider, plan });
      // Create new OAuth user with plan
      user = await createOAuthUser(userInfo.email, provider, userInfo.providerId, userInfo.name, plan);
      logger.info('New OAuth user created', { userId: user.id, provider });
    } else {
      logger.info('Existing user found', { userId: user.id, provider });
      // Update existing user with OAuth provider info if not already set
      if (!user.oauthProvider) {
        await updateUser(userInfo.email, {
          oauthProvider: provider,
          oauthProviderId: userInfo.providerId
        });
        logger.info('Updated existing user with OAuth info', { userId: user.id, provider });
      }
    }

    // Create JWT token
    const token = createToken({ id: user.id, email: userInfo.email });

    logger.info('OAuth authentication successful', { userId: user.id, provider });

    // Redirect to dashboard with token in URL fragment (client-side only)
    // Note: State is already marked as used in validateOAuthState (one-time use)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/dashboard/?auth_token=${token}`
      }
    });

  } catch (err) {
    logger.error('OAuth callback failed', err, { provider });
    return redirectWithError('Authentication failed');
  }
}

async function handleGitHub(code, logger) {
  logger.debug('Exchanging GitHub code for access token');

  // Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code
    })
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    logger.error('GitHub token exchange failed', null, { error: tokenData.error_description || tokenData.error });
    throw new Error(tokenData.error_description || tokenData.error);
  }

  const accessToken = tokenData.access_token;
  logger.debug('GitHub access token obtained');

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  const userData = await userResponse.json();
  logger.debug('GitHub user data retrieved', { hasEmail: !!userData.email });

  // Get user email (may be private)
  let email = userData.email;

  if (!email) {
    logger.debug('Email not in user data, fetching from emails endpoint');
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const emails = await emailsResponse.json();
    const primaryEmail = emails.find(e => e.primary && e.verified);
    email = primaryEmail?.email;
    logger.debug('Primary email retrieved', { hasEmail: !!email });
  }

  return {
    email,
    providerId: String(userData.id),
    name: userData.name || userData.login
  };
}

async function handleGoogle(code, logger) {
  logger.debug('Exchanging Google code for access token');

  // Exchange code for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI
    })
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    logger.error('Google token exchange failed', null, { error: tokenData.error_description || tokenData.error });
    throw new Error(tokenData.error_description || tokenData.error);
  }

  const accessToken = tokenData.access_token;
  logger.debug('Google access token obtained');

  // Get user info
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const userData = await userResponse.json();
  logger.debug('Google user data retrieved', { hasEmail: !!userData.email });

  return {
    email: userData.email,
    providerId: userData.id,
    name: userData.name
  };
}

function redirectWithError(message) {
  const encodedMessage = encodeURIComponent(message);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `/login/?error=${encodedMessage}`
    }
  });
}

export const config = {
  path: '/api/auth/callback/:provider'
};
