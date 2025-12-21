/**
 * GDPR Article 20 - User Data Export
 *
 * This endpoint allows users to export all their personal data in a portable format.
 * This is a requirement under GDPR "Right to Data Portability".
 */

import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getUser, getUserSites, getSite, getUserSessions, getUserApiKeys } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('user-export', req, context);
  const origin = req.headers.get('origin');

  logger.info('User data export request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const userId = auth.user.id;
    const userEmail = auth.user.email;

    logger.info('Exporting user data', { userId });

    // Get user profile
    const user = await getUser(userEmail);
    if (!user) {
      logger.error('User not found for export', { userId, userEmail });
      return Errors.notFound('User');
    }

    // Get user's sites
    const siteIds = await getUserSites(userId);
    const sites = [];
    for (const siteId of siteIds) {
      const site = await getSite(siteId);
      if (site) {
        sites.push({
          id: site.id,
          domain: site.domain,
          nickname: site.nickname,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt
        });
      }
    }

    // Get user's sessions (sanitized)
    const sessions = await getUserSessions(userId);
    const sanitizedSessions = sessions.map(session => ({
      id: session.id,
      device: session.device,
      browser: session.browser,
      os: session.os,
      isActive: session.isActive,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
      // IP address is hashed and not included for privacy
    }));

    // Get user's API keys (without the actual key values)
    const apiKeys = await getUserApiKeys(userId);
    const sanitizedApiKeys = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      permissions: key.permissions,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt
      // Actual key value is never exposed
    }));

    // Build export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      gdprArticle: 20,
      description: 'User data export under GDPR Article 20 - Right to Data Portability',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        oauthProvider: user.oauthProvider || null,
        twoFactorEnabled: !!user.twoFactorSecret,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        trialEndsAt: user.trialEndsAt
      },
      sites: sites,
      sessions: sanitizedSessions,
      apiKeys: sanitizedApiKeys,
      analytics: {
        note: 'Analytics data is pseudonymized and cannot be directly linked to you. Visit your dashboard to view aggregate analytics.',
        siteCount: sites.length
      }
    };

    logger.info('User data export completed', {
      userId,
      siteCount: sites.length,
      sessionCount: sanitizedSessions.length,
      apiKeyCount: sanitizedApiKeys.length
    });

    // Return as JSON with Content-Disposition header for download
    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        ...getSecurityHeaders(origin),
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zta-data-export-${new Date().toISOString().split('T')[0]}.json"`
      }
    });

  } catch (err) {
    logger.error('User data export failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/user/export'
};
