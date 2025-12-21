import { jest } from '@jest/globals';
import { createHeaders } from './helpers.js';

// Mock rate-limit to always allow requests
jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

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
    __clearAllStores: () => stores.clear()
  };
});

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: jest.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: jest.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`))
  }
}));

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn((payload, secret, options) => {
      if (payload.temp) {
        return `temp_token_${payload.email}`;
      }
      return `token_${payload.email}`;
    }),
    verify: jest.fn((token, secret) => {
      if (token.startsWith('temp_token_')) {
        return { email: token.replace('temp_token_', ''), temp: true };
      }
      if (token.startsWith('token_')) {
        return { id: 'user-123', email: token.replace('token_', '') };
      }
      throw new Error('Invalid token');
    })
  }
}));

// Mock otpauth - we'll create a simple TOTP implementation for testing
jest.unstable_mockModule('otpauth', () => {
  class MockSecret {
    constructor(options) {
      this.size = options?.size || 20;
      this.base32 = 'JBSWY3DPEHPK3PXP'; // Mock base32 secret
    }

    static fromBase32(base32) {
      const secret = new MockSecret({});
      secret.base32 = base32;
      return secret;
    }
  }

  class MockTOTP {
    constructor(options) {
      this.issuer = options.issuer;
      this.label = options.label;
      this.secret = options.secret;
    }

    toString() {
      return `otpauth://totp/${this.issuer}:${this.label}?secret=${this.secret.base32}&issuer=${this.issuer}`;
    }

    validate(options) {
      const { token, window } = options;
      // For testing, accept '123456' as valid, '000000' as invalid
      if (token === '123456') {
        return 0; // Valid token
      }
      return null; // Invalid token
    }

    generate() {
      return '123456'; // Mock TOTP code
    }
  }

  return {
    TOTP: MockTOTP,
    Secret: MockSecret
  };
});

const { __clearAllStores } = await import('@netlify/blobs');

describe('2FA Authentication', () => {
  const testToken = 'token_test@example.com';
  const validAuthHeaders = {
    'Authorization': `Bearer ${testToken}`,
    'Content-Type': 'application/json'
  };

  beforeEach(async () => {
    __clearAllStores();
    process.env.JWT_SECRET = 'test-jwt-secret';

    // Create test user
    const { getStore } = await import('@netlify/blobs');
    const usersStore = getStore({ name: 'users' });

    await usersStore.setJSON('test@example.com', {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed_password123',
      twoFactorEnabled: false
    });
  });

  describe('POST /api/auth/2fa - Setup', () => {
    it('should generate TOTP secret and QR code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'setup'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.secret).toBeDefined();
      expect(data.qrCode).toBeDefined();
      expect(data.qrCode).toContain('otpauth://totp/');
      expect(data.message).toContain('Scan the QR code');
    });

    it('should require authentication', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({}),
        json: async () => ({
          action: 'setup'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      expect(response.status).toBe(401);
    });

    it('should store secret without enabling 2FA', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');
      const { getStore } = await import('@netlify/blobs');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'setup'
        })
      };

      await handler(req, { ip: '127.0.0.1' });

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('test@example.com', { type: 'json' });

      expect(user.twoFactorSecret).toBeDefined();
      expect(user.twoFactorEnabled).toBe(false);
    });
  });

  describe('POST /api/auth/2fa - Verify', () => {
    beforeEach(async () => {
      // Setup 2FA first
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: false
      });
    });

    it('should verify valid TOTP code and enable 2FA', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'verify',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('enabled successfully');
    });

    it('should reject invalid TOTP code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'verify',
          code: '000000'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid verification code');
    });

    it('should require verification code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'verify'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject if setup not initiated', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      // Remove the secret
      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorEnabled: false
      });

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'verify',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('setup not initiated');
    });

    it('should enable 2FA after successful verification', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');
      const { getStore } = await import('@netlify/blobs');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'verify',
          code: '123456'
        })
      };

      await handler(req, { ip: '127.0.0.1' });

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('test@example.com', { type: 'json' });

      expect(user.twoFactorEnabled).toBe(true);
    });
  });

  describe('POST /api/auth/2fa - Disable', () => {
    beforeEach(async () => {
      // Setup and enable 2FA
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true
      });
    });

    it('should disable 2FA with valid code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'disable',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('disabled');
    });

    it('should require valid code to disable', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'disable',
          code: '000000'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid verification code');
    });

    it('should remove secret after disabling', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');
      const { getStore } = await import('@netlify/blobs');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'disable',
          code: '123456'
        })
      };

      await handler(req, { ip: '127.0.0.1' });

      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('test@example.com', { type: 'json' });

      expect(user.twoFactorEnabled).toBe(false);
      expect(user.twoFactorSecret).toBeNull();
    });

    it('should fail if 2FA not enabled', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorEnabled: false
      });

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'disable',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('not enabled');
    });
  });

  describe('POST /api/auth/2fa - Validate (during login)', () => {
    beforeEach(async () => {
      // Setup and enable 2FA
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true
      });
    });

    it('should validate code and return full JWT', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          action: 'validate',
          tempToken: 'temp_token_test@example.com',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
    });

    it('should reject invalid code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          action: 'validate',
          tempToken: 'temp_token_test@example.com',
          code: '000000'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid verification code');
    });

    it('should require tempToken and code', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          action: 'validate'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });

    it('should reject invalid temp token', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          action: 'validate',
          tempToken: 'invalid_token',
          code: '123456'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid temporary token');
    });
  });

  describe('Login flow with 2FA', () => {
    it('should return requires_2fa when 2FA is enabled', async () => {
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true
      });

      const { default: loginHandler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          email: 'test@example.com',
          password: 'password123'
        })
      };

      const response = await loginHandler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.requires_2fa).toBe(true);
      expect(data.tempToken).toBeDefined();
      expect(data.token).toBeUndefined();
    });

    it('should login normally when 2FA is disabled', async () => {
      const { getStore } = await import('@netlify/blobs');
      const usersStore = getStore({ name: 'users' });

      await usersStore.setJSON('test@example.com', {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password123',
        twoFactorEnabled: false
      });

      const { default: loginHandler } = await import('../../netlify/functions/auth-login.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/login',
        headers: createHeaders({ 'Content-Type': 'application/json' }),
        json: async () => ({
          email: 'test@example.com',
          password: 'password123'
        })
      };

      const response = await loginHandler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.requires_2fa).toBeUndefined();
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
    });
  });

  describe('OPTIONS /api/auth/2fa - CORS preflight', () => {
    it('should handle OPTIONS request', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'OPTIONS',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders({})
      };

      const response = await handler(req, { ip: '127.0.0.1' });

      expect(response.status).toBe(204);
    });
  });

  describe('Invalid action', () => {
    it('should reject invalid action', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-2fa.js');

      const req = {
        method: 'POST',
        url: 'http://localhost/api/auth/2fa',
        headers: createHeaders(validAuthHeaders),
        json: async () => ({
          action: 'invalid_action'
        })
      };

      const response = await handler(req, { ip: '127.0.0.1' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });
  });
});
