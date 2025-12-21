import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHash, randomBytes } from 'crypto'

/**
 * Visitor Hash Tests
 * Tests for privacy-preserving visitor ID hashing
 * Uses cryptographic hashing to create anonymous visitor identifiers
 */

interface VisitorData {
  ipAddress?: string
  userAgent?: string
  timestamp?: Date
  salt?: string
}

interface HashedVisitor {
  visitorId: string
  hashedAt: Date
  expiresAt?: Date
}

interface HashConfig {
  algorithm: 'sha256' | 'sha512' | 'md5'
  includeTimestamp: boolean
  rotationPeriod?: number // in days
  pepper?: string
}

// TDD: Implementation will follow these tests
class VisitorHasher {
  private pepper: string
  private algorithm: string
  private rotationPeriod: number

  constructor(config: Partial<HashConfig> = {}) {
    this.algorithm = config.algorithm || 'sha256'
    this.rotationPeriod = config.rotationPeriod || 30
    this.pepper = config.pepper || process.env.HASH_SECRET || 'default-pepper'
  }

  /**
   * Generate a hashed visitor ID from visitor data
   */
  generateVisitorId(data: VisitorData): string {
    const components: string[] = []

    if (data.ipAddress) {
      components.push(this.normalizeIp(data.ipAddress))
    }

    if (data.userAgent) {
      components.push(this.normalizeUserAgent(data.userAgent))
    }

    if (data.timestamp) {
      const rotationKey = this.getRotationKey(data.timestamp)
      components.push(rotationKey)
    }

    if (data.salt) {
      components.push(data.salt)
    }

    components.push(this.pepper)

    const input = components.join('::')
    return this.hash(input)
  }

  /**
   * Hash a string using configured algorithm
   */
  private hash(input: string): string {
    return createHash(this.algorithm).update(input).digest('hex')
  }

  /**
   * Normalize IP address (remove last octet for privacy)
   */
  private normalizeIp(ip: string): string {
    // IPv4
    if (ip.includes('.')) {
      const parts = ip.split('.')
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`
    }

    // IPv6 - use first 64 bits
    if (ip.includes(':')) {
      const parts = ip.split(':')
      return parts.slice(0, 4).join(':') + '::0'
    }

    return ip
  }

  /**
   * Normalize user agent (extract major version only)
   */
  private normalizeUserAgent(ua: string): string {
    // Remove specific version numbers
    return ua
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X')
      .replace(/\d+\.\d+/g, 'X.X')
      .toLowerCase()
  }

  /**
   * Get rotation key based on date and rotation period
   */
  private getRotationKey(date: Date): string {
    const daysSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60 * 24))
    const rotationBucket = Math.floor(daysSinceEpoch / this.rotationPeriod)
    return `rotation-${rotationBucket}`
  }

  /**
   * Generate a hashed visitor with metadata
   */
  generateHashedVisitor(data: VisitorData): HashedVisitor {
    const visitorId = this.generateVisitorId(data)
    const hashedAt = new Date()
    const expiresAt = new Date(hashedAt.getTime() + this.rotationPeriod * 24 * 60 * 60 * 1000)

    return {
      visitorId,
      hashedAt,
      expiresAt
    }
  }

  /**
   * Validate visitor ID format
   */
  isValidVisitorId(visitorId: string): boolean {
    const hexRegex = /^[a-f0-9]+$/i
    const expectedLength = this.algorithm === 'sha256' ? 64 : this.algorithm === 'sha512' ? 128 : 32
    return hexRegex.test(visitorId) && visitorId.length === expectedLength
  }

  /**
   * Generate random salt
   */
  generateSalt(length: number = 16): string {
    return randomBytes(length).toString('hex')
  }

  /**
   * Check if two visitor IDs match
   */
  compareVisitorIds(id1: string, id2: string): boolean {
    return id1.toLowerCase() === id2.toLowerCase()
  }

  /**
   * Anonymize IP address only
   */
  anonymizeIp(ip: string): string {
    return this.hash(this.normalizeIp(ip) + this.pepper)
  }

  /**
   * Hash user agent only
   */
  hashUserAgent(userAgent: string): string {
    return this.hash(this.normalizeUserAgent(userAgent) + this.pepper)
  }

  /**
   * Generate visitor ID with custom rotation
   */
  generateWithCustomRotation(data: VisitorData, rotationDays: number): string {
    const originalRotation = this.rotationPeriod
    this.rotationPeriod = rotationDays
    const result = this.generateVisitorId(data)
    this.rotationPeriod = originalRotation
    return result
  }

  /**
   * Verify visitor ID hasn't expired
   */
  isVisitorIdValid(hashedVisitor: HashedVisitor): boolean {
    if (!hashedVisitor.expiresAt) return true
    return new Date() < hashedVisitor.expiresAt
  }

  /**
   * Get visitor ID age in days
   */
  getVisitorIdAge(hashedVisitor: HashedVisitor): number {
    const now = new Date()
    const ageMs = now.getTime() - hashedVisitor.hashedAt.getTime()
    return Math.floor(ageMs / (1000 * 60 * 60 * 24))
  }

  /**
   * Batch hash multiple visitor data entries
   */
  batchGenerateVisitorIds(dataList: VisitorData[]): string[] {
    return dataList.map(data => this.generateVisitorId(data))
  }

  /**
   * Generate deterministic visitor ID (same input = same output)
   */
  generateDeterministicId(data: VisitorData): string {
    // Remove timestamp for deterministic results
    const deterministicData = { ...data }
    delete deterministicData.timestamp
    return this.generateVisitorId(deterministicData)
  }

  /**
   * Get hash algorithm info
   */
  getAlgorithmInfo(): { algorithm: string; outputLength: number } {
    const lengths: Record<string, number> = {
      sha256: 64,
      sha512: 128,
      md5: 32
    }

    return {
      algorithm: this.algorithm,
      outputLength: lengths[this.algorithm] || 0
    }
  }
}

describe('VisitorHasher', () => {
  let hasher: VisitorHasher
  let sampleData: VisitorData

  beforeEach(() => {
    hasher = new VisitorHasher({
      algorithm: 'sha256',
      pepper: 'test-pepper-secret'
    })

    sampleData = {
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      timestamp: new Date('2024-01-01T10:00:00Z')
    }
  })

  describe('Basic Hashing', () => {
    it('should generate a visitor ID from visitor data', () => {
      const visitorId = hasher.generateVisitorId(sampleData)

      expect(visitorId).toBeDefined()
      expect(typeof visitorId).toBe('string')
      expect(visitorId.length).toBe(64) // SHA-256 produces 64 hex chars
    })

    it('should generate consistent IDs for same input', () => {
      const id1 = hasher.generateVisitorId(sampleData)
      const id2 = hasher.generateVisitorId(sampleData)

      expect(id1).toBe(id2)
    })

    it('should generate different IDs for different inputs', () => {
      const data2 = { ...sampleData, ipAddress: '192.168.1.101' }

      const id1 = hasher.generateVisitorId(sampleData)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).not.toBe(id2)
    })

    it('should handle missing IP address', () => {
      const data = { userAgent: sampleData.userAgent }
      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
      expect(visitorId.length).toBe(64)
    })

    it('should handle missing user agent', () => {
      const data = { ipAddress: sampleData.ipAddress }
      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
      expect(visitorId.length).toBe(64)
    })

    it('should handle empty visitor data', () => {
      const visitorId = hasher.generateVisitorId({})

      expect(visitorId).toBeDefined()
      expect(visitorId.length).toBe(64)
    })
  })

  describe('IP Address Normalization', () => {
    it('should normalize IPv4 addresses', () => {
      const data1 = { ...sampleData, ipAddress: '192.168.1.100' }
      const data2 = { ...sampleData, ipAddress: '192.168.1.200' }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).toBe(id2) // Last octet is removed, so IDs should match
    })

    it('should handle IPv6 addresses', () => {
      const data = {
        ...sampleData,
        ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
      }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })

    it('should normalize IPv6 addresses for privacy', () => {
      const data1 = {
        ...sampleData,
        ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
      }
      const data2 = {
        ...sampleData,
        ipAddress: '2001:0db8:85a3:0000:1111:8a2e:0370:7335'
      }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).toBe(id2) // Last 64 bits removed
    })
  })

  describe('User Agent Normalization', () => {
    it('should normalize user agent version numbers', () => {
      const data1 = {
        ...sampleData,
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0'
      }
      const data2 = {
        ...sampleData,
        userAgent: 'Mozilla/5.0 Chrome/120.1.5.2'
      }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).toBe(id2) // Version numbers normalized
    })

    it('should handle Safari user agent', () => {
      const data = {
        ...sampleData,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'
      }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })

    it('should handle Firefox user agent', () => {
      const data = {
        ...sampleData,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Firefox/121.0'
      }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })
  })

  describe('Hash Algorithms', () => {
    it('should support SHA-256 algorithm', () => {
      const sha256Hasher = new VisitorHasher({ algorithm: 'sha256' })
      const visitorId = sha256Hasher.generateVisitorId(sampleData)

      expect(visitorId.length).toBe(64)
    })

    it('should support SHA-512 algorithm', () => {
      const sha512Hasher = new VisitorHasher({ algorithm: 'sha512' })
      const visitorId = sha512Hasher.generateVisitorId(sampleData)

      expect(visitorId.length).toBe(128)
    })

    it('should support MD5 algorithm', () => {
      const md5Hasher = new VisitorHasher({ algorithm: 'md5' })
      const visitorId = md5Hasher.generateVisitorId(sampleData)

      expect(visitorId.length).toBe(32)
    })

    it('should produce different hashes for different algorithms', () => {
      const sha256Hasher = new VisitorHasher({ algorithm: 'sha256' })
      const sha512Hasher = new VisitorHasher({ algorithm: 'sha512' })

      const id1 = sha256Hasher.generateVisitorId(sampleData)
      const id2 = sha512Hasher.generateVisitorId(sampleData)

      expect(id1).not.toBe(id2)
    })

    it('should get algorithm info', () => {
      const info = hasher.getAlgorithmInfo()

      expect(info.algorithm).toBe('sha256')
      expect(info.outputLength).toBe(64)
    })
  })

  describe('Salt Handling', () => {
    it('should use salt when provided', () => {
      const data1 = { ...sampleData, salt: 'salt1' }
      const data2 = { ...sampleData, salt: 'salt2' }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).not.toBe(id2)
    })

    it('should generate random salt', () => {
      const salt1 = hasher.generateSalt()
      const salt2 = hasher.generateSalt()

      expect(salt1).not.toBe(salt2)
      expect(salt1.length).toBe(32) // 16 bytes = 32 hex chars
    })

    it('should generate salt with custom length', () => {
      const salt = hasher.generateSalt(32)

      expect(salt.length).toBe(64) // 32 bytes = 64 hex chars
    })

    it('should produce consistent hashes with same salt', () => {
      const data = { ...sampleData, salt: 'consistent-salt' }

      const id1 = hasher.generateVisitorId(data)
      const id2 = hasher.generateVisitorId(data)

      expect(id1).toBe(id2)
    })
  })

  describe('Rotation Keys', () => {
    it('should generate same ID for dates within rotation period', () => {
      const data1 = { ...sampleData, timestamp: new Date('2024-01-01') }
      const data2 = { ...sampleData, timestamp: new Date('2024-01-15') }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).toBe(id2) // Both within 30-day rotation
    })

    it('should generate different IDs for dates in different rotation periods', () => {
      const data1 = { ...sampleData, timestamp: new Date('2024-01-01') }
      const data2 = { ...sampleData, timestamp: new Date('2024-03-01') }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      expect(id1).not.toBe(id2) // Different 30-day buckets
    })

    it('should support custom rotation period', () => {
      const data = { ...sampleData, timestamp: new Date('2024-01-01') }

      const id1 = hasher.generateWithCustomRotation(data, 7)
      const id2 = hasher.generateWithCustomRotation(data, 30)

      expect(id1).not.toBe(id2)
    })
  })

  describe('Hashed Visitor Object', () => {
    it('should generate hashed visitor with metadata', () => {
      const hashedVisitor = hasher.generateHashedVisitor(sampleData)

      expect(hashedVisitor.visitorId).toBeDefined()
      expect(hashedVisitor.hashedAt).toBeInstanceOf(Date)
      expect(hashedVisitor.expiresAt).toBeInstanceOf(Date)
    })

    it('should set expiration date correctly', () => {
      const hashedVisitor = hasher.generateHashedVisitor(sampleData)

      const expectedExpiration = new Date(hashedVisitor.hashedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
      const timeDiff = Math.abs(hashedVisitor.expiresAt!.getTime() - expectedExpiration.getTime())

      expect(timeDiff).toBeLessThan(1000) // Within 1 second
    })

    it('should validate non-expired visitor ID', () => {
      const hashedVisitor = hasher.generateHashedVisitor(sampleData)
      const isValid = hasher.isVisitorIdValid(hashedVisitor)

      expect(isValid).toBe(true)
    })

    it('should detect expired visitor ID', () => {
      const hashedVisitor = hasher.generateHashedVisitor(sampleData)
      hashedVisitor.expiresAt = new Date('2020-01-01')

      const isValid = hasher.isVisitorIdValid(hashedVisitor)

      expect(isValid).toBe(false)
    })

    it('should calculate visitor ID age', () => {
      const hashedVisitor = hasher.generateHashedVisitor(sampleData)
      hashedVisitor.hashedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago

      const age = hasher.getVisitorIdAge(hashedVisitor)

      expect(age).toBe(5)
    })
  })

  describe('Validation', () => {
    it('should validate correct visitor ID format', () => {
      const visitorId = hasher.generateVisitorId(sampleData)
      const isValid = hasher.isValidVisitorId(visitorId)

      expect(isValid).toBe(true)
    })

    it('should reject invalid hex characters', () => {
      const isValid = hasher.isValidVisitorId('zzz123')

      expect(isValid).toBe(false)
    })

    it('should reject incorrect length', () => {
      const isValid = hasher.isValidVisitorId('abc123')

      expect(isValid).toBe(false)
    })

    it('should accept uppercase hex', () => {
      const visitorId = hasher.generateVisitorId(sampleData).toUpperCase()
      const isValid = hasher.isValidVisitorId(visitorId)

      expect(isValid).toBe(true)
    })
  })

  describe('Comparison', () => {
    it('should compare visitor IDs correctly', () => {
      const id1 = hasher.generateVisitorId(sampleData)
      const id2 = hasher.generateVisitorId(sampleData)

      const isMatch = hasher.compareVisitorIds(id1, id2)

      expect(isMatch).toBe(true)
    })

    it('should handle case-insensitive comparison', () => {
      const id = hasher.generateVisitorId(sampleData)
      const id1 = id.toLowerCase()
      const id2 = id.toUpperCase()

      const isMatch = hasher.compareVisitorIds(id1, id2)

      expect(isMatch).toBe(true)
    })

    it('should detect non-matching IDs', () => {
      const data1 = sampleData
      const data2 = { ...sampleData, ipAddress: '10.0.0.1' }

      const id1 = hasher.generateVisitorId(data1)
      const id2 = hasher.generateVisitorId(data2)

      const isMatch = hasher.compareVisitorIds(id1, id2)

      expect(isMatch).toBe(false)
    })
  })

  describe('Anonymization', () => {
    it('should anonymize IP address only', () => {
      const anonymizedIp = hasher.anonymizeIp('192.168.1.100')

      expect(anonymizedIp).toBeDefined()
      expect(anonymizedIp.length).toBe(64)
    })

    it('should produce same hash for IPs in same subnet', () => {
      const hash1 = hasher.anonymizeIp('192.168.1.100')
      const hash2 = hasher.anonymizeIp('192.168.1.200')

      expect(hash1).toBe(hash2)
    })

    it('should hash user agent independently', () => {
      const hashedUA = hasher.hashUserAgent(sampleData.userAgent!)

      expect(hashedUA).toBeDefined()
      expect(hashedUA.length).toBe(64)
    })
  })

  describe('Batch Operations', () => {
    it('should batch generate visitor IDs', () => {
      const dataList: VisitorData[] = [
        { ...sampleData, ipAddress: '192.168.1.1' },
        { ...sampleData, ipAddress: '192.168.1.2' },
        { ...sampleData, ipAddress: '192.168.1.3' }
      ]

      const visitorIds = hasher.batchGenerateVisitorIds(dataList)

      expect(visitorIds).toHaveLength(3)
      expect(visitorIds[0]).toBeDefined()
    })

    it('should handle empty batch', () => {
      const visitorIds = hasher.batchGenerateVisitorIds([])

      expect(visitorIds).toHaveLength(0)
    })

    it('should generate unique IDs in batch', () => {
      const dataList: VisitorData[] = [
        { ...sampleData, ipAddress: '192.168.1.1' },
        { ...sampleData, ipAddress: '10.0.0.1' }
      ]

      const visitorIds = hasher.batchGenerateVisitorIds(dataList)
      const uniqueIds = new Set(visitorIds)

      expect(uniqueIds.size).toBe(2)
    })
  })

  describe('Deterministic Hashing', () => {
    it('should generate deterministic IDs', () => {
      const id1 = hasher.generateDeterministicId(sampleData)
      const id2 = hasher.generateDeterministicId(sampleData)

      expect(id1).toBe(id2)
    })

    it('should ignore timestamp in deterministic mode', () => {
      const data1 = { ...sampleData, timestamp: new Date('2024-01-01') }
      const data2 = { ...sampleData, timestamp: new Date('2024-12-31') }

      const id1 = hasher.generateDeterministicId(data1)
      const id2 = hasher.generateDeterministicId(data2)

      expect(id1).toBe(id2)
    })
  })

  describe('Pepper Security', () => {
    it('should use pepper in hash generation', () => {
      const hasher1 = new VisitorHasher({ pepper: 'pepper1' })
      const hasher2 = new VisitorHasher({ pepper: 'pepper2' })

      const id1 = hasher1.generateVisitorId(sampleData)
      const id2 = hasher2.generateVisitorId(sampleData)

      expect(id1).not.toBe(id2)
    })

    it('should use environment variable for pepper', () => {
      process.env.HASH_SECRET = 'env-pepper'
      const envHasher = new VisitorHasher()

      const visitorId = envHasher.generateVisitorId(sampleData)

      expect(visitorId).toBeDefined()
    })

    it('should fall back to default pepper', () => {
      delete process.env.HASH_SECRET
      const defaultHasher = new VisitorHasher()

      const visitorId = defaultHasher.generateVisitorId(sampleData)

      expect(visitorId).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long user agent strings', () => {
      const longUA = 'A'.repeat(1000)
      const data = { ...sampleData, userAgent: longUA }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
      expect(visitorId.length).toBe(64)
    })

    it('should handle special characters in user agent', () => {
      const data = {
        ...sampleData,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) "Special\'Chars"'
      }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })

    it('should handle localhost IP addresses', () => {
      const data = { ...sampleData, ipAddress: '127.0.0.1' }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })

    it('should handle private network IPs', () => {
      const data = { ...sampleData, ipAddress: '10.0.0.1' }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })

    it('should handle null values gracefully', () => {
      const data: VisitorData = {
        ipAddress: undefined,
        userAgent: undefined
      }

      const visitorId = hasher.generateVisitorId(data)

      expect(visitorId).toBeDefined()
    })
  })

  describe('Performance', () => {
    it('should hash large batches efficiently', () => {
      const dataList: VisitorData[] = Array.from({ length: 1000 }, (_, i) => ({
        ...sampleData,
        ipAddress: `192.168.1.${i % 255}`
      }))

      const startTime = Date.now()
      const visitorIds = hasher.batchGenerateVisitorIds(dataList)
      const endTime = Date.now()

      expect(visitorIds).toHaveLength(1000)
      expect(endTime - startTime).toBeLessThan(1000) // Should complete in < 1 second
    })

    it('should handle concurrent hash generation', async () => {
      const promises = Array.from({ length: 100 }, () =>
        Promise.resolve(hasher.generateVisitorId(sampleData))
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(100)
      expect(new Set(results).size).toBe(1) // All should be the same
    })
  })

  describe('Security Considerations', () => {
    it('should not expose original IP in hash', () => {
      const visitorId = hasher.generateVisitorId(sampleData)

      expect(visitorId).not.toContain('192')
      expect(visitorId).not.toContain('168')
    })

    it('should not expose user agent in hash', () => {
      const visitorId = hasher.generateVisitorId(sampleData)

      expect(visitorId.toLowerCase()).not.toContain('chrome')
      expect(visitorId.toLowerCase()).not.toContain('mozilla')
    })

    it('should produce cryptographically secure hashes', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        const data = { ...sampleData, salt: hasher.generateSalt() }
        ids.add(hasher.generateVisitorId(data))
      }

      // All hashes should be unique
      expect(ids.size).toBe(1000)
    })
  })
})
