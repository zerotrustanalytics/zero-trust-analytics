// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || `${process.env.URL}/api/auth/callback/github`;

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (!GITHUB_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'GitHub OAuth not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get plan from query params (for signup flow)
  const url = new URL(req.url);
  const plan = url.searchParams.get('plan') || 'pro';

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

  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl,
      'Set-Cookie': stateCookie
    }
  });
}

export const config = {
  path: '/api/auth/github'
};
