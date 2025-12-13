import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'zta-jwt-secret-change-me';
const JWT_EXPIRY = '7d';

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
  TOKEN_EXPIRED: 'TOKEN_EXPIRED'
};

// Standard error response helper
export function errorResponse(message, status = 400, code = null, details = null) {
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
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Common error responses
export const Errors = {
  methodNotAllowed: () => errorResponse('Method not allowed', 405, ErrorCodes.METHOD_NOT_ALLOWED),
  unauthorized: (message = 'Unauthorized') => errorResponse(message, 401, ErrorCodes.UNAUTHORIZED),
  forbidden: (message = 'Access denied') => errorResponse(message, 403, ErrorCodes.FORBIDDEN),
  notFound: (resource = 'Resource') => errorResponse(`${resource} not found`, 404, ErrorCodes.NOT_FOUND),
  badRequest: (message) => errorResponse(message, 400, ErrorCodes.BAD_REQUEST),
  validationError: (message, details = null) => errorResponse(message, 400, ErrorCodes.VALIDATION_ERROR, details),
  internalError: (message = 'Internal server error') => errorResponse(message, 500, ErrorCodes.INTERNAL_ERROR),
  tokenExpired: () => errorResponse('Token expired. Please log in again.', 401, ErrorCodes.TOKEN_EXPIRED)
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // Return error type for better error messages
    if (err.name === 'TokenExpiredError') {
      return { expired: true, expiredAt: err.expiredAt };
    }
    return null;
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

// Middleware helper - verify auth and return user
export function authenticateRequest(headers) {
  const token = getTokenFromHeader(headers);
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: 'Invalid token', status: 401 };
  }

  // Check if token is expired
  if (decoded.expired) {
    return { error: 'Token expired. Please log in again.', status: 401, expired: true };
  }

  return { user: decoded };
}
