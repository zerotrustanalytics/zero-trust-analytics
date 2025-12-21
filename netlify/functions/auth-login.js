import { verifyPassword, createToken, Errors, corsPreflightResponse, successResponse, getSecurityHeaders, createAuthResponse } from './lib/auth.js';
import { getUser } from './lib/storage.js';
import { checkRateLimit, rateLimitResponse, hashIP, getEndpointConfig } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, AuthError, ValidationError } from './lib/error-handler.js';
import { validateRequest, authLoginSchema } from './lib/schemas.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('auth-login', req, context);

  logger.info('Login attempt received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Strict rate limiting for login: Uses endpoint-specific config
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `login_${hashIP(clientIP)}`;
  const { limit, windowMs } = getEndpointConfig('login');
  const rateLimit = await checkRateLimit(rateLimitKey, { limit, windowMs });

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded', {
      retryAfter: rateLimit.retryAfter,
      limit
    });
    return rateLimitResponse(rateLimit, limit);
  }

  try {
    const body = await req.json();

    // SECURITY: Comprehensive input validation with sanitization
    const validated = validateRequest(authLoginSchema, body, logger);
    const { email, password } = validated;

    logger.debug('Input validation successful, attempting to retrieve user');

    // Get user
    const user = await getUser(email);
    if (!user) {
      logger.warn('Login failed - user not found', {
        hasEmail: !!email
      });
      return Errors.unauthorized('Invalid credentials');
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      logger.warn('Login failed - invalid password', {
        userId: user.id
      });
      return Errors.unauthorized('Invalid credentials');
    }

    logger.info('Password verified successfully', {
      userId: user.id,
      has2FA: user.twoFactorEnabled
    });

    // Check if user has 2FA enabled
    if (user.twoFactorEnabled) {
      // Create a temporary token (short-lived, 5 minutes)
      const jwt = (await import('jsonwebtoken')).default;
      const tempToken = jwt.sign(
        { email: user.email, temp: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      logger.info('2FA required, returning temp token', {
        userId: user.id
      });

      return successResponse({
        success: true,
        requires_2fa: true,
        tempToken
      }, 200, origin);
    }

    // Create JWT token (no 2FA required)
    const token = createToken({ id: user.id, email: user.email });

    logger.info('Login successful', {
      userId: user.id,
      subscription: user.subscription?.status
    });

    // SECURITY: Return auth response with CSRF token
    return createAuthResponse(user, token, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/login'
};
