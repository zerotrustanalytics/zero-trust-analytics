import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Device Parser Module - Parses user agent strings
 * Detects browser, OS, device type, and versions
 */

interface DeviceInfo {
  browser: string
  browserVersion?: string
  os: string
  osVersion?: string
  device: string
  isBot: boolean
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

interface BrowserStats {
  browser: string
  count: number
  percentage: number
}

interface OSStats {
  os: string
  count: number
  percentage: number
}

interface DeviceStats {
  device: string
  count: number
  percentage: number
}

// TDD: Implementation will follow these tests
class DeviceParser {
  /**
   * Parse user agent string to device information
   */
  parse(userAgent: string): DeviceInfo {
    const info: DeviceInfo = {
      browser: 'Unknown',
      os: 'Unknown',
      device: 'Desktop',
      isBot: false,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    }

    if (!userAgent) return info

    // Bot detection
    info.isBot = this.isBot(userAgent)

    // Browser detection
    const browserInfo = this.detectBrowser(userAgent)
    info.browser = browserInfo.name
    info.browserVersion = browserInfo.version

    // OS detection
    const osInfo = this.detectOS(userAgent)
    info.os = osInfo.name
    info.osVersion = osInfo.version

    // Device type detection
    const deviceType = this.detectDeviceType(userAgent)
    info.device = deviceType
    info.isMobile = deviceType === 'Mobile'
    info.isTablet = deviceType === 'Tablet'
    info.isDesktop = deviceType === 'Desktop'

    return info
  }

  /**
   * Detect browser from user agent
   */
  detectBrowser(userAgent: string): { name: string; version?: string } {
    const ua = userAgent.toLowerCase()

    // Edge (must be before Chrome)
    if (ua.includes('edg/')) {
      const match = ua.match(/edg\/([\d.]+)/)
      return { name: 'Edge', version: match?.[1] }
    }

    // Chrome
    if (ua.includes('chrome/')) {
      const match = ua.match(/chrome\/([\d.]+)/)
      return { name: 'Chrome', version: match?.[1] }
    }

    // Firefox
    if (ua.includes('firefox/')) {
      const match = ua.match(/firefox\/([\d.]+)/)
      return { name: 'Firefox', version: match?.[1] }
    }

    // Safari (must be after Chrome)
    if (ua.includes('safari/') && !ua.includes('chrome')) {
      const match = ua.match(/version\/([\d.]+)/)
      return { name: 'Safari', version: match?.[1] }
    }

    // Opera
    if (ua.includes('opr/') || ua.includes('opera/')) {
      const match = ua.match(/(?:opr|opera)\/([\d.]+)/)
      return { name: 'Opera', version: match?.[1] }
    }

    // Internet Explorer
    if (ua.includes('msie') || ua.includes('trident/')) {
      const match = ua.match(/(?:msie |rv:)([\d.]+)/)
      return { name: 'Internet Explorer', version: match?.[1] }
    }

    return { name: 'Unknown' }
  }

  /**
   * Detect operating system from user agent
   */
  detectOS(userAgent: string): { name: string; version?: string } {
    const ua = userAgent.toLowerCase()

    // Windows
    if (ua.includes('windows')) {
      if (ua.includes('windows nt 10.0')) return { name: 'Windows', version: '10' }
      if (ua.includes('windows nt 6.3')) return { name: 'Windows', version: '8.1' }
      if (ua.includes('windows nt 6.2')) return { name: 'Windows', version: '8' }
      if (ua.includes('windows nt 6.1')) return { name: 'Windows', version: '7' }
      return { name: 'Windows' }
    }

    // macOS
    if (ua.includes('mac os x')) {
      const match = ua.match(/mac os x ([\d_]+)/)
      const version = match?.[1]?.replace(/_/g, '.')
      return { name: 'macOS', version }
    }

    // iOS
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      const match = ua.match(/os ([\d_]+)/)
      const version = match?.[1]?.replace(/_/g, '.')
      return { name: 'iOS', version }
    }

    // Android
    if (ua.includes('android')) {
      const match = ua.match(/android ([\d.]+)/)
      return { name: 'Android', version: match?.[1] }
    }

    // Linux
    if (ua.includes('linux')) {
      return { name: 'Linux' }
    }

    // Chrome OS
    if (ua.includes('cros')) {
      return { name: 'Chrome OS' }
    }

    return { name: 'Unknown' }
  }

  /**
   * Detect device type from user agent
   */
  detectDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase()

    // Tablet detection (must be before mobile)
    if (ua.includes('ipad') || (ua.includes('tablet') && !ua.includes('mobile'))) {
      return 'Tablet'
    }

    // Mobile detection
    if (
      ua.includes('mobile') ||
      ua.includes('iphone') ||
      ua.includes('ipod') ||
      ua.includes('android') && ua.includes('mobile')
    ) {
      return 'Mobile'
    }

    return 'Desktop'
  }

  /**
   * Check if user agent is a bot
   */
  isBot(userAgent: string): boolean {
    const ua = userAgent.toLowerCase()

    const botPatterns = [
      'bot',
      'crawler',
      'spider',
      'scraper',
      'headless',
      'phantom',
      'selenium',
      'webdriver',
      'curl',
      'wget',
      'http',
      'python',
    ]

    return botPatterns.some(pattern => ua.includes(pattern))
  }

  /**
   * Get browser statistics from user agents
   */
  getBrowserStats(userAgents: string[]): BrowserStats[] {
    if (userAgents.length === 0) return []

    const browserCounts = new Map<string, number>()

    userAgents.forEach(ua => {
      const { browser } = this.detectBrowser(ua)
      browserCounts.set(browser, (browserCounts.get(browser) || 0) + 1)
    })

    const stats: BrowserStats[] = Array.from(browserCounts.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: Math.round((count / userAgents.length) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    return stats
  }

  /**
   * Get OS statistics from user agents
   */
  getOSStats(userAgents: string[]): OSStats[] {
    if (userAgents.length === 0) return []

    const osCounts = new Map<string, number>()

    userAgents.forEach(ua => {
      const { os } = this.detectOS(ua)
      osCounts.set(os, (osCounts.get(os) || 0) + 1)
    })

    const stats: OSStats[] = Array.from(osCounts.entries())
      .map(([os, count]) => ({
        os,
        count,
        percentage: Math.round((count / userAgents.length) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    return stats
  }

  /**
   * Get device statistics from user agents
   */
  getDeviceStats(userAgents: string[]): DeviceStats[] {
    if (userAgents.length === 0) return []

    const deviceCounts = new Map<string, number>()

    userAgents.forEach(ua => {
      const device = this.detectDeviceType(ua)
      deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1)
    })

    const stats: DeviceStats[] = Array.from(deviceCounts.entries())
      .map(([device, count]) => ({
        device,
        count,
        percentage: Math.round((count / userAgents.length) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    return stats
  }

  /**
   * Filter out bot traffic
   */
  filterBots(userAgents: string[]): string[] {
    return userAgents.filter(ua => !this.isBot(ua))
  }

  /**
   * Get mobile percentage
   */
  getMobilePercentage(userAgents: string[]): number {
    if (userAgents.length === 0) return 0

    const mobileCount = userAgents.filter(ua => {
      const device = this.detectDeviceType(ua)
      return device === 'Mobile' || device === 'Tablet'
    }).length

    return Math.round((mobileCount / userAgents.length) * 100 * 10) / 10
  }

  /**
   * Check if browser version is outdated
   */
  isOutdated(browser: string, version: string): boolean {
    const minVersions: Record<string, number> = {
      'Chrome': 100,
      'Firefox': 100,
      'Safari': 15,
      'Edge': 100,
    }

    const majorVersion = parseInt(version.split('.')[0], 10)
    const minVersion = minVersions[browser]

    if (!minVersion) return false

    return majorVersion < minVersion
  }

  /**
   * Normalize browser name
   */
  normalizeBrowserName(browser: string): string {
    const normalized: Record<string, string> = {
      'chrome': 'Chrome',
      'firefox': 'Firefox',
      'safari': 'Safari',
      'edge': 'Edge',
      'opera': 'Opera',
      'ie': 'Internet Explorer',
      'internet explorer': 'Internet Explorer',
    }

    return normalized[browser.toLowerCase()] || browser
  }
}

describe('DeviceParser - User Agent Parsing', () => {
  let parser: DeviceParser

  beforeEach(() => {
    parser = new DeviceParser()
  })

  describe('parse', () => {
    it('should parse Chrome on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const result = parser.parse(ua)

      expect(result.browser).toBe('Chrome')
      expect(result.os).toBe('Windows')
      expect(result.device).toBe('Desktop')
      expect(result.isDesktop).toBe(true)
      expect(result.isMobile).toBe(false)
    })

    it('should parse Safari on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      const result = parser.parse(ua)

      expect(result.browser).toBe('Safari')
      expect(result.os).toBe('macOS')
      expect(result.device).toBe('Desktop')
    })

    it('should parse Chrome on Android mobile', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      const result = parser.parse(ua)

      expect(result.browser).toBe('Chrome')
      expect(result.os).toBe('Android')
      expect(result.device).toBe('Mobile')
      expect(result.isMobile).toBe(true)
      expect(result.isDesktop).toBe(false)
    })

    it('should parse Safari on iOS', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      const result = parser.parse(ua)

      expect(result.os).toBe('iOS')
      expect(result.device).toBe('Mobile')
      expect(result.isMobile).toBe(true)
    })

    it('should parse Firefox on Linux', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
      const result = parser.parse(ua)

      expect(result.browser).toBe('Firefox')
      expect(result.os).toBe('Linux')
      expect(result.device).toBe('Desktop')
    })

    it('should handle empty user agent', () => {
      const result = parser.parse('')

      expect(result.browser).toBe('Unknown')
      expect(result.os).toBe('Unknown')
    })

    it('should detect bot user agents', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      const result = parser.parse(ua)

      expect(result.isBot).toBe(true)
    })
  })

  describe('detectBrowser', () => {
    it('should detect Chrome', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Chrome')
      expect(result.version).toBe('120.0.0.0')
    })

    it('should detect Firefox', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Firefox')
      expect(result.version).toBe('120.0')
    })

    it('should detect Safari', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Safari')
      expect(result.version).toBe('17.0')
    })

    it('should detect Edge', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Edge')
      expect(result.version).toBe('120.0.0.0')
    })

    it('should detect Opera', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 OPR/106.0.0.0'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Opera')
    })

    it('should return Unknown for unrecognized browsers', () => {
      const ua = 'Some Random Browser'
      const result = parser.detectBrowser(ua)

      expect(result.name).toBe('Unknown')
    })
  })

  describe('detectOS', () => {
    it('should detect Windows 10', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('Windows')
      expect(result.version).toBe('10')
    })

    it('should detect macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('macOS')
      expect(result.version).toBe('10.15.7')
    })

    it('should detect iOS', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('iOS')
      expect(result.version).toBe('17.0')
    })

    it('should detect Android', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('Android')
      expect(result.version).toBe('13')
    })

    it('should detect Linux', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('Linux')
    })

    it('should detect Chrome OS', () => {
      const ua = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)'
      const result = parser.detectOS(ua)

      expect(result.name).toBe('Chrome OS')
    })
  })

  describe('detectDeviceType', () => {
    it('should detect desktop', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      const result = parser.detectDeviceType(ua)

      expect(result).toBe('Desktop')
    })

    it('should detect mobile', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13) Mobile Safari/537.36'
      const result = parser.detectDeviceType(ua)

      expect(result).toBe('Mobile')
    })

    it('should detect tablet', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'
      const result = parser.detectDeviceType(ua)

      expect(result).toBe('Tablet')
    })

    it('should detect iPhone as mobile', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      const result = parser.detectDeviceType(ua)

      expect(result).toBe('Mobile')
    })
  })

  describe('isBot', () => {
    it('should detect Googlebot', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1)'
      expect(parser.isBot(ua)).toBe(true)
    })

    it('should detect generic bot', () => {
      const ua = 'SomeBot/1.0'
      expect(parser.isBot(ua)).toBe(true)
    })

    it('should detect crawler', () => {
      const ua = 'MyCrawler/1.0'
      expect(parser.isBot(ua)).toBe(true)
    })

    it('should not detect normal browsers as bots', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0'
      expect(parser.isBot(ua)).toBe(false)
    })

    it('should detect headless browsers', () => {
      const ua = 'HeadlessChrome/120.0.0.0'
      expect(parser.isBot(ua)).toBe(true)
    })
  })

  describe('getBrowserStats', () => {
    it('should calculate browser statistics', () => {
      const userAgents = [
        'Mozilla/5.0 Chrome/120.0.0.0',
        'Mozilla/5.0 Chrome/119.0.0.0',
        'Mozilla/5.0 Firefox/120.0',
      ]

      const stats = parser.getBrowserStats(userAgents)

      expect(stats).toHaveLength(2)
      expect(stats[0].browser).toBe('Chrome')
      expect(stats[0].count).toBe(2)
      expect(stats[0].percentage).toBe(66.7)
    })

    it('should handle empty array', () => {
      const stats = parser.getBrowserStats([])
      expect(stats).toHaveLength(0)
    })

    it('should sort by count descending', () => {
      const userAgents = [
        'Mozilla/5.0 Chrome/120.0.0.0',
        'Mozilla/5.0 Firefox/120.0',
        'Mozilla/5.0 Firefox/119.0',
        'Mozilla/5.0 Firefox/118.0',
      ]

      const stats = parser.getBrowserStats(userAgents)

      expect(stats[0].browser).toBe('Firefox')
      expect(stats[0].count).toBe(3)
    })
  })

  describe('getOSStats', () => {
    it('should calculate OS statistics', () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ]

      const stats = parser.getOSStats(userAgents)

      expect(stats).toHaveLength(2)
      expect(stats[0].os).toBe('Windows')
      expect(stats[0].percentage).toBe(66.7)
    })

    it('should handle empty array', () => {
      const stats = parser.getOSStats([])
      expect(stats).toHaveLength(0)
    })
  })

  describe('getDeviceStats', () => {
    it('should calculate device statistics', () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (iPhone) Mobile',
      ]

      const stats = parser.getDeviceStats(userAgents)

      expect(stats).toHaveLength(2)
      expect(stats[0].device).toBe('Desktop')
      expect(stats[0].count).toBe(2)
    })
  })

  describe('filterBots', () => {
    it('should filter out bot user agents', () => {
      const userAgents = [
        'Mozilla/5.0 Chrome/120.0.0.0',
        'Googlebot/2.1',
        'Mozilla/5.0 Firefox/120.0',
        'SomeCrawler/1.0',
      ]

      const filtered = parser.filterBots(userAgents)

      expect(filtered).toHaveLength(2)
    })

    it('should handle all bots', () => {
      const userAgents = [
        'Googlebot/2.1',
        'SomeBot/1.0',
      ]

      const filtered = parser.filterBots(userAgents)

      expect(filtered).toHaveLength(0)
    })
  })

  describe('getMobilePercentage', () => {
    it('should calculate mobile percentage', () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (iPhone) Mobile',
        'Mozilla/5.0 (iPad)',
      ]

      const percentage = parser.getMobilePercentage(userAgents)

      expect(percentage).toBe(66.7)
    })

    it('should return 0 for empty array', () => {
      const percentage = parser.getMobilePercentage([])
      expect(percentage).toBe(0)
    })

    it('should return 0 for all desktop', () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0)',
        'Mozilla/5.0 (Macintosh)',
      ]

      const percentage = parser.getMobilePercentage(userAgents)

      expect(percentage).toBe(0)
    })
  })

  describe('isOutdated', () => {
    it('should detect outdated Chrome', () => {
      expect(parser.isOutdated('Chrome', '99.0')).toBe(true)
    })

    it('should detect up-to-date Chrome', () => {
      expect(parser.isOutdated('Chrome', '120.0')).toBe(false)
    })

    it('should handle unknown browsers', () => {
      expect(parser.isOutdated('UnknownBrowser', '1.0')).toBe(false)
    })
  })

  describe('normalizeBrowserName', () => {
    it('should normalize Chrome', () => {
      expect(parser.normalizeBrowserName('chrome')).toBe('Chrome')
    })

    it('should normalize Firefox', () => {
      expect(parser.normalizeBrowserName('FIREFOX')).toBe('Firefox')
    })

    it('should normalize Internet Explorer', () => {
      expect(parser.normalizeBrowserName('ie')).toBe('Internet Explorer')
    })

    it('should keep unknown browsers as-is', () => {
      expect(parser.normalizeBrowserName('CustomBrowser')).toBe('CustomBrowser')
    })
  })
})
