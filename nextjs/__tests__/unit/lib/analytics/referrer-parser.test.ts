import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Referrer Parser Module - Parses and classifies referrer sources
 * Categorizes traffic sources (search, social, direct, referral)
 */

interface ReferrerInfo {
  source: string
  medium: string
  campaign?: string
  searchTerm?: string
  isInternal: boolean
}

interface SourceStats {
  source: string
  count: number
  percentage: number
}

interface MediumStats {
  medium: string
  count: number
  percentage: number
}

type MediumType = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'paid' | 'organic' | 'unknown'

// TDD: Implementation will follow these tests
class ReferrerParser {
  private searchEngines = [
    'google',
    'bing',
    'yahoo',
    'duckduckgo',
    'baidu',
    'yandex',
  ]

  private socialNetworks = [
    'facebook',
    'twitter',
    'linkedin',
    'instagram',
    'pinterest',
    'reddit',
    'tiktok',
    'youtube',
  ]

  /**
   * Parse referrer URL to referrer information
   */
  parse(referrer: string, currentHost?: string): ReferrerInfo {
    if (!referrer || referrer === '') {
      return {
        source: '(direct)',
        medium: 'direct',
        isInternal: false,
      }
    }

    try {
      const url = new URL(referrer)
      const hostname = url.hostname.toLowerCase().replace('www.', '')

      // Check if internal
      const isInternal = currentHost ? hostname === currentHost.replace('www.', '') : false

      if (isInternal) {
        return {
          source: hostname,
          medium: 'internal',
          isInternal: true,
        }
      }

      // Check search engines
      const searchEngine = this.searchEngines.find(se => hostname.includes(se))
      if (searchEngine) {
        const searchTerm = this.extractSearchTerm(url)
        return {
          source: searchEngine,
          medium: 'search',
          searchTerm,
          isInternal: false,
        }
      }

      // Check social networks
      const socialNetwork = this.socialNetworks.find(sn => hostname.includes(sn))
      if (socialNetwork) {
        return {
          source: socialNetwork,
          medium: 'social',
          isInternal: false,
        }
      }

      // Check UTM parameters
      const utmSource = url.searchParams.get('utm_source')
      const utmMedium = url.searchParams.get('utm_medium')
      const utmCampaign = url.searchParams.get('utm_campaign')

      if (utmSource) {
        return {
          source: utmSource,
          medium: utmMedium || 'referral',
          campaign: utmCampaign || undefined,
          isInternal: false,
        }
      }

      // Default to referral
      return {
        source: hostname,
        medium: 'referral',
        isInternal: false,
      }
    } catch (error) {
      return {
        source: '(direct)',
        medium: 'direct',
        isInternal: false,
      }
    }
  }

  /**
   * Extract search term from URL
   */
  extractSearchTerm(url: URL): string | undefined {
    const params = ['q', 'query', 'search', 'p', 'text']

    for (const param of params) {
      const value = url.searchParams.get(param)
      if (value) return value
    }

    return undefined
  }

  /**
   * Classify medium type
   */
  classifyMedium(referrer: string): MediumType {
    const info = this.parse(referrer)
    return info.medium as MediumType
  }

  /**
   * Check if referrer is from search engine
   */
  isSearch(referrer: string): boolean {
    const info = this.parse(referrer)
    return info.medium === 'search'
  }

  /**
   * Check if referrer is from social media
   */
  isSocial(referrer: string): boolean {
    const info = this.parse(referrer)
    return info.medium === 'social'
  }

  /**
   * Check if referrer is direct traffic
   */
  isDirect(referrer: string): boolean {
    return !referrer || referrer === ''
  }

  /**
   * Get source statistics
   */
  getSourceStats(referrers: string[]): SourceStats[] {
    if (referrers.length === 0) return []

    const sourceCounts = new Map<string, number>()

    referrers.forEach(ref => {
      const info = this.parse(ref)
      sourceCounts.set(info.source, (sourceCounts.get(info.source) || 0) + 1)
    })

    const stats: SourceStats[] = Array.from(sourceCounts.entries())
      .map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / referrers.length) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    return stats
  }

  /**
   * Get medium statistics
   */
  getMediumStats(referrers: string[]): MediumStats[] {
    if (referrers.length === 0) return []

    const mediumCounts = new Map<string, number>()

    referrers.forEach(ref => {
      const info = this.parse(ref)
      mediumCounts.set(info.medium, (mediumCounts.get(info.medium) || 0) + 1)
    })

    const stats: MediumStats[] = Array.from(mediumCounts.entries())
      .map(([medium, count]) => ({
        medium,
        count,
        percentage: Math.round((count / referrers.length) * 100 * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)

    return stats
  }

  /**
   * Get top referrers
   */
  getTopReferrers(referrers: string[], limit: number): SourceStats[] {
    const stats = this.getSourceStats(referrers)
    return stats.slice(0, limit)
  }

  /**
   * Filter referrers by medium
   */
  filterByMedium(referrers: string[], medium: string): string[] {
    return referrers.filter(ref => {
      const info = this.parse(ref)
      return info.medium === medium
    })
  }

  /**
   * Get organic traffic percentage
   */
  getOrganicPercentage(referrers: string[]): number {
    if (referrers.length === 0) return 0

    const organicCount = referrers.filter(ref => {
      const info = this.parse(ref)
      return info.medium === 'search'
    }).length

    return Math.round((organicCount / referrers.length) * 100 * 10) / 10
  }

  /**
   * Extract domain from referrer
   */
  extractDomain(referrer: string): string | null {
    if (!referrer) return null

    try {
      const url = new URL(referrer)
      return url.hostname.toLowerCase().replace('www.', '')
    } catch {
      return null
    }
  }

  /**
   * Check if referrer is valid URL
   */
  isValidReferrer(referrer: string): boolean {
    if (!referrer) return false

    try {
      new URL(referrer)
      return true
    } catch {
      return false
    }
  }

  /**
   * Normalize source name
   */
  normalizeSource(source: string): string {
    const normalized: Record<string, string> = {
      'google.com': 'google',
      'google.co.uk': 'google',
      'facebook.com': 'facebook',
      'fb.com': 'facebook',
      't.co': 'twitter',
      'twitter.com': 'twitter',
      'linkedin.com': 'linkedin',
    }

    const lowerSource = source.toLowerCase()

    for (const [key, value] of Object.entries(normalized)) {
      if (lowerSource.includes(key)) {
        return value
      }
    }

    return source
  }
}

describe('ReferrerParser - Referrer Source Classification', () => {
  let parser: ReferrerParser

  beforeEach(() => {
    parser = new ReferrerParser()
  })

  describe('parse', () => {
    it('should parse direct traffic', () => {
      const result = parser.parse('')

      expect(result.source).toBe('(direct)')
      expect(result.medium).toBe('direct')
      expect(result.isInternal).toBe(false)
    })

    it('should parse Google search referrer', () => {
      const referrer = 'https://www.google.com/search?q=analytics'
      const result = parser.parse(referrer)

      expect(result.source).toBe('google')
      expect(result.medium).toBe('search')
      expect(result.searchTerm).toBe('analytics')
    })

    it('should parse Facebook referrer', () => {
      const referrer = 'https://www.facebook.com/somepage'
      const result = parser.parse(referrer)

      expect(result.source).toBe('facebook')
      expect(result.medium).toBe('social')
    })

    it('should parse referral traffic', () => {
      const referrer = 'https://example.com/page'
      const result = parser.parse(referrer)

      expect(result.source).toBe('example.com')
      expect(result.medium).toBe('referral')
    })

    it('should parse UTM parameters', () => {
      const referrer = 'https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=launch'
      const result = parser.parse(referrer)

      expect(result.source).toBe('newsletter')
      expect(result.medium).toBe('email')
      expect(result.campaign).toBe('launch')
    })

    it('should detect internal referrers', () => {
      const referrer = 'https://mysite.com/page1'
      const result = parser.parse(referrer, 'mysite.com')

      expect(result.medium).toBe('internal')
      expect(result.isInternal).toBe(true)
    })

    it('should handle invalid URLs', () => {
      const result = parser.parse('not a url')

      expect(result.source).toBe('(direct)')
      expect(result.medium).toBe('direct')
    })
  })

  describe('extractSearchTerm', () => {
    it('should extract search term from Google', () => {
      const url = new URL('https://www.google.com/search?q=analytics')
      const term = parser.extractSearchTerm(url)

      expect(term).toBe('analytics')
    })

    it('should extract search term from Bing', () => {
      const url = new URL('https://www.bing.com/search?q=test')
      const term = parser.extractSearchTerm(url)

      expect(term).toBe('test')
    })

    it('should return undefined when no search term', () => {
      const url = new URL('https://www.google.com/')
      const term = parser.extractSearchTerm(url)

      expect(term).toBeUndefined()
    })
  })

  describe('classifyMedium', () => {
    it('should classify search traffic', () => {
      const medium = parser.classifyMedium('https://www.google.com/search?q=test')
      expect(medium).toBe('search')
    })

    it('should classify social traffic', () => {
      const medium = parser.classifyMedium('https://twitter.com/post')
      expect(medium).toBe('social')
    })

    it('should classify direct traffic', () => {
      const medium = parser.classifyMedium('')
      expect(medium).toBe('direct')
    })

    it('should classify referral traffic', () => {
      const medium = parser.classifyMedium('https://example.com')
      expect(medium).toBe('referral')
    })
  })

  describe('isSearch', () => {
    it('should return true for search engines', () => {
      expect(parser.isSearch('https://www.google.com/search?q=test')).toBe(true)
      expect(parser.isSearch('https://www.bing.com/search?q=test')).toBe(true)
    })

    it('should return false for non-search referrers', () => {
      expect(parser.isSearch('https://facebook.com')).toBe(false)
      expect(parser.isSearch('')).toBe(false)
    })
  })

  describe('isSocial', () => {
    it('should return true for social networks', () => {
      expect(parser.isSocial('https://facebook.com')).toBe(true)
      expect(parser.isSocial('https://twitter.com')).toBe(true)
      expect(parser.isSocial('https://linkedin.com')).toBe(true)
    })

    it('should return false for non-social referrers', () => {
      expect(parser.isSocial('https://google.com')).toBe(false)
      expect(parser.isSocial('')).toBe(false)
    })
  })

  describe('isDirect', () => {
    it('should return true for direct traffic', () => {
      expect(parser.isDirect('')).toBe(true)
    })

    it('should return false for referrers', () => {
      expect(parser.isDirect('https://google.com')).toBe(false)
    })
  })

  describe('getSourceStats', () => {
    it('should calculate source statistics', () => {
      const referrers = [
        'https://www.google.com/search?q=test',
        'https://www.google.com/search?q=test2',
        'https://facebook.com',
      ]

      const stats = parser.getSourceStats(referrers)

      expect(stats).toHaveLength(2)
      expect(stats[0].source).toBe('google')
      expect(stats[0].count).toBe(2)
      expect(stats[0].percentage).toBe(66.7)
    })

    it('should handle empty array', () => {
      const stats = parser.getSourceStats([])
      expect(stats).toHaveLength(0)
    })

    it('should sort by count descending', () => {
      const referrers = [
        'https://example.com',
        'https://google.com/search?q=test',
        'https://google.com/search?q=test2',
        'https://google.com/search?q=test3',
      ]

      const stats = parser.getSourceStats(referrers)

      expect(stats[0].source).toBe('google')
      expect(stats[0].count).toBe(3)
    })
  })

  describe('getMediumStats', () => {
    it('should calculate medium statistics', () => {
      const referrers = [
        'https://www.google.com/search?q=test',
        'https://www.bing.com/search?q=test',
        'https://facebook.com',
      ]

      const stats = parser.getMediumStats(referrers)

      expect(stats.length).toBeGreaterThan(0)
      const searchStat = stats.find(s => s.medium === 'search')
      expect(searchStat?.count).toBe(2)
    })

    it('should handle empty array', () => {
      const stats = parser.getMediumStats([])
      expect(stats).toHaveLength(0)
    })
  })

  describe('getTopReferrers', () => {
    it('should return top N referrers', () => {
      const referrers = [
        'https://google.com',
        'https://google.com',
        'https://google.com',
        'https://facebook.com',
        'https://facebook.com',
        'https://twitter.com',
      ]

      const top = parser.getTopReferrers(referrers, 2)

      expect(top).toHaveLength(2)
      expect(top[0].source).toBe('google')
      expect(top[1].source).toBe('facebook')
    })

    it('should handle limit greater than available sources', () => {
      const referrers = ['https://google.com']
      const top = parser.getTopReferrers(referrers, 10)

      expect(top).toHaveLength(1)
    })
  })

  describe('filterByMedium', () => {
    it('should filter referrers by medium', () => {
      const referrers = [
        'https://www.google.com/search?q=test',
        'https://facebook.com',
        'https://www.bing.com/search?q=test',
      ]

      const searchReferrers = parser.filterByMedium(referrers, 'search')

      expect(searchReferrers).toHaveLength(2)
    })

    it('should return empty array when no matches', () => {
      const referrers = ['https://google.com/search?q=test']
      const socialReferrers = parser.filterByMedium(referrers, 'social')

      expect(socialReferrers).toHaveLength(0)
    })
  })

  describe('getOrganicPercentage', () => {
    it('should calculate organic traffic percentage', () => {
      const referrers = [
        'https://www.google.com/search?q=test',
        'https://facebook.com',
        '',
      ]

      const percentage = parser.getOrganicPercentage(referrers)

      expect(percentage).toBe(33.3)
    })

    it('should return 0 for empty array', () => {
      const percentage = parser.getOrganicPercentage([])
      expect(percentage).toBe(0)
    })

    it('should return 0 when no organic traffic', () => {
      const referrers = ['https://facebook.com', '']
      const percentage = parser.getOrganicPercentage(referrers)

      expect(percentage).toBe(0)
    })
  })

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      const domain = parser.extractDomain('https://www.example.com/page')
      expect(domain).toBe('example.com')
    })

    it('should return null for empty referrer', () => {
      const domain = parser.extractDomain('')
      expect(domain).toBeNull()
    })

    it('should return null for invalid URL', () => {
      const domain = parser.extractDomain('not a url')
      expect(domain).toBeNull()
    })
  })

  describe('isValidReferrer', () => {
    it('should validate correct URLs', () => {
      expect(parser.isValidReferrer('https://example.com')).toBe(true)
      expect(parser.isValidReferrer('http://example.com')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(parser.isValidReferrer('not a url')).toBe(false)
      expect(parser.isValidReferrer('')).toBe(false)
    })
  })

  describe('normalizeSource', () => {
    it('should normalize Google domains', () => {
      expect(parser.normalizeSource('google.com')).toBe('google')
      expect(parser.normalizeSource('google.co.uk')).toBe('google')
    })

    it('should normalize Facebook domains', () => {
      expect(parser.normalizeSource('facebook.com')).toBe('facebook')
      expect(parser.normalizeSource('fb.com')).toBe('facebook')
    })

    it('should keep unknown sources as-is', () => {
      expect(parser.normalizeSource('example.com')).toBe('example.com')
    })
  })
})
