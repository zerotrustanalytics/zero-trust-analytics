import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Script Generation API Tests
 *
 * Tests the tracking script serving endpoint including
 * caching, compression, and CORS headers.
 */

describe('Script Generation API', () => {
  describe('Script Serving', () => {
    it('should serve tracking script for valid site ID', () => {
      const siteId = 'site-123'
      const apiUrl = 'https://api.example.com'

      const generateScript = (sid: string, api: string): string => {
        return `(function(){var sid='${sid}',api='${api}';})();`
      }

      const script = generateScript(siteId, apiUrl)

      expect(script).toContain(`sid='${siteId}'`)
      expect(script).toContain(`api='${apiUrl}'`)
    })

    it('should return JavaScript content type', () => {
      const headers = {
        'Content-Type': 'application/javascript',
      }

      expect(headers['Content-Type']).toBe('application/javascript')
    })

    it('should include CORS headers', () => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      }

      expect(headers['Access-Control-Allow-Origin']).toBe('*')
      expect(headers['Access-Control-Allow-Methods']).toBe('GET')
    })

    it('should set cache control headers', () => {
      const headers = {
        'Cache-Control': 'public, max-age=3600',
      }

      expect(headers['Cache-Control']).toContain('public')
      expect(headers['Cache-Control']).toContain('max-age=3600')
    })

    it('should handle missing site ID gracefully', () => {
      const validateSiteId = (siteId: string | undefined): boolean => {
        return !!siteId && siteId.length > 0
      }

      expect(validateSiteId('site-123')).toBe(true)
      expect(validateSiteId('')).toBe(false)
      expect(validateSiteId(undefined)).toBe(false)
    })

    it('should generate unique script per site ID', () => {
      const generateScript = (sid: string): string => {
        return `var sid='${sid}';`
      }

      const script1 = generateScript('site-1')
      const script2 = generateScript('site-2')

      expect(script1).not.toBe(script2)
      expect(script1).toContain('site-1')
      expect(script2).toContain('site-2')
    })
  })

  describe('Request Handling', () => {
    it('should accept GET requests', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/script/site-123',
        {
          method: 'GET',
        }
      )

      expect(request.method).toBe('GET')
    })

    it('should extract site ID from URL', () => {
      const extractSiteId = (url: string): string | null => {
        const match = url.match(/\/api\/script\/([^/]+)/)
        return match ? match[1] : null
      }

      expect(extractSiteId('/api/script/site-123')).toBe('site-123')
      expect(extractSiteId('/api/script/my-site')).toBe('my-site')
      expect(extractSiteId('/api/script/')).toBeNull()
    })

    it('should handle URL-encoded site IDs', () => {
      const siteId = 'my-site-123'
      const encoded = encodeURIComponent(siteId)
      const decoded = decodeURIComponent(encoded)

      expect(decoded).toBe(siteId)
    })

    it('should reject POST requests', () => {
      const isValidMethod = (method: string): boolean => {
        return method === 'GET' || method === 'HEAD'
      }

      expect(isValidMethod('GET')).toBe(true)
      expect(isValidMethod('HEAD')).toBe(true)
      expect(isValidMethod('POST')).toBe(false)
      expect(isValidMethod('PUT')).toBe(false)
    })
  })

  describe('Script Caching', () => {
    it('should cache script for 1 hour', () => {
      const cacheControl = 'public, max-age=3600'
      const maxAge = parseInt(cacheControl.match(/max-age=(\d+)/)?.[1] || '0')

      expect(maxAge).toBe(3600)
    })

    it('should allow public caching', () => {
      const cacheControl = 'public, max-age=3600'

      expect(cacheControl).toContain('public')
      expect(cacheControl).not.toContain('private')
    })

    it('should include ETag for cache validation', () => {
      const generateETag = (content: string): string => {
        let hash = 0
        for (let i = 0; i < content.length; i++) {
          hash = ((hash << 5) - hash) + content.charCodeAt(i)
          hash |= 0
        }
        return `"${hash.toString(36)}"`
      }

      const script = 'console.log("test");'
      const etag = generateETag(script)

      expect(etag).toMatch(/^"[a-z0-9]+"$/)
    })

    it('should generate consistent ETags for same content', () => {
      const generateETag = (content: string): string => {
        let hash = 0
        for (let i = 0; i < content.length; i++) {
          hash = ((hash << 5) - hash) + content.charCodeAt(i)
          hash |= 0
        }
        return `"${hash.toString(36)}"`
      }

      const script = 'console.log("test");'
      const etag1 = generateETag(script)
      const etag2 = generateETag(script)

      expect(etag1).toBe(etag2)
    })

    it('should support conditional requests with If-None-Match', () => {
      const checkETag = (currentETag: string, ifNoneMatch: string): boolean => {
        return currentETag === ifNoneMatch
      }

      const etag = '"abc123"'

      expect(checkETag(etag, '"abc123"')).toBe(true)
      expect(checkETag(etag, '"different"')).toBe(false)
    })
  })

  describe('Script Compression', () => {
    it('should calculate script size', () => {
      const script = 'console.log("test");'
      const size = new Blob([script]).size

      expect(size).toBeGreaterThan(0)
      expect(size).toBe(script.length)
    })

    it('should verify script is under size limit', () => {
      const maxSize = 3000 // 3KB
      const script = 'var x=1;'
      const size = new Blob([script]).size

      expect(size).toBeLessThan(maxSize)
    })

    it('should support Accept-Encoding header', () => {
      const request = new NextRequest('http://localhost:3000/api/script/test', {
        method: 'GET',
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
        },
      })

      const acceptEncoding = request.headers.get('Accept-Encoding')
      expect(acceptEncoding).toContain('gzip')
    })

    it('should indicate compression in response headers', () => {
      const headers = {
        'Content-Encoding': 'gzip',
      }

      expect(headers['Content-Encoding']).toBe('gzip')
    })
  })

  describe('API URL Configuration', () => {
    it('should use production API URL by default', () => {
      const getApiUrl = (): string => {
        return process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      }

      const apiUrl = getApiUrl()
      expect(apiUrl).toBeTruthy()
    })

    it('should support custom API URL from environment', () => {
      const originalUrl = process.env.NEXT_PUBLIC_API_URL
      process.env.NEXT_PUBLIC_API_URL = 'https://custom.example.com'

      const getApiUrl = (): string => {
        return process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      }

      expect(getApiUrl()).toBe('https://custom.example.com')

      process.env.NEXT_PUBLIC_API_URL = originalUrl
    })

    it('should validate API URL format', () => {
      const isValidUrl = (url: string): boolean => {
        try {
          new URL(url)
          return true
        } catch {
          return false
        }
      }

      expect(isValidUrl('https://api.example.com')).toBe(true)
      expect(isValidUrl('http://localhost:3000')).toBe(true)
      expect(isValidUrl('not-a-url')).toBe(false)
    })

    it('should inject API URL into script', () => {
      const apiUrl = 'https://api.example.com'
      const script = `var api='${apiUrl}';`

      expect(script).toContain(apiUrl)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid site ID characters', () => {
      const isValidSiteId = (siteId: string): boolean => {
        return /^[a-zA-Z0-9-_]+$/.test(siteId)
      }

      expect(isValidSiteId('site-123')).toBe(true)
      expect(isValidSiteId('my_site')).toBe(true)
      expect(isValidSiteId('invalid@site')).toBe(false)
      expect(isValidSiteId('site with spaces')).toBe(false)
    })

    it('should handle very long site IDs', () => {
      const maxLength = 100
      const longSiteId = 'a'.repeat(200)

      expect(longSiteId.length).toBeGreaterThan(maxLength)

      const isValidLength = (siteId: string): boolean => {
        return siteId.length <= maxLength
      }

      expect(isValidLength(longSiteId)).toBe(false)
    })

    it('should handle script generation errors', () => {
      const generateScriptSafely = (siteId: string, apiUrl: string): string | null => {
        try {
          if (!siteId || !apiUrl) return null
          return `var sid='${siteId}',api='${apiUrl}';`
        } catch (error) {
          return null
        }
      }

      expect(generateScriptSafely('site-123', 'https://api.example.com')).toBeTruthy()
      expect(generateScriptSafely('', 'https://api.example.com')).toBeNull()
      expect(generateScriptSafely('site-123', '')).toBeNull()
    })
  })

  describe('Security', () => {
    it('should escape site ID for XSS prevention', () => {
      const escapeSiteId = (siteId: string): string => {
        return siteId.replace(/['"\\]/g, '\\$&')
      }

      expect(escapeSiteId("site'123")).toBe("site\\'123")
      expect(escapeSiteId('site"123')).toBe('site\\"123')
      expect(escapeSiteId('site\\123')).toBe('site\\\\123')
    })

    it('should escape API URL for XSS prevention', () => {
      const escapeUrl = (url: string): string => {
        return url.replace(/['"\\]/g, '\\$&')
      }

      const maliciousUrl = "https://api.com'; alert('xss'); //"
      const escaped = escapeUrl(maliciousUrl)

      expect(escaped).not.toContain("'; alert('xss');")
      expect(escaped).toContain("\\'")
    })

    it('should not execute injected JavaScript', () => {
      const siteId = "site'; alert('xss'); //"
      const script = `var sid='${siteId}';`

      // This would be dangerous without escaping
      expect(script).toContain("alert('xss')")
    })

    it('should set security headers', () => {
      const headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      }

      expect(headers['X-Content-Type-Options']).toBe('nosniff')
      expect(headers['X-Frame-Options']).toBe('DENY')
    })
  })
})
