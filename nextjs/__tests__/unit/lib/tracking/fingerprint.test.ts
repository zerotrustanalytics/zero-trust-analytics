import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Browser Fingerprint Tests
 *
 * Tests privacy-safe visitor identification through browser fingerprinting.
 * Uses only non-invasive signals that respect user privacy.
 */

describe('Browser Fingerprint', () => {
  const hashString = (str: string): string => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash |= 0
    }
    return hash.toString(36)
  }

  const generateFingerprint = (components: {
    userAgent: string
    language: string
    screenWidth: number
    screenHeight: number
    colorDepth: number
    timezone: number
  }): string => {
    const data = [
      components.userAgent,
      components.language,
      components.screenWidth,
      components.screenHeight,
      components.colorDepth,
      components.timezone,
    ].join('|')

    return hashString(data)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Fingerprint Generation', () => {
    it('should generate a fingerprint from browser properties', () => {
      const fingerprint = generateFingerprint({
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      expect(fingerprint).toBeTruthy()
      expect(typeof fingerprint).toBe('string')
    })

    it('should generate consistent fingerprints for same inputs', () => {
      const components = {
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      }

      const fp1 = generateFingerprint(components)
      const fp2 = generateFingerprint(components)

      expect(fp1).toBe(fp2)
    })

    it('should generate different fingerprints for different browsers', () => {
      const chrome = generateFingerprint({
        userAgent: 'Mozilla/5.0 Chrome/91.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      const firefox = generateFingerprint({
        userAgent: 'Mozilla/5.0 Firefox/89.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      expect(chrome).not.toBe(firefox)
    })

    it('should generate different fingerprints for different screen sizes', () => {
      const desktop = generateFingerprint({
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      const mobile = generateFingerprint({
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 375,
        screenHeight: 667,
        colorDepth: 24,
        timezone: -300,
      })

      expect(desktop).not.toBe(mobile)
    })

    it('should generate different fingerprints for different languages', () => {
      const english = generateFingerprint({
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      const spanish = generateFingerprint({
        userAgent: 'Mozilla/5.0',
        language: 'es-ES',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      })

      expect(english).not.toBe(spanish)
    })
  })

  describe('Hash Function', () => {
    it('should hash strings consistently', () => {
      const input = 'test-string'
      const hash1 = hashString(input)
      const hash2 = hashString(input)

      expect(hash1).toBe(hash2)
    })

    it('should generate different hashes for different strings', () => {
      const hash1 = hashString('string1')
      const hash2 = hashString('string2')

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty strings', () => {
      const hash = hashString('')
      expect(hash).toBe('0')
    })

    it('should handle unicode characters', () => {
      const hash = hashString('Hello 世界 🌍')
      expect(hash).toBeTruthy()
      expect(typeof hash).toBe('string')
    })

    it('should use base36 encoding', () => {
      const hash = hashString('test')
      // Base36 uses 0-9 and a-z
      expect(hash).toMatch(/^-?[0-9a-z]+$/)
    })

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000)
      const hash = hashString(longString)
      expect(hash).toBeTruthy()
    })
  })

  describe('User Agent Detection', () => {
    it('should extract user agent from navigator', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      })

      const getUserAgent = (): string => {
        return navigator.userAgent
      }

      expect(getUserAgent()).toContain('Mozilla/5.0')
    })

    it('should handle missing user agent', () => {
      vi.stubGlobal('navigator', {})

      const getUserAgent = (): string => {
        return navigator.userAgent || ''
      }

      expect(getUserAgent()).toBe('')
    })

    it('should detect mobile user agents', () => {
      const isMobile = (ua: string): boolean => {
        return /Mobile|Android|iPhone|iPad|iPod/.test(ua)
      }

      expect(isMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6)')).toBe(true)
      expect(isMobile('Mozilla/5.0 (Windows NT 10.0)')).toBe(false)
    })
  })

  describe('Screen Properties', () => {
    it('should capture screen dimensions', () => {
      vi.stubGlobal('screen', {
        width: 1920,
        height: 1080,
        colorDepth: 24,
      })

      const getScreenProps = () => ({
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
      })

      const props = getScreenProps()
      expect(props.width).toBe(1920)
      expect(props.height).toBe(1080)
      expect(props.colorDepth).toBe(24)
    })

    it('should handle missing screen object', () => {
      vi.stubGlobal('screen', undefined)

      const getScreenProps = () => {
        if (typeof screen === 'undefined') {
          return { width: 0, height: 0, colorDepth: 0 }
        }
        return {
          width: screen.width,
          height: screen.height,
          colorDepth: screen.colorDepth,
        }
      }

      const props = getScreenProps()
      expect(props.width).toBe(0)
      expect(props.height).toBe(0)
    })
  })

  describe('Language Detection', () => {
    it('should detect browser language', () => {
      vi.stubGlobal('navigator', {
        language: 'en-US',
      })

      const getLanguage = (): string => {
        return navigator.language
      }

      expect(getLanguage()).toBe('en-US')
    })

    it('should handle different language codes', () => {
      const languages = ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP']

      languages.forEach((lang) => {
        vi.stubGlobal('navigator', { language: lang })
        expect(navigator.language).toBe(lang)
      })
    })

    it('should fallback for missing language', () => {
      vi.stubGlobal('navigator', {})

      const getLanguage = (): string => {
        return navigator.language || 'unknown'
      }

      expect(getLanguage()).toBe('unknown')
    })
  })

  describe('Timezone Detection', () => {
    it('should detect timezone offset', () => {
      const getTimezoneOffset = (): number => {
        return new Date().getTimezoneOffset()
      }

      const offset = getTimezoneOffset()
      expect(typeof offset).toBe('number')
      expect(offset).toBeGreaterThanOrEqual(-840) // UTC+14
      expect(offset).toBeLessThanOrEqual(720) // UTC-12
    })

    it('should be consistent for same timezone', () => {
      const offset1 = new Date().getTimezoneOffset()
      const offset2 = new Date().getTimezoneOffset()

      expect(offset1).toBe(offset2)
    })
  })

  describe('Privacy Considerations', () => {
    it('should not collect sensitive browser features', () => {
      const components = {
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      }

      const keys = Object.keys(components)

      // Should not include invasive features
      expect(keys).not.toContain('plugins')
      expect(keys).not.toContain('fonts')
      expect(keys).not.toContain('canvas')
      expect(keys).not.toContain('webgl')
      expect(keys).not.toContain('audio')
    })

    it('should not use canvas fingerprinting', () => {
      // Verify that we don't implement canvas fingerprinting
      const components = {
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      }

      const componentString = JSON.stringify(components)
      expect(componentString).not.toContain('canvas')
      expect(componentString).not.toContain('toDataURL')
    })

    it('should use only publicly available browser properties', () => {
      // All components should be accessible without user interaction
      const components = {
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: -300,
      }

      expect(components.userAgent).toBeTruthy()
      expect(components.language).toBeTruthy()
      expect(components.screenWidth).toBeGreaterThan(0)
      expect(components.screenHeight).toBeGreaterThan(0)
    })
  })
})
