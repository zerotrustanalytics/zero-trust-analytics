/**
 * GDPR Article 17 - User Data Deletion (Right to be Forgotten)
 *
 * This endpoint allows users to permanently delete all their personal data.
 * This is a requirement under GDPR "Right to Erasure".
 *
 * IMPORTANT: This is a destructive, irreversible operation.
 */

import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getUser, getUserSites, deleteSite, deleteUser, revokeAllSessions, deleteAllUserApiKeys } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('user-delete', req, context);
  const origin = req.headers.get('origin');

  logger.info('User deletion request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
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

  // SECURITY: Validate CSRF token for this destructive operation
  const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
  if (!csrfValidation.valid) {
    logger.warn('CSRF validation failed', { userId: auth.user.id });
    return Errors.csrfInvalid();
  }

  try {
    const body = await req.json();
    const { confirmEmail, confirmDelete } = body;

    const userId = auth.user.id;
    const userEmail = auth.user.email;

    // Require explicit confirmation
    if (confirmDelete !== 'DELETE_MY_ACCOUNT') {
      logger.warn('Deletion confirmation missing', { userId });
      return Errors.validationError('Please confirm deletion by providing confirmDelete: "DELETE_MY_ACCOUNT"');
    }

    // Verify email matches (extra safety)
    if (confirmEmail !== userEmail) {
      logger.warn('Email confirmation mismatch', { userId, providedEmail: confirmEmail });
      return Errors.validationError('Email confirmation does not match your account email');
    }

    // Get user to verify they exist
    const user = await getUser(userEmail);
    if (!user) {
      logger.error('User not found for deletion', { userId, userEmail });
      return Errors.notFound('User');
    }

    logger.info('Starting user data deletion', { userId, userEmail });

    // Track deletion stats
    const deletionStats = {
      userId,
      email: userEmail,
      deletedAt: new Date().toISOString(),
      sites: 0,
      sessions: 0,
      apiKeys: 0
    };

    // 1. Delete all user's sites (and their analytics data)
    const siteIds = await getUserSites(userId);
    for (const siteId of siteIds) {
      await deleteSite(siteId, userId);
      deletionStats.sites++;
    }
    logger.info('Deleted user sites', { userId, count: deletionStats.sites });

    // 2. Revoke all sessions
    const revokedSessions = await revokeAllSessions(userId);
    deletionStats.sessions = revokedSessions;
    logger.info('Revoked user sessions', { userId, count: revokedSessions });

    // 3. Delete all API keys
    const deletedKeys = await deleteAllUserApiKeys(userId);
    deletionStats.apiKeys = deletedKeys;
    logger.info('Deleted user API keys', { userId, count: deletedKeys });

    // 4. Delete the user account
    await deleteUser(userEmail);
    logger.info('Deleted user account', { userId, userEmail });

    // Log the deletion for compliance audit trail (without PII)
    logger.info('GDPR deletion completed', {
      action: 'GDPR_ARTICLE_17_DELETION',
      timestamp: deletionStats.deletedAt,
      sitesDeleted: deletionStats.sites,
      sessionsRevoked: deletionStats.sessions,
      apiKeysDeleted: deletionStats.apiKeys
      // Note: userId and email are NOT logged here for privacy after deletion
    });

    return successResponse({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
      deletedAt: deletionStats.deletedAt,
      summary: {
        sitesDeleted: deletionStats.sites,
        sessionsRevoked: deletionStats.sessions,
        apiKeysDeleted: deletionStats.apiKeys
      },
      gdprArticle: 17,
      note: 'This action is irreversible. You may create a new account at any time.'
    }, 200, origin);

  } catch (err) {
    logger.error('User deletion failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/user/delete'
};
