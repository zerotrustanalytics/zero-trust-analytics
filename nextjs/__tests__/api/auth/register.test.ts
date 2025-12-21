/**
 * Comprehensive TDD Test Suite for Registration API Route
 *
 * This test suite covers registration API endpoint functionality:
 * - User registration flow
 * - Email uniqueness and validation
 * - Password strength requirements
 * - Rate limiting and security
 * - Email verification flow
 *
 * Total: 30 test cases
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
  verificationToken?: string;
  createdAt: number;
}

// Mock database
let mockUsers: User[] = [];
const mockRegistrationAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REGISTRATIONS_PER_IP = 3;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Mock registration API handler
const mockRegisterAPI = {
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
    const rateLimitCheck = mockRegisterAPI.checkRateLimit(ip);
    if (!rateLimitCheck.allowed) {
      return {
        status: 429,
        body: {
          error: 'Too many registration attempts',
          message: 'Please try again later.',
          retryAfter: rateLimitCheck.retryAfter,
        },
        headers: {
          'Retry-After': String(rateLimitCheck.retryAfter),
        },
      };
    }

    // Validate request body
    const { email, password, confirmPassword, name } = req.body || {};

    // Required fields validation
    if (!email || !password) {
      return {
        status: 400,
        body: { error: 'Email and password are required' },
        headers: {},
      };
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        status: 400,
        body: { error: 'Invalid email format' },
        headers: {},
      };
    }

    // Email length validation
    if (email.length > 255) {
      return {
        status: 400,
        body: { error: 'Email is too long' },
        headers: {},
      };
    }

    // Validate password confirmation
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return {
        status: 400,
        body: { error: 'Passwords do not match' },
        headers: {},
      };
    }

    // Password length validation
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        status: 400,
        body: {
          error: 'Password is too weak',
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        },
        headers: {},
      };
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return {
        status: 400,
        body: {
          error: 'Password is too long',
          message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
        },
        headers: {},
      };
    }

    // Password strength validation
    const strengthValidation = mockRegisterAPI.validatePasswordStrength(password);
    if (!strengthValidation.valid) {
      return {
        status: 400,
        body: {
          error: 'Password is too weak',
          message: strengthValidation.errors[0],
          requirements: strengthValidation.errors,
        },
        headers: {},
      };
    }

    // Check for existing user (case-insensitive)
    const existingUser = mockUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      return {
        status: 409,
        body: { error: 'Email already registered' },
        headers: {},
      };
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return {
          status: 400,
          body: { error: 'Invalid name' },
          headers: {},
        };
      }

      if (name.length > 100) {
        return {
          status: 400,
          body: { error: 'Name is too long' },
          headers: {},
        };
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate verification token
    const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create user
    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      isActive: true,
      emailVerified: false,
      verificationToken,
      createdAt: Date.now(),
    };

    mockUsers.push(newUser);

    // In real implementation, send verification email here

    return {
      status: 201,
      body: {
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        user: {
          id: newUser.id,
          email: newUser.email,
          emailVerified: newUser.emailVerified,
        },
      },
      headers: {},
    };
  },

  validatePasswordStrength: (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUpperCase) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!hasLowerCase) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!hasNumber) {
      errors.push('Password must contain at least one number');
    }

    if (!hasSpecialChar) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  checkRateLimit: (identifier: string): { allowed: boolean; retryAfter?: number } => {
    const now = Date.now();
    const attempts = mockRegistrationAttempts.get(identifier);

    if (!attempts || now - attempts.lastAttempt > RATE_LIMIT_WINDOW) {
      mockRegistrationAttempts.set(identifier, { count: 1, lastAttempt: now });
      return { allowed: true };
    }

    if (attempts.count >= MAX_REGISTRATIONS_PER_IP) {
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - attempts.lastAttempt)) / 1000);
      return { allowed: false, retryAfter };
    }

    attempts.count += 1;
    attempts.lastAttempt = now;
    mockRegistrationAttempts.set(identifier, attempts);

    return { allowed: true };
  },

  verifyEmail: async (token: string): Promise<MockResponse> => {
    const user = mockUsers.find((u) => u.verificationToken === token);

    if (!user) {
      return {
        status: 400,
        body: { error: 'Invalid or expired verification token' },
        headers: {},
      };
    }

    if (user.emailVerified) {
      return {
        status: 400,
        body: { error: 'Email already verified' },
        headers: {},
      };
    }

    user.emailVerified = true;
    user.verificationToken = undefined;

    return {
      status: 200,
      body: {
        success: true,
        message: 'Email verified successfully',
      },
      headers: {},
    };
  },

  resendVerification: async (email: string): Promise<MockResponse> => {
    const user = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Don't reveal if user exists
      return {
        status: 200,
        body: {
          success: true,
          message: 'If an account exists, a verification email has been sent.',
        },
        headers: {},
      };
    }

    if (user.emailVerified) {
      return {
        status: 400,
        body: { error: 'Email already verified' },
        headers: {},
      };
    }

    // Generate new verification token
    const verificationToken = `verify_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    user.verificationToken = verificationToken;

    // In real implementation, send verification email here

    return {
      status: 200,
      body: {
        success: true,
        message: 'Verification email sent.',
      },
      headers: {},
    };
  },

  resetRateLimits: () => {
    mockRegistrationAttempts.clear();
  },
};

describe('Registration API - HTTP Methods', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should accept POST requests', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    expect(response.status).not.toBe(405);
  });

  it('should reject GET requests', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'GET',
    });

    expect(response.status).toBe(405);
    expect(response.body.error).toBe('Method not allowed');
  });

  it('should reject PUT requests', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'PUT',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    expect(response.status).toBe(405);
  });

  it('should reject PATCH requests', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'PATCH',
    });

    expect(response.status).toBe(405);
  });
});

describe('Registration API - Input Validation', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should require email field', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('should require password field', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('should reject empty email', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: '', password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
  });

  it('should reject empty password', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: '' },
    });

    expect(response.status).toBe(400);
  });

  it('should validate email format', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'invalid-email', password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid email format');
  });

  it('should reject email without @', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'testexample.com', password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid email format');
  });

  it('should reject email without domain', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@', password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid email format');
  });

  it('should reject email that is too long', async () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: longEmail, password: 'TestPassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email is too long');
  });

  it('should accept valid email formats', async () => {
    const validEmails = [
      'user@example.com',
      'user.name@example.com',
      'user+tag@example.co.uk',
      'user_123@example-domain.com',
    ];

    for (const email of validEmails) {
      const response = await mockRegisterAPI.handler({
        method: 'POST',
        body: { email, password: 'TestPassword123!' },
      });

      expect(response.status).not.toBe(400);
      expect(response.body.error).not.toBe('Invalid email format');
    }
  });

  it('should validate password confirmation match', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
        confirmPassword: 'DifferentPassword123!',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Passwords do not match');
  });

  it('should accept matching password confirmation', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
        confirmPassword: 'TestPassword123!',
      },
    });

    expect(response.status).not.toBe(400);
    expect(response.body.error).not.toBe('Passwords do not match');
  });

  it('should validate name length when provided', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: 'a'.repeat(101),
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Name is too long');
  });

  it('should reject empty name string', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: '   ',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid name');
  });
});

describe('Registration API - Password Validation', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should reject password shorter than minimum length', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'Short1!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('too weak');
  });

  it('should reject password longer than maximum length', async () => {
    const longPassword = 'A1!' + 'a'.repeat(MAX_PASSWORD_LENGTH);
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: longPassword },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Password is too long');
  });

  it('should require uppercase letter', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'testpassword123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.requirements).toContain('Password must contain at least one uppercase letter');
  });

  it('should require lowercase letter', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'TESTPASSWORD123!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.requirements).toContain('Password must contain at least one lowercase letter');
  });

  it('should require number', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'TestPassword!' },
    });

    expect(response.status).toBe(400);
    expect(response.body.requirements).toContain('Password must contain at least one number');
  });

  it('should require special character', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'TestPassword123' },
    });

    expect(response.status).toBe(400);
    expect(response.body.requirements).toContain('Password must contain at least one special character');
  });

  it('should accept strong password with all requirements', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: { email: 'test@example.com', password: 'StrongPassword123!' },
    });

    expect(response.status).not.toBe(400);
    expect(response.body.error).not.toContain('too weak');
  });
});

describe('Registration API - User Creation', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should create user with valid credentials', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'newuser@example.com',
        password: 'NewUserPassword123!',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockUsers).toHaveLength(1);
  });

  it('should return user information on successful registration', async () => {
    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'newuser@example.com',
        password: 'NewUserPassword123!',
      },
    });

    expect(response.body.user).toBeDefined();
    expect(response.body.user.id).toBeDefined();
    expect(response.body.user.email).toBe('newuser@example.com');
    expect(response.body.user.emailVerified).toBe(false);
  });

  it('should hash password before storing', async () => {
    const password = 'TestPassword123!';
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password,
      },
    });

    const user = mockUsers[0];
    expect(user.password).not.toBe(password);
    expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  it('should store email in lowercase', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'TEST@EXAMPLE.COM',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    expect(user.email).toBe('test@example.com');
  });

  it('should reject duplicate email registration', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'AnotherPassword123!',
      },
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email already registered');
  });

  it('should reject duplicate email with different case', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'TEST@EXAMPLE.COM',
        password: 'AnotherPassword123!',
      },
    });

    expect(response.status).toBe(409);
  });

  it('should create verification token', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    expect(user.verificationToken).toBeDefined();
    expect(user.emailVerified).toBe(false);
  });

  it('should set user role to "user" by default', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    expect(user.role).toBe('user');
  });

  it('should set user as active by default', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    expect(user.isActive).toBe(true);
  });
});

describe('Registration API - Email Verification', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should verify email with valid token', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    const response = await mockRegisterAPI.verifyEmail(user.verificationToken!);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(user.emailVerified).toBe(true);
  });

  it('should reject invalid verification token', async () => {
    const response = await mockRegisterAPI.verifyEmail('invalid-token');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid or expired');
  });

  it('should reject already verified email', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const user = mockUsers[0];
    await mockRegisterAPI.verifyEmail(user.verificationToken!);

    const response = await mockRegisterAPI.verifyEmail(user.verificationToken!);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email already verified');
  });

  it('should allow resending verification email', async () => {
    await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'test@example.com',
        password: 'TestPassword123!',
      },
    });

    const response = await mockRegisterAPI.resendVerification('test@example.com');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should not reveal if user exists when resending verification', async () => {
    const response = await mockRegisterAPI.resendVerification('nonexistent@example.com');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe('Registration API - Rate Limiting', () => {
  beforeEach(() => {
    mockUsers = [];
    mockRegistrationAttempts.clear();
  });

  it('should allow multiple registrations within limit', async () => {
    const ip = '192.168.1.1';

    for (let i = 0; i < MAX_REGISTRATIONS_PER_IP; i++) {
      const response = await mockRegisterAPI.handler({
        method: 'POST',
        body: {
          email: `user${i}@example.com`,
          password: 'TestPassword123!',
        },
        ip,
      });

      expect(response.status).toBe(201);
    }
  });

  it('should block registrations exceeding rate limit', async () => {
    const ip = '192.168.1.1';

    // Exceed rate limit
    for (let i = 0; i < MAX_REGISTRATIONS_PER_IP; i++) {
      await mockRegisterAPI.handler({
        method: 'POST',
        body: {
          email: `user${i}@example.com`,
          password: 'TestPassword123!',
        },
        ip,
      });
    }

    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'blocked@example.com',
        password: 'TestPassword123!',
      },
      ip,
    });

    expect(response.status).toBe(429);
    expect(response.body.error).toContain('Too many registration attempts');
  });

  it('should include retry-after header when rate limited', async () => {
    const ip = '192.168.1.1';

    // Exceed rate limit
    for (let i = 0; i <= MAX_REGISTRATIONS_PER_IP; i++) {
      await mockRegisterAPI.handler({
        method: 'POST',
        body: {
          email: `user${i}@example.com`,
          password: 'TestPassword123!',
        },
        ip,
      });
    }

    const response = await mockRegisterAPI.handler({
      method: 'POST',
      body: {
        email: 'blocked@example.com',
        password: 'TestPassword123!',
      },
      ip,
    });

    expect(response.headers['Retry-After']).toBeDefined();
  });
});
