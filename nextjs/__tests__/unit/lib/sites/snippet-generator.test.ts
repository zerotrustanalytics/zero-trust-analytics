/**
 * Snippet Generator Unit Tests
 * Tests for tracking snippet generation and customization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SnippetGenerator } from '@/lib/sites/snippet-generator'

describe('SnippetGenerator', () => {
  let generator: SnippetGenerator

  beforeEach(() => {
    generator = new SnippetGenerator()
  })

  describe('Basic Generation', () => {
    it('should generate a basic tracking snippet', () => {
      const snippet = generator.generate('zt_abc123')

      expect(snippet).toContain('zt_abc123')
      expect(snippet).toContain('<script')
      expect(snippet).toContain('</script>')
    })

    it('should include async and defer attributes by default', () => {
      const snippet = generator.generate('zt_abc123')

      expect(snippet).toContain('async')
      expect(snippet).toContain('defer')
    })

    it('should generate unique snippets for different tracking IDs', () => {
      const snippet1 = generator.generate('zt_abc123')
      const snippet2 = generator.generate('zt_def456')

      expect(snippet1).not.toEqual(snippet2)
    })

    it('should throw error for empty tracking ID', () => {
      expect(() => generator.generate('')).toThrow('Tracking ID is required')
    })

    it('should throw error for invalid tracking ID format', () => {
      expect(() => generator.generate('invalid-id')).toThrow('Invalid tracking ID format')
    })

    it('should validate tracking ID format', () => {
      expect(() => generator.generate('zt_123')).not.toThrow()
      expect(() => generator.generate('zt_abc123def456')).not.toThrow()
    })

    it('should escape HTML in tracking ID', () => {
      const snippet = generator.generate('zt_<script>alert(1)</script>')

      expect(snippet).not.toContain('<script>alert')
      expect(snippet).toContain('&lt;')
    })
  })

  describe('Configuration Options', () => {
    it('should support custom API endpoint', () => {
      const snippet = generator.generate('zt_abc123', {
        apiEndpoint: 'https://custom.analytics.com/collect'
      })

      expect(snippet).toContain('https://custom.analytics.com/collect')
    })

    it('should support custom domain', () => {
      const snippet = generator.generate('zt_abc123', {
        domain: 'analytics.example.com'
      })

      expect(snippet).toContain('analytics.example.com')
    })

    it('should disable auto-tracking when specified', () => {
      const snippet = generator.generate('zt_abc123', {
        autoTrack: false
      })

      expect(snippet).toContain('data-auto-track="false"')
    })

    it('should enable manual tracking mode', () => {
      const snippet = generator.generate('zt_abc123', {
        manualMode: true
      })

      expect(snippet).toContain('manual')
    })

    it('should honor Do Not Track setting', () => {
      const snippet = generator.generate('zt_abc123', {
        honorDNT: true
      })

      expect(snippet).toContain('doNotTrack')
    })

    it('should include custom data attributes', () => {
      const snippet = generator.generate('zt_abc123', {
        customAttributes: {
          'data-privacy-mode': 'strict',
          'data-region': 'eu'
        }
      })

      expect(snippet).toContain('data-privacy-mode="strict"')
      expect(snippet).toContain('data-region="eu"')
    })

    it('should support hash mode for SPA routing', () => {
      const snippet = generator.generate('zt_abc123', {
        hashMode: true
      })

      expect(snippet).toContain('hash')
    })

    it('should exclude specific paths', () => {
      const snippet = generator.generate('zt_abc123', {
        excludePaths: ['/admin', '/internal']
      })

      expect(snippet).toContain('/admin')
      expect(snippet).toContain('/internal')
    })
  })

  describe('Script Formats', () => {
    it('should generate external script tag', () => {
      const snippet = generator.generateExternal('zt_abc123')

      expect(snippet).toMatch(/<script[^>]*src=/)
      expect(snippet).not.toMatch(/<script[^>]*>[\s\S]+<\/script>/)
    })

    it('should generate inline script', () => {
      const snippet = generator.generateInline('zt_abc123')

      expect(snippet).not.toContain('src=')
      expect(snippet).toMatch(/<script[^>]*>[\s\S]+<\/script>/)
    })

    it('should minify inline script by default', () => {
      const snippet = generator.generateInline('zt_abc123')

      expect(snippet).not.toMatch(/\n\s{2,}/)
    })

    it('should generate prettified inline script when requested', () => {
      const snippet = generator.generateInline('zt_abc123', { minify: false })

      expect(snippet).toContain('\n')
    })

    it('should generate module script type', () => {
      const snippet = generator.generate('zt_abc123', {
        moduleType: true
      })

      expect(snippet).toContain('type="module"')
    })
  })

  describe('CSP and Security', () => {
    it('should generate snippet with nonce', () => {
      const nonce = 'random-nonce-123'
      const snippet = generator.generateWithNonce('zt_abc123', nonce)

      expect(snippet).toContain(`nonce="${nonce}"`)
    })

    it('should generate snippet with integrity hash', () => {
      const snippet = generator.generateWithIntegrity('zt_abc123')

      expect(snippet).toContain('integrity=')
      expect(snippet).toContain('sha384-')
    })

    it('should generate CSP-compliant snippet', () => {
      const snippet = generator.generateCSPCompliant('zt_abc123')

      expect(snippet).not.toContain('onclick')
      expect(snippet).not.toContain('onerror')
    })

    it('should escape dangerous characters', () => {
      const snippet = generator.generate('zt_test', {
        customAttributes: {
          'data-test': '"><script>alert(1)</script>'
        }
      })

      expect(snippet).not.toContain('"><script>')
      expect(snippet).toContain('&quot;')
    })

    it('should generate SRI hash for external script', () => {
      const snippet = generator.generateExternal('zt_abc123', {
        subresourceIntegrity: true
      })

      expect(snippet).toContain('integrity=')
      expect(snippet).toContain('crossorigin=')
    })
  })

  describe('Framework-Specific Snippets', () => {
    it('should generate React component snippet', () => {
      const snippet = generator.generateForReact('zt_abc123')

      expect(snippet).toContain('useEffect')
      expect(snippet).toContain('export')
    })

    it('should generate Next.js snippet', () => {
      const snippet = generator.generateForNextJS('zt_abc123')

      expect(snippet).toContain('Script')
      expect(snippet).toContain('from \'next/script\'')
    })

    it('should generate Vue component snippet', () => {
      const snippet = generator.generateForVue('zt_abc123')

      expect(snippet).toContain('mounted')
      expect(snippet).toContain('export default')
    })

    it('should generate WordPress plugin snippet', () => {
      const snippet = generator.generateForWordPress('zt_abc123')

      expect(snippet).toContain('wp_enqueue_script')
      expect(snippet).toContain('wp_head')
    })

    it('should generate Angular component snippet', () => {
      const snippet = generator.generateForAngular('zt_abc123')

      expect(snippet).toContain('ngOnInit')
      expect(snippet).toContain('@Component')
    })

    it('should generate Svelte snippet', () => {
      const snippet = generator.generateForSvelte('zt_abc123')

      expect(snippet).toContain('onMount')
      expect(snippet).toContain('svelte')
    })
  })

  describe('Installation Instructions', () => {
    it('should generate HTML installation instructions', () => {
      const instructions = generator.getInstallationInstructions('zt_abc123', 'html')

      expect(instructions).toContain('<head>')
      expect(instructions).toContain('</body>')
      expect(instructions).toContain('zt_abc123')
    })

    it('should generate React installation instructions', () => {
      const instructions = generator.getInstallationInstructions('zt_abc123', 'react')

      expect(instructions).toContain('npm install')
      expect(instructions).toContain('useEffect')
    })

    it('should generate Next.js installation instructions', () => {
      const instructions = generator.getInstallationInstructions('zt_abc123', 'nextjs')

      expect(instructions).toContain('_app.tsx')
      expect(instructions).toContain('next/script')
    })

    it('should include verification steps', () => {
      const instructions = generator.getInstallationInstructions('zt_abc123', 'html')

      expect(instructions).toContain('verify')
      expect(instructions).toContain('test')
    })

    it('should include troubleshooting tips', () => {
      const instructions = generator.getInstallationInstructions('zt_abc123', 'html')

      expect(instructions).toContain('troubleshoot')
    })
  })

  describe('Snippet Validation', () => {
    it('should validate a correctly formatted snippet', () => {
      const snippet = generator.generate('zt_abc123')

      expect(generator.validate(snippet)).toBe(true)
    })

    it('should reject snippet without tracking ID', () => {
      const snippet = '<script async defer></script>'

      expect(generator.validate(snippet)).toBe(false)
    })

    it('should reject malformed HTML', () => {
      expect(generator.validate('<script>unclosed')).toBe(false)
    })

    it('should reject snippet with suspicious content', () => {
      expect(generator.validate('<script>eval("alert(1)")</script>')).toBe(false)
    })

    it('should reject snippet with XSS patterns', () => {
      expect(generator.validate('<script>document.cookie</script>')).toBe(false)
    })

    it('should extract tracking ID from valid snippet', () => {
      const snippet = generator.generate('zt_xyz789')

      expect(generator.extractTrackingId(snippet)).toBe('zt_xyz789')
    })

    it('should return null for invalid snippet', () => {
      expect(generator.extractTrackingId('invalid')).toBeNull()
    })
  })

  describe('Privacy and Compliance', () => {
    it('should generate GDPR-compliant snippet', () => {
      const snippet = generator.generateGDPRCompliant('zt_abc123')

      expect(snippet).toContain('consent')
      expect(snippet).toContain('gdpr')
    })

    it('should generate CCPA-compliant snippet', () => {
      const snippet = generator.generateCCPACompliant('zt_abc123')

      expect(snippet).toContain('ccpa')
      expect(snippet).toContain('doNotSell')
    })

    it('should include cookie consent integration', () => {
      const snippet = generator.generate('zt_abc123', {
        cookieConsent: true
      })

      expect(snippet).toContain('cookie')
      expect(snippet).toContain('consent')
    })

    it('should support opt-out functionality', () => {
      const snippet = generator.generate('zt_abc123', {
        optOut: true
      })

      expect(snippet).toContain('opt-out')
    })

    it('should anonymize IP addresses when configured', () => {
      const snippet = generator.generate('zt_abc123', {
        anonymizeIP: true
      })

      expect(snippet).toContain('anonymize')
    })
  })

  describe('Performance Optimization', () => {
    it('should generate lazy-loaded snippet', () => {
      const snippet = generator.generateLazyLoaded('zt_abc123')

      expect(snippet).toContain('loading=')
    })

    it('should support delayed loading', () => {
      const snippet = generator.generate('zt_abc123', {
        loadDelay: 2000
      })

      expect(snippet).toContain('setTimeout')
      expect(snippet).toContain('2000')
    })

    it('should generate snippet with preconnect hints', () => {
      const snippet = generator.generateWithPreconnect('zt_abc123')

      expect(snippet).toContain('preconnect')
      expect(snippet).toContain('<link')
    })

    it('should support conditional loading', () => {
      const snippet = generator.generate('zt_abc123', {
        conditionalLoad: 'window.innerWidth > 768'
      })

      expect(snippet).toContain('window.innerWidth')
    })
  })

  describe('Error Handling', () => {
    it('should include error handling in snippet', () => {
      const snippet = generator.generateInline('zt_abc123')

      expect(snippet).toContain('try')
      expect(snippet).toContain('catch')
    })

    it('should handle script loading errors', () => {
      const snippet = generator.generateExternal('zt_abc123')

      expect(snippet).toContain('onerror')
    })

    it('should provide fallback mechanism', () => {
      const snippet = generator.generate('zt_abc123', {
        fallback: true
      })

      expect(snippet).toContain('fallback')
    })
  })

  describe('Formatting and Output', () => {
    it('should format snippet for copying', () => {
      const snippet = generator.generate('zt_abc123')
      const formatted = generator.formatForCopy(snippet)

      expect(formatted).toBeTruthy()
      expect(formatted).toContain('zt_abc123')
    })

    it('should generate snippet with comments', () => {
      const snippet = generator.generate('zt_abc123', {
        includeComments: true
      })

      expect(snippet).toContain('//')
    })

    it('should remove comments when minified', () => {
      const snippet = generator.generate('zt_abc123', {
        minify: true,
        includeComments: true
      })

      expect(snippet).not.toContain('//')
    })

    it('should support custom formatting options', () => {
      const snippet = generator.generate('zt_abc123', {
        format: {
          indent: 4,
          lineBreak: '\n'
        }
      })

      expect(snippet).toBeDefined()
    })
  })

  describe('Testing and Development', () => {
    it('should generate debug mode snippet', () => {
      const snippet = generator.generate('zt_abc123', {
        debug: true
      })

      expect(snippet).toContain('console')
      expect(snippet).toContain('debug')
    })

    it('should generate test mode snippet', () => {
      const snippet = generator.generateTestMode('zt_abc123')

      expect(snippet).toContain('test')
    })

    it('should support dry-run mode', () => {
      const snippet = generator.generate('zt_abc123', {
        dryRun: true
      })

      expect(snippet).toContain('dryRun')
    })
  })

  describe('Caching and Performance', () => {
    it('should cache generated snippets', () => {
      const snippet1 = generator.generate('zt_abc123')
      const snippet2 = generator.generate('zt_abc123')

      expect(snippet1).toEqual(snippet2)
    })

    it('should handle large batch generation', () => {
      const trackingIds = Array.from({ length: 100 }, (_, i) => `zt_${i}`)
      const start = Date.now()

      trackingIds.forEach(id => generator.generate(id))

      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)
    })
  })
})
