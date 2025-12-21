import { describe, it, expect, beforeEach } from 'vitest'

/**
 * TDD Tests for Google Analytics Data Parser
 * These tests define the expected behavior BEFORE implementation
 */

// Types we expect to exist
interface GAReportRow {
  dimensionValues: { value: string }[]
  metricValues: { value: string }[]
}

interface GAReport {
  rows: GAReportRow[]
  dimensionHeaders: { name: string }[]
  metricHeaders: { name: string }[]
}

interface ParsedAnalyticsData {
  date: string
  pageviews: number
  sessions: number
  users: number
  newUsers: number
  bounceRate: number
  avgSessionDuration: number
  screenPageViews: number
}

interface ParsedPageData {
  path: string
  title: string
  pageviews: number
  uniquePageviews: number
  avgTimeOnPage: number
  entrances: number
  exits: number
  bounceRate: number
}

interface ParsedReferrerData {
  source: string
  medium: string
  sessions: number
  users: number
  bounceRate: number
  conversions: number
}

interface ParsedGeoData {
  country: string
  countryCode: string
  city: string
  sessions: number
  users: number
  pageviews: number
}

interface ParsedDeviceData {
  deviceCategory: string
  browser: string
  operatingSystem: string
  sessions: number
  users: number
  bounceRate: number
}

// Mock implementations for TDD - these will be replaced with real implementations
const parseOverviewReport = (report: GAReport): ParsedAnalyticsData[] => {
  return report.rows.map(row => ({
    date: row.dimensionValues[0]?.value || '',
    pageviews: parseInt(row.metricValues[0]?.value || '0'),
    sessions: parseInt(row.metricValues[1]?.value || '0'),
    users: parseInt(row.metricValues[2]?.value || '0'),
    newUsers: parseInt(row.metricValues[3]?.value || '0'),
    bounceRate: parseFloat(row.metricValues[4]?.value || '0'),
    avgSessionDuration: parseFloat(row.metricValues[5]?.value || '0'),
    screenPageViews: parseInt(row.metricValues[6]?.value || '0')
  }))
}

const parsePagesReport = (report: GAReport): ParsedPageData[] => {
  return report.rows.map(row => ({
    path: row.dimensionValues[0]?.value || '/',
    title: row.dimensionValues[1]?.value || 'Untitled',
    pageviews: parseInt(row.metricValues[0]?.value || '0'),
    uniquePageviews: parseInt(row.metricValues[1]?.value || '0'),
    avgTimeOnPage: parseFloat(row.metricValues[2]?.value || '0'),
    entrances: parseInt(row.metricValues[3]?.value || '0'),
    exits: parseInt(row.metricValues[4]?.value || '0'),
    bounceRate: parseFloat(row.metricValues[5]?.value || '0')
  }))
}

const parseReferrersReport = (report: GAReport): ParsedReferrerData[] => {
  return report.rows.map(row => ({
    source: row.dimensionValues[0]?.value || 'direct',
    medium: row.dimensionValues[1]?.value || 'none',
    sessions: parseInt(row.metricValues[0]?.value || '0'),
    users: parseInt(row.metricValues[1]?.value || '0'),
    bounceRate: parseFloat(row.metricValues[2]?.value || '0'),
    conversions: parseInt(row.metricValues[3]?.value || '0')
  }))
}

const parseGeoReport = (report: GAReport): ParsedGeoData[] => {
  return report.rows.map(row => ({
    country: row.dimensionValues[0]?.value || 'Unknown',
    countryCode: row.dimensionValues[1]?.value || 'XX',
    city: row.dimensionValues[2]?.value || 'Unknown',
    sessions: parseInt(row.metricValues[0]?.value || '0'),
    users: parseInt(row.metricValues[1]?.value || '0'),
    pageviews: parseInt(row.metricValues[2]?.value || '0')
  }))
}

const parseDevicesReport = (report: GAReport): ParsedDeviceData[] => {
  return report.rows.map(row => ({
    deviceCategory: row.dimensionValues[0]?.value || 'desktop',
    browser: row.dimensionValues[1]?.value || 'Unknown',
    operatingSystem: row.dimensionValues[2]?.value || 'Unknown',
    sessions: parseInt(row.metricValues[0]?.value || '0'),
    users: parseInt(row.metricValues[1]?.value || '0'),
    bounceRate: parseFloat(row.metricValues[2]?.value || '0')
  }))
}

const formatGADate = (gaDate: string): string => {
  // GA4 returns dates as YYYYMMDD
  if (gaDate.length === 8) {
    return `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}`
  }
  return gaDate
}

const normalizePagePath = (path: string): string => {
  // Remove query params and trailing slashes
  let normalized = path.split('?')[0]
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized || '/'
}

const aggregateByDate = (data: ParsedAnalyticsData[]): Map<string, ParsedAnalyticsData> => {
  const aggregated = new Map<string, ParsedAnalyticsData>()

  for (const row of data) {
    const existing = aggregated.get(row.date)
    if (existing) {
      existing.pageviews += row.pageviews
      existing.sessions += row.sessions
      existing.users += row.users
      existing.newUsers += row.newUsers
      // Weighted average for rates
      const totalSessions = existing.sessions
      existing.bounceRate = ((existing.bounceRate * (totalSessions - row.sessions)) + (row.bounceRate * row.sessions)) / totalSessions
      existing.avgSessionDuration = ((existing.avgSessionDuration * (totalSessions - row.sessions)) + (row.avgSessionDuration * row.sessions)) / totalSessions
      existing.screenPageViews += row.screenPageViews
    } else {
      aggregated.set(row.date, { ...row })
    }
  }

  return aggregated
}

describe('Google Analytics Parser', () => {
  describe('parseOverviewReport', () => {
    it('parses a valid GA4 overview report', () => {
      const report: GAReport = {
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: [
          { name: 'screenPageViews' },
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViewsPerSession' }
        ],
        rows: [
          {
            dimensionValues: [{ value: '20240115' }],
            metricValues: [
              { value: '1000' },
              { value: '500' },
              { value: '400' },
              { value: '100' },
              { value: '0.45' },
              { value: '180.5' },
              { value: '2.0' }
            ]
          }
        ]
      }

      const result = parseOverviewReport(report)

      expect(result).toHaveLength(1)
      expect(result[0].pageviews).toBe(1000)
      expect(result[0].sessions).toBe(500)
      expect(result[0].users).toBe(400)
      expect(result[0].newUsers).toBe(100)
      expect(result[0].bounceRate).toBe(0.45)
      expect(result[0].avgSessionDuration).toBe(180.5)
    })

    it('handles empty report', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: []
      }

      const result = parseOverviewReport(report)
      expect(result).toHaveLength(0)
    })

    it('handles missing metric values with defaults', () => {
      const report: GAReport = {
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: '20240115' }],
            metricValues: []
          }
        ]
      }

      const result = parseOverviewReport(report)
      expect(result[0].pageviews).toBe(0)
      expect(result[0].sessions).toBe(0)
    })

    it('parses multiple rows correctly', () => {
      const report: GAReport = {
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: '20240115' }],
            metricValues: [{ value: '100' }, { value: '50' }]
          },
          {
            dimensionValues: [{ value: '20240116' }],
            metricValues: [{ value: '200' }, { value: '100' }]
          },
          {
            dimensionValues: [{ value: '20240117' }],
            metricValues: [{ value: '150' }, { value: '75' }]
          }
        ]
      }

      const result = parseOverviewReport(report)
      expect(result).toHaveLength(3)
      expect(result[0].pageviews).toBe(100)
      expect(result[1].pageviews).toBe(200)
      expect(result[2].pageviews).toBe(150)
    })
  })

  describe('parsePagesReport', () => {
    it('parses page data correctly', () => {
      const report: GAReport = {
        dimensionHeaders: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: '/pricing' }, { value: 'Pricing - ZTA' }],
            metricValues: [
              { value: '500' },
              { value: '450' },
              { value: '45.5' },
              { value: '200' },
              { value: '180' },
              { value: '0.35' }
            ]
          }
        ]
      }

      const result = parsePagesReport(report)

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/pricing')
      expect(result[0].title).toBe('Pricing - ZTA')
      expect(result[0].pageviews).toBe(500)
      expect(result[0].uniquePageviews).toBe(450)
    })

    it('handles missing page title', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: '/unknown' }],
            metricValues: [{ value: '100' }]
          }
        ]
      }

      const result = parsePagesReport(report)
      expect(result[0].title).toBe('Untitled')
    })
  })

  describe('parseReferrersReport', () => {
    it('parses referrer data correctly', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: 'google' }, { value: 'organic' }],
            metricValues: [
              { value: '1000' },
              { value: '800' },
              { value: '0.42' },
              { value: '50' }
            ]
          }
        ]
      }

      const result = parseReferrersReport(report)

      expect(result[0].source).toBe('google')
      expect(result[0].medium).toBe('organic')
      expect(result[0].sessions).toBe(1000)
      expect(result[0].conversions).toBe(50)
    })

    it('handles direct traffic', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [{ value: '(direct)' }, { value: '(none)' }],
            metricValues: [{ value: '500' }]
          }
        ]
      }

      const result = parseReferrersReport(report)
      expect(result[0].source).toBe('(direct)')
      expect(result[0].medium).toBe('(none)')
    })
  })

  describe('parseGeoReport', () => {
    it('parses geographic data correctly', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [
              { value: 'United States' },
              { value: 'US' },
              { value: 'New York' }
            ],
            metricValues: [
              { value: '1000' },
              { value: '800' },
              { value: '2500' }
            ]
          }
        ]
      }

      const result = parseGeoReport(report)

      expect(result[0].country).toBe('United States')
      expect(result[0].countryCode).toBe('US')
      expect(result[0].city).toBe('New York')
      expect(result[0].sessions).toBe(1000)
    })

    it('handles unknown locations', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [],
            metricValues: [{ value: '100' }]
          }
        ]
      }

      const result = parseGeoReport(report)
      expect(result[0].country).toBe('Unknown')
      expect(result[0].countryCode).toBe('XX')
    })
  })

  describe('parseDevicesReport', () => {
    it('parses device data correctly', () => {
      const report: GAReport = {
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [
          {
            dimensionValues: [
              { value: 'mobile' },
              { value: 'Chrome' },
              { value: 'Android' }
            ],
            metricValues: [
              { value: '500' },
              { value: '450' },
              { value: '0.55' }
            ]
          }
        ]
      }

      const result = parseDevicesReport(report)

      expect(result[0].deviceCategory).toBe('mobile')
      expect(result[0].browser).toBe('Chrome')
      expect(result[0].operatingSystem).toBe('Android')
      expect(result[0].bounceRate).toBe(0.55)
    })
  })

  describe('formatGADate', () => {
    it('formats YYYYMMDD to YYYY-MM-DD', () => {
      expect(formatGADate('20240115')).toBe('2024-01-15')
      expect(formatGADate('20231231')).toBe('2023-12-31')
      expect(formatGADate('20240101')).toBe('2024-01-01')
    })

    it('returns already formatted dates as-is', () => {
      expect(formatGADate('2024-01-15')).toBe('2024-01-15')
    })

    it('handles edge cases', () => {
      expect(formatGADate('')).toBe('')
      expect(formatGADate('invalid')).toBe('invalid')
    })
  })

  describe('normalizePagePath', () => {
    it('removes query parameters', () => {
      expect(normalizePagePath('/page?utm_source=google')).toBe('/page')
      expect(normalizePagePath('/search?q=test&page=1')).toBe('/search')
    })

    it('removes trailing slashes', () => {
      expect(normalizePagePath('/about/')).toBe('/about')
      expect(normalizePagePath('/docs/api/')).toBe('/docs/api')
    })

    it('preserves root path', () => {
      expect(normalizePagePath('/')).toBe('/')
      expect(normalizePagePath('')).toBe('/')
    })

    it('handles complex paths', () => {
      expect(normalizePagePath('/blog/post-1/?ref=twitter')).toBe('/blog/post-1')
    })
  })

  describe('aggregateByDate', () => {
    it('aggregates data for the same date', () => {
      const data: ParsedAnalyticsData[] = [
        {
          date: '2024-01-15',
          pageviews: 100,
          sessions: 50,
          users: 40,
          newUsers: 10,
          bounceRate: 0.4,
          avgSessionDuration: 120,
          screenPageViews: 100
        },
        {
          date: '2024-01-15',
          pageviews: 200,
          sessions: 100,
          users: 80,
          newUsers: 20,
          bounceRate: 0.5,
          avgSessionDuration: 180,
          screenPageViews: 200
        }
      ]

      const result = aggregateByDate(data)

      expect(result.size).toBe(1)
      const aggregated = result.get('2024-01-15')!
      expect(aggregated.pageviews).toBe(300)
      expect(aggregated.sessions).toBe(150)
      expect(aggregated.users).toBe(120)
    })

    it('keeps separate dates separate', () => {
      const data: ParsedAnalyticsData[] = [
        {
          date: '2024-01-15',
          pageviews: 100,
          sessions: 50,
          users: 40,
          newUsers: 10,
          bounceRate: 0.4,
          avgSessionDuration: 120,
          screenPageViews: 100
        },
        {
          date: '2024-01-16',
          pageviews: 200,
          sessions: 100,
          users: 80,
          newUsers: 20,
          bounceRate: 0.5,
          avgSessionDuration: 180,
          screenPageViews: 200
        }
      ]

      const result = aggregateByDate(data)

      expect(result.size).toBe(2)
      expect(result.get('2024-01-15')!.pageviews).toBe(100)
      expect(result.get('2024-01-16')!.pageviews).toBe(200)
    })
  })
})
