import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { createApiKey, getUserApiKeys, revokeApiKey, updateApiKeyName } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('api-keys', req, context);
  const origin = req.headers.get('origin');

  logger.info('API keys request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, POST, PATCH, DELETE, OPTIONS');
  }

  // Authenticate request
  const auth = authenticateRequest(req.headers);
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  const userId = auth.user.id;

  // GET - List API keys
  if (req.method === 'GET') {
    try {
      const keys = await getUserApiKeys(userId);
      logger.info('API keys retrieved successfully', { userId, count: keys.length });
      return successResponse({ keys }, 200, origin);
    } catch (err) {
      logger.error('List API keys failed', err, { userId });
      return handleError(err, logger, origin);
    }
  }

  // POST - Create new API key
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { name, permissions } = body;

      // Validate permissions
      const validPermissions = ['read', 'write', 'admin'];
      const perms = (permissions || ['read']).filter(p => validPermissions.includes(p));

      if (perms.length === 0) {
        perms.push('read');
      }

      logger.info('Creating API key', { userId, permissions: perms });
      const apiKey = await createApiKey(userId, name, perms);

      logger.info('API key created successfully', { userId, keyId: apiKey.id });
      return successResponse({
        key: apiKey,
        message: 'API key created. Save the key now - you won\'t be able to see it again!'
      }, 201, origin);
    } catch (err) {
      logger.error('Create API key failed', err, { userId });
      return handleError(err, logger, origin);
    }
  }

  // PATCH - Update API key name
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { keyId, name } = body;

      if (!keyId || !name) {
        logger.warn('Update API key failed - missing parameters', { userId });
        return Errors.validationError('Key ID and name required');
      }

      logger.info('Updating API key', { userId, keyId });
      const updated = await updateApiKeyName(keyId, userId, name);

      if (!updated) {
        logger.warn('Update API key failed - not found', { userId, keyId });
        return Errors.notFound('API key not found');
      }

      logger.info('API key updated successfully', { userId, keyId });
      return successResponse({ key: updated }, 200, origin);
    } catch (err) {
      logger.error('Update API key failed', err, { userId });
      return handleError(err, logger, origin);
    }
  }

  // DELETE - Revoke API key
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const keyId = url.searchParams.get('keyId');

    if (!keyId) {
      logger.warn('Revoke API key failed - missing key ID', { userId });
      return Errors.validationError('Key ID required');
    }

    try {
      logger.info('Revoking API key', { userId, keyId });
      const success = await revokeApiKey(keyId, userId);

      if (!success) {
        logger.warn('Revoke API key failed - not found', { userId, keyId });
        return Errors.notFound('API key not found');
      }

      logger.info('API key revoked successfully', { userId, keyId });
      return successResponse({ success: true }, 200, origin);
    } catch (err) {
      logger.error('Revoke API key failed', err, { userId });
      return handleError(err, logger, origin);
    }
  }

  logger.warn('Invalid HTTP method', { method: req.method });
  return Errors.methodNotAllowed();
}

export const config = {
  path: '/api/keys'
};
