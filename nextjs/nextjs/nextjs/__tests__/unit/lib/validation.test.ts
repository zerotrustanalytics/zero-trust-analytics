import { describe, it, expect } from 'vitest'

// Validation utility functions
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const isValidDomain = (domain: string): boolean => {
  const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z]{2,})+$/
  return domainRegex.test(domain)
}

const isStrongPassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  return { valid: errors.length === 0, errors }
}

const sanitizeInput = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}

const isValidSiteId = (siteId: string): boolean => {
  // Site IDs should be alphanumeric with underscores, 3-50 chars
  return /^[a-zA-Z0-9_]{3,50}$/.test(siteId)
}

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('validates correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
      expect(isValidEmail('user+tag@example.com')).toBe(true)
    })

    it('rejects invalid emails', () => {
      expect(isValidEmail('notanemail')).toBe(false)
      expect(isValidEmail('@example.com')).toBe(false)
      expect(isValidEmail('test@')).toBe(false)
      expect(isValidEmail('test @example.com')).toBe(false)
      expect(isValidEmail('')).toBe(false)
    })
  })

  describe('isValidDomain', () => {
    it('validates correct domains', () => {
      expect(isValidDomain('example.com')).toBe(true)
      expect(isValidDomain('sub.example.com')).toBe(true)
      expect(isValidDomain('my-site.co.uk')).toBe(true)
    })

    it('rejects invalid domains', () => {
      expect(isValidDomain('http://example.com')).toBe(false)
      expect(isValidDomain('example')).toBe(false)
      expect(isValidDomain('-example.com')).toBe(false)
      expect(isValidDomain('example-.com')).toBe(false)
      expect(isValidDomain('')).toBe(false)
    })
  })

  describe('isStrongPassword', () => {
    it('validates strong passwords', () => {
      const result = isStrongPassword('SecurePass123')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects short passwords', () => {
      const result = isStrongPassword('Short1')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must be at least 8 characters')
    })

    it('requires uppercase letters', () => {
      const result = isStrongPassword('lowercase123')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one uppercase letter')
    })

    it('requires lowercase letters', () => {
      const result = isStrongPassword('UPPERCASE123')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one lowercase letter')
    })

    it('requires numbers', () => {
      const result = isStrongPassword('NoNumbers!')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one number')
    })

    it('returns multiple errors for weak passwords', () => {
      const result = isStrongPassword('weak')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })

  describe('sanitizeInput', () => {
    it('escapes HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      )
    })

    it('escapes quotes', () => {
      expect(sanitizeInput('test"quote\'here')).toBe('test&quot;quote&#x27;here')
    })

    it('trims whitespace', () => {
      expect(sanitizeInput('  test  ')).toBe('test')
    })

    it('handles empty strings', () => {
      expect(sanitizeInput('')).toBe('')
    })
  })

  describe('isValidSiteId', () => {
    it('validates correct site IDs', () => {
      expect(isValidSiteId('site_123')).toBe(true)
      expect(isValidSiteId('my_site')).toBe(true)
      expect(isValidSiteId('SITE123')).toBe(true)
    })

    it('rejects invalid site IDs', () => {
      expect(isValidSiteId('ab')).toBe(false) // too short
      expect(isValidSiteId('site-123')).toBe(false) // has dash
      expect(isValidSiteId('site 123')).toBe(false) // has space
      expect(isValidSiteId('')).toBe(false)
    })
  })
})
