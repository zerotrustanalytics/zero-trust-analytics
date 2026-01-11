/**
 * AUTH CONFIG ENDPOINT
 * ====================
 * Returns authentication configuration for the frontend.
 * Allows the UI to adapt based on auth mode (clerk, jwt, password, none).
 */

import { getAuthModeInfo, corsPreflightResponse, successResponse, getSecurityHeaders } from './lib/auth.js';
import { Config } from './lib/config.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: getSecurityHeaders(origin)
    });
  }

  // Return auth configuration
  const authInfo = getAuthModeInfo();

  return successResponse({
    auth: {
      mode: authInfo.mode,
      requiresAuth: authInfo.requiresAuth,
      // Don't expose password, just whether password mode is active
      needsPassword: authInfo.mode === 'password',
    },
    selfHosted: {
      enabled: authInfo.isSelfHosted,
      features: {
        emailReports: !Config.selfHosted.disableEmailReports,
        stripe: !Config.selfHosted.disableStripe,
        teams: !authInfo.isSelfHosted, // Teams only for SaaS
      }
    }
  }, 200, origin);
}

export const config = {
  path: '/api/auth/config'
};
