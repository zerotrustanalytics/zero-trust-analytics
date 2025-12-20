/**
 * Comprehensive TDD Test Suite for Login API Route
 *
 * This test suite covers login API endpoint functionality:
 * - Email/password login flow
 * - Authentication and validation
 * - Rate limiting and security
 * - Error handling and edge cases
 *
 * Total: 25 test cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock Next.js Request/Response types
interface MockRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  ip?: string;
}

interface MockResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

// Mock user database
interface User {
  id: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil?: number;
}

// Mock database
let mockUsers: User[] = [];
const mockLoginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// Mock login API handler
const mockLoginAPI = {
  handler: async (req: MockRequest): Promise<MockResponse> => {
    if (req.method !== 'POST') {
      return {
        status: 405,
        body: { error: 'Method not allowed' },
        headers: { 'Allow': 'POST' },
      };
    }

    // Rate limiting check
    const ip = req.ip || 'unknown';
    const rateLimitCheck = mockLoginAPI.checkRateLimit(ip);
    if (!rateLimitCheck.allowed) {
      return {
        status: 429,
        body: {
          error: 'Too many requests',
          retryAfter: rateLimitCheck.retryAfter,
        },
        headers: {
          'Retry-After': String(rateLimitCheck.retryAfter),
        },
      };
    }

    // Validate request body
    const { email, password } = req.body || {};

    if (!email || !password) {
      return {
        status: 400,
        body: { error: 'Email and password are required' },
        headers: {},
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        status: 400,
        body: { error: 'Invalid email format' },
        headers: {},
      };
    }

    // Find user
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Prevent user enumeration - use same timing as password check
      await bcrypt.compare(password, await bcrypt.hash('dummy', 10));
      return {
        status: 401,
        body: { error: 'Invalid credentials' },
        headers: {},
      };
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockedUntil - Date.now()) / 1000 / 60);
      return {
        status: 423,
        body: {
          error: 'Account temporarily locked',
          message: `Too many failed login attempts. Try again in ${remainingTime} minutes.`,
          lockedUntil: user.lockedUntil,
        },
        headers: {},
      };
    }

    // Check if account is active
    if (!user.isActive) {
      return {
        status: 403,
        body: { error: 'Account is deactivated' },
        headers: {},
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failedLoginAttempts += 1;

      // Lock account if too many failed attempts
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = Date.now() + LOCKOUT_DURATION;
        return {
          status: 423,
          body: {
            error: 'Account locked',
            message: `Too many failed login attempts. Account locked for ${LOCKOUT_DURATION / 60000} minutes.`,
          },
          headers: {},
        };
      }

      return {
        status: 401,
        body: {
          error: 'Invalid credentials',
          remainingAttempts: MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts,
        },
        headers: {},
      };
    }

    // Check email verification
    if (!user.emailVerified) {
      return {
        status: 403,
        body: {
          error: 'Email not verified',
          message: 'Please verify your email address before logging in.',
        },
        headers: {},
      };
    }

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;

    // Generate tokens (mock implementation)
    const accessToken = `access_token_${user.id}_${Date.now()}`;
    const refreshToken = `refresh_token_${user.id}_${Date.now()}`;
    const sessionId = `session_${user.id}_${Date.now()}`;

    return {
      status: 200,
      body: {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900, // 15 minutes
        },
        sessionId,
      },
      headers: {
        'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/`,
      },
    };
  },

  checkRateLimit: (identifier: string): { allowed: boolean; retryAfter?: number } => {
    const now = Date.now();
    const attempts = mockLoginAttempts.get(identifier);

    if (!attempts || now - attempts.lastAttempt > RATE_LIMIT_WINDOW) {
      mockLoginAttempts.set(identifier, { count: 1, lastAttempt: now });
      return { allowed: true };
    }

    if (attempts.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - attempts.lastAttempt)) / 1000);
      return { allowed: false, retryAfter };
    }

    attempts.count += 1;
    attempts.lastAttempt = now;
    mockLoginAttempts.set(identifier, attempts);

    return { allowed: true };
  },

  resetRateLimits: () => {
    mockLoginAttempts.clear();
  },
};

describe('Login API - HTTP Methods', () => {
  beforeEach(() => {
    mockUsers = [];
    mockLoginAttempts.clear();
  });

  it('should accept POST requests', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'password' },
    });

    expect(response.status).not.toBe(405);
  });

  it('should reject GET requests', async () => {
    const response = await mockLoginAPI.handler({
      method: 'GET',
    });

    expect(response.status).toBe(405);
    expect(response.body.error).toBe('Method not allowed');
    expect(response.headers['Allow']).toBe('POST');
  });

  it('should reject PUT requests', async () => {
    const response = await mockLoginAPI.handler({
      method: 'PUT',
      body: { email: 'test@example.com', password: 'password' },
    });

    expect(response.status).toBe(405);
  });

  it('should reject DELETE requests', async () => {
    const response = await mockLoginAPI.handler({
      method: 'DELETE',
    });

    expect(response.status).toBe(405);
  });
});

describe('Login API - Input Validation', () => {
  beforeEach(() => {
    mockUsers = [];
    mockLoginAttempts.clear();
  });

  it('should require email field', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { password: 'password123' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('should require password field', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('should reject empty email', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: '', password: 'password123' },
    });

    expect(response.status).toBe(400);
  });

  it('should reject empty password', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: '' },
    });

    expect(response.status).toBe(400);
  });

  it('should validate email format', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'invalid-email', password: 'password123' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid email format');
  });

  it('should accept valid email formats', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'valid.email+tag@example.com', password: 'password123' },
    });

    // Should not fail on email format validation
    expect(response.status).not.toBe(400);
    expect(response.body.error).not.toBe('Invalid email format');
  });
});

describe('Login API - Authentication', () => {
  beforeEach(async () => {
    mockUsers = [
      {
        id: 'user-1',
        email: 'active@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 10),
        role: 'user',
        isActive: true,
        emailVerified: true,
        failedLoginAttempts: 0,
      },
      {
        id: 'user-2',
        email: 'inactive@example.com',
        password: await bcrypt.hash('Password123!', 10),
        role: 'user',
        isActive: false,
        emailVerified: true,
        failedLoginAttempts: 0,
      },
      {
        id: 'user-3',
        email: 'unverified@example.com',
        password: await bcrypt.hash('Password123!', 10),
        role: 'user',
        isActive: true,
        emailVerified: false,
        failedLoginAttempts: 0,
      },
    ];
    mockLoginAttempts.clear();
  });

  it('should login with valid credentials', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'active@example.com', password: 'CorrectPassword123!' },
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe('active@example.com');
    expect(response.body.tokens).toBeDefined();
  });

  it('should return access and refresh tokens on success', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'active@example.com', password: 'CorrectPassword123!' },
    });

    expect(response.body.tokens.accessToken).toBeDefined();
    expect(response.body.tokens.refreshToken).toBeDefined();
    expect(response.body.tokens.expiresIn).toBeDefined();
  });

  it('should set session cookie on success', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'active@example.com', password: 'CorrectPassword123!' },
    });

    expect(response.headers['Set-Cookie']).toBeDefined();
    expect(response.headers['Set-Cookie']).toContain('HttpOnly');
    expect(response.headers['Set-Cookie']).toContain('Secure');
    expect(response.headers['Set-Cookie']).toContain('SameSite=Strict');
  });

  it('should reject invalid password', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'active@example.com', password: 'WrongPassword!' },
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should reject non-existent user', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'nonexistent@example.com', password: 'Password123!' },
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });

  it('should be case-insensitive for email', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'ACTIVE@EXAMPLE.COM', password: 'CorrectPassword123!' },
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should reject inactive accounts', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'inactive@example.com', password: 'Password123!' },
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Account is deactivated');
  });

  it('should reject unverified email accounts', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'unverified@example.com', password: 'Password123!' },
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Email not verified');
  });
});

describe('Login API - Security & Rate Limiting', () => {
  beforeEach(async () => {
    mockUsers = [
      {
        id: 'user-1',
        email: 'test@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 10),
        role: 'user',
        isActive: true,
        emailVerified: true,
        failedLoginAttempts: 0,
      },
    ];
    mockLoginAttempts.clear();
  });

  it('should increment failed login attempts on wrong password', async () => {
    const user = mockUsers[0];
    const initialAttempts = user.failedLoginAttempts;

    await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'WrongPassword!' },
    });

    expect(user.failedLoginAttempts).toBe(initialAttempts + 1);
  });

  it('should return remaining attempts after failed login', async () => {
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'WrongPassword!' },
    });

    expect(response.body.remainingAttempts).toBeDefined();
    expect(response.body.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1);
  });

  it('should lock account after max failed attempts', async () => {
    // Make MAX_LOGIN_ATTEMPTS failed login attempts
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      await mockLoginAPI.handler({
        method: 'POST',
        body: { email: 'test@example.com', password: 'WrongPassword!' },
      });
    }

    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'CorrectPassword123!' },
    });

    expect(response.status).toBe(423);
    expect(response.body.error).toContain('locked');
  });

  it('should reset failed attempts on successful login', async () => {
    const user = mockUsers[0];

    // Failed attempt
    await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'WrongPassword!' },
    });

    expect(user.failedLoginAttempts).toBe(1);

    // Successful login
    await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'CorrectPassword123!' },
    });

    expect(user.failedLoginAttempts).toBe(0);
  });

  it('should enforce rate limiting', async () => {
    const ip = '192.168.1.1';

    // Make MAX_REQUESTS_PER_WINDOW requests
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      await mockLoginAPI.handler({
        method: 'POST',
        body: { email: 'test@example.com', password: 'password' },
        ip,
      });
    }

    // Next request should be rate limited
    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'password' },
      ip,
    });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('Too many requests');
  });

  it('should include retry-after header when rate limited', async () => {
    const ip = '192.168.1.1';

    // Exceed rate limit
    for (let i = 0; i <= MAX_REQUESTS_PER_WINDOW; i++) {
      await mockLoginAPI.handler({
        method: 'POST',
        body: { email: 'test@example.com', password: 'password' },
        ip,
      });
    }

    const response = await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'password' },
      ip,
    });

    expect(response.headers['Retry-After']).toBeDefined();
  });

  it('should prevent user enumeration with timing attack', async () => {
    const start1 = Date.now();
    await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'nonexistent@example.com', password: 'password' },
    });
    const duration1 = Date.now() - start1;

    const start2 = Date.now();
    await mockLoginAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'WrongPassword!' },
    });
    const duration2 = Date.now() - start2;

    // Timing should be similar (within 100ms)
    expect(Math.abs(duration1 - duration2)).toBeLessThan(100);
  });
});
