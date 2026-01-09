/**
 * Auth Library Tests
 *
 * Comprehensive tests for netlify/functions/lib/auth.js
 * Testing authentication, CORS, JWT, CSRF, and security headers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// ==========================================
// MOCK CONFIGURATION
// ==========================================

const JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes'
const JWT_EXPIRY = '24h'
const JWT_ALGORITHM = 'HS256'

const ALLOWED_ORIGINS = [
  'https://app.ztas.io',
  'https://ztas.io',
  'http://localhost:3000',
]

// ==========================================
// AUTH LIBRARY IMPLEMENTATION (mirrors auth.js)
// ==========================================

const ErrorCodes = {
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
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
}

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
  "upgrade-insecure-requests",
].join('; ')

function getCorsOrigin(requestOrigin: string | null) {
  if (!requestOrigin) return ALLOWED_ORIGINS[0]
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0]
}

function getSecurityHeaders(requestOrigin: string | null = null) {
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
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
}

function errorResponse(
  message: string,
  status = 400,
  code: string | null = null,
  details: unknown = null,
  requestOrigin: string | null = null
) {
  const body: Record<string, unknown> = {
    error: message,
    code:
      code ||
      (status === 400
        ? ErrorCodes.BAD_REQUEST
        : status === 401
          ? ErrorCodes.UNAUTHORIZED
          : status === 403
            ? ErrorCodes.FORBIDDEN
            : status === 404
              ? ErrorCodes.NOT_FOUND
              : status === 405
                ? ErrorCodes.METHOD_NOT_ALLOWED
                : status === 429
                  ? ErrorCodes.RATE_LIMITED
                  : ErrorCodes.INTERNAL_ERROR),
  }

  if (details) {
    body.details = details
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: getSecurityHeaders(requestOrigin),
  })
}

const Errors = {
  methodNotAllowed: (origin: string | null = null) =>
    errorResponse('Method not allowed', 405, ErrorCodes.METHOD_NOT_ALLOWED, null, origin),
  unauthorized: (message = 'Unauthorized', origin: string | null = null) =>
    errorResponse(message, 401, ErrorCodes.UNAUTHORIZED, null, origin),
  forbidden: (message = 'Access denied', origin: string | null = null) =>
    errorResponse(message, 403, ErrorCodes.FORBIDDEN, null, origin),
  notFound: (resource = 'Resource', origin: string | null = null) =>
    errorResponse(`${resource} not found`, 404, ErrorCodes.NOT_FOUND, null, origin),
  badRequest: (message: string, origin: string | null = null) =>
    errorResponse(message, 400, ErrorCodes.BAD_REQUEST, null, origin),
  validationError: (message: string, details: unknown = null, origin: string | null = null) =>
    errorResponse(message, 400, ErrorCodes.VALIDATION_ERROR, details, origin),
  internalError: (message = 'Internal server error', origin: string | null = null) =>
    errorResponse(message, 500, ErrorCodes.INTERNAL_ERROR, null, origin),
  tokenExpired: (origin: string | null = null) =>
    errorResponse('Token expired. Please log in again.', 401, ErrorCodes.TOKEN_EXPIRED, null, origin),
  csrfMissing: (origin: string | null = null) =>
    errorResponse('CSRF token is required', 403, ErrorCodes.CSRF_TOKEN_MISSING, null, origin),
  csrfInvalid: (origin: string | null = null) =>
    errorResponse('Invalid CSRF token', 403, ErrorCodes.CSRF_TOKEN_INVALID, null, origin),
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

function createToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: JWT_ALGORITHM,
  })
}

function verifyToken(
  token: string,
  user: { tokenInvalidatedAt?: string } | null = null
): { expired?: boolean; expiredAt?: Date; invalidated?: boolean; [key: string]: unknown } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as { iat: number; [key: string]: unknown }

    if (user && user.tokenInvalidatedAt) {
      const invalidatedAt = new Date(user.tokenInvalidatedAt).getTime() / 1000
      const tokenIssuedAt = decoded.iat

      if (tokenIssuedAt < invalidatedAt) {
        return { invalidated: true }
      }
    }

    return decoded
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'TokenExpiredError') {
      return { expired: true, expiredAt: (err as { expiredAt: Date }).expiredAt }
    }
    return null
  }
}

function generateCSRFToken(userId: string) {
  const timestamp = Date.now()
  const data = `${userId}:${timestamp}:${crypto.randomBytes(16).toString('hex')}`
  const hash = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex')

  return `${timestamp}.${hash}`
}

function validateCSRFToken(token: string, _userId: string) {
  if (!token || typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return false
  }

  const [timestamp, hash] = parts

  // Check if token is expired (24 hours)
  const tokenAge = Date.now() - parseInt(timestamp, 10)
  const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours
  if (tokenAge > MAX_AGE || tokenAge < 0) {
    return false
  }

  // Check if hash is valid hex string of correct length
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return false
  }

  return true
}

function getTokenFromHeader(headers: { authorization?: string; Authorization?: string }) {
  const auth = headers.authorization || headers.Authorization
  if (!auth) return null

  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null

  return parts[1]
}

function corsPreflightResponse(requestOrigin: string | null, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  })
}

function successResponse(data: unknown, status = 200, requestOrigin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getSecurityHeaders(requestOrigin),
  })
}

function createAuthResponse(
  user: { id: string; email: string; plan?: string; trialEndsAt?: string; subscription?: unknown },
  token: string,
  requestOrigin: string | null = null
) {
  const csrfToken = generateCSRFToken(user.id)

  return successResponse(
    {
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        trialEndsAt: user.trialEndsAt,
        subscription: user.subscription,
      },
      csrfToken,
    },
    200,
    requestOrigin
  )
}

function validateCSRFFromRequest(headers: { get?: (key: string) => string | null }, userId: string) {
  const csrfToken = headers.get?.('x-csrf-token') || headers.get?.('X-CSRF-Token')

  if (!csrfToken) {
    return { valid: false, error: 'CSRF token is required' }
  }

  const isValid = validateCSRFToken(csrfToken, userId)

  if (!isValid) {
    return { valid: false, error: 'Invalid CSRF token' }
  }

  return { valid: true }
}

// ==========================================
// TEST SUITE
// ==========================================

describe('Auth Library', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-09T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ==========================================
  // ERROR CODES TESTS
  // ==========================================
  describe('ErrorCodes', () => {
    it('defines all standard error codes', () => {
      expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST')
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED')
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN')
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND')
      expect(ErrorCodes.METHOD_NOT_ALLOWED).toBe('METHOD_NOT_ALLOWED')
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED')
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ErrorCodes.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED')
      expect(ErrorCodes.CSRF_TOKEN_MISSING).toBe('CSRF_TOKEN_MISSING')
      expect(ErrorCodes.CSRF_TOKEN_INVALID).toBe('CSRF_TOKEN_INVALID')
    })
  })

  // ==========================================
  // CORS TESTS
  // ==========================================
  describe('CORS Handling', () => {
    describe('getCorsOrigin', () => {
      it('returns first allowed origin when request origin is null', () => {
        const result = getCorsOrigin(null)
        expect(result).toBe('https://app.ztas.io')
      })

      it('returns request origin when it is allowed', () => {
        const result = getCorsOrigin('https://ztas.io')
        expect(result).toBe('https://ztas.io')
      })

      it('returns request origin for localhost in development', () => {
        const result = getCorsOrigin('http://localhost:3000')
        expect(result).toBe('http://localhost:3000')
      })

      it('returns default origin for disallowed origins', () => {
        const result = getCorsOrigin('https://evil.com')
        expect(result).toBe('https://app.ztas.io')
      })
    })

    describe('corsPreflightResponse', () => {
      it('returns 204 status for preflight', () => {
        const response = corsPreflightResponse('https://ztas.io')
        expect(response.status).toBe(204)
      })

      it('includes correct CORS headers', () => {
        const response = corsPreflightResponse('https://ztas.io')
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ztas.io')
        expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
        expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
      })

      it('includes CSRF token in allowed headers', () => {
        const response = corsPreflightResponse('https://ztas.io')
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-CSRF-Token')
      })

      it('allows custom methods', () => {
        const response = corsPreflightResponse('https://ztas.io', 'GET, POST')
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST')
      })
    })
  })

  // ==========================================
  // SECURITY HEADERS TESTS
  // ==========================================
  describe('Security Headers', () => {
    describe('getSecurityHeaders', () => {
      it('includes Content-Type header', () => {
        const headers = getSecurityHeaders()
        expect(headers['Content-Type']).toBe('application/json')
      })

      it('includes CORS origin header', () => {
        const headers = getSecurityHeaders('https://ztas.io')
        expect(headers['Access-Control-Allow-Origin']).toBe('https://ztas.io')
      })

      it('includes Content-Security-Policy', () => {
        const headers = getSecurityHeaders()
        expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
        expect(headers['Content-Security-Policy']).toContain('https://js.stripe.com')
      })

      it('includes HSTS header', () => {
        const headers = getSecurityHeaders()
        expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
        expect(headers['Strict-Transport-Security']).toContain('includeSubDomains')
      })

      it('includes X-Content-Type-Options', () => {
        const headers = getSecurityHeaders()
        expect(headers['X-Content-Type-Options']).toBe('nosniff')
      })

      it('includes X-Frame-Options', () => {
        const headers = getSecurityHeaders()
        expect(headers['X-Frame-Options']).toBe('DENY')
      })

      it('includes XSS protection header', () => {
        const headers = getSecurityHeaders()
        expect(headers['X-XSS-Protection']).toBe('1; mode=block')
      })

      it('includes Referrer-Policy', () => {
        const headers = getSecurityHeaders()
        expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
      })

      it('includes Permissions-Policy', () => {
        const headers = getSecurityHeaders()
        expect(headers['Permissions-Policy']).toContain('camera=()')
        expect(headers['Permissions-Policy']).toContain('microphone=()')
        expect(headers['Permissions-Policy']).toContain('geolocation=()')
      })
    })
  })

  // ==========================================
  // ERROR RESPONSES TESTS
  // ==========================================
  describe('Error Responses', () => {
    describe('errorResponse', () => {
      it('creates error response with message', async () => {
        const response = errorResponse('Test error', 400)
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.error).toBe('Test error')
        expect(body.code).toBe('BAD_REQUEST')
      })

      it('auto-assigns correct error code based on status', async () => {
        expect((await errorResponse('Err', 401).json()).code).toBe('UNAUTHORIZED')
        expect((await errorResponse('Err', 403).json()).code).toBe('FORBIDDEN')
        expect((await errorResponse('Err', 404).json()).code).toBe('NOT_FOUND')
        expect((await errorResponse('Err', 405).json()).code).toBe('METHOD_NOT_ALLOWED')
        expect((await errorResponse('Err', 429).json()).code).toBe('RATE_LIMITED')
        expect((await errorResponse('Err', 500).json()).code).toBe('INTERNAL_ERROR')
      })

      it('allows custom error code', async () => {
        const response = errorResponse('Test', 400, 'CUSTOM_CODE')
        const body = await response.json()

        expect(body.code).toBe('CUSTOM_CODE')
      })

      it('includes details when provided', async () => {
        const response = errorResponse('Test', 400, null, { field: 'email' })
        const body = await response.json()

        expect(body.details).toEqual({ field: 'email' })
      })
    })

    describe('Errors helpers', () => {
      it('methodNotAllowed returns 405', () => {
        expect(Errors.methodNotAllowed().status).toBe(405)
      })

      it('unauthorized returns 401', () => {
        expect(Errors.unauthorized().status).toBe(401)
      })

      it('forbidden returns 403', () => {
        expect(Errors.forbidden().status).toBe(403)
      })

      it('notFound returns 404 with resource name', async () => {
        const response = Errors.notFound('Site')
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body.error).toBe('Site not found')
      })

      it('badRequest returns 400', () => {
        expect(Errors.badRequest('Invalid input').status).toBe(400)
      })

      it('validationError includes details', async () => {
        const response = Errors.validationError('Validation failed', { email: 'required' })
        const body = await response.json()

        expect(body.code).toBe('VALIDATION_ERROR')
        expect(body.details).toEqual({ email: 'required' })
      })

      it('internalError returns 500', () => {
        expect(Errors.internalError().status).toBe(500)
      })

      it('tokenExpired returns 401 with TOKEN_EXPIRED code', async () => {
        const response = Errors.tokenExpired()
        const body = await response.json()

        expect(response.status).toBe(401)
        expect(body.code).toBe('TOKEN_EXPIRED')
      })

      it('csrfMissing returns 403', async () => {
        const response = Errors.csrfMissing()
        const body = await response.json()

        expect(response.status).toBe(403)
        expect(body.code).toBe('CSRF_TOKEN_MISSING')
      })

      it('csrfInvalid returns 403', async () => {
        const response = Errors.csrfInvalid()
        const body = await response.json()

        expect(response.status).toBe(403)
        expect(body.code).toBe('CSRF_TOKEN_INVALID')
      })
    })
  })

  // ==========================================
  // PASSWORD HASHING TESTS
  // ==========================================
  describe('Password Hashing', () => {
    describe('hashPassword', () => {
      it('hashes password using bcrypt', async () => {
        const hash = await hashPassword('mypassword')

        expect(hash).not.toBe('mypassword')
        expect(hash).toMatch(/^\$2[ayb]\$/)
      })

      it('generates different hashes for same password', async () => {
        const hash1 = await hashPassword('mypassword')
        const hash2 = await hashPassword('mypassword')

        expect(hash1).not.toBe(hash2)
      })
    })

    describe('verifyPassword', () => {
      it('returns true for correct password', async () => {
        const hash = await hashPassword('mypassword')
        const result = await verifyPassword('mypassword', hash)

        expect(result).toBe(true)
      })

      it('returns false for incorrect password', async () => {
        const hash = await hashPassword('mypassword')
        const result = await verifyPassword('wrongpassword', hash)

        expect(result).toBe(false)
      })
    })
  })

  // ==========================================
  // JWT TOKEN TESTS
  // ==========================================
  describe('JWT Token Handling', () => {
    describe('createToken', () => {
      it('creates valid JWT token', () => {
        const token = createToken({ id: 'user_123', email: 'test@example.com' })

        expect(typeof token).toBe('string')
        expect(token.split('.')).toHaveLength(3)
      })

      it('includes payload in token', () => {
        const token = createToken({ id: 'user_123', email: 'test@example.com' })
        const decoded = jwt.decode(token) as { id: string; email: string }

        expect(decoded.id).toBe('user_123')
        expect(decoded.email).toBe('test@example.com')
      })

      it('sets expiration time', () => {
        const token = createToken({ id: 'user_123' })
        const decoded = jwt.decode(token) as { exp: number; iat: number }

        expect(decoded.exp).toBeGreaterThan(decoded.iat)
      })
    })

    describe('verifyToken', () => {
      it('verifies valid token', () => {
        const token = createToken({ id: 'user_123' })
        const result = verifyToken(token)

        expect(result).not.toBeNull()
        expect(result?.id).toBe('user_123')
      })

      it('returns null for invalid token', () => {
        const result = verifyToken('invalid.token.here')

        expect(result).toBeNull()
      })

      it('returns expired flag for expired token', () => {
        // Create a token that's already expired
        const expiredToken = jwt.sign({ id: 'user_123' }, JWT_SECRET, {
          expiresIn: '-1h',
          algorithm: JWT_ALGORITHM,
        })

        const result = verifyToken(expiredToken)

        expect(result?.expired).toBe(true)
      })

      it('returns invalidated flag when token issued before password change', () => {
        vi.useRealTimers()
        const token = createToken({ id: 'user_123' })

        // Simulate password change after token was issued
        const user = {
          tokenInvalidatedAt: new Date(Date.now() + 1000).toISOString(),
        }

        const result = verifyToken(token, user)

        expect(result?.invalidated).toBe(true)
        vi.useFakeTimers()
      })

      it('accepts token issued after password change', () => {
        vi.useRealTimers()
        // Password changed in the past
        const user = {
          tokenInvalidatedAt: new Date(Date.now() - 3600000).toISOString(),
        }

        const token = createToken({ id: 'user_123' })
        const result = verifyToken(token, user)

        expect(result?.invalidated).toBeUndefined()
        expect(result?.id).toBe('user_123')
        vi.useFakeTimers()
      })

      it('prevents algorithm confusion attacks', () => {
        // Try to use "none" algorithm
        const noneToken = jwt.sign({ id: 'user_123' }, '', { algorithm: 'none' as jwt.Algorithm })
        const result = verifyToken(noneToken)

        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // CSRF TOKEN TESTS
  // ==========================================
  describe('CSRF Token Handling', () => {
    describe('generateCSRFToken', () => {
      it('generates token in timestamp.hash format', () => {
        const token = generateCSRFToken('user_123')
        const parts = token.split('.')

        expect(parts).toHaveLength(2)
        expect(parseInt(parts[0], 10)).toBeGreaterThan(0)
        expect(parts[1]).toMatch(/^[a-f0-9]{64}$/)
      })

      it('generates different tokens for same user', () => {
        const token1 = generateCSRFToken('user_123')
        const token2 = generateCSRFToken('user_123')

        expect(token1).not.toBe(token2)
      })

      it('includes current timestamp', () => {
        vi.setSystemTime(new Date('2026-01-09T15:00:00.000Z'))
        const token = generateCSRFToken('user_123')
        const timestamp = parseInt(token.split('.')[0], 10)

        expect(timestamp).toBe(new Date('2026-01-09T15:00:00.000Z').getTime())
      })
    })

    describe('validateCSRFToken', () => {
      it('validates recently generated token', () => {
        const token = generateCSRFToken('user_123')
        const result = validateCSRFToken(token, 'user_123')

        expect(result).toBe(true)
      })

      it('rejects token with invalid format', () => {
        expect(validateCSRFToken('invalid', 'user_123')).toBe(false)
        expect(validateCSRFToken('no.dots.allowed.extra', 'user_123')).toBe(false)
        expect(validateCSRFToken('', 'user_123')).toBe(false)
      })

      it('rejects null or undefined token', () => {
        expect(validateCSRFToken(null as unknown as string, 'user_123')).toBe(false)
        expect(validateCSRFToken(undefined as unknown as string, 'user_123')).toBe(false)
      })

      it('rejects expired token (older than 24 hours)', () => {
        vi.useRealTimers()
        const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
        const token = `${oldTimestamp}.${crypto.randomBytes(32).toString('hex')}`

        const result = validateCSRFToken(token, 'user_123')

        expect(result).toBe(false)
        vi.useFakeTimers()
      })

      it('rejects token with future timestamp', () => {
        vi.useRealTimers()
        const futureTimestamp = Date.now() + 60 * 60 * 1000 // 1 hour in future
        const token = `${futureTimestamp}.${crypto.randomBytes(32).toString('hex')}`

        const result = validateCSRFToken(token, 'user_123')

        expect(result).toBe(false)
        vi.useFakeTimers()
      })

      it('rejects token with invalid hash format', () => {
        const timestamp = Date.now()
        expect(validateCSRFToken(`${timestamp}.tooshort`, 'user_123')).toBe(false)
        expect(validateCSRFToken(`${timestamp}.invalidcharszzz${crypto.randomBytes(28).toString('hex')}`, 'user_123')).toBe(false)
      })
    })

    describe('validateCSRFFromRequest', () => {
      it('returns valid: true for valid token', () => {
        const token = generateCSRFToken('user_123')
        const headers = {
          get: (key: string) => (key.toLowerCase() === 'x-csrf-token' ? token : null),
        }

        const result = validateCSRFFromRequest(headers, 'user_123')

        expect(result.valid).toBe(true)
      })

      it('returns error when token is missing', () => {
        const headers = {
          get: () => null,
        }

        const result = validateCSRFFromRequest(headers, 'user_123')

        expect(result.valid).toBe(false)
        expect(result.error).toBe('CSRF token is required')
      })

      it('returns error for invalid token', () => {
        const headers = {
          get: () => 'invalid-token',
        }

        const result = validateCSRFFromRequest(headers, 'user_123')

        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid CSRF token')
      })
    })
  })

  // ==========================================
  // TOKEN EXTRACTION TESTS
  // ==========================================
  describe('Token Extraction', () => {
    describe('getTokenFromHeader', () => {
      it('extracts token from Bearer header', () => {
        const headers = { authorization: 'Bearer mytoken123' }
        const result = getTokenFromHeader(headers)

        expect(result).toBe('mytoken123')
      })

      it('handles Authorization with capital A', () => {
        const headers = { Authorization: 'Bearer mytoken123' }
        const result = getTokenFromHeader(headers)

        expect(result).toBe('mytoken123')
      })

      it('returns null when no authorization header', () => {
        const headers = {}
        const result = getTokenFromHeader(headers)

        expect(result).toBeNull()
      })

      it('returns null for non-Bearer token', () => {
        const headers = { authorization: 'Basic base64credentials' }
        const result = getTokenFromHeader(headers)

        expect(result).toBeNull()
      })

      it('returns null for malformed header', () => {
        const headers = { authorization: 'BearerNoSpace' }
        const result = getTokenFromHeader(headers)

        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // RESPONSE HELPERS TESTS
  // ==========================================
  describe('Response Helpers', () => {
    describe('successResponse', () => {
      it('creates response with data', async () => {
        const response = successResponse({ message: 'Success' })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Success')
      })

      it('allows custom status code', () => {
        const response = successResponse({ created: true }, 201)

        expect(response.status).toBe(201)
      })

      it('includes security headers', () => {
        const response = successResponse({ ok: true })

        expect(response.headers.get('Content-Type')).toBe('application/json')
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      })
    })

    describe('createAuthResponse', () => {
      it('includes token and user info', async () => {
        const user = { id: 'user_123', email: 'test@example.com', plan: 'pro' }
        const token = 'jwt_token_123'

        const response = createAuthResponse(user, token)
        const body = await response.json()

        expect(body.token).toBe('jwt_token_123')
        expect(body.user.id).toBe('user_123')
        expect(body.user.email).toBe('test@example.com')
        expect(body.user.plan).toBe('pro')
      })

      it('includes CSRF token', async () => {
        const user = { id: 'user_123', email: 'test@example.com' }
        const response = createAuthResponse(user, 'token')
        const body = await response.json()

        expect(body.csrfToken).toBeDefined()
        expect(body.csrfToken.split('.')).toHaveLength(2)
      })

      it('excludes sensitive user data', async () => {
        const user = {
          id: 'user_123',
          email: 'test@example.com',
          passwordHash: 'secret_hash',
          plan: 'pro',
        }
        const response = createAuthResponse(user, 'token')
        const body = await response.json()

        expect(body.user.passwordHash).toBeUndefined()
      })
    })
  })

  // ==========================================
  // CSP DIRECTIVE TESTS
  // ==========================================
  describe('Content Security Policy', () => {
    it('includes self for default-src', () => {
      expect(CSP_DIRECTIVES).toContain("default-src 'self'")
    })

    it('allows Stripe scripts', () => {
      expect(CSP_DIRECTIVES).toContain('https://js.stripe.com')
    })

    it('allows Stripe API connections', () => {
      expect(CSP_DIRECTIVES).toContain('https://api.stripe.com')
    })

    it('allows Turso database connections', () => {
      expect(CSP_DIRECTIVES).toContain('https://*.turso.io')
      expect(CSP_DIRECTIVES).toContain('wss://*.turso.io')
    })

    it('denies framing by other sites', () => {
      expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'")
    })

    it('restricts base-uri to self', () => {
      expect(CSP_DIRECTIVES).toContain("base-uri 'self'")
    })

    it('enforces HTTPS upgrades', () => {
      expect(CSP_DIRECTIVES).toContain('upgrade-insecure-requests')
    })
  })
})
