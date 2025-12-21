import { getPasswordResetToken } from './lib/storage.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';
import { corsPreflightResponse, successResponse, Errors } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('auth-verify-reset-token', req, context);
  const origin = req.headers.get('origin');

  logger.info('Reset token verification requested');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    return Errors.methodNotAllowed();
  }

  // Rate limit by IP (10 per minute)
  const ip = context?.ip || req.headers.get?.('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimitKey = hashIP(ip);
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 10, windowMs: 60000 });

  if (!rateLimit.allowed) {
    logger.warn('Token verification rate limit exceeded');
    return rateLimitResponse(rateLimit);
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      logger.warn('Token verification failed - no token provided');
      return Errors.validationError('Token is required');
    }

    // Validate token (without consuming it)
    const tokenData = await getPasswordResetToken(token);
    if (!tokenData) {
      logger.warn('Token verification failed - invalid or expired token');
      return Errors.badRequest('Invalid or expired reset link');
    }

    logger.info('Token verified successfully');
    return successResponse({
      valid: true,
      expiresAt: tokenData.expiresAt
    }, 200, origin);
  } catch (err) {
    logger.error('Token verification failed', err);
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/verify-reset-token'
};
