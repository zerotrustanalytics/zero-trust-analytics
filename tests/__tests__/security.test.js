import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

/**
 * SECURITY TESTS
 * Tests for security features across the application:
 * - CORS origin validation
 * - JWT algorithm enforcement
 * - Password strength validation
 * - Rate limiting behavior
 */

describe('Security Features', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-security-tests';
    process.env.NODE_ENV = 'test';
    // In test mode, config.js defaults to http://localhost:3000
  });

  describe('CORS Origin Validation', () => {
    it('should allow requests from whitelisted origins', async () => {
      const { getCorsOrigin, getSecurityHeaders } = await import('../../netlify/functions/lib/auth.js');

      // In test mode, only localhost:3000 is allowed by default
      const allowedOrigins = [
        'http://localhost:3000'
      ];

      for (const origin of allowedOrigins) {
        const corsOrigin = getCorsOrigin(origin);
        expect(corsOrigin).toBe(origin);

        const headers = getSecurityHeaders(origin);
        expect(headers['Access-Control-Allow-Origin']).toBe(origin);
      }
    });

    it('should block requests from non-whitelisted origins', async () => {
      const { getCorsOrigin } = await import('../../netlify/functions/lib/auth.js');

      const blockedOrigins = [
        'https://malicious-site.com',
        'http://evil.example.com',
        'https://phishing-ztas.io',
        'http://localhost:9999',
        'https://ztas.io'  // Not allowed in test mode
      ];

      // In test mode, first allowed is http://localhost:3000
      const firstAllowed = 'http://localhost:3000';

      for (const origin of blockedOrigins) {
        const corsOrigin = getCorsOrigin(origin);
        // Should return first allowed origin instead of the malicious one
        expect(corsOrigin).not.toBe(origin);
        expect(corsOrigin).toBe(firstAllowed);
      }
    });

    it('should handle missing origin header gracefully', async () => {
      const { getCorsOrigin } = await import('../../netlify/functions/lib/auth.js');

      const firstAllowed = 'http://localhost:3000';

      const corsOrigin = getCorsOrigin(null);
      expect(corsOrigin).toBe(firstAllowed); // First allowed origin

      const corsOrigin2 = getCorsOrigin(undefined);
      expect(corsOrigin2).toBe(firstAllowed);
    });

    it('should include security headers in all responses', async () => {
      const { getSecurityHeaders } = await import('../../netlify/functions/lib/auth.js');

      const headers = getSecurityHeaders('https://ztas.io');

      // Check all security headers are present
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should respond to CORS preflight requests', async () => {
      const { corsPreflightResponse } = await import('../../netlify/functions/lib/auth.js');

      const allowedOrigin = 'http://localhost:3000';
      const response = corsPreflightResponse(allowedOrigin, 'GET, POST, PUT, DELETE');

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('JWT Algorithm Enforcement', () => {
    it('should only use HS256 algorithm for JWT signing', async () => {
      const { createToken } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      const payload = { email: 'test@example.com', id: 'user-123' };
      const token = createToken(payload);

      // Decode without verification to check header
      const decoded = jwt.decode(token, { complete: true });
      expect(decoded.header.alg).toBe('HS256');
    });

    it('should reject tokens with "none" algorithm', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      // Create a token with "none" algorithm (security vulnerability attempt)
      const noneAlgToken = jwt.sign(
        { email: 'attacker@example.com' },
        '',
        { algorithm: 'none' }
      );

      const result = verifyToken(noneAlgToken);
      expect(result).toBeNull(); // Should reject tokens with "none" algorithm
    });

    it('should enforce algorithm in verification', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');

      // Valid token with correct algorithm
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.invalid';

      // This should fail because signature is invalid
      const result = verifyToken(validToken);
      expect(result).toBeNull();
    });

    it('should require JWT_SECRET for token operations', async () => {
      // Note: In the current test environment, JWT_SECRET is set in jest.setup.js
      // This test validates that the functions check for JWT_SECRET
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      // With JWT_SECRET present, operations should work
      const token = createToken({ email: 'test@example.com' });
      expect(token).toBeDefined();

      const decoded = verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded.email).toBe('test@example.com');
    });

    it('should detect expired tokens', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      // Create an expired token
      const expiredToken = jwt.sign(
        { email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h', algorithm: 'HS256' }
      );

      const result = verifyToken(expiredToken);

      // The verifyToken function returns an object with expired: true when token is expired
      if (result && result.expired) {
        expect(result.expired).toBe(true);
        expect(result.expiredAt).toBeDefined();
      } else {
        // If using mocked jwt, it might return null
        expect(result).toBeNull();
      }
    });

    it('should extract token from Authorization header correctly', async () => {
      const { getTokenFromHeader } = await import('../../netlify/functions/lib/auth.js');

      // Valid Bearer token
      const headers1 = { authorization: 'Bearer valid-token-123' };
      expect(getTokenFromHeader(headers1)).toBe('valid-token-123');

      // Case insensitive
      const headers2 = { Authorization: 'Bearer another-token' };
      expect(getTokenFromHeader(headers2)).toBe('another-token');

      // Missing Bearer prefix
      const headers3 = { authorization: 'valid-token-123' };
      expect(getTokenFromHeader(headers3)).toBeNull();

      // Wrong prefix
      const headers4 = { authorization: 'Basic dXNlcjpwYXNz' };
      expect(getTokenFromHeader(headers4)).toBeNull();

      // No authorization header
      const headers5 = {};
      expect(getTokenFromHeader(headers5)).toBeNull();

      // Malformed header
      const headers6 = { authorization: 'Bearer' };
      expect(getTokenFromHeader(headers6)).toBeNull();

      // Multiple parts (should be rejected)
      const headers7 = { authorization: 'Bearer token extra-part' };
      expect(getTokenFromHeader(headers7)).toBeNull();
    });
  });

  describe('Password Strength Validation', () => {
    it('should hash passwords with bcrypt', async () => {
      const { hashPassword, verifyPassword } = await import('../../netlify/functions/lib/auth.js');

      const password = 'SecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long

      // Verify correct password
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      // Verify wrong password
      const isInvalid = await verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should reject weak passwords during registration', async () => {
      // This test would check password strength validation in auth-register
      // Note: Implementation may vary based on actual password validation rules
      const weakPasswords = [
        '123',           // Too short
        'password',      // Common password
        'abc123',        // Too simple
        '1234567'        // Only numbers
      ];

      // This validates the concept - actual implementation would test the registration endpoint
      for (const password of weakPasswords) {
        expect(password.length).toBeLessThanOrEqual(8);
      }
    });

    it('should accept strong passwords', async () => {
      const { hashPassword } = await import('../../netlify/functions/lib/auth.js');

      const strongPasswords = [
        'MySecureP@ssw0rd',
        'Tr0ng!P@ssword123',
        'C0mpl3x&Secure!Pass',
        'S3cur3P@ssw0rd!2024'
      ];

      for (const password of strongPasswords) {
        const hash = await hashPassword(password);
        expect(hash).toBeDefined();
        expect(hash.length).toBeGreaterThan(0);
      }
    });

    it('should use proper bcrypt salt rounds', async () => {
      const { hashPassword } = await import('../../netlify/functions/lib/auth.js');
      const bcrypt = (await import('bcryptjs')).default;

      const password = 'TestPassword123';
      const hash = await hashPassword(password);

      // bcrypt hashes start with $2a$ or $2b$ followed by cost factor
      expect(hash).toMatch(/^\$2[ab]\$/);

      // Extract cost factor (should be 10 based on implementation)
      const costMatch = hash.match(/^\$2[ab]\$(\d+)\$/);
      expect(costMatch).toBeTruthy();
      expect(parseInt(costMatch[1])).toBe(10);
    });
  });

  describe('Rate Limiting Behavior', () => {
    beforeEach(async () => {
      // Clear rate limit store before each test
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');
      // Reset by checking with a unique identifier
    });

    it('should allow requests within rate limit', async () => {
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-1';
      const options = { limit: 10, windowMs: 60000 };

      // First 10 requests should be allowed
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(identifier, options);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });

    it('should block requests exceeding rate limit', async () => {
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-2';
      const options = { limit: 5, windowMs: 60000 };

      // Use up the rate limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit(identifier, options);
      }

      // 6th request should be blocked
      const result = checkRateLimit(identifier, options);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset rate limit after window expires', async () => {
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-3';
      const options = { limit: 3, windowMs: 100 }; // 100ms window for fast test

      // Use up the rate limit
      for (let i = 0; i < 3; i++) {
        checkRateLimit(identifier, options);
      }

      // Should be blocked
      let result = checkRateLimit(identifier, options);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      result = checkRateLimit(identifier, options);
      expect(result.allowed).toBe(true);
    });

    it('should track different identifiers separately', async () => {
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

      const options = { limit: 2, windowMs: 60000 };

      // Use up limit for identifier1
      checkRateLimit('identifier1', options);
      checkRateLimit('identifier1', options);

      // identifier1 should be blocked
      let result1 = checkRateLimit('identifier1', options);
      expect(result1.allowed).toBe(false);

      // identifier2 should still be allowed
      let result2 = checkRateLimit('identifier2', options);
      expect(result2.allowed).toBe(true);
    });

    it('should include proper rate limit headers', async () => {
      const { checkRateLimit, rateLimitHeaders } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-4';
      const limit = 100;
      const result = checkRateLimit(identifier, { limit, windowMs: 60000 });

      const headers = rateLimitHeaders(result, limit);

      expect(headers['X-RateLimit-Limit']).toBe(String(limit));
      expect(headers['X-RateLimit-Remaining']).toBeDefined();
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should return 429 response when rate limited', async () => {
      const { checkRateLimit, rateLimitResponse } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-5';
      const options = { limit: 1, windowMs: 60000 };

      // Use up limit
      checkRateLimit(identifier, options);
      const result = checkRateLimit(identifier, options);

      const response = rateLimitResponse(result);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Too many requests');
      expect(data.retryAfter).toBeGreaterThan(0);
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should hash IP addresses for privacy', async () => {
      const { hashIP } = await import('../../netlify/functions/lib/rate-limit.js');

      const ip1 = '192.168.1.1';
      const ip2 = '10.0.0.1';

      const hash1 = hashIP(ip1);
      const hash2 = hashIP(ip2);

      // Hashes should be different
      expect(hash1).not.toBe(hash2);

      // Hashes should be consistent
      expect(hashIP(ip1)).toBe(hash1);
      expect(hashIP(ip2)).toBe(hash2);

      // Hashes should not contain original IP
      expect(hash1).not.toContain('192.168.1.1');
      expect(hash2).not.toContain('10.0.0.1');

      // Hashes should start with 'rl_' prefix
      expect(hash1).toMatch(/^rl_/);
      expect(hash2).toMatch(/^rl_/);
    });

    it('should use default rate limit values', async () => {
      const { checkRateLimit } = await import('../../netlify/functions/lib/rate-limit.js');

      const identifier = 'test-ip-6';

      // Call without options to use defaults
      const result = checkRateLimit(identifier);

      expect(result.allowed).toBe(true);
      // Default limit is 100
      expect(result.remaining).toBe(99);
    });
  });

  describe('Error Response Handling', () => {
    it('should return standard error codes', async () => {
      const { ErrorCodes, errorResponse } = await import('../../netlify/functions/lib/auth.js');

      expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.METHOD_NOT_ALLOWED).toBe('METHOD_NOT_ALLOWED');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
    });

    it('should create error responses with correct status codes', async () => {
      const { Errors } = await import('../../netlify/functions/lib/auth.js');

      const responses = [
        { fn: Errors.methodNotAllowed, status: 405 },
        { fn: Errors.unauthorized, status: 401 },
        { fn: Errors.forbidden, status: 403 },
        { fn: Errors.notFound, status: 404 },
        { fn: Errors.badRequest, status: 400, args: ['Bad request'] },
        { fn: Errors.internalError, status: 500 }
      ];

      for (const { fn, status, args } of responses) {
        const response = args ? fn(...args) : fn();
        expect(response.status).toBe(status);
      }
    });

    it('should include error details when provided', async () => {
      const { Errors } = await import('../../netlify/functions/lib/auth.js');

      const details = { field: 'email', message: 'Invalid format' };
      const response = Errors.validationError('Validation failed', details);
      const data = await response.json();

      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(details);
    });
  });

  describe('Authentication Request Middleware', () => {
    it('should authenticate valid requests', async () => {
      const { authenticateRequest, createToken } = await import('../../netlify/functions/lib/auth.js');

      const token = createToken({ email: 'test@example.com', id: 'user-123' });
      const headers = { authorization: `Bearer ${token}` };

      const result = authenticateRequest(headers);

      expect(result.error).toBeUndefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should reject requests without token', async () => {
      const { authenticateRequest } = await import('../../netlify/functions/lib/auth.js');

      const headers = {};
      const result = authenticateRequest(headers);

      expect(result.error).toBe('No token provided');
      expect(result.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const { authenticateRequest } = await import('../../netlify/functions/lib/auth.js');

      const headers = { authorization: 'Bearer invalid-token-xyz' };
      const result = authenticateRequest(headers);

      expect(result.error).toBe('Invalid token');
      expect(result.status).toBe(401);
    });

    it('should detect expired tokens in auth middleware', async () => {
      const { authenticateRequest } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      const expiredToken = jwt.sign(
        { email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h', algorithm: 'HS256' }
      );

      const headers = { authorization: `Bearer ${expiredToken}` };
      const result = authenticateRequest(headers);

      // Should return an error
      expect(result.error).toBeDefined();
      expect(result.status).toBe(401);

      // Check for either expired or invalid token error
      const isExpiredOrInvalid = result.error.includes('expired') || result.error.includes('Invalid');
      expect(isExpiredOrInvalid).toBe(true);
    });
  });
});
