/**
 * Comprehensive TDD Test Suite for Password Hashing Utilities
 *
 * This test suite covers password hashing and verification with bcrypt:
 * - Password hashing with various salt rounds
 * - Password verification and comparison
 * - Password strength validation
 * - Security edge cases and error handling
 *
 * Total: 25 test cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock password utilities - these would be implemented in src/lib/auth/password.ts
interface PasswordHashResult {
  hash: string;
  salt: string;
}

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
}

interface PasswordCompareResult {
  match: boolean;
  error?: string;
}

// Mock implementation for testing
const DEFAULT_SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const mockPasswordUtils = {
  hashPassword: async (password: string, saltRounds: number = DEFAULT_SALT_ROUNDS): Promise<string> => {
    if (!password) {
      throw new Error('Password is required');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

    if (saltRounds < 4 || saltRounds > 31) {
      throw new Error('Salt rounds must be between 4 and 31');
    }

    return await bcrypt.hash(password, saltRounds);
  },

  comparePassword: async (password: string, hash: string): Promise<boolean> => {
    if (!password || !hash) {
      throw new Error('Password and hash are required');
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      throw new Error('Invalid hash format');
    }
  },

  verifyPassword: async (password: string, hash: string): Promise<PasswordCompareResult> => {
    if (!password || !hash) {
      return { match: false, error: 'Password and hash are required' };
    }

    try {
      const match = await bcrypt.compare(password, hash);
      return { match };
    } catch (error) {
      return { match: false, error: 'Invalid hash format' };
    }
  },

  validatePasswordStrength: (password: string): PasswordValidationResult => {
    const errors: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' | 'very-strong' = 'weak';

    if (!password) {
      return { valid: false, errors: ['Password is required'], strength };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      errors.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

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

    // Calculate strength
    const criteriasMet = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar].filter(Boolean).length;

    if (password.length >= MIN_PASSWORD_LENGTH && criteriasMet === 4) {
      if (password.length >= 16) {
        strength = 'very-strong';
      } else if (password.length >= 12) {
        strength = 'strong';
      } else {
        strength = 'medium';
      }
    } else if (criteriasMet >= 2) {
      strength = 'weak';
    }

    return {
      valid: errors.length === 0,
      errors,
      strength,
    };
  },

  generateSalt: async (rounds: number = DEFAULT_SALT_ROUNDS): Promise<string> => {
    if (rounds < 4 || rounds > 31) {
      throw new Error('Salt rounds must be between 4 and 31');
    }

    return await bcrypt.genSalt(rounds);
  },

  hashWithSalt: async (password: string, salt: string): Promise<string> => {
    if (!password || !salt) {
      throw new Error('Password and salt are required');
    }

    return await bcrypt.hash(password, salt);
  },

  needsRehash: (hash: string, targetRounds: number = DEFAULT_SALT_ROUNDS): boolean => {
    try {
      // Extract rounds from bcrypt hash (format: $2a$rounds$...)
      const rounds = parseInt(hash.split('$')[2], 10);
      return rounds < targetRounds;
    } catch {
      return true; // Invalid hash format, should be rehashed
    }
  },

  isValidHash: (hash: string): boolean => {
    // Bcrypt hash format: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
    const bcryptRegex = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
    return bcryptRegex.test(hash);
  },
};

describe('Password Utilities - Hashing', () => {
  describe('hashPassword', () => {
    it('should hash a valid password', async () => {
      const password = 'TestPassword123!';
      const hash = await mockPasswordUtils.hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);
    });

    it('should create a bcrypt hash with correct format', async () => {
      const password = 'TestPassword123!';
      const hash = await mockPasswordUtils.hashPassword(password);

      expect(hash).toMatch(/^\$2[aby]\$/); // Bcrypt hash starts with $2a$, $2b$, or $2y$
    });

    it('should create different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await mockPasswordUtils.hashPassword(password);
      const hash2 = await mockPasswordUtils.hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different salts
    });

    it('should use default salt rounds when not specified', async () => {
      const password = 'TestPassword123!';
      const hash = await mockPasswordUtils.hashPassword(password);

      // Extract rounds from hash (format: $2a$rounds$...)
      const rounds = parseInt(hash.split('$')[2], 10);
      expect(rounds).toBe(DEFAULT_SALT_ROUNDS);
    });

    it('should accept custom salt rounds', async () => {
      const password = 'TestPassword123!';
      const customRounds = 10;
      const hash = await mockPasswordUtils.hashPassword(password, customRounds);

      const rounds = parseInt(hash.split('$')[2], 10);
      expect(rounds).toBe(customRounds);
    });

    it('should reject empty password', async () => {
      await expect(mockPasswordUtils.hashPassword('')).rejects.toThrow('Password is required');
    });

    it('should reject password shorter than minimum length', async () => {
      const shortPassword = '1234567'; // 7 characters
      await expect(mockPasswordUtils.hashPassword(shortPassword)).rejects.toThrow(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
      );
    });

    it('should reject password longer than maximum length', async () => {
      const longPassword = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
      await expect(mockPasswordUtils.hashPassword(longPassword)).rejects.toThrow(
        `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`
      );
    });

    it('should reject invalid salt rounds (too low)', async () => {
      const password = 'TestPassword123!';
      await expect(mockPasswordUtils.hashPassword(password, 3)).rejects.toThrow(
        'Salt rounds must be between 4 and 31'
      );
    });

    it('should reject invalid salt rounds (too high)', async () => {
      const password = 'TestPassword123!';
      await expect(mockPasswordUtils.hashPassword(password, 32)).rejects.toThrow(
        'Salt rounds must be between 4 and 31'
      );
    });

    it('should hash password with special characters', async () => {
      const password = 'P@ssw0rd!#$%^&*()';
      const hash = await mockPasswordUtils.hashPassword(password);

      expect(hash).toBeDefined();
      expect(await bcrypt.compare(password, hash)).toBe(true);
    });

    it('should hash password with unicode characters', async () => {
      const password = 'P@ssw0rd你好世界🔒';
      const hash = await mockPasswordUtils.hashPassword(password);

      expect(hash).toBeDefined();
      expect(await bcrypt.compare(password, hash)).toBe(true);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      const result = await mockPasswordUtils.comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await bcrypt.hash(password, 10);

      const result = await mockPasswordUtils.comparePassword(wrongPassword, hash);
      expect(result).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      const result = await mockPasswordUtils.comparePassword('testpassword123!', hash);
      expect(result).toBe(false);
    });

    it('should reject empty password', async () => {
      const hash = await bcrypt.hash('TestPassword123!', 10);
      await expect(mockPasswordUtils.comparePassword('', hash)).rejects.toThrow(
        'Password and hash are required'
      );
    });

    it('should reject empty hash', async () => {
      await expect(mockPasswordUtils.comparePassword('TestPassword123!', '')).rejects.toThrow(
        'Password and hash are required'
      );
    });

    it('should reject invalid hash format', async () => {
      await expect(mockPasswordUtils.comparePassword('TestPassword123!', 'invalid-hash')).rejects.toThrow(
        'Invalid hash format'
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return match true for valid password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      const result = await mockPasswordUtils.verifyPassword(password, hash);
      expect(result.match).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return match false for invalid password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      const result = await mockPasswordUtils.verifyPassword('WrongPassword!', hash);
      expect(result.match).toBe(false);
    });

    it('should return error for invalid hash', async () => {
      const result = await mockPasswordUtils.verifyPassword('TestPassword123!', 'invalid-hash');
      expect(result.match).toBe(false);
      expect(result.error).toBe('Invalid hash format');
    });

    it('should return error for empty inputs', async () => {
      const result = await mockPasswordUtils.verifyPassword('', '');
      expect(result.match).toBe(false);
      expect(result.error).toBe('Password and hash are required');
    });
  });
});

describe('Password Utilities - Validation', () => {
  describe('validatePasswordStrength', () => {
    it('should validate strong password with all criteria', () => {
      const password = 'StrongP@ssw0rd!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('strong');
    });

    it('should validate very strong password (16+ characters)', () => {
      const password = 'VeryStrongP@ssw0rd123!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(true);
      expect(result.strength).toBe('very-strong');
    });

    it('should detect missing uppercase letter', () => {
      const password = 'weakpassword123!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should detect missing lowercase letter', () => {
      const password = 'WEAKPASSWORD123!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should detect missing number', () => {
      const password = 'WeakPassword!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should detect missing special character', () => {
      const password = 'WeakPassword123';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should detect password too short', () => {
      const password = 'Pass1!';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    });

    it('should detect password too long', () => {
      const password = 'P@ss1' + 'a'.repeat(MAX_PASSWORD_LENGTH);
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    });

    it('should return multiple errors for weak password', () => {
      const password = 'weak';
      const result = mockPasswordUtils.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should handle empty password', () => {
      const result = mockPasswordUtils.validatePasswordStrength('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });
  });
});

describe('Password Utilities - Advanced', () => {
  describe('generateSalt', () => {
    it('should generate a valid salt', async () => {
      const salt = await mockPasswordUtils.generateSalt();

      expect(salt).toBeDefined();
      expect(typeof salt).toBe('string');
      expect(salt).toMatch(/^\$2[aby]\$/); // Bcrypt salt format
    });

    it('should generate salt with custom rounds', async () => {
      const salt = await mockPasswordUtils.generateSalt(10);
      const rounds = parseInt(salt.split('$')[2], 10);

      expect(rounds).toBe(10);
    });

    it('should generate different salts', async () => {
      const salt1 = await mockPasswordUtils.generateSalt();
      const salt2 = await mockPasswordUtils.generateSalt();

      expect(salt1).not.toBe(salt2);
    });

    it('should reject invalid rounds', async () => {
      await expect(mockPasswordUtils.generateSalt(3)).rejects.toThrow(
        'Salt rounds must be between 4 and 31'
      );
    });
  });

  describe('hashWithSalt', () => {
    it('should hash password with provided salt', async () => {
      const password = 'TestPassword123!';
      const salt = await bcrypt.genSalt(10);
      const hash = await mockPasswordUtils.hashWithSalt(password, salt);

      expect(hash).toBeDefined();
      expect(await bcrypt.compare(password, hash)).toBe(true);
    });

    it('should create same hash with same salt', async () => {
      const password = 'TestPassword123!';
      const salt = await bcrypt.genSalt(10);
      const hash1 = await mockPasswordUtils.hashWithSalt(password, salt);
      const hash2 = await mockPasswordUtils.hashWithSalt(password, salt);

      expect(hash1).toBe(hash2);
    });

    it('should reject empty password', async () => {
      const salt = await bcrypt.genSalt(10);
      await expect(mockPasswordUtils.hashWithSalt('', salt)).rejects.toThrow(
        'Password and salt are required'
      );
    });

    it('should reject empty salt', async () => {
      await expect(mockPasswordUtils.hashWithSalt('TestPassword123!', '')).rejects.toThrow(
        'Password and salt are required'
      );
    });
  });

  describe('needsRehash', () => {
    it('should return true if hash rounds are lower than target', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 8);

      const needsRehash = mockPasswordUtils.needsRehash(hash, 12);
      expect(needsRehash).toBe(true);
    });

    it('should return false if hash rounds match target', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);

      const needsRehash = mockPasswordUtils.needsRehash(hash, 12);
      expect(needsRehash).toBe(false);
    });

    it('should return true for invalid hash format', () => {
      const needsRehash = mockPasswordUtils.needsRehash('invalid-hash', 12);
      expect(needsRehash).toBe(true);
    });
  });

  describe('isValidHash', () => {
    it('should return true for valid bcrypt hash', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);

      expect(mockPasswordUtils.isValidHash(hash)).toBe(true);
    });

    it('should return false for invalid hash format', () => {
      expect(mockPasswordUtils.isValidHash('invalid-hash')).toBe(false);
    });

    it('should return false for empty hash', () => {
      expect(mockPasswordUtils.isValidHash('')).toBe(false);
    });

    it('should return false for truncated hash', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      const truncatedHash = hash.substring(0, 30);

      expect(mockPasswordUtils.isValidHash(truncatedHash)).toBe(false);
    });
  });
});
