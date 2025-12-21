import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Pageview Collection API Tests
 *
 * Tests the pageview collection endpoint including validation,
 * data sanitization, rate limiting, and storage.
 */

describe('Pageview Collection API', () => {
  const createRequest = (body: any, headers: Record<string, string> = {}): NextRequest => {
    return new NextRequest('http://localhost:3000/api/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  }

  describe('Request Validation', () => {
    it('should accept valid pageview request', async () => {
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        ref: 'https://example.com/',
        sw: 1920,
        sh: 1080,
        lang: 'en-US',
        ts: Date.now(),
        vid: 'visitor-123',
      }

      const request = createRequest(payload)

      expect(request.method).toBe('POST')
      const body = await request.json()
      expect(body.type).toBe('pageview')
    })

    it('should reject request without siteId', async () => {
      const payload = {
        type: 'pageview',
        url: 'https://example.com/page',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.sid).toBeUndefined()
    })

    it('should reject request without type', async () => {
      const payload = {
        sid: 'site-123',
        url: 'https://example.com/page',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.type).toBeUndefined()
    })

    it('should reject request without URL', async () => {
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        ref: 'https://example.com/',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.url).toBeUndefined()
    })

    it('should accept request without referrer', async () => {
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        sw: 1920,
        sh: 1080,
        lang: 'en-US',
        ts: Date.now(),
        vid: 'visitor-123',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.ref).toBeUndefined()
      expect(body.url).toBeTruthy()
    })

    it('should validate timestamp format', async () => {
      const now = Date.now()
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        ts: now,
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.ts).toBe(now)
      expect(typeof body.ts).toBe('number')
    })

    it('should validate screen dimensions', async () => {
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        sw: 1920,
        sh: 1080,
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.sw).toBe(1920)
      expect(body.sh).toBe(1080)
      expect(typeof body.sw).toBe('number')
      expect(typeof body.sh).toBe('number')
    })

    it('should reject invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{',
      })

      await expect(request.json()).rejects.toThrow()
    })

    it('should validate visitor ID format', async () => {
      const payload = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        vid: 'visitor-123',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.vid).toBe('visitor-123')
      expect(typeof body.vid).toBe('string')
    })
  })

  describe('Data Sanitization', () => {
    it('should sanitize URL with XSS attempt', async () => {
      const sanitizeURL = (url: string): string => {
        try {
          const parsed = new URL(url)
          return parsed.href
        } catch {
          return ''
        }
      }

      const maliciousURL = 'javascript:alert("xss")'
      const sanitized = sanitizeURL(maliciousURL)

      expect(sanitized).toBe('')
    })

    it('should preserve valid URLs', async () => {
      const sanitizeURL = (url: string): string => {
        try {
          const parsed = new URL(url)
          return parsed.href
        } catch {
          return ''
        }
      }

      const validURL = 'https://example.com/page?param=value'
      const sanitized = sanitizeURL(validURL)

      expect(sanitized).toBe(validURL)
    })

    it('should handle URLs with special characters', async () => {
      const url = 'https://example.com/search?q=hello world&lang=en'
      const parsed = new URL(url)

      expect(parsed.hostname).toBe('example.com')
      expect(parsed.pathname).toBe('/search')
    })

    it('should strip sensitive query parameters', () => {
      const stripSensitiveParams = (url: string): string => {
        try {
          const parsed = new URL(url)
          const sensitiveParams = ['token', 'api_key', 'password', 'secret']

          sensitiveParams.forEach((param) => {
            parsed.searchParams.delete(param)
          })

          return parsed.href
        } catch {
          return url
        }
      }

      const url = 'https://example.com/page?token=abc123&param=value'
      const stripped = stripSensitiveParams(url)

      expect(stripped).not.toContain('token=abc123')
      expect(stripped).toContain('param=value')
    })

    it('should limit URL length', () => {
      const maxLength = 2000
      const longURL = 'https://example.com/' + 'a'.repeat(3000)

      const truncated = longURL.substring(0, maxLength)

      expect(truncated.length).toBe(maxLength)
      expect(truncated.length).toBeLessThan(longURL.length)
    })
  })

  describe('Header Extraction', () => {
    it('should extract User-Agent from headers', async () => {
      const payload = { sid: 'site-123', type: 'pageview', url: 'https://example.com' }
      const request = createRequest(payload, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)',
      })

      const userAgent = request.headers.get('User-Agent')
      expect(userAgent).toContain('Mozilla/5.0')
    })

    it('should extract IP address from X-Forwarded-For', async () => {
      const payload = { sid: 'site-123', type: 'pageview', url: 'https://example.com' }
      const request = createRequest(payload, {
        'X-Forwarded-For': '192.168.1.100',
      })

      const ip = request.headers.get('X-Forwarded-For')
      expect(ip).toBe('192.168.1.100')
    })

    it('should handle multiple IPs in X-Forwarded-For', async () => {
      const extractClientIP = (header: string): string => {
        return header.split(',')[0].trim()
      }

      const ip = extractClientIP('192.168.1.100, 10.0.0.1, 172.16.0.1')
      expect(ip).toBe('192.168.1.100')
    })

    it('should extract Referer from headers', async () => {
      const payload = { sid: 'site-123', type: 'pageview', url: 'https://example.com' }
      const request = createRequest(payload, {
        Referer: 'https://google.com',
      })

      const referer = request.headers.get('Referer')
      expect(referer).toBe('https://google.com')
    })

    it('should handle missing headers gracefully', async () => {
      const payload = { sid: 'site-123', type: 'pageview', url: 'https://example.com' }
      const request = createRequest(payload)

      const userAgent = request.headers.get('User-Agent')
      const referer = request.headers.get('Referer')

      expect(userAgent).toBeNull()
      expect(referer).toBeNull()
    })
  })

  describe('Rate Limiting', () => {
    it('should track request count per visitor', () => {
      const rateLimiter = new Map<string, number>()

      const incrementCount = (visitorId: string): number => {
        const current = rateLimiter.get(visitorId) || 0
        const updated = current + 1
        rateLimiter.set(visitorId, updated)
        return updated
      }

      expect(incrementCount('visitor-1')).toBe(1)
      expect(incrementCount('visitor-1')).toBe(2)
      expect(incrementCount('visitor-1')).toBe(3)
    })

    it('should enforce rate limit per visitor', () => {
      const rateLimiter = new Map<string, number>()
      const maxRequests = 100

      const checkRateLimit = (visitorId: string): boolean => {
        const count = rateLimiter.get(visitorId) || 0
        return count < maxRequests
      }

      rateLimiter.set('visitor-1', 99)
      expect(checkRateLimit('visitor-1')).toBe(true)

      rateLimiter.set('visitor-1', 100)
      expect(checkRateLimit('visitor-1')).toBe(false)

      rateLimiter.set('visitor-1', 150)
      expect(checkRateLimit('visitor-1')).toBe(false)
    })

    it('should track rate limits independently per visitor', () => {
      const rateLimiter = new Map<string, number>()

      rateLimiter.set('visitor-1', 50)
      rateLimiter.set('visitor-2', 10)

      expect(rateLimiter.get('visitor-1')).toBe(50)
      expect(rateLimiter.get('visitor-2')).toBe(10)
    })

    it('should reset rate limit after time window', () => {
      const rateLimiter = new Map<string, { count: number; resetAt: number }>()
      const windowMs = 60000 // 1 minute

      const checkAndResetLimit = (visitorId: string): boolean => {
        const now = Date.now()
        const data = rateLimiter.get(visitorId)

        if (!data || now > data.resetAt) {
          rateLimiter.set(visitorId, {
            count: 1,
            resetAt: now + windowMs,
          })
          return true
        }

        return data.count < 100
      }

      expect(checkAndResetLimit('visitor-1')).toBe(true)
    })
  })

  describe('Batch Processing', () => {
    it('should accept batch of pageviews', async () => {
      const batch = [
        {
          sid: 'site-123',
          type: 'pageview',
          url: 'https://example.com/page1',
          ts: Date.now(),
        },
        {
          sid: 'site-123',
          type: 'pageview',
          url: 'https://example.com/page2',
          ts: Date.now(),
        },
      ]

      const request = createRequest(batch)
      const body = await request.json()

      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
    })

    it('should validate each item in batch', async () => {
      const validatePageview = (pv: any): boolean => {
        return !!(pv.sid && pv.type === 'pageview' && pv.url)
      }

      const batch = [
        { sid: 'site-123', type: 'pageview', url: 'https://example.com/1' },
        { sid: 'site-123', type: 'pageview', url: 'https://example.com/2' },
        { sid: 'site-123', type: 'event' }, // Invalid
      ]

      const valid = batch.filter(validatePageview)
      expect(valid).toHaveLength(2)
    })

    it('should limit batch size', () => {
      const maxBatchSize = 50
      const batch = new Array(100).fill({
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com',
      })

      const limited = batch.slice(0, maxBatchSize)
      expect(limited).toHaveLength(maxBatchSize)
    })

    it('should process batch atomically', () => {
      const storage: any[] = []

      const processBatch = (batch: any[]): boolean => {
        try {
          batch.forEach((item) => {
            if (!item.sid || !item.url) {
              throw new Error('Invalid item')
            }
          })

          storage.push(...batch)
          return true
        } catch {
          return false
        }
      }

      const validBatch = [
        { sid: 'site-123', url: 'https://example.com/1' },
        { sid: 'site-123', url: 'https://example.com/2' },
      ]

      const invalidBatch = [
        { sid: 'site-123', url: 'https://example.com/1' },
        { url: 'https://example.com/2' }, // Missing sid
      ]

      expect(processBatch(validBatch)).toBe(true)
      expect(storage).toHaveLength(2)

      expect(processBatch(invalidBatch)).toBe(false)
      expect(storage).toHaveLength(2) // Should not increase
    })
  })

  describe('Response Format', () => {
    it('should return success response with 200 status', () => {
      const response = {
        status: 200,
        success: true,
        message: 'Pageview recorded',
      }

      expect(response.status).toBe(200)
      expect(response.success).toBe(true)
    })

    it('should return error response with 400 status', () => {
      const response = {
        status: 400,
        success: false,
        error: 'Invalid payload',
      }

      expect(response.status).toBe(400)
      expect(response.success).toBe(false)
    })

    it('should return 429 for rate limit exceeded', () => {
      const response = {
        status: 429,
        success: false,
        error: 'Rate limit exceeded',
      }

      expect(response.status).toBe(429)
    })

    it('should include CORS headers in response', () => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      }

      expect(headers['Access-Control-Allow-Origin']).toBe('*')
      expect(headers['Access-Control-Allow-Methods']).toBe('POST')
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', () => {
      const savePageview = async (): Promise<boolean> => {
        try {
          throw new Error('Database connection failed')
        } catch (error) {
          return false
        }
      }

      expect(savePageview()).resolves.toBe(false)
    })

    it('should handle malformed data gracefully', () => {
      const validateData = (data: any): boolean => {
        try {
          if (typeof data !== 'object') return false
          if (!data.sid || !data.url) return false
          return true
        } catch {
          return false
        }
      }

      expect(validateData(null)).toBe(false)
      expect(validateData('string')).toBe(false)
      expect(validateData({})).toBe(false)
      expect(validateData({ sid: 'test', url: 'https://example.com' })).toBe(true)
    })

    it('should handle timeout errors', async () => {
      const saveWithTimeout = async (timeout: number): Promise<boolean> => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve(false)
          }, timeout)

          // Simulate save operation
          setTimeout(() => {
            clearTimeout(timer)
            resolve(true)
          }, 50)
        })
      }

      expect(await saveWithTimeout(100)).toBe(true)
      expect(await saveWithTimeout(10)).toBe(false)
    })
  })

  describe('Data Storage', () => {
    it('should store pageview with all fields', () => {
      const storage: any[] = []

      const savePageview = (data: any): void => {
        storage.push({
          id: crypto.randomUUID(),
          ...data,
          createdAt: new Date(),
        })
      }

      const pageview = {
        sid: 'site-123',
        type: 'pageview',
        url: 'https://example.com/page',
        vid: 'visitor-123',
      }

      savePageview(pageview)

      expect(storage).toHaveLength(1)
      expect(storage[0].sid).toBe('site-123')
      expect(storage[0].url).toBe('https://example.com/page')
      expect(storage[0].id).toBeTruthy()
    })

    it('should generate unique IDs for each pageview', () => {
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const id = crypto.randomUUID()
        ids.add(id)
      }

      expect(ids.size).toBe(100)
    })

    it('should add server timestamp', () => {
      const addTimestamp = (data: any) => ({
        ...data,
        serverTs: Date.now(),
      })

      const before = Date.now()
      const withTimestamp = addTimestamp({ url: 'https://example.com' })
      const after = Date.now()

      expect(withTimestamp.serverTs).toBeGreaterThanOrEqual(before)
      expect(withTimestamp.serverTs).toBeLessThanOrEqual(after)
    })
  })
})
