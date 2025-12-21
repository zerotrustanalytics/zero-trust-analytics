/**
 * Tracking Snippet Unit Tests
 * Tests for tracking code generation and validation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { TrackingSnippet } from '@/lib/sites/tracking-snippet'

describe('TrackingSnippet', () => {
  let snippetGenerator: TrackingSnippet

  beforeEach(() => {
    snippetGenerator = new TrackingSnippet()
  })

  describe('generate', () => {
    it('should generate tracking snippet with site ID', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippet).toContain('zt_abc123')
      expect(snippet).toContain('<script>')
      expect(snippet).toContain('</script>')
    })

    it('should include async attribute', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippet).toContain('async')
    })

    it('should include defer attribute', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippet).toContain('defer')
    })

    it('should include script source URL', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippet).toMatch(/src=["'].*\/api\/script\/zt_abc123["']/)
    })

    it('should include data-site-id attribute', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippet).toContain('data-site-id="zt_abc123"')
    })

    it('should generate valid HTML', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      // Check for proper script tag structure
      expect(snippet).toMatch(/<script[^>]*>.*<\/script>/s)
    })

    it('should escape special characters in site ID', () => {
      const snippet = snippetGenerator.generate('zt_<script>alert("xss")</script>')

      expect(snippet).not.toContain('<script>alert')
      expect(snippet).toContain('&lt;')
    })

    it('should throw error for empty site ID', () => {
      expect(() => snippetGenerator.generate('')).toThrow('Site ID is required')
    })

    it('should throw error for invalid site ID format', () => {
      expect(() => snippetGenerator.generate('invalid-id')).toThrow('Invalid site ID format')
    })

    it('should generate unique snippets for different site IDs', () => {
      const snippet1 = snippetGenerator.generate('zt_abc123')
      const snippet2 = snippetGenerator.generate('zt_def456')

      expect(snippet1).not.toEqual(snippet2)
      expect(snippet1).toContain('zt_abc123')
      expect(snippet2).toContain('zt_def456')
    })

    it('should include tracking domain', () => {
      const snippet = snippetGenerator.generate('zt_abc123', {
        domain: 'analytics.example.com'
      })

      expect(snippet).toContain('analytics.example.com')
    })

    it('should include custom API endpoint', () => {
      const snippet = snippetGenerator.generate('zt_abc123', {
        apiEndpoint: '/custom/track'
      })

      expect(snippet).toContain('/custom/track')
    })

    it('should respect honor DNT option', () => {
      const snippet = snippetGenerator.generate('zt_abc123', {
        honorDNT: true
      })

      expect(snippet).toContain('honorDNT')
      expect(snippet).toContain('doNotTrack')
    })

    it('should include manual tracking option', () => {
      const snippet = snippetGenerator.generate('zt_abc123', {
        autoTrack: false
      })

      expect(snippet).toContain('data-auto-track="false"')
    })
  })

  describe('generateInlineScript', () => {
    it('should generate inline script without external source', () => {
      const script = snippetGenerator.generateInlineScript('zt_abc123')

      expect(script).not.toContain('src=')
      expect(script).toContain('zt_abc123')
    })

    it('should include tracking logic', () => {
      const script = snippetGenerator.generateInlineScript('zt_abc123')

      expect(script).toContain('pageview')
      expect(script).toContain('track')
    })

    it('should be minified by default', () => {
      const script = snippetGenerator.generateInlineScript('zt_abc123')

      // Check that there are no unnecessary line breaks or spaces
      expect(script).not.toMatch(/\n\s+/)
    })

    it('should include performance tracking', () => {
      const script = snippetGenerator.generateInlineScript('zt_abc123')

      expect(script).toContain('performance')
    })

    it('should handle errors gracefully', () => {
      const script = snippetGenerator.generateInlineScript('zt_abc123')

      expect(script).toContain('try')
      expect(script).toContain('catch')
    })
  })

  describe('validate', () => {
    it('should validate correct snippet', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippetGenerator.validate(snippet)).toBe(true)
    })

    it('should reject snippet without script tags', () => {
      expect(snippetGenerator.validate('just some text')).toBe(false)
    })

    it('should reject snippet without site ID', () => {
      const snippet = '<script async defer></script>'

      expect(snippetGenerator.validate(snippet)).toBe(false)
    })

    it('should reject malformed HTML', () => {
      const snippet = '<script>unclosed'

      expect(snippetGenerator.validate(snippet)).toBe(false)
    })

    it('should reject snippet with suspicious content', () => {
      const snippet = '<script>alert("xss")</script>'

      expect(snippetGenerator.validate(snippet)).toBe(false)
    })
  })

  describe('extractSiteId', () => {
    it('should extract site ID from valid snippet', () => {
      const snippet = snippetGenerator.generate('zt_abc123')

      expect(snippetGenerator.extractSiteId(snippet)).toBe('zt_abc123')
    })

    it('should return null for invalid snippet', () => {
      expect(snippetGenerator.extractSiteId('invalid snippet')).toBeNull()
    })

    it('should extract site ID from data attribute', () => {
      const snippet = '<script data-site-id="zt_xyz789"></script>'

      expect(snippetGenerator.extractSiteId(snippet)).toBe('zt_xyz789')
    })
  })

  describe('getInstallationInstructions', () => {
    it('should return installation instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123')

      expect(instructions).toContain('head')
      expect(instructions).toContain('body')
      expect(instructions).toBeTruthy()
    })

    it('should include snippet in instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123')

      expect(instructions).toContain('zt_abc123')
    })

    it('should provide HTML instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123', 'html')

      expect(instructions).toContain('<head>')
    })

    it('should provide React instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123', 'react')

      expect(instructions).toContain('useEffect')
    })

    it('should provide Next.js instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123', 'nextjs')

      expect(instructions).toContain('_app')
      expect(instructions).toContain('_document')
    })

    it('should provide WordPress instructions', () => {
      const instructions = snippetGenerator.getInstallationInstructions('zt_abc123', 'wordpress')

      expect(instructions).toContain('wp_head')
    })
  })

  describe('formatForCopy', () => {
    it('should format snippet for easy copying', () => {
      const snippet = snippetGenerator.generate('zt_abc123')
      const formatted = snippetGenerator.formatForCopy(snippet)

      expect(formatted).not.toContain('\t')
      expect(formatted).toBeTruthy()
    })

    it('should preserve script functionality', () => {
      const snippet = snippetGenerator.generate('zt_abc123')
      const formatted = snippetGenerator.formatForCopy(snippet)

      expect(formatted).toContain('zt_abc123')
      expect(formatted).toContain('<script>')
    })
  })

  describe('generateNonceSnippet', () => {
    it('should generate snippet with CSP nonce', () => {
      const nonce = 'random-nonce-123'
      const snippet = snippetGenerator.generateNonceSnippet('zt_abc123', nonce)

      expect(snippet).toContain(`nonce="${nonce}"`)
    })

    it('should include site ID with nonce', () => {
      const snippet = snippetGenerator.generateNonceSnippet('zt_abc123', 'nonce-123')

      expect(snippet).toContain('zt_abc123')
    })
  })

  describe('minify', () => {
    it('should remove unnecessary whitespace', () => {
      const code = `
        function track() {
          console.log('tracking');
        }
      `
      const minified = snippetGenerator.minify(code)

      expect(minified.length).toBeLessThan(code.length)
      expect(minified).not.toContain('\n  ')
    })

    it('should preserve functionality', () => {
      const code = 'function track() { return true; }'
      const minified = snippetGenerator.minify(code)

      expect(minified).toContain('track')
      expect(minified).toContain('return')
    })
  })
})
