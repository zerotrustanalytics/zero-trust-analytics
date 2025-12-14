import { createToken } from './lib/auth.js';
import { getUser, createOAuthUser, updateUser } from './lib/storage.js';

// OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.URL}/api/auth/callback/google`;

export default async function handler(req, context) {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const provider = pathParts[pathParts.length - 1]; // 'github' or 'google'

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return redirectWithError(`OAuth error: ${error}`);
  }

  if (!code) {
    return redirectWithError('No authorization code received');
  }

  // Verify state (CSRF protection) and extract plan
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const storedState = cookies.oauth_state;

  if (!storedState || storedState !== state) {
    return redirectWithError('Invalid state parameter');
  }

  // Decode state to get plan
  let plan = 'pro';
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    plan = stateData.plan || 'pro';
  } catch (e) {
    // Use default plan if state parsing fails
  }

  try {
    let userInfo;

    if (provider === 'github') {
      userInfo = await handleGitHub(code);
    } else if (provider === 'google') {
      userInfo = await handleGoogle(code);
    } else {
      return redirectWithError('Unknown OAuth provider');
    }

    if (!userInfo || !userInfo.email) {
      return redirectWithError('Could not retrieve email from provider');
    }

    // Get or create user
    let user = await getUser(userInfo.email);

    if (!user) {
      // Create new OAuth user with plan
      user = await createOAuthUser(userInfo.email, provider, userInfo.providerId, userInfo.name, plan);
    } else {
      // Update existing user with OAuth provider info if not already set
      if (!user.oauthProvider) {
        await updateUser(userInfo.email, {
          oauthProvider: provider,
          oauthProviderId: userInfo.providerId
        });
      }
    }

    // Create JWT token
    const token = createToken({ id: user.id, email: userInfo.email });

    // Clear the state cookie and redirect with token
    const clearStateCookie = 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

    // Redirect to dashboard with token in URL fragment (client-side only)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/dashboard/?auth_token=${token}`,
        'Set-Cookie': clearStateCookie
      }
    });

  } catch (err) {
    console.error('OAuth callback error:', err);
    return redirectWithError('Authentication failed');
  }
}

async function handleGitHub(code) {
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
    throw new Error(tokenData.error_description || tokenData.error);
  }

  const accessToken = tokenData.access_token;

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  const userData = await userResponse.json();

  // Get user email (may be private)
  let email = userData.email;

  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const emails = await emailsResponse.json();
    const primaryEmail = emails.find(e => e.primary && e.verified);
    email = primaryEmail?.email;
  }

  return {
    email,
    providerId: String(userData.id),
    name: userData.name || userData.login
  };
}

async function handleGoogle(code) {
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
    throw new Error(tokenData.error_description || tokenData.error);
  }

  const accessToken = tokenData.access_token;

  // Get user info
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const userData = await userResponse.json();

  return {
    email: userData.email,
    providerId: userData.id,
    name: userData.name
  };
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = rest.join('=');
  });

  return cookies;
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
