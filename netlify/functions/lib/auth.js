/**
 * Authentication and Security Library
 *
 * CSRF Protection Implementation:
 * ================================
 * This library implements CSRF (Cross-Site Request Forgery) protection for state-changing operations.
 *
 * How it works:
 * 1. When a user logs in or registers, the server generates a CSRF token using generateCSRFToken()
 * 2. The CSRF token is sent to the client in the auth response via createAuthResponse()
 * 3. The client stores the CSRF token (e.g., in memory or session storage - NOT in cookies)
 * 4. For all state-changing requests (POST, PUT, DELETE), the client must include the CSRF token
 *    in the X-CSRF-Token header
 * 5. The server validates the CSRF token using validateCSRFFromRequest() before processing the request
 *
 * Frontend Implementation Example:
 * ```javascript
 * // After login, store the CSRF token
 * const { token, csrfToken } = await loginResponse.json();
 * sessionStorage.setItem('csrfToken', csrfToken);
 *
 * // Include CSRF token in state-changing requests
 * fetch('/api/sites', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'X-CSRF-Token': sessionStorage.getItem('csrfToken'),
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify(data)
 * });
 * ```
 *
 * Session Invalidation:
 * =====================
 * When a user changes their password, all existing JWT tokens are invalidated by setting
 * tokenInvalidatedAt on the user record. This prevents old sessions from being used after
 * a password reset, which is critical for security.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { verifyToken as verifyClerkToken } from '@clerk/backend';
import { Config } from './config.js';

// Use centralized configuration with validation
const JWT_SECRET = Config.jwt.secret;
const JWT_EXPIRY = Config.jwt.expiry;
const JWT_ALGORITHM = 'HS256';

// Allowed origins for CORS
const ALLOWED_ORIGINS = Config.cors.allowedOrigins;

// Standard error codes
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  CSRF_TOKEN_MISSING: 'CSRF_TOKEN_MISSING',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID'
};

// Get CORS origin based on request
export function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
}

// Content Security Policy - defense-in-depth against XSS
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://api.stripe.com https://*.turso.io wss://*.turso.io",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests"
].join('; ');

// Security headers for all responses
export function getSecurityHeaders(requestOrigin = null) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Credentials': 'true',
    'Content-Security-Policy': CSP_DIRECTIVES,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

// Standard error response helper
export function errorResponse(message, status = 400, code = null, details = null, requestOrigin = null) {
  const body = {
    error: message,
    code: code || (status === 400 ? ErrorCodes.BAD_REQUEST :
                   status === 401 ? ErrorCodes.UNAUTHORIZED :
                   status === 403 ? ErrorCodes.FORBIDDEN :
                   status === 404 ? ErrorCodes.NOT_FOUND :
                   status === 405 ? ErrorCodes.METHOD_NOT_ALLOWED :
                   status === 429 ? ErrorCodes.RATE_LIMITED :
                   ErrorCodes.INTERNAL_ERROR)
  };

  if (details) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: getSecurityHeaders(requestOrigin)
  });
}

// Common error responses - all accept optional origin for CORS
export const Errors = {
  methodNotAllowed: (origin = null) => errorResponse('Method not allowed', 405, ErrorCodes.METHOD_NOT_ALLOWED, null, origin),
  unauthorized: (message = 'Unauthorized', origin = null) => errorResponse(message, 401, ErrorCodes.UNAUTHORIZED, null, origin),
  forbidden: (message = 'Access denied', origin = null) => errorResponse(message, 403, ErrorCodes.FORBIDDEN, null, origin),
  notFound: (resource = 'Resource', origin = null) => errorResponse(`${resource} not found`, 404, ErrorCodes.NOT_FOUND, null, origin),
  badRequest: (message, origin = null) => errorResponse(message, 400, ErrorCodes.BAD_REQUEST, null, origin),
  validationError: (message, details = null, origin = null) => errorResponse(message, 400, ErrorCodes.VALIDATION_ERROR, details, origin),
  internalError: (message = 'Internal server error', origin = null) => errorResponse(message, 500, ErrorCodes.INTERNAL_ERROR, null, origin),
  tokenExpired: (origin = null) => errorResponse('Token expired. Please log in again.', 401, ErrorCodes.TOKEN_EXPIRED, null, origin),
  csrfMissing: (origin = null) => errorResponse('CSRF token is required', 403, ErrorCodes.CSRF_TOKEN_MISSING, null, origin),
  csrfInvalid: (origin = null) => errorResponse('Invalid CSRF token', 403, ErrorCodes.CSRF_TOKEN_INVALID, null, origin)
};

// Hash password
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Create JWT token
export function createToken(payload) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: JWT_ALGORITHM
  });
}

// Verify JWT token - SECURITY: Always enforce algorithm to prevent "none" algorithm attacks
// Also checks if token was issued before tokenInvalidatedAt timestamp (for password resets)
export function verifyToken(token, user = null) {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM] // Only allow HS256, prevent algorithm confusion attacks
    });

    // SECURITY: Check if token was invalidated (e.g., after password change)
    if (user && user.tokenInvalidatedAt) {
      const invalidatedAt = new Date(user.tokenInvalidatedAt).getTime() / 1000; // Convert to seconds
      const tokenIssuedAt = decoded.iat;

      if (tokenIssuedAt < invalidatedAt) {
        // Token was issued before password change - invalid
        return { invalidated: true };
      }
    }

    return decoded;
  } catch (err) {
    // Return error type for better error messages
    if (err.name === 'TokenExpiredError') {
      return { expired: true, expiredAt: err.expiredAt };
    }
    return null;
  }
}

// SECURITY: Generate CSRF token tied to user session
// Token is self-verifying: HMAC(userId:timestamp, secret) with no random component
export function generateCSRFToken(userId) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const timestamp = Date.now();
  const data = `csrf:${userId}:${timestamp}`;
  const hash = crypto.createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('hex');

  return `${timestamp}.${hash}`;
}

// SECURITY: Validate CSRF token by recomputing the HMAC
// Token format: timestamp.hash
// Tokens are valid for 24 hours
export function validateCSRFToken(token, userId) {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return false;
  }

  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [timestamp, hash] = parts;

  // Check if token is expired (24 hours)
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  if (tokenAge > MAX_AGE || tokenAge < 0) {
    return false;
  }

  // Recompute the expected HMAC and compare using timing-safe comparison
  const expectedData = `csrf:${userId}:${timestamp}`;
  const expectedHash = crypto.createHmac('sha256', JWT_SECRET)
    .update(expectedData)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch (e) {
    return false;
  }
}

// Extract token from Authorization header
export function getTokenFromHeader(headers) {
  const auth = headers.authorization || headers.Authorization;
  if (!auth) return null;

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

// CORS preflight response helper
export function corsPreflightResponse(requestOrigin, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  });
}

// Success response helper with proper headers
export function successResponse(data, status = 200, requestOrigin = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getSecurityHeaders(requestOrigin)
  });
}

// SECURITY: Create authentication response with CSRF token
// This helper should be used for login/register responses to provide the client with a CSRF token
export function createAuthResponse(user, token, requestOrigin = null) {
  const csrfToken = generateCSRFToken(user.id);

  return successResponse({
    token,
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
      trialEndsAt: user.trialEndsAt,
      subscription: user.subscription
    },
    csrfToken
  }, 200, requestOrigin);
}

// SECURITY: Validate CSRF token from request headers
// Frontend should send CSRF token in X-CSRF-Token header for state-changing requests
export function validateCSRFFromRequest(headers, userId) {
  const csrfToken = headers.get?.('x-csrf-token') || headers.get?.('X-CSRF-Token');

  if (!csrfToken) {
    return { valid: false, error: 'CSRF token is required' };
  }

  const isValid = validateCSRFToken(csrfToken, userId);

  if (!isValid) {
    return { valid: false, error: 'Invalid CSRF token' };
  }

  return { valid: true };
}

// Middleware helper - verify auth and return user
// Supports multiple auth modes: clerk, jwt, password, none
export async function authenticateRequest(headers, user = null) {
  const authMode = Config.auth.mode;

  // AUTH_MODE=none: No authentication required (self-hosted single user)
  if (authMode === 'none') {
    return {
      user: {
        id: 'self-hosted-user',
        email: 'admin@localhost',
        plan: 'enterprise', // Self-hosted gets all features
        isSelfHosted: true
      }
    };
  }

  // AUTH_MODE=password: Simple shared password authentication
  if (authMode === 'password') {
    const providedPassword = headers.get?.('x-auth-password') || headers.get?.('X-Auth-Password');
    const expectedPassword = Config.auth.password;

    if (!expectedPassword) {
      console.error('AUTH_MODE=password but AUTH_PASSWORD not set');
      return { error: 'Server misconfigured', status: 500 };
    }

    if (!providedPassword) {
      return { error: 'Password required', status: 401, needsPassword: true };
    }

    if (providedPassword !== expectedPassword) {
      return { error: 'Invalid password', status: 401 };
    }

    return {
      user: {
        id: 'self-hosted-user',
        email: 'admin@localhost',
        plan: 'enterprise',
        isSelfHosted: true
      }
    };
  }

  // AUTH_MODE=clerk or AUTH_MODE=jwt: Token-based auth
  const token = getTokenFromHeader(headers);
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  // Try Clerk verification first (only if AUTH_MODE=clerk)
  if (authMode === 'clerk') {
    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const verifiedToken = await verifyClerkToken(token, {
          secretKey: clerkSecretKey,
        });

        if (verifiedToken) {
          return {
            user: {
              id: verifiedToken.sub,
              clerkUserId: verifiedToken.sub,
              email: verifiedToken.email || null,
            }
          };
        }
      }
    } catch (clerkError) {
      console.log('Clerk token verification failed:', clerkError.message);
      return { error: 'Invalid token', status: 401 };
    }
  }

  // JWT verification (AUTH_MODE=jwt or fallback)
  const decoded = verifyToken(token, user);
  if (!decoded) {
    return { error: 'Invalid token', status: 401 };
  }

  if (decoded.expired) {
    return { error: 'Token expired. Please log in again.', status: 401, expired: true };
  }

  if (decoded.invalidated) {
    return { error: 'Session invalidated. Please log in again.', status: 401, invalidated: true };
  }

  return { user: decoded };
}

// Helper to check if auth is required for current mode
export function isAuthRequired() {
  return Config.auth.requiresAuth;
}

// Helper to get auth mode info for frontend
export function getAuthModeInfo() {
  return {
    mode: Config.auth.mode,
    requiresAuth: Config.auth.requiresAuth,
    isSelfHosted: Config.selfHosted.enabled,
  };
}
