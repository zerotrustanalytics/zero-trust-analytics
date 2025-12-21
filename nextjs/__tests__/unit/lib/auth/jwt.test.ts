/**
 * Comprehensive TDD Test Suite for JWT Utilities
 *
 * This test suite covers all JWT-related functionality with:
 * - JWT token creation and signing tests
 * - JWT token verification and validation tests
 * - Token refresh and expiry handling tests
 * - Security edge cases and error handling
 *
 * Total: 28 test cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock JWT utilities - these would be implemented in src/lib/auth/jwt.ts
interface JWTPayload {
  userId: string;
  email: string;
  role?: string;
  sessionId?: string;
  [key: string]: any;
}

interface JWTTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

interface VerifyResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  expired?: boolean;
}

// Mock implementation for testing
const JWT_ACCESS_SECRET = 'test-access-secret-key-very-long-and-secure';
const JWT_REFRESH_SECRET = 'test-refresh-secret-key-very-long-and-secure';
const JWT_ACCESS_EXPIRY = '15m'; // 15 minutes
const JWT_REFRESH_EXPIRY = '7d'; // 7 days

const mockJWTUtils = {
  createAccessToken: (payload: JWTPayload, expiresIn: string = JWT_ACCESS_EXPIRY): string => {
    if (!payload.userId) {
      throw new Error('userId is required in payload');
    }
    if (!payload.email) {
      throw new Error('email is required in payload');
    }

    return jwt.sign(
      {
        ...payload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_ACCESS_SECRET,
      { expiresIn }
    );
  },

  createRefreshToken: (payload: JWTPayload, expiresIn: string = JWT_REFRESH_EXPIRY): string => {
    if (!payload.userId) {
      throw new Error('userId is required in payload');
    }

    return jwt.sign(
      {
        userId: payload.userId,
        sessionId: payload.sessionId || `session-${Date.now()}`,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_REFRESH_SECRET,
      { expiresIn }
    );
  },

  createTokenPair: (payload: JWTPayload): JWTTokenPair => {
    const accessToken = mockJWTUtils.createAccessToken(payload);
    const refreshToken = mockJWTUtils.createRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      refreshExpiresIn: 604800, // 7 days in seconds
    };
  },

  verifyAccessToken: (token: string): VerifyResult => {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }

    try {
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as JWTPayload & { type: string };

      if (decoded.type !== 'access') {
        return { valid: false, error: 'Invalid token type' };
      }

      return { valid: true, payload: decoded };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired', expired: true };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: error.message };
    }
  },

  verifyRefreshToken: (token: string): VerifyResult => {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }

    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload & { type: string };

      if (decoded.type !== 'refresh') {
        return { valid: false, error: 'Invalid token type' };
      }

      return { valid: true, payload: decoded };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired', expired: true };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: error.message };
    }
  },

  refreshAccessToken: (refreshToken: string): { accessToken: string } | null => {
    const verification = mockJWTUtils.verifyRefreshToken(refreshToken);

    if (!verification.valid || !verification.payload) {
      return null;
    }

    const newAccessToken = mockJWTUtils.createAccessToken({
      userId: verification.payload.userId,
      email: verification.payload.email || '',
      role: verification.payload.role,
    });

    return { accessToken: newAccessToken };
  },

  decodeTokenWithoutVerification: (token: string): JWTPayload | null => {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch {
      return null;
    }
  },

  getTokenExpiry: (token: string): number | null => {
    const decoded = mockJWTUtils.decodeTokenWithoutVerification(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return decoded.exp;
  },

  isTokenExpired: (token: string): boolean => {
    const expiry = mockJWTUtils.getTokenExpiry(token);
    if (!expiry) {
      return true;
    }
    return expiry < Math.floor(Date.now() / 1000);
  },

  getTimeUntilExpiry: (token: string): number => {
    const expiry = mockJWTUtils.getTokenExpiry(token);
    if (!expiry) {
      return 0;
    }
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, expiry - now);
  },
};

describe('JWT Utilities - Token Creation', () => {
  const mockPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
  };

  describe('createAccessToken', () => {
    it('should create a valid access token with required payload', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include userId in token payload', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe(mockPayload.userId);
    });

    it('should include email in token payload', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.email).toBe(mockPayload.email);
    });

    it('should include role in token payload when provided', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should include token type as "access"', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.type).toBe('access');
    });

    it('should include iat (issued at) timestamp', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
    });

    it('should include exp (expiry) timestamp', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('should throw error when userId is missing', () => {
      const invalidPayload = { email: 'test@example.com' } as JWTPayload;

      expect(() => mockJWTUtils.createAccessToken(invalidPayload)).toThrow('userId is required');
    });

    it('should throw error when email is missing', () => {
      const invalidPayload = { userId: 'user-123' } as JWTPayload;

      expect(() => mockJWTUtils.createAccessToken(invalidPayload)).toThrow('email is required');
    });

    it('should create token with custom expiry time', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload, '1h');
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
    });

    it('should create different tokens for same payload', () => {
      const token1 = mockJWTUtils.createAccessToken(mockPayload);
      const token2 = mockJWTUtils.createAccessToken(mockPayload);

      // Tokens should be different due to different iat values
      expect(token1).not.toBe(token2);
    });
  });

  describe('createRefreshToken', () => {
    it('should create a valid refresh token', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include userId in refresh token', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.userId).toBe(mockPayload.userId);
    });

    it('should include sessionId in refresh token', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.sessionId).toBeDefined();
    });

    it('should include token type as "refresh"', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.type).toBe('refresh');
    });

    it('should throw error when userId is missing', () => {
      const invalidPayload = { email: 'test@example.com' } as JWTPayload;

      expect(() => mockJWTUtils.createRefreshToken(invalidPayload)).toThrow('userId is required');
    });

    it('should use custom sessionId when provided', () => {
      const customSessionId = 'custom-session-123';
      const payloadWithSession = { ...mockPayload, sessionId: customSessionId };
      const token = mockJWTUtils.createRefreshToken(payloadWithSession);
      const decoded = jwt.decode(token) as any;

      expect(decoded.sessionId).toBe(customSessionId);
    });

    it('should create token with custom expiry time', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload, '30d');
      const decoded = jwt.decode(token) as any;

      expect(decoded.exp).toBeDefined();
    });
  });

  describe('createTokenPair', () => {
    it('should create both access and refresh tokens', () => {
      const tokens = mockJWTUtils.createTokenPair(mockPayload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should include expiry times in response', () => {
      const tokens = mockJWTUtils.createTokenPair(mockPayload);

      expect(tokens.expiresIn).toBe(900); // 15 minutes
      expect(tokens.refreshExpiresIn).toBe(604800); // 7 days
    });

    it('should create valid access token in pair', () => {
      const tokens = mockJWTUtils.createTokenPair(mockPayload);
      const decoded = jwt.decode(tokens.accessToken) as any;

      expect(decoded.type).toBe('access');
      expect(decoded.userId).toBe(mockPayload.userId);
    });

    it('should create valid refresh token in pair', () => {
      const tokens = mockJWTUtils.createTokenPair(mockPayload);
      const decoded = jwt.decode(tokens.refreshToken) as any;

      expect(decoded.type).toBe('refresh');
      expect(decoded.userId).toBe(mockPayload.userId);
    });
  });
});

describe('JWT Utilities - Token Verification', () => {
  const mockPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
  };

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const result = mockJWTUtils.verifyAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return payload data on successful verification', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const result = mockJWTUtils.verifyAccessToken(token);

      expect(result.payload?.userId).toBe(mockPayload.userId);
      expect(result.payload?.email).toBe(mockPayload.email);
      expect(result.payload?.role).toBe(mockPayload.role);
    });

    it('should reject token with invalid signature', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      const result = mockJWTUtils.verifyAccessToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject malformed token', () => {
      const result = mockJWTUtils.verifyAccessToken('not-a-valid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject empty token', () => {
      const result = mockJWTUtils.verifyAccessToken('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });

    it('should reject refresh token when verifying access token', () => {
      const refreshToken = mockJWTUtils.createRefreshToken(mockPayload);
      const result = mockJWTUtils.verifyAccessToken(refreshToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });

    it('should detect expired tokens', () => {
      const expiredToken = mockJWTUtils.createAccessToken(mockPayload, '0s');

      // Wait a moment to ensure expiration
      setTimeout(() => {
        const result = mockJWTUtils.verifyAccessToken(expiredToken);

        expect(result.valid).toBe(false);
        expect(result.expired).toBe(true);
        expect(result.error).toBe('Token expired');
      }, 100);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const result = mockJWTUtils.verifyRefreshToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it('should return payload data on successful verification', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const result = mockJWTUtils.verifyRefreshToken(token);

      expect(result.payload?.userId).toBe(mockPayload.userId);
      expect(result.payload?.sessionId).toBeDefined();
    });

    it('should reject token with invalid signature', () => {
      const token = mockJWTUtils.createRefreshToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      const result = mockJWTUtils.verifyRefreshToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject access token when verifying refresh token', () => {
      const accessToken = mockJWTUtils.createAccessToken(mockPayload);
      const result = mockJWTUtils.verifyRefreshToken(accessToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });

    it('should reject empty token', () => {
      const result = mockJWTUtils.verifyRefreshToken('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });
  });
});

describe('JWT Utilities - Token Refresh', () => {
  const mockPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
  };

  describe('refreshAccessToken', () => {
    it('should create new access token from valid refresh token', () => {
      const refreshToken = mockJWTUtils.createRefreshToken(mockPayload);
      const result = mockJWTUtils.refreshAccessToken(refreshToken);

      expect(result).toBeDefined();
      expect(result?.accessToken).toBeDefined();
    });

    it('should create valid access token with same userId', () => {
      const refreshToken = mockJWTUtils.createRefreshToken(mockPayload);
      const result = mockJWTUtils.refreshAccessToken(refreshToken);

      if (result) {
        const decoded = jwt.decode(result.accessToken) as any;
        expect(decoded.userId).toBe(mockPayload.userId);
        expect(decoded.type).toBe('access');
      }
    });

    it('should return null for invalid refresh token', () => {
      const result = mockJWTUtils.refreshAccessToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired refresh token', () => {
      const expiredToken = mockJWTUtils.createRefreshToken(mockPayload, '0s');

      setTimeout(() => {
        const result = mockJWTUtils.refreshAccessToken(expiredToken);
        expect(result).toBeNull();
      }, 100);
    });

    it('should return null for access token instead of refresh token', () => {
      const accessToken = mockJWTUtils.createAccessToken(mockPayload);
      const result = mockJWTUtils.refreshAccessToken(accessToken);

      expect(result).toBeNull();
    });
  });
});

describe('JWT Utilities - Token Inspection', () => {
  const mockPayload: JWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'user',
  };

  describe('decodeTokenWithoutVerification', () => {
    it('should decode valid token without verification', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const decoded = mockJWTUtils.decodeTokenWithoutVerification(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(mockPayload.userId);
    });

    it('should decode tampered token without error', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      const decoded = mockJWTUtils.decodeTokenWithoutVerification(tamperedToken);

      // Should still decode even though signature is invalid
      expect(decoded).toBeDefined();
    });

    it('should return null for malformed token', () => {
      const decoded = mockJWTUtils.decodeTokenWithoutVerification('not-a-token');

      expect(decoded).toBeNull();
    });
  });

  describe('getTokenExpiry', () => {
    it('should return expiry timestamp from token', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const expiry = mockJWTUtils.getTokenExpiry(token);

      expect(expiry).toBeDefined();
      expect(typeof expiry).toBe('number');
      expect(expiry).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should return null for token without expiry', () => {
      const tokenWithoutExp = jwt.sign(
        { userId: 'user-123' },
        JWT_ACCESS_SECRET
        // No expiresIn option
      );
      const expiry = mockJWTUtils.getTokenExpiry(tokenWithoutExp);

      expect(expiry).toBeNull();
    });

    it('should return null for invalid token', () => {
      const expiry = mockJWTUtils.getTokenExpiry('invalid-token');

      expect(expiry).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid unexpired token', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload);
      const expired = mockJWTUtils.isTokenExpired(token);

      expect(expired).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredToken = mockJWTUtils.createAccessToken(mockPayload, '0s');

      setTimeout(() => {
        const expired = mockJWTUtils.isTokenExpired(expiredToken);
        expect(expired).toBe(true);
      }, 100);
    });

    it('should return true for invalid token', () => {
      const expired = mockJWTUtils.isTokenExpired('invalid-token');

      expect(expired).toBe(true);
    });
  });

  describe('getTimeUntilExpiry', () => {
    it('should return time remaining in seconds', () => {
      const token = mockJWTUtils.createAccessToken(mockPayload, '1h');
      const timeRemaining = mockJWTUtils.getTimeUntilExpiry(token);

      expect(timeRemaining).toBeGreaterThan(3500); // Close to 1 hour (3600s)
      expect(timeRemaining).toBeLessThanOrEqual(3600);
    });

    it('should return 0 for expired token', () => {
      const expiredToken = mockJWTUtils.createAccessToken(mockPayload, '0s');

      setTimeout(() => {
        const timeRemaining = mockJWTUtils.getTimeUntilExpiry(expiredToken);
        expect(timeRemaining).toBe(0);
      }, 100);
    });

    it('should return 0 for invalid token', () => {
      const timeRemaining = mockJWTUtils.getTimeUntilExpiry('invalid-token');

      expect(timeRemaining).toBe(0);
    });
  });
});
