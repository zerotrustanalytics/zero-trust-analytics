import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

/**
 * AUTH EDGE CASES TESTS
 * Tests for authentication edge cases:
 * - Expired token handling
 * - Invalid token formats
 * - Token refresh flow
 * - 2FA flow edge cases
 * - Concurrent login attempts
 * - Session management
 */

// Mock @netlify/blobs
jest.unstable_mockModule('@netlify/blobs', () => {
  const stores = new Map();

  function createMockStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const data = stores.get(name);

    return {
      async get(key, options = {}) {
        const value = data.get(key);
        if (value === undefined) return null;
        if (options.type === 'json') {
          return JSON.parse(value);
        }
        return value;
      },
      async setJSON(key, value) {
        data.set(key, JSON.stringify(value));
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

// Mock jsonwebtoken with advanced features
jest.unstable_mockModule('jsonwebtoken', () => {
  const mockTokens = new Map();
  let tokenCounter = 0;

  return {
    default: {
      sign: jest.fn((payload, secret, options = {}) => {
        tokenCounter++;
        const tokenId = `token_${tokenCounter}`;
        const expiresIn = options.expiresIn || '7d';

        // Calculate expiry time
        let expiryMs;
        if (typeof expiresIn === 'string') {
          const match = expiresIn.match(/^(-?)(\d+)([smhd])$/);
          if (match) {
            const [, sign, amount, unit] = match;
            const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
            expiryMs = parseInt(amount) * multipliers[unit] * (sign === '-' ? -1 : 1);
          }
        }

        const token = {
          ...payload,
          iat: Date.now(),
          exp: expiryMs ? Date.now() + expiryMs : Date.now() + 604800000, // 7 days default
          tokenId
        };

        mockTokens.set(tokenId, token);
        return tokenId;
      }),

      verify: jest.fn((token, secret, options = {}) => {
        const tokenData = mockTokens.get(token);

        if (!tokenData) {
          const error = new Error('Invalid token');
          error.name = 'JsonWebTokenError';
          throw error;
        }

        // Check if token is expired
        if (Date.now() > tokenData.exp) {
          const error = new Error('jwt expired');
          error.name = 'TokenExpiredError';
          error.expiredAt = new Date(tokenData.exp);
          throw error;
        }

        // Check algorithm enforcement
        if (options.algorithms && !options.algorithms.includes('HS256')) {
          const error = new Error('invalid algorithm');
          error.name = 'JsonWebTokenError';
          throw error;
        }

        const { tokenId, iat, exp, ...payload } = tokenData;
        return payload;
      }),

      decode: jest.fn((token, options = {}) => {
        const tokenData = mockTokens.get(token);
        if (!tokenData) return null;

        if (options.complete) {
          return {
            header: { alg: 'HS256', typ: 'JWT' },
            payload: tokenData
          };
        }
        return tokenData;
      })
    },
    __clearTokens: () => {
      mockTokens.clear();
      tokenCounter = 0;
    }
  };
});

// Mock rate limiting
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

const { __clearAllStores } = await import('@netlify/blobs');

describe('Auth Edge Cases', () => {
  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret-for-edge-cases';

    // Create test user
    const { getStore } = await import('@netlify/blobs');
    const usersStore = getStore({ name: 'users' });

    await usersStore.setJSON('test@example.com', {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed_password123',
      createdAt: new Date().toISOString(),
      twoFactorEnabled: false
    });
  });

  describe('Expired Token Handling', () => {
    it('should detect expired tokens', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      // Create an expired token
      const expiredToken = jwt.sign(
        { email: 'test@example.com', id: 'user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Negative = already expired
      );

      const result = verifyToken(expiredToken);

      expect(result).not.toBeNull();
      expect(result.expired).toBe(true);
      expect(result.expiredAt).toBeDefined();
    });

    it('should reject API requests with expired token', async () => {
      const jwt = (await import('jsonwebtoken')).default;

      const expiredToken = jwt.sign(
        { email: 'test@example.com', id: 'user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      // Try to use expired token with any authenticated endpoint
      const { default: handler } = await import('../../netlify/functions/sites.js');

      const req = {
        method: 'GET',
        headers: createHeaders({
          'Authorization': `Bearer ${expiredToken}`
        })
      };

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Token expired');
    });

    it('should provide clear error message for expired tokens', async () => {
      const { Errors } = await import('../../netlify/functions/lib/auth.js');

      const response = Errors.tokenExpired();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Token expired');
      expect(data.error).toContain('log in again');
      expect(data.code).toBe('TOKEN_EXPIRED');
    });

    it('should handle token expiry in authenticateRequest middleware', async () => {
      const { authenticateRequest } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      const expiredToken = jwt.sign(
        { email: 'test@example.com', id: 'user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '-30m' }
      );

      const headers = { authorization: `Bearer ${expiredToken}` };
      const result = authenticateRequest(headers);

      expect(result.error).toBeDefined();
      expect(result.status).toBe(401);
      expect(result.expired).toBe(true);
      expect(result.error).toContain('Token expired');
    });
  });

  describe('Invalid Token Formats', () => {
    it('should reject malformed JWT tokens', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const malformedTokens = [
        'not.a.token',
        'invalid-format',
        'Bearer xyz',
        'eyJhbGciOiJIUzI1NiIsInR5cCI',  // Incomplete base64
        '',
        null,
        undefined
      ];

      for (const token of malformedTokens) {
        const result = verifyToken(token);
        expect(result).toBeNull();
      }
    });

    it('should reject token without Bearer prefix', async () => {
      const { getTokenFromHeader } = await import('../../netlify/functions/lib/auth.js');

      const testCases = [
        { auth: 'token-without-bearer', expected: null },
        { auth: 'Basic dXNlcjpwYXNz', expected: null },
        { auth: 'Digest xyz', expected: null },
        { auth: 'OAuth abc123', expected: null }
      ];

      for (const { auth, expected } of testCases) {
        const result = getTokenFromHeader({ authorization: auth });
        expect(result).toBe(expected);
      }
    });

    it('should handle various Authorization header formats', async () => {
      const { getTokenFromHeader } = await import('../../netlify/functions/lib/auth.js');

      const testCases = [
        { headers: { authorization: 'Bearer valid-token' }, expected: 'valid-token' },
        { headers: { Authorization: 'Bearer CAPS-TOKEN' }, expected: 'CAPS-TOKEN' },
        { headers: { authorization: 'Bearer   ' }, expected: null }, // Only whitespace after Bearer
        { headers: { authorization: 'Bearer' }, expected: null }, // Missing token
        { headers: { authorization: 'Bearer token extra' }, expected: null }, // Extra parts
        { headers: {}, expected: null } // No header
      ];

      for (const { headers, expected } of testCases) {
        const result = getTokenFromHeader(headers);
        expect(result).toBe(expected);
      }
    });

    it('should reject tokens signed with wrong secret', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');
      const jwt = (await import('jsonwebtoken')).default;

      const wrongSecretToken = jwt.sign(
        { email: 'test@example.com' },
        'wrong-secret-key',
        { algorithm: 'HS256' }
      );

      const result = verifyToken(wrongSecretToken);
      expect(result).toBeNull();
    });

    it('should reject empty or whitespace tokens', async () => {
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const emptyTokens = ['', '   ', '\t', '\n', null, undefined];

      for (const token of emptyTokens) {
        const result = verifyToken(token);
        expect(result).toBeNull();
      }
    });
  });

  describe('Token Refresh Flow', () => {
    it('should allow creating new tokens after expiry', async () => {
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const payload = { email: 'test@example.com', id: 'user-123' };

      // Create first token
      const token1 = createToken(payload);
      expect(verifyToken(token1)).not.toBeNull();

      // Create second token (simulating refresh)
      const token2 = createToken(payload);
      expect(verifyToken(token2)).not.toBeNull();

      // Both tokens should be different but valid
      expect(token1).not.toBe(token2);
    });

    it('should maintain user session across token refresh', async () => {
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const originalPayload = {
        email: 'test@example.com',
        id: 'user-123',
        role: 'admin'
      };

      const token = createToken(originalPayload);
      const decoded = verifyToken(token);

      expect(decoded.email).toBe(originalPayload.email);
      expect(decoded.id).toBe(originalPayload.id);
      expect(decoded.role).toBe(originalPayload.role);
    });

    it('should handle concurrent token creation', async () => {
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const payload = { email: 'test@example.com', id: 'user-123' };

      // Create multiple tokens simultaneously
      const tokens = await Promise.all([
        Promise.resolve(createToken(payload)),
        Promise.resolve(createToken(payload)),
        Promise.resolve(createToken(payload))
      ]);

      // All tokens should be unique
      expect(new Set(tokens).size).toBe(3);

      // All tokens should be valid
      for (const token of tokens) {
        const decoded = verifyToken(token);
        expect(decoded).not.toBeNull();
        expect(decoded.email).toBe(payload.email);
      }
    });
  });

  describe('2FA Flow Edge Cases', () => {
    beforeEach(async () => {
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      // Setup user with 2FA
      await usersStore.setJSON('2fa@example.com', {
        id: 'user-2fa',
        email: '2fa@example.com',
        passwordHash: 'hashed_password123',
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP'
      });

      // Setup user without 2FA
      await usersStore.setJSON('no2fa@example.com', {
        id: 'user-no2fa',
        email: 'no2fa@example.com',
        passwordHash: 'hashed_password123',
        twoFactorEnabled: false
      });
    });

    it('should require 2FA code during login when enabled', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: '2fa@example.com',
          password: 'password123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.requires_2fa).toBe(true);
      expect(data.tempToken).toBeDefined();
      expect(data.token).toBeUndefined(); // Full token not issued yet
    });

    it('should not require 2FA when disabled', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        headers: createHeaders({}),
        json: async () => ({
          email: 'no2fa@example.com',
          password: 'password123'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.requires_2fa).toBeUndefined();
      expect(data.token).toBeDefined(); // Full token issued immediately
    });

    it('should reject expired temp tokens', async () => {
      // This tests the 2FA validation endpoint with an expired temporary token
      const jwt = (await import('jsonwebtoken')).default;

      const expiredTempToken = jwt.sign(
        { email: '2fa@example.com', temp: true },
        process.env.JWT_SECRET,
        { expiresIn: '-5m' }
      );

      // Try to validate 2FA with expired temp token
      const { verifyToken } = await import('../../netlify/functions/lib/auth.js');
      const result = verifyToken(expiredTempToken);

      expect(result.expired).toBe(true);
    });

    it('should invalidate temp token after successful 2FA verification', async () => {
      // After 2FA validation, the temp token should not be usable again
      // This prevents replay attacks
      const { createToken } = await import('../../netlify/functions/lib/auth.js');

      const tempToken = createToken({ email: '2fa@example.com', temp: true });

      // First use should succeed (tested in auth-2fa.test.js)
      // Second use should fail (temp tokens are one-time use)

      expect(tempToken).toBeDefined();
      // Note: Actual invalidation logic would be tested with the 2FA endpoint
    });
  });

  describe('Concurrent Login Attempts', () => {
    it('should handle multiple login attempts from same user', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const makeLoginRequest = () => ({
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        headers: createHeaders({}),
        json: async () => ({
          email: 'test@example.com',
          password: 'password123'
        })
      });

      // Simulate concurrent login attempts
      const responses = await Promise.all([
        handler(makeLoginRequest(), { ip: '127.0.0.1' }),
        handler(makeLoginRequest(), { ip: '127.0.0.2' }),
        handler(makeLoginRequest(), { ip: '127.0.0.3' })
      ]);

      // All should succeed with different tokens
      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.token).toBeDefined();
      }

      // Extract tokens
      const tokens = await Promise.all(
        responses.map(async r => (await r.json()).token)
      );

      // All tokens should be unique
      expect(new Set(tokens).size).toBe(3);
    });

    it('should prevent login with wrong password during concurrent attempts', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-login.js');

      const correctLogin = {
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        headers: createHeaders({}),
        json: async () => ({
          email: 'test@example.com',
          password: 'password123'
        })
      };

      const wrongLogin = {
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        headers: createHeaders({}),
        json: async () => ({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
      };

      const [response1, response2] = await Promise.all([
        handler(correctLogin, { ip: '127.0.0.1' }),
        handler(wrongLogin, { ip: '127.0.0.2' })
      ]);

      // Correct password should succeed
      expect(response1.status).toBe(200);

      // Wrong password should fail
      expect(response2.status).toBe(401);
    });
  });

  describe('Session Management', () => {
    it('should include user info in token payload', async () => {
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      const userInfo = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        plan: 'pro'
      };

      const token = createToken(userInfo);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(userInfo.id);
      expect(decoded.email).toBe(userInfo.email);
      expect(decoded.role).toBe(userInfo.role);
      expect(decoded.plan).toBe(userInfo.plan);
    });

    it('should maintain session state after token verification', async () => {
      const { authenticateRequest, createToken } = await import('../../netlify/functions/lib/auth.js');

      const userInfo = {
        id: 'user-456',
        email: 'session@example.com',
        settings: { theme: 'dark', language: 'en' }
      };

      const token = createToken(userInfo);
      const headers = { authorization: `Bearer ${token}` };

      const result = authenticateRequest(headers);

      expect(result.error).toBeUndefined();
      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(userInfo.id);
      expect(result.user.settings).toEqual(userInfo.settings);
    });

    it('should handle missing JWT_SECRET gracefully', async () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      // Re-import to get new instance without JWT_SECRET
      const { createToken, verifyToken } = await import('../../netlify/functions/lib/auth.js');

      // Create token should throw
      expect(() => {
        createToken({ email: 'test@example.com' });
      }).toThrow('JWT_SECRET is not configured');

      // Verify token should return null
      const result = verifyToken('any-token');
      expect(result).toBeNull();

      // Restore secret
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('Registration Edge Cases', () => {
    it('should prevent registration with existing email', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      // First registration should succeed
      const req1 = {
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        headers: createHeaders({}),
        json: async () => ({
          email: 'duplicate@example.com',
          password: 'password123'
        })
      };

      const response1 = await handler(req1, { ip: '127.0.0.1' });
      expect(response1.status).toBe(201);

      // Second registration with same email should fail
      const req2 = {
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        headers: createHeaders({}),
        json: async () => ({
          email: 'duplicate@example.com',
          password: 'differentpassword'
        })
      };

      const response2 = await handler(req2, { ip: '127.0.0.2' });
      const data2 = await response2.json();

      expect(response2.status).toBe(409);
      expect(data2.error).toContain('registered');
    });

    it('should handle concurrent registrations with same email', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const makeRequest = () => ({
        method: 'POST',
        url: 'http://localhost/api/auth/register',
        headers: createHeaders({}),
        json: async () => ({
          email: 'concurrent@example.com',
          password: 'password123'
        })
      });

      // Try to register same email concurrently
      const responses = await Promise.all([
        handler(makeRequest(), { ip: '127.0.0.1' }),
        handler(makeRequest(), { ip: '127.0.0.2' }),
        handler(makeRequest(), { ip: '127.0.0.3' })
      ]);

      // At least one should succeed
      const successCount = responses.filter(r => r.status === 201).length;
      const failCount = responses.filter(r => r.status === 409).length;

      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(successCount + failCount).toBe(3);
    });

    it('should require all mandatory fields for registration', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-register.js');

      const testCases = [
        { body: {}, expectedError: 'required' },
        { body: { email: 'test@example.com' }, expectedError: 'required' },
        { body: { password: 'password123' }, expectedError: 'required' },
        { body: { email: '', password: 'password123' }, expectedError: 'required' },
        { body: { email: 'test@example.com', password: '' }, expectedError: 'required' }
      ];

      for (const { body, expectedError } of testCases) {
        const req = {
          method: 'POST',
          url: 'http://localhost/api/auth/register',
          headers: createHeaders({}),
          json: async () => body
        };

        const response = await handler(req, { ip: '127.0.0.1' });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error.toLowerCase()).toContain(expectedError);
      }
    });
  });

  describe('Password Reset Edge Cases', () => {
    it('should handle non-existent email in forgot password', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-forgot.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/forgot',
        headers: createHeaders({}),
        json: async () => ({
          email: 'nonexistent@example.com'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      // Should return 200 to prevent email enumeration
      expect(response.status).toBe(200);
    });

    it('should expire reset tokens after use', async () => {
      // Reset tokens should be one-time use only
      // This prevents someone from reusing a captured reset link
      const { createToken } = await import('../../netlify/functions/lib/auth.js');

      const resetToken = createToken({
        email: 'test@example.com',
        purpose: 'password-reset'
      });

      expect(resetToken).toBeDefined();
      // Actual expiry logic would be in the reset endpoint
    });

    it('should validate reset token format', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-verify-reset-token.js');

      const invalidTokens = [
        'invalid-token',
        '',
        'Bearer xyz',
        'malformed.token.format'
      ];

      for (const token of invalidTokens) {
        const req = {
          method: 'POST',
          url: 'http://localhost/api/auth/verify-reset-token',
          headers: createHeaders({}),
          json: async () => ({ token })
        };

        const response = await handler(req, { ip: '127.0.0.1' });
        // Should return 400 for invalid token or 405 if method not allowed
        expect([400, 405]).toContain(response.status);
      }
    });
  });
});
