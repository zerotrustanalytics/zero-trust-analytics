/**
 * HTTP helpers shared by every function: CORS, security headers, JSON
 * responses, error shapes and CSRF checks. No storage or identity-provider
 * dependencies, so anything can import it cheaply (lib/auth.js re-exports it).
 */
import crypto from 'crypto';
import { Config } from './config.js';

const JWT_SECRET = Config.jwt.secret;

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

// SECURITY: Validate CSRF token from request headers
// Frontend should send CSRF token in X-CSRF-Token header for state-changing requests.
//
// CSRF only threatens credentials a browser attaches automatically (cookies).
// API auth here is header-only — a Bearer token (oidc/jwt/clerk) or
// X-Auth-Password (password mode) — and a cross-site form or link cannot set
// those headers, so a request that authenticated with one is not forgeable and
// needs no token. (The gatekeep dashboard never had a CSRF token to send.)
export function validateCSRFFromRequest(headers, userId) {
  if (extractBearerToken(headers) || headers.get?.('x-auth-password')) {
    return { valid: true };
  }

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

// Constant-time string comparison for shared secrets (hash first so lengths
// match and the comparison time reveals nothing about the secret).
export function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export // Robust bearer-token extraction: works whether `headers` is a Web Headers
// object (has .get()) or a plain object (Express-wrapped functions).
function extractBearerToken(headers) {
  let raw = null;
  if (headers && typeof headers.get === 'function') {
    raw = headers.get('authorization') || headers.get('Authorization');
  } else if (headers) {
    raw = headers.authorization || headers.Authorization;
  }
  if (!raw) return null;
  const parts = raw.split(' ');
  return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
}
