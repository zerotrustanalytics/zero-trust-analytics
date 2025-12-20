import { hashPassword, createToken, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, createAuthResponse } from './lib/auth.js';
import { createUser, getUser } from './lib/storage.js';
import { generateSiteId } from './lib/hash.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, ConflictError } from './lib/error-handler.js';

// SECURITY: Strong password validation
function validatePassword(password) {
  const errors = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return errors;
}

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

  // Rate limiting for registration: 5 attempts per minute per IP
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `register_${hashIP(clientIP)}`;
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 5, windowMs: 60000 });

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for registration', {
      remainingTime: rateLimit.resetIn,
      limit: 5
    });
    return rateLimitResponse(rateLimit);
  }

  try {
    const { email, password, plan } = await req.json();

    if (!email || !password) {
      logger.warn('Missing required fields');
      return Errors.validationError('Email and password required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn('Invalid email format provided');
      return Errors.validationError('Invalid email format');
    }

    // Validate plan if provided
    const validPlans = ['solo', 'starter', 'pro', 'business', 'scale'];
    const selectedPlan = validPlans.includes(plan) ? plan : 'pro';

    logger.debug('Validating password requirements', { selectedPlan });

    // SECURITY: Strong password validation
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      logger.warn('Password validation failed', {
        errorCount: passwordErrors.length
      });
      return Errors.validationError('Password does not meet requirements', passwordErrors);
    }

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

    logger.info('Creating new user', { plan: selectedPlan });

    // Create user with selected plan and 14-day trial
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash, selectedPlan);

    // Create JWT token
    const token = createToken({ id: user.id, email: user.email });

    logger.info('User registration successful', {
      userId: user.id,
      plan: selectedPlan,
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
