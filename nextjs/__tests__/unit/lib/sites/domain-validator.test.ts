/**
 * Domain Validator Unit Tests
 * Tests for domain validation and sanitization
 */

import { describe, it, expect } from 'vitest'
import { DomainValidator } from '@/lib/sites/domain-validator'

describe('DomainValidator', () => {
  let validator: DomainValidator

  beforeEach(() => {
    validator = new DomainValidator()
  })

  describe('isValid', () => {
    it('should validate a simple domain', () => {
      expect(validator.isValid('example.com')).toBe(true)
    })

    it('should validate a subdomain', () => {
      expect(validator.isValid('blog.example.com')).toBe(true)
    })

    it('should validate a multi-level subdomain', () => {
      expect(validator.isValid('api.v2.example.com')).toBe(true)
    })

    it('should validate domains with hyphens', () => {
      expect(validator.isValid('my-site.com')).toBe(true)
    })

    it('should validate domains with numbers', () => {
      expect(validator.isValid('site123.com')).toBe(true)
    })

    it('should reject domain without TLD', () => {
      expect(validator.isValid('example')).toBe(false)
    })

    it('should reject domain with spaces', () => {
      expect(validator.isValid('my site.com')).toBe(false)
    })

    it('should reject domain with special characters', () => {
      expect(validator.isValid('my@site.com')).toBe(false)
    })

    it('should reject domain starting with hyphen', () => {
      expect(validator.isValid('-example.com')).toBe(false)
    })

    it('should reject domain ending with hyphen', () => {
      expect(validator.isValid('example-.com')).toBe(false)
    })

    it('should reject empty domain', () => {
      expect(validator.isValid('')).toBe(false)
    })

    it('should reject domain with only TLD', () => {
      expect(validator.isValid('.com')).toBe(false)
    })

    it('should reject IP addresses', () => {
      expect(validator.isValid('192.168.1.1')).toBe(false)
    })

    it('should reject localhost', () => {
      expect(validator.isValid('localhost')).toBe(false)
    })

    it('should validate international domains (IDN)', () => {
      expect(validator.isValid('münchen.de')).toBe(true)
    })
  })

  describe('sanitize', () => {
    it('should remove http:// prefix', () => {
      expect(validator.sanitize('http://example.com')).toBe('example.com')
    })

    it('should remove https:// prefix', () => {
      expect(validator.sanitize('https://example.com')).toBe('example.com')
    })

    it('should remove www. prefix', () => {
      expect(validator.sanitize('www.example.com')).toBe('example.com')
    })

    it('should remove trailing slash', () => {
      expect(validator.sanitize('example.com/')).toBe('example.com')
    })

    it('should remove path', () => {
      expect(validator.sanitize('example.com/path/to/page')).toBe('example.com')
    })

    it('should remove query string', () => {
      expect(validator.sanitize('example.com?query=value')).toBe('example.com')
    })

    it('should remove fragment', () => {
      expect(validator.sanitize('example.com#section')).toBe('example.com')
    })

    it('should remove port number', () => {
      expect(validator.sanitize('example.com:8080')).toBe('example.com')
    })

    it('should convert to lowercase', () => {
      expect(validator.sanitize('EXAMPLE.COM')).toBe('example.com')
    })

    it('should handle complex URL with all components', () => {
      expect(validator.sanitize('https://www.example.com:8080/path?query=1#section')).toBe('example.com')
    })

    it('should trim whitespace', () => {
      expect(validator.sanitize('  example.com  ')).toBe('example.com')
    })

    it('should preserve subdomains', () => {
      expect(validator.sanitize('https://blog.example.com')).toBe('blog.example.com')
    })
  })

  describe('getValidationErrors', () => {
    it('should return no errors for valid domain', () => {
      const errors = validator.getValidationErrors('example.com')
      expect(errors).toHaveLength(0)
    })

    it('should return error for empty domain', () => {
      const errors = validator.getValidationErrors('')
      expect(errors).toContain('Domain cannot be empty')
    })

    it('should return error for invalid characters', () => {
      const errors = validator.getValidationErrors('my@site.com')
      expect(errors).toContain('Domain contains invalid characters')
    })

    it('should return error for missing TLD', () => {
      const errors = validator.getValidationErrors('example')
      expect(errors).toContain('Domain must have a valid TLD')
    })

    it('should return error for domain too long', () => {
      const longDomain = 'a'.repeat(250) + '.com'
      const errors = validator.getValidationErrors(longDomain)
      expect(errors).toContain('Domain is too long (max 253 characters)')
    })

    it('should return multiple errors for invalid domain', () => {
      const errors = validator.getValidationErrors('my@site')
      expect(errors.length).toBeGreaterThan(1)
    })
  })

  describe('normalize', () => {
    it('should normalize domain to lowercase', () => {
      expect(validator.normalize('EXAMPLE.COM')).toBe('example.com')
    })

    it('should remove www prefix during normalization', () => {
      expect(validator.normalize('www.example.com')).toBe('example.com')
    })

    it('should trim whitespace during normalization', () => {
      expect(validator.normalize('  example.com  ')).toBe('example.com')
    })
  })

  describe('extractDomain', () => {
    it('should extract domain from full URL', () => {
      expect(validator.extractDomain('https://example.com/path')).toBe('example.com')
    })

    it('should extract domain from URL with subdomain', () => {
      expect(validator.extractDomain('https://blog.example.com')).toBe('blog.example.com')
    })

    it('should extract domain from URL with port', () => {
      expect(validator.extractDomain('http://example.com:3000')).toBe('example.com')
    })

    it('should return null for invalid URL', () => {
      expect(validator.extractDomain('not-a-url')).toBeNull()
    })
  })

  describe('isSubdomain', () => {
    it('should identify subdomain', () => {
      expect(validator.isSubdomain('blog.example.com')).toBe(true)
    })

    it('should not identify root domain as subdomain', () => {
      expect(validator.isSubdomain('example.com')).toBe(false)
    })

    it('should identify multi-level subdomain', () => {
      expect(validator.isSubdomain('api.v2.example.com')).toBe(true)
    })
  })

  describe('getRootDomain', () => {
    it('should extract root domain from subdomain', () => {
      expect(validator.getRootDomain('blog.example.com')).toBe('example.com')
    })

    it('should return same domain for root domain', () => {
      expect(validator.getRootDomain('example.com')).toBe('example.com')
    })

    it('should extract root domain from multi-level subdomain', () => {
      expect(validator.getRootDomain('api.v2.example.com')).toBe('example.com')
    })
  })
})
