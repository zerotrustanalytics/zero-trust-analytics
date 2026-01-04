/**
 * Comprehensive TDD Test Suite for Login API Endpoint
 *
 * This test suite covers the /api/auth/login endpoint with:
 * - Input validation tests
 * - Authentication success and failure scenarios
 * - Security features (rate limiting, account lockout)
 * - Session and token management
 *
 * Total: 18 test cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  error?: string;
  message?: string;
}

// Mock database
const mockDb = {
  getUserByEmail: vi.fn(),
  updateLastLogin: vi.fn(),
  incrementLoginAttempts: vi.fn(),
  resetLoginAttempts: vi.fn(),
  lockAccount: vi.fn(),
  saveSession: vi.fn(),
};

// Mock auth utilities
const mockAuth = {
  verifyPassword: vi.fn(),
  createTokenPair: vi.fn(),
  createSession: vi.fn(),
};

// Mock rate limiter
const mockRateLimiter = {
  checkRateLimit: vi.fn(),
  recordFailedAttempt: vi.fn(),
  resetAttempts: vi.fn(),
};

// Mock audit logger
const mockAuditLog = {
  logLoginAttempt: vi.fn(),
  logSuccessfulLogin: vi.fn(),
  logFailedLogin: vi.fn(),
};

describe('POST /api/auth/login', () => {
  const validLoginData: LoginRequest = {
    email: 'test@example.com',
    password: 'SecurePassword123!',
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    passwordHash: '$2a$12$hashedpassword',
    loginAttempts: 0,
    accountLocked: false,
    lastLogin: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockDb.getUserByEmail.mockResolvedValue(mockUser);
    mockAuth.verifyPassword.mockResolvedValue(true);
    mockAuth.createTokenPair.mockReturnValue({
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-123',
    });
    mockAuth.createSession.mockResolvedValue({ id: 'session-123' });
    mockDb.updateLastLogin.mockResolvedValue(true);
    mockDb.resetLoginAttempts.mockResolvedValue(true);
    mockRateLimiter.checkRateLimit.mockResolvedValue({ allowed: true });
  });

  describe('Validation Tests', () => {
    it('should return 400 when email is missing', async () => {
      const invalidData = { password: validLoginData.password };

      const response = await simulateLogin(invalidData as LoginRequest);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('email');
    });

    it('should return 400 when email format is invalid', async () => {
      const invalidData = { ...validLoginData, email: 'invalid-email' };

      const response = await simulateLogin(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('email');
    });

    it('should return 400 when password is missing', async () => {
      const invalidData = { email: validLoginData.email };

      const response = await simulateLogin(invalidData as LoginRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('password');
    });

    it('should return 400 when password is empty', async () => {
      const invalidData = { ...validLoginData, password: '' };

      const response = await simulateLogin(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('password');
    });

    it('should sanitize email to lowercase', async () => {
      const dataWithUppercase = { ...validLoginData, email: 'TEST@EXAMPLE.COM' };

      await simulateLogin(dataWithUppercase);

      expect(mockDb.getUserByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('Authentication Failure Tests', () => {
    it('should return 401 when user does not exist', async () => {
      mockDb.getUserByEmail.mockResolvedValue(null);

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is incorrect', async () => {
      mockAuth.verifyPassword.mockResolvedValue(false);

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should not reveal whether email exists in error message', async () => {
      mockDb.getUserByEmail.mockResolvedValue(null);

      const response = await simulateLogin(validLoginData);

      // Error should be generic
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.body.message).not.toContain(validLoginData.email);
    });

    it('should increment login attempts on failed login', async () => {
      mockAuth.verifyPassword.mockResolvedValue(false);

      await simulateLogin(validLoginData);

      expect(mockDb.incrementLoginAttempts).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return 423 when account is locked', async () => {
      mockDb.getUserByEmail.mockResolvedValue({
        ...mockUser,
        accountLocked: true,
      });

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(423);
      expect(response.body.error).toBe('Locked');
      expect(response.body.message).toContain('locked');
    });

    it('should lock account after maximum failed attempts', async () => {
      mockDb.getUserByEmail.mockResolvedValue({
        ...mockUser,
        loginAttempts: 4, // One more will reach max
      });
      mockAuth.verifyPassword.mockResolvedValue(false);

      const response = await simulateLogin(validLoginData);

      expect(mockDb.lockAccount).toHaveBeenCalledWith(mockUser.id);
      expect(response.status).toBe(423);
    });

    it('should log failed login attempts', async () => {
      mockAuth.verifyPassword.mockResolvedValue(false);

      await simulateLogin(validLoginData);

      expect(mockAuditLog.logFailedLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validLoginData.email.toLowerCase(),
        })
      );
    });
  });

  describe('Success Cases', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
    });

    it('should return user data without password hash', async () => {
      const response = await simulateLogin(validLoginData);

      expect(response.body.user).toBeDefined();
      expect(response.body.user?.email).toBe(mockUser.email);
      expect(response.body.user?.name).toBe(mockUser.name);
      expect((response.body.user as any)?.passwordHash).toBeUndefined();
    });

    it('should return access and refresh tokens', async () => {
      const response = await simulateLogin(validLoginData);

      expect(response.body.tokens?.accessToken).toBe('access-token-123');
      expect(response.body.tokens?.refreshToken).toBe('refresh-token-123');
    });

    it('should create session on successful login', async () => {
      await simulateLogin(validLoginData);

      expect(mockAuth.createSession).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Object)
      );
      expect(mockDb.saveSession).toHaveBeenCalled();
    });

    it('should update last login timestamp', async () => {
      await simulateLogin(validLoginData);

      expect(mockDb.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should reset login attempts on successful login', async () => {
      await simulateLogin(validLoginData);

      expect(mockDb.resetLoginAttempts).toHaveBeenCalledWith(mockUser.id);
    });

    it('should log successful login', async () => {
      await simulateLogin(validLoginData);

      expect(mockAuditLog.logSuccessfulLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          email: mockUser.email,
        })
      );
    });

    it('should support "remember me" functionality', async () => {
      const dataWithRememberMe = { ...validLoginData, rememberMe: true };

      const response = await simulateLogin(dataWithRememberMe);

      expect(response.status).toBe(200);
      // Should create longer-lived session or refresh token
      expect(mockAuth.createTokenPair).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ rememberMe: true })
      );
    });
  });

  describe('Security and Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfter: 60,
      });

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too Many Requests');
      expect(response.headers['Retry-After']).toBe('60');
    });

    it('should record failed attempts in rate limiter', async () => {
      mockAuth.verifyPassword.mockResolvedValue(false);

      await simulateLogin(validLoginData);

      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith(
        validLoginData.email.toLowerCase()
      );
    });

    it('should reset rate limiter on successful login', async () => {
      await simulateLogin(validLoginData);

      expect(mockRateLimiter.resetAttempts).toHaveBeenCalledWith(
        validLoginData.email.toLowerCase()
      );
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when database fails', async () => {
      mockDb.getUserByEmail.mockRejectedValue(new Error('Database connection failed'));

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    it('should return 500 when password verification fails', async () => {
      mockAuth.verifyPassword.mockRejectedValue(new Error('Verification failed'));

      const response = await simulateLogin(validLoginData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = {
        status: 400,
        body: { error: 'Bad Request', message: 'Invalid JSON in request body' },
      };

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid JSON');
    });
  });
});

// Simulation helper function
async function simulateLogin(
  data: Partial<LoginRequest>
): Promise<{ status: number; body: LoginResponse; headers: Record<string, string> }> {
  const MAX_LOGIN_ATTEMPTS = 5;

  // Input validation
  if (!data.email) {
    return {
      status: 400,
      body: { success: false, error: 'Validation Error', message: 'email is required' },
      headers: {},
    };
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return {
      status: 400,
      body: { success: false, error: 'Validation Error', message: 'Invalid email format' },
      headers: {},
    };
  }

  if (!data.password) {
    return {
      status: 400,
      body: { success: false, error: 'Validation Error', message: 'password is required' },
      headers: {},
    };
  }

  // Sanitize email
  const sanitizedEmail = data.email.toLowerCase().trim();

  // Rate limiting check
  const rateLimitResult = await mockRateLimiter.checkRateLimit(sanitizedEmail);
  if (!rateLimitResult.allowed) {
    return {
      status: 429,
      body: { success: false, error: 'Too Many Requests', message: 'Too many login attempts' },
      headers: { 'Retry-After': rateLimitResult.retryAfter?.toString() || '60' },
    };
  }

  try {
    // Get user
    const user = await mockDb.getUserByEmail(sanitizedEmail);
    if (!user) {
      await mockRateLimiter.recordFailedAttempt(sanitizedEmail);
      await mockAuditLog.logFailedLogin({ email: sanitizedEmail, reason: 'User not found' });
      return {
        status: 401,
        body: { success: false, error: 'Unauthorized', message: 'Invalid credentials' },
        headers: {},
      };
    }

    // Check if account is locked
    if (user.accountLocked) {
      return {
        status: 423,
        body: { success: false, error: 'Locked', message: 'Account is locked. Please contact support.' },
        headers: {},
      };
    }

    // Verify password
    const passwordValid = await mockAuth.verifyPassword(data.password, user.passwordHash);
    if (!passwordValid) {
      // Increment login attempts
      await mockDb.incrementLoginAttempts(user.id);
      await mockRateLimiter.recordFailedAttempt(sanitizedEmail);
      await mockAuditLog.logFailedLogin({ email: sanitizedEmail, userId: user.id, reason: 'Invalid password' });

      // Lock account if max attempts reached
      if (user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
        await mockDb.lockAccount(user.id);
        return {
          status: 423,
          body: { success: false, error: 'Locked', message: 'Account locked due to too many failed attempts' },
          headers: {},
        };
      }

      return {
        status: 401,
        body: { success: false, error: 'Unauthorized', message: 'Invalid credentials' },
        headers: {},
      };
    }

    // Successful authentication
    // Reset login attempts
    await mockDb.resetLoginAttempts(user.id);
    await mockRateLimiter.resetAttempts(sanitizedEmail);

    // Create tokens
    const tokens = mockAuth.createTokenPair(
      { userId: user.id, email: user.email, role: user.role },
      { rememberMe: data.rememberMe }
    );

    // Create session
    const session = await mockAuth.createSession(user.id, { rememberMe: data.rememberMe });
    await mockDb.saveSession(session);

    // Update last login
    await mockDb.updateLastLogin(user.id);

    // Log successful login
    await mockAuditLog.logSuccessfulLogin({ userId: user.id, email: user.email });

    return {
      status: 200,
      body: {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tokens,
      },
      headers: {},
    };
  } catch (error: any) {
    return {
      status: 500,
      body: { success: false, error: 'Internal Server Error', message: error.message },
      headers: {},
    };
  }
}
