/**
 * Zero Trust Analytics - Google Search Console Integration
 *
 * Connect GSC to view search performance data alongside your analytics.
 * Shows impressions, clicks, CTR, and average position for your pages.
 */

import { authenticateRequest } from './lib/auth.js';
import { getStore } from '@netlify/blobs';

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
const SEARCH_ANALYTICS_API = 'https://searchconsole.googleapis.com/v1';

// Required scopes for GSC
const GSC_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly'
];

export default async function handler(req, context) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // OAuth callback doesn't require auth (it's the redirect from Google)
  if (action === 'callback') {
    return handleOAuthCallback(req, url, corsHeaders);
  }

  // All other endpoints require authentication
  const auth = authenticateRequest(req.headers);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = auth.user.id;

  switch (action) {
    case 'connect':
      return handleConnect(req, userId, url, corsHeaders);
    case 'sites':
      return handleGetSites(req, userId, corsHeaders);
    case 'performance':
      return handleGetPerformance(req, userId, url, corsHeaders);
    case 'pages':
      return handleGetPages(req, userId, url, corsHeaders);
    case 'queries':
      return handleGetQueries(req, userId, url, corsHeaders);
    case 'status':
      return handleGetStatus(req, userId, corsHeaders);
    case 'disconnect':
      return handleDisconnect(req, userId, corsHeaders);
    default:
      return new Response(JSON.stringify({
        error: 'Invalid action',
        validActions: ['connect', 'callback', 'sites', 'performance', 'pages', 'queries', 'status', 'disconnect']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
  }
}

/**
 * Start OAuth flow - returns URL to redirect user to
 */
async function handleConnect(req, userId, url, corsHeaders) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return new Response(JSON.stringify({
      error: 'Google OAuth not configured',
      message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generate state token to prevent CSRF
  const state = Buffer.from(JSON.stringify({
    userId,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2)
  })).toString('base64');

  // Store state temporarily
  const stateStore = getStore({ name: 'oauth-states' });
  await stateStore.setJSON(`gsc_${state}`, {
    userId,
    createdAt: new Date().toISOString()
  }, { expirationTtl: 600 }); // 10 minute expiry

  // Build callback URL
  const baseUrl = url.origin;
  const redirectUri = `${baseUrl}/.netlify/functions/gsc?action=callback`;

  // Build OAuth URL
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GSC_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;

  return new Response(JSON.stringify({
    authUrl,
    message: 'Redirect user to authUrl to connect Google Search Console'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle OAuth callback from Google
 */
async function handleOAuthCallback(req, url, corsHeaders) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    // Redirect to dashboard with error
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': `/dashboard/?gsc_error=${encodeURIComponent(error)}`
      }
    });
  }

  if (!code || !state) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': '/dashboard/?gsc_error=missing_params'
      }
    });
  }

  // Verify state
  const stateStore = getStore({ name: 'oauth-states' });
  const stateData = await stateStore.get(`gsc_${state}`, { type: 'json' });

  if (!stateData) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': '/dashboard/?gsc_error=invalid_state'
      }
    });
  }

  const userId = stateData.userId;

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = url.origin;
  const redirectUri = `${baseUrl}/.netlify/functions/gsc?action=callback`;

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': '/dashboard/?gsc_error=token_exchange_failed'
        }
      });
    }

    const tokens = await tokenResponse.json();

    // Store tokens securely
    const gscStore = getStore({ name: 'gsc-connections' });
    await gscStore.setJSON(`user_${userId}`, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      connectedAt: new Date().toISOString(),
      scope: tokens.scope
    });

    // Clean up state
    await stateStore.delete(`gsc_${state}`);

    // Redirect to dashboard with success
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': '/dashboard/?gsc_connected=true'
      }
    });

  } catch (err) {
    console.error('OAuth callback error:', err);
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': '/dashboard/?gsc_error=callback_failed'
      }
    });
  }
}

/**
 * Get list of sites from GSC
 */
async function handleGetSites(req, userId, corsHeaders) {
  const tokens = await getValidTokens(userId);
  if (!tokens) {
    return new Response(JSON.stringify({
      error: 'Not connected',
      message: 'Google Search Console is not connected. Use action=connect to start OAuth flow.'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`${GSC_API_BASE}/sites`, {
      headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({
        error: 'Failed to fetch sites',
        details: errorData
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      sites: (data.siteEntry || []).map(site => ({
        url: site.siteUrl,
        permissionLevel: site.permissionLevel
      }))
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch sites', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get search performance data
 */
async function handleGetPerformance(req, userId, url, corsHeaders) {
  const tokens = await getValidTokens(userId);
  if (!tokens) {
    return new Response(JSON.stringify({ error: 'Not connected' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const siteUrl = url.searchParams.get('siteUrl');
  const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
  const endDate = url.searchParams.get('endDate') || getDefaultEndDate();
  const dimensions = url.searchParams.get('dimensions') || 'date';

  if (!siteUrl) {
    return new Response(JSON.stringify({ error: 'siteUrl is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const response = await fetch(
      `${SEARCH_ANALYTICS_API}/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: dimensions.split(','),
          rowLimit: 1000
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({
        error: 'Failed to fetch performance data',
        details: errorData
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    // Transform rows to more usable format
    const rows = (data.rows || []).map(row => {
      const result = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position
      };

      // Add dimension values
      const dims = dimensions.split(',');
      row.keys.forEach((key, idx) => {
        result[dims[idx]] = key;
      });

      return result;
    });

    return new Response(JSON.stringify({
      siteUrl,
      startDate,
      endDate,
      rows,
      totals: {
        clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
        impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
        avgCtr: rows.length > 0 ? rows.reduce((sum, r) => sum + r.ctr, 0) / rows.length : 0,
        avgPosition: rows.length > 0 ? rows.reduce((sum, r) => sum + r.position, 0) / rows.length : 0
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch performance', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get top pages
 */
async function handleGetPages(req, userId, url, corsHeaders) {
  const tokens = await getValidTokens(userId);
  if (!tokens) {
    return new Response(JSON.stringify({ error: 'Not connected' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const siteUrl = url.searchParams.get('siteUrl');
  const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
  const endDate = url.searchParams.get('endDate') || getDefaultEndDate();
  const limit = parseInt(url.searchParams.get('limit') || '25');

  if (!siteUrl) {
    return new Response(JSON.stringify({ error: 'siteUrl is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const response = await fetch(
      `${SEARCH_ANALYTICS_API}/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['page'],
          rowLimit: limit
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: 'Failed to fetch pages', details: errorData }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    const pages = (data.rows || []).map(row => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }));

    return new Response(JSON.stringify({
      siteUrl,
      startDate,
      endDate,
      pages
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch pages', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get top search queries
 */
async function handleGetQueries(req, userId, url, corsHeaders) {
  const tokens = await getValidTokens(userId);
  if (!tokens) {
    return new Response(JSON.stringify({ error: 'Not connected' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const siteUrl = url.searchParams.get('siteUrl');
  const startDate = url.searchParams.get('startDate') || getDefaultStartDate();
  const endDate = url.searchParams.get('endDate') || getDefaultEndDate();
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!siteUrl) {
    return new Response(JSON.stringify({ error: 'siteUrl is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const response = await fetch(
      `${SEARCH_ANALYTICS_API}/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['query'],
          rowLimit: limit
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: 'Failed to fetch queries', details: errorData }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    const queries = (data.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    }));

    return new Response(JSON.stringify({
      siteUrl,
      startDate,
      endDate,
      queries
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch queries', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get connection status
 */
async function handleGetStatus(req, userId, corsHeaders) {
  const gscStore = getStore({ name: 'gsc-connections' });
  const connection = await gscStore.get(`user_${userId}`, { type: 'json' });

  if (!connection) {
    return new Response(JSON.stringify({
      connected: false,
      message: 'Google Search Console is not connected'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    connected: true,
    connectedAt: connection.connectedAt,
    expiresAt: new Date(connection.expiresAt).toISOString()
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Disconnect GSC
 */
async function handleDisconnect(req, userId, corsHeaders) {
  const gscStore = getStore({ name: 'gsc-connections' });
  await gscStore.delete(`user_${userId}`);

  return new Response(JSON.stringify({
    success: true,
    message: 'Google Search Console disconnected'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Get valid tokens, refreshing if needed
 */
async function getValidTokens(userId) {
  const gscStore = getStore({ name: 'gsc-connections' });
  const connection = await gscStore.get(`user_${userId}`, { type: 'json' });

  if (!connection) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  if (connection.expiresAt < Date.now() + 300000) {
    // Refresh token
    const refreshed = await refreshAccessToken(userId, connection.refreshToken);
    if (!refreshed) {
      return null;
    }
    return refreshed;
  }

  return connection;
}

/**
 * Refresh access token
 */
async function refreshAccessToken(userId, refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      console.error('Token refresh failed');
      return null;
    }

    const tokens = await response.json();

    // Update stored tokens
    const gscStore = getStore({ name: 'gsc-connections' });
    const updated = {
      accessToken: tokens.access_token,
      refreshToken: refreshToken, // Keep original refresh token
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      connectedAt: new Date().toISOString(),
      scope: tokens.scope
    };

    await gscStore.setJSON(`user_${userId}`, updated);
    return updated;

  } catch (err) {
    console.error('Token refresh error:', err);
    return null;
  }
}

/**
 * Get default start date (28 days ago)
 */
function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 28);
  return date.toISOString().split('T')[0];
}

/**
 * Get default end date (today)
 */
function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}
