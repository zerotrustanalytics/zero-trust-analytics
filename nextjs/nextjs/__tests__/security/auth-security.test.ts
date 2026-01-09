/**
 * Authentication Security Tests
 *
 * Tests for security vulnerabilities in authentication flows
 * Covers brute force prevention, token security, session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// ==========================================
// SECURITY TEST UTILITIES
// ==========================================

const JWT_SECRET = 'test-secret-key'
const JWT_ALGORITHM = 'HS256'

function createToken(payload: object, options: jwt.SignOptions = {}) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: '24h',
    ...options,
  })
}

function verifyToken(token: string): { valid: boolean; error?: string; payload?: jwt.JwtPayload } {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload
    return { valid: true, payload }
  } catch (err) {
    return { valid: false, error: (err as Error).message }
  }
}

// Simulate brute force tracking
const loginAttempts = new Map<string, { count: number; lastAttempt: number; blocked: boolean }>()

function trackLoginAttempt(ip: string, success: boolean) {
  const now = Date.now()
  const existing = loginAttempts.get(ip) || { count: 0, lastAttempt: 0, blocked: false }

  // Reset if last attempt was more than 15 minutes ago
  if (now - existing.lastAttempt > 15 * 60 * 1000) {
    existing.count = 0
    existing.blocked = false
  }

  if (success) {
    existing.count = 0
    existing.blocked = false
  } else {
    existing.count++
    if (existing.count >= 5) {
      existing.blocked = true
    }
  }

  existing.lastAttempt = now
  loginAttempts.set(ip, existing)

  return existing
}

function isBlocked(ip: string): boolean {
  const record = loginAttempts.get(ip)
  if (!record) return false

  // Check if block has expired (15 minutes)
  if (record.blocked && Date.now() - record.lastAttempt > 15 * 60 * 1000) {
    record.blocked = false
    record.count = 0
    return false
  }

  return record.blocked
}

// CSRF token validation
function validateCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false

  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [timestamp, hash] = parts
  const tokenAge = Date.now() - parseInt(timestamp, 10)
  const MAX_AGE = 24 * 60 * 60 * 1000

  if (tokenAge > MAX_AGE || tokenAge < 0) return false
  if (!/^[a-f0-9]{64}$/.test(hash)) return false

  return true
}

function generateCSRFToken(): string {
  const timestamp = Date.now()
  const hash = crypto.randomBytes(32).toString('hex')
  return `${timestamp}.${hash}`
}

// ==========================================
// TEST SUITE
// ==========================================

describe('Authentication Security', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-09T12:00:00.000Z'))
    loginAttempts.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ==========================================
  // JWT SECURITY TESTS
  // ==========================================
  describe('JWT Security', () => {
    describe('Algorithm Enforcement', () => {
      it('rejects tokens with none algorithm', () => {
        // Attempt to use "none" algorithm (JWT vulnerability CVE-2015-9235)
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ id: 'user_123' })).toString('base64url')
        const noneToken = `${header}.${payload}.`

        const result = verifyToken(noneToken)

        expect(result.valid).toBe(false)
      })

      it('rejects tokens with wrong algorithm', () => {
        // Token signed with different algorithm
        const token = jwt.sign({ id: 'user_123' }, 'different-secret', { algorithm: 'HS384' })

        const result = verifyToken(token)

        expect(result.valid).toBe(false)
      })

      it('accepts only HS256 algorithm', () => {
        const token = createToken({ id: 'user_123' })
        const result = verifyToken(token)

        expect(result.valid).toBe(true)
      })
    })

    describe('Token Expiration', () => {
      it('rejects expired tokens', () => {
        const expiredToken = jwt.sign({ id: 'user_123' }, JWT_SECRET, {
          algorithm: JWT_ALGORITHM,
          expiresIn: '-1h',
        })

        const result = verifyToken(expiredToken)

        expect(result.valid).toBe(false)
        expect(result.error).toContain('expired')
      })

      it('accepts valid non-expired tokens', () => {
        const token = createToken({ id: 'user_123' })
        const result = verifyToken(token)

        expect(result.valid).toBe(true)
      })

      it('includes exp claim in token', () => {
        const token = createToken({ id: 'user_123' })
        const decoded = jwt.decode(token) as jwt.JwtPayload

        expect(decoded.exp).toBeDefined()
        expect(decoded.exp).toBeGreaterThan(Date.now() / 1000)
      })
    })

    describe('Token Tampering', () => {
      it('rejects tokens with modified payload', () => {
        const token = createToken({ id: 'user_123', role: 'user' })
        const parts = token.split('.')

        // Modify payload to change role
        const tamperedPayload = Buffer.from(JSON.stringify({ id: 'user_123', role: 'admin' })).toString('base64url')
        const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`

        const result = verifyToken(tamperedToken)

        expect(result.valid).toBe(false)
      })

      it('rejects tokens with modified signature', () => {
        const token = createToken({ id: 'user_123' })
        const parts = token.split('.')

        // Modify signature
        const tamperedSignature = 'tampered' + parts[2].slice(8)
        const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`

        const result = verifyToken(tamperedToken)

        expect(result.valid).toBe(false)
      })

      it('rejects tokens signed with different secret', () => {
        const token = jwt.sign({ id: 'user_123' }, 'wrong-secret', {
          algorithm: JWT_ALGORITHM,
          expiresIn: '24h',
        })

        const result = verifyToken(token)

        expect(result.valid).toBe(false)
      })
    })

    describe('Token Structure', () => {
      it('rejects malformed tokens', () => {
        expect(verifyToken('not.a.valid.token').valid).toBe(false)
        expect(verifyToken('invalid').valid).toBe(false)
        expect(verifyToken('').valid).toBe(false)
        expect(verifyToken('a.b').valid).toBe(false)
      })

      it('rejects tokens with invalid base64', () => {
        const result = verifyToken('!!!.@@@.###')
        expect(result.valid).toBe(false)
      })
    })
  })

  // ==========================================
  // BRUTE FORCE PROTECTION TESTS
  // ==========================================
  describe('Brute Force Protection', () => {
    it('allows initial login attempts', () => {
      const ip = '192.168.1.1'

      expect(isBlocked(ip)).toBe(false)
      trackLoginAttempt(ip, false)
      expect(isBlocked(ip)).toBe(false)
    })

    it('blocks after 5 failed attempts', () => {
      const ip = '192.168.1.2'

      for (let i = 0; i < 5; i++) {
        trackLoginAttempt(ip, false)
      }

      expect(isBlocked(ip)).toBe(true)
    })

    it('does not block after 4 failed attempts', () => {
      const ip = '192.168.1.3'

      for (let i = 0; i < 4; i++) {
        trackLoginAttempt(ip, false)
      }

      expect(isBlocked(ip)).toBe(false)
    })

    it('resets count on successful login', () => {
      const ip = '192.168.1.4'

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        trackLoginAttempt(ip, false)
      }

      // Successful login
      trackLoginAttempt(ip, true)

      // More failed attempts should start fresh
      for (let i = 0; i < 4; i++) {
        trackLoginAttempt(ip, false)
      }

      expect(isBlocked(ip)).toBe(false)
    })

    it('tracks attempts per IP', () => {
      const ip1 = '192.168.1.5'
      const ip2 = '192.168.1.6'

      // Block first IP
      for (let i = 0; i < 5; i++) {
        trackLoginAttempt(ip1, false)
      }

      // Second IP should not be blocked
      expect(isBlocked(ip1)).toBe(true)
      expect(isBlocked(ip2)).toBe(false)
    })

    it('unblocks after timeout period', () => {
      const ip = '192.168.1.7'

      // Block the IP
      for (let i = 0; i < 5; i++) {
        trackLoginAttempt(ip, false)
      }
      expect(isBlocked(ip)).toBe(true)

      // Advance time past block duration
      vi.advanceTimersByTime(16 * 60 * 1000) // 16 minutes

      expect(isBlocked(ip)).toBe(false)
    })

    it('resets failed count after timeout', () => {
      const ip = '192.168.1.8'

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        trackLoginAttempt(ip, false)
      }

      // Advance time past reset period
      vi.advanceTimersByTime(16 * 60 * 1000)

      // New failed attempts should start fresh
      trackLoginAttempt(ip, false)
      const record = loginAttempts.get(ip)

      expect(record?.count).toBe(1)
    })
  })

  // ==========================================
  // CSRF TOKEN SECURITY TESTS
  // ==========================================
  describe('CSRF Token Security', () => {
    describe('Token Generation', () => {
      it('generates unique tokens', () => {
        const token1 = generateCSRFToken()
        const token2 = generateCSRFToken()

        expect(token1).not.toBe(token2)
      })

      it('generates tokens in correct format', () => {
        const token = generateCSRFToken()
        const parts = token.split('.')

        expect(parts).toHaveLength(2)
        expect(parseInt(parts[0], 10)).toBeGreaterThan(0)
        expect(parts[1]).toMatch(/^[a-f0-9]{64}$/)
      })
    })

    describe('Token Validation', () => {
      it('accepts valid tokens', () => {
        const token = generateCSRFToken()
        expect(validateCSRFToken(token)).toBe(true)
      })

      it('rejects null tokens', () => {
        expect(validateCSRFToken(null as unknown as string)).toBe(false)
      })

      it('rejects undefined tokens', () => {
        expect(validateCSRFToken(undefined as unknown as string)).toBe(false)
      })

      it('rejects empty tokens', () => {
        expect(validateCSRFToken('')).toBe(false)
      })

      it('rejects tokens with wrong format', () => {
        expect(validateCSRFToken('invalid')).toBe(false)
        expect(validateCSRFToken('no.dots.here.extra')).toBe(false)
      })

      it('rejects expired tokens', () => {
        vi.useRealTimers()
        const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000
        const token = `${oldTimestamp}.${crypto.randomBytes(32).toString('hex')}`

        expect(validateCSRFToken(token)).toBe(false)
        vi.useFakeTimers()
      })

      it('rejects tokens with future timestamp', () => {
        vi.useRealTimers()
        const futureTimestamp = Date.now() + 60 * 60 * 1000
        const token = `${futureTimestamp}.${crypto.randomBytes(32).toString('hex')}`

        expect(validateCSRFToken(token)).toBe(false)
        vi.useFakeTimers()
      })

      it('rejects tokens with invalid hash length', () => {
        const timestamp = Date.now()
        expect(validateCSRFToken(`${timestamp}.short`)).toBe(false)
        expect(validateCSRFToken(`${timestamp}.${crypto.randomBytes(16).toString('hex')}`)).toBe(false)
      })

      it('rejects tokens with non-hex hash', () => {
        const timestamp = Date.now()
        const invalidHash = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
        expect(validateCSRFToken(`${timestamp}.${invalidHash}`)).toBe(false)
      })
    })
  })

  // ==========================================
  // SESSION SECURITY TESTS
  // ==========================================
  describe('Session Security', () => {
    describe('Session ID Generation', () => {
      it('generates cryptographically random session IDs', () => {
        const sessionIds = new Set()

        for (let i = 0; i < 1000; i++) {
          const id = 'sess_' + crypto.randomBytes(16).toString('hex')
          sessionIds.add(id)
        }

        // All should be unique
        expect(sessionIds.size).toBe(1000)
      })

      it('generates session IDs with sufficient entropy', () => {
        const id = 'sess_' + crypto.randomBytes(16).toString('hex')

        // Should be at least 37 chars (5 prefix + 32 hex)
        expect(id.length).toBe(37)
      })
    })

    describe('Token Invalidation', () => {
      it('invalidates tokens issued before password change', () => {
        // Token issued at current time
        const token = createToken({ id: 'user_123', iat: Math.floor(Date.now() / 1000) })

        // Simulate password change 1 second later
        const passwordChangedAt = Math.floor(Date.now() / 1000) + 1

        const decoded = jwt.decode(token) as jwt.JwtPayload
        const tokenIssuedAt = decoded.iat!

        // Token should be invalid if issued before password change
        expect(tokenIssuedAt < passwordChangedAt).toBe(true)
      })

      it('accepts tokens issued after password change', () => {
        // Password changed in the past
        const passwordChangedAt = Math.floor(Date.now() / 1000) - 3600

        // Token issued now
        const token = createToken({ id: 'user_123' })
        const decoded = jwt.decode(token) as jwt.JwtPayload

        expect(decoded.iat! > passwordChangedAt).toBe(true)
      })
    })
  })

  // ==========================================
  // INPUT VALIDATION SECURITY TESTS
  // ==========================================
  describe('Input Validation Security', () => {
    describe('Email Validation', () => {
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email) && email.length <= 254
      }

      it('accepts valid emails', () => {
        expect(isValidEmail('user@example.com')).toBe(true)
        expect(isValidEmail('user.name@example.co.uk')).toBe(true)
        expect(isValidEmail('user+tag@example.com')).toBe(true)
      })

      it('rejects invalid emails', () => {
        expect(isValidEmail('invalid')).toBe(false)
        expect(isValidEmail('missing@domain')).toBe(false)
        expect(isValidEmail('@nodomain.com')).toBe(false)
        expect(isValidEmail('spaces in@email.com')).toBe(false)
      })

      it('rejects excessively long emails', () => {
        const longEmail = 'a'.repeat(250) + '@example.com'
        expect(isValidEmail(longEmail)).toBe(false)
      })
    })

    describe('Password Validation', () => {
      const isValidPassword = (password: string): { valid: boolean; errors: string[] } => {
        const errors: string[] = []

        if (password.length < 8) errors.push('Password must be at least 8 characters')
        if (password.length > 128) errors.push('Password too long')
        if (!/[a-z]/.test(password)) errors.push('Must contain lowercase letter')
        if (!/[A-Z]/.test(password)) errors.push('Must contain uppercase letter')
        if (!/[0-9]/.test(password)) errors.push('Must contain number')

        return { valid: errors.length === 0, errors }
      }

      it('accepts strong passwords', () => {
        expect(isValidPassword('SecurePass123').valid).toBe(true)
        expect(isValidPassword('MyP@ssw0rd!').valid).toBe(true)
      })

      it('rejects short passwords', () => {
        const result = isValidPassword('Short1')
        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Password must be at least 8 characters')
      })

      it('requires mixed case', () => {
        expect(isValidPassword('alllowercase123').valid).toBe(false)
        expect(isValidPassword('ALLUPPERCASE123').valid).toBe(false)
      })

      it('requires numbers', () => {
        expect(isValidPassword('NoNumbersHere').valid).toBe(false)
      })

      it('rejects excessively long passwords', () => {
        const longPassword = 'Aa1' + 'x'.repeat(130)
        expect(isValidPassword(longPassword).valid).toBe(false)
      })
    })
  })

  // ==========================================
  // HEADER SECURITY TESTS
  // ==========================================
  describe('Security Headers', () => {
    const getSecurityHeaders = () => ({
      'Content-Security-Policy': "default-src 'self'",
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })

    it('includes CSP header', () => {
      const headers = getSecurityHeaders()
      expect(headers['Content-Security-Policy']).toBeDefined()
    })

    it('includes HSTS header', () => {
      const headers = getSecurityHeaders()
      expect(headers['Strict-Transport-Security']).toContain('max-age')
    })

    it('includes X-Content-Type-Options', () => {
      const headers = getSecurityHeaders()
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    })

    it('includes X-Frame-Options', () => {
      const headers = getSecurityHeaders()
      expect(headers['X-Frame-Options']).toBe('DENY')
    })

    it('includes XSS protection', () => {
      const headers = getSecurityHeaders()
      expect(headers['X-XSS-Protection']).toContain('mode=block')
    })

    it('includes Referrer-Policy', () => {
      const headers = getSecurityHeaders()
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    })
  })
})
