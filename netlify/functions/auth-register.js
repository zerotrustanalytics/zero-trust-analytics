import { hashPassword, createToken, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, createAuthResponse } from './lib/auth.js';
import { createUser, getUser } from './lib/storage.js';
import { generateSiteId } from './lib/hash.js';
import { checkRateLimit, rateLimitResponse, hashIP, getEndpointConfig } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, ConflictError } from './lib/error-handler.js';
import { validateRequest, authRegisterSchema } from './lib/schemas.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('auth-register', req, context);

  logger.info('Registration attempt received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Rate limiting for registration: Uses endpoint-specific config
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `register_${hashIP(clientIP)}`;
  const { limit, windowMs } = getEndpointConfig('register');
  const rateLimit = await checkRateLimit(rateLimitKey, { limit, windowMs });

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for registration', {
      retryAfter: rateLimit.retryAfter,
      limit
    });
    return rateLimitResponse(rateLimit, limit);
  }

  try {
    const body = await req.json();

    // SECURITY: Comprehensive input validation with sanitization
    const validated = validateRequest(authRegisterSchema, body, logger);
    const { email, password, plan } = validated;

    logger.debug('Input validation successful', { plan });

    // Check if user exists
    const existing = await getUser(email);
    if (existing) {
      logger.warn('Registration failed - email already exists', {
        hasExistingUser: true
      });
      return new Response(JSON.stringify({ error: 'Email already registered' }), {
        status: 409,
        headers: getSecurityHeaders(origin)
      });
    }

    logger.info('Creating new user', { plan });

    // Create user with selected plan and 14-day trial
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash, plan);

    // Create JWT token
    const token = createToken({ id: user.id, email: user.email });

    logger.info('User registration successful', {
      userId: user.id,
      plan: plan,
      hasTrialPeriod: !!user.trialEndsAt
    });

    // SECURITY: Return auth response with CSRF token
    return createAuthResponse(user, token, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/register'
};
