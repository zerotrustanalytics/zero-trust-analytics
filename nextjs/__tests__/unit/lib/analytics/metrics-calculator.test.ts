import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Metrics Calculator Module - Calculates analytics metrics
 * Including pageviews, visitors, bounce rate, session duration
 */

interface Session {
  id: string
  userId?: string
  startTime: Date
  endTime?: Date
  pageViews: number
  bounced: boolean
}

interface PageView {
  timestamp: Date
  sessionId: string
  userId?: string
  duration?: number
  path: string
}

interface MetricsSummary {
  totalPageViews: number
  uniqueVisitors: number
  totalSessions: number
  bounceRate: number
  avgSessionDuration: number
  avgPageViewsPerSession: number
}

interface ComparisonMetrics {
  current: number
  previous: number
  change: number
  changePercent: number
}

// TDD: Implementation will follow these tests
class MetricsCalculator {
  /**
   * Calculate total pageviews
   */
  calculatePageViews(pageViews: PageView[]): number {
    return pageViews.length
  }

  /**
   * Calculate unique visitors
   */
  calculateUniqueVisitors(pageViews: PageView[]): number {
    const uniqueUsers = new Set(
      pageViews.filter(pv => pv.userId).map(pv => pv.userId)
    )
    return uniqueUsers.size
  }

  /**
   * Calculate bounce rate
   */
  calculateBounceRate(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const bouncedSessions = sessions.filter(s => s.bounced).length
    return Math.round((bouncedSessions / sessions.length) * 100 * 10) / 10
  }

  /**
   * Calculate average session duration (in seconds)
   */
  calculateAvgSessionDuration(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const totalDuration = sessions.reduce((sum, session) => {
      if (!session.endTime) return sum
      const duration = (session.endTime.getTime() - session.startTime.getTime()) / 1000
      return sum + duration
    }, 0)

    return Math.round(totalDuration / sessions.length)
  }

  /**
   * Calculate average pageviews per session
   */
  calculateAvgPageViewsPerSession(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const totalPageViews = sessions.reduce((sum, s) => sum + s.pageViews, 0)
    return Math.round((totalPageViews / sessions.length) * 10) / 10
  }

  /**
   * Calculate comprehensive metrics summary
   */
  calculateMetricsSummary(
    pageViews: PageView[],
    sessions: Session[]
  ): MetricsSummary {
    return {
      totalPageViews: this.calculatePageViews(pageViews),
      uniqueVisitors: this.calculateUniqueVisitors(pageViews),
      totalSessions: sessions.length,
      bounceRate: this.calculateBounceRate(sessions),
      avgSessionDuration: this.calculateAvgSessionDuration(sessions),
      avgPageViewsPerSession: this.calculateAvgPageViewsPerSession(sessions),
    }
  }

  /**
   * Calculate pageviews per minute
   */
  calculatePageViewsPerMinute(pageViews: PageView[], minutes: number): number {
    if (minutes <= 0) return 0
    return Math.round((pageViews.length / minutes) * 10) / 10
  }

  /**
   * Calculate pageviews per hour
   */
  calculatePageViewsPerHour(pageViews: PageView[], hours: number): number {
    if (hours <= 0) return 0
    return Math.round((pageViews.length / hours) * 10) / 10
  }

  /**
   * Calculate session rate (sessions per visitor)
   */
  calculateSessionRate(sessions: Session[], uniqueVisitors: number): number {
    if (uniqueVisitors === 0) return 0
    return Math.round((sessions.length / uniqueVisitors) * 10) / 10
  }

  /**
   * Calculate engagement rate (non-bounce rate)
   */
  calculateEngagementRate(sessions: Session[]): number {
    if (sessions.length === 0) return 0
    const bounceRate = this.calculateBounceRate(sessions)
    return Math.round((100 - bounceRate) * 10) / 10
  }

  /**
   * Calculate returning visitor rate
   */
  calculateReturningVisitorRate(
    totalVisitors: number,
    returningVisitors: number
  ): number {
    if (totalVisitors === 0) return 0
    return Math.round((returningVisitors / totalVisitors) * 100 * 10) / 10
  }

  /**
   * Calculate metrics comparison between two periods
   */
  compareMetrics(current: number, previous: number): ComparisonMetrics {
    const change = current - previous
    const changePercent = previous === 0
      ? (current > 0 ? 100 : 0)
      : Math.round((change / previous) * 100 * 10) / 10

    return {
      current,
      previous,
      change,
      changePercent,
    }
  }

  /**
   * Calculate percentile for session duration
   */
  calculatePercentile(sessions: Session[], percentile: number): number {
    if (sessions.length === 0) return 0

    const durations = sessions
      .filter(s => s.endTime)
      .map(s => (s.endTime!.getTime() - s.startTime.getTime()) / 1000)
      .sort((a, b) => a - b)

    if (durations.length === 0) return 0

    const index = Math.ceil((percentile / 100) * durations.length) - 1
    return Math.round(durations[index])
  }

  /**
   * Calculate median session duration
   */
  calculateMedianSessionDuration(sessions: Session[]): number {
    return this.calculatePercentile(sessions, 50)
  }

  /**
   * Calculate pages per visitor
   */
  calculatePagesPerVisitor(
    totalPageViews: number,
    uniqueVisitors: number
  ): number {
    if (uniqueVisitors === 0) return 0
    return Math.round((totalPageViews / uniqueVisitors) * 10) / 10
  }

  /**
   * Calculate time on page average
   */
  calculateAvgTimeOnPage(pageViews: PageView[]): number {
    const viewsWithDuration = pageViews.filter(pv => pv.duration !== undefined)

    if (viewsWithDuration.length === 0) return 0

    const totalDuration = viewsWithDuration.reduce(
      (sum, pv) => sum + (pv.duration || 0),
      0
    )

    return Math.round(totalDuration / viewsWithDuration.length)
  }

  /**
   * Calculate conversion rate
   */
  calculateConversionRate(conversions: number, visitors: number): number {
    if (visitors === 0) return 0
    return Math.round((conversions / visitors) * 100 * 10) / 10
  }

  /**
   * Calculate exit rate for a specific page
   */
  calculateExitRate(exits: number, totalPageViews: number): number {
    if (totalPageViews === 0) return 0
    return Math.round((exits / totalPageViews) * 100 * 10) / 10
  }

  /**
   * Check if session is bounced
   */
  isBounced(session: Session): boolean {
    return session.pageViews <= 1
  }

  /**
   * Classify session duration
   */
  classifySessionDuration(durationSeconds: number): string {
    if (durationSeconds < 10) return 'very-short'
    if (durationSeconds < 30) return 'short'
    if (durationSeconds < 120) return 'medium'
    if (durationSeconds < 300) return 'long'
    return 'very-long'
  }

  /**
   * Calculate time-based metrics
   */
  calculateTimeBuckets(sessions: Session[]): Record<string, number> {
    const buckets = {
      'very-short': 0,
      'short': 0,
      'medium': 0,
      'long': 0,
      'very-long': 0,
    }

    sessions.forEach(session => {
      if (!session.endTime) return

      const duration = (session.endTime.getTime() - session.startTime.getTime()) / 1000
      const classification = this.classifySessionDuration(duration)
      buckets[classification as keyof typeof buckets]++
    })

    return buckets
  }
}

describe('MetricsCalculator - Analytics Metrics Calculation', () => {
  let calculator: MetricsCalculator

  beforeEach(() => {
    calculator = new MetricsCalculator()
  })

  describe('calculatePageViews', () => {
    it('should count total pageviews', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', path: '/' },
        { timestamp: new Date(), sessionId: 's1', path: '/about' },
        { timestamp: new Date(), sessionId: 's2', path: '/' },
      ]

      const result = calculator.calculatePageViews(pageViews)
      expect(result).toBe(3)
    })

    it('should return 0 for empty array', () => {
      const result = calculator.calculatePageViews([])
      expect(result).toBe(0)
    })

    it('should count pageviews from same session', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', path: '/page1' },
        { timestamp: new Date(), sessionId: 's1', path: '/page2' },
        { timestamp: new Date(), sessionId: 's1', path: '/page3' },
      ]

      const result = calculator.calculatePageViews(pageViews)
      expect(result).toBe(3)
    })
  })

  describe('calculateUniqueVisitors', () => {
    it('should count unique visitors', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', userId: 'u1', path: '/' },
        { timestamp: new Date(), sessionId: 's1', userId: 'u1', path: '/about' },
        { timestamp: new Date(), sessionId: 's2', userId: 'u2', path: '/' },
      ]

      const result = calculator.calculateUniqueVisitors(pageViews)
      expect(result).toBe(2)
    })

    it('should return 0 when no userId present', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', path: '/' },
        { timestamp: new Date(), sessionId: 's2', path: '/about' },
      ]

      const result = calculator.calculateUniqueVisitors(pageViews)
      expect(result).toBe(0)
    })

    it('should handle mix of identified and anonymous users', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', userId: 'u1', path: '/' },
        { timestamp: new Date(), sessionId: 's2', path: '/about' },
        { timestamp: new Date(), sessionId: 's3', userId: 'u2', path: '/contact' },
      ]

      const result = calculator.calculateUniqueVisitors(pageViews)
      expect(result).toBe(2)
    })

    it('should handle empty array', () => {
      const result = calculator.calculateUniqueVisitors([])
      expect(result).toBe(0)
    })
  })

  describe('calculateBounceRate', () => {
    it('should calculate bounce rate correctly', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 1, bounced: true },
        { id: 's2', startTime: new Date(), pageViews: 3, bounced: false },
        { id: 's3', startTime: new Date(), pageViews: 1, bounced: true },
      ]

      const result = calculator.calculateBounceRate(sessions)
      expect(result).toBe(66.7) // 2/3 * 100 = 66.7%
    })

    it('should return 0 for empty sessions', () => {
      const result = calculator.calculateBounceRate([])
      expect(result).toBe(0)
    })

    it('should handle 100% bounce rate', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 1, bounced: true },
        { id: 's2', startTime: new Date(), pageViews: 1, bounced: true },
      ]

      const result = calculator.calculateBounceRate(sessions)
      expect(result).toBe(100)
    })

    it('should handle 0% bounce rate', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 2, bounced: false },
        { id: 's2', startTime: new Date(), pageViews: 3, bounced: false },
      ]

      const result = calculator.calculateBounceRate(sessions)
      expect(result).toBe(0)
    })

    it('should round to one decimal place', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 1, bounced: true },
        { id: 's2', startTime: new Date(), pageViews: 2, bounced: false },
        { id: 's3', startTime: new Date(), pageViews: 2, bounced: false },
      ]

      const result = calculator.calculateBounceRate(sessions)
      expect(result).toBe(33.3)
    })
  })

  describe('calculateAvgSessionDuration', () => {
    it('should calculate average session duration', () => {
      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:01:00Z'),
          pageViews: 2,
          bounced: false,
        },
        {
          id: 's2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:03:00Z'),
          pageViews: 3,
          bounced: false,
        },
      ]

      const result = calculator.calculateAvgSessionDuration(sessions)
      expect(result).toBe(120) // (60 + 180) / 2 = 120 seconds
    })

    it('should return 0 for empty sessions', () => {
      const result = calculator.calculateAvgSessionDuration([])
      expect(result).toBe(0)
    })

    it('should skip sessions without endTime', () => {
      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:02:00Z'),
          pageViews: 2,
          bounced: false,
        },
        {
          id: 's2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          pageViews: 1,
          bounced: true,
        },
      ]

      const result = calculator.calculateAvgSessionDuration(sessions)
      expect(result).toBe(60)
    })

    it('should round to nearest second', () => {
      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00.000Z'),
          endTime: new Date('2024-01-01T10:00:05.500Z'),
          pageViews: 2,
          bounced: false,
        },
      ]

      const result = calculator.calculateAvgSessionDuration(sessions)
      expect(result).toBe(6) // 5.5 seconds rounded to 6
    })
  })

  describe('calculateAvgPageViewsPerSession', () => {
    it('should calculate average pageviews per session', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 3, bounced: false },
        { id: 's2', startTime: new Date(), pageViews: 1, bounced: true },
        { id: 's3', startTime: new Date(), pageViews: 5, bounced: false },
      ]

      const result = calculator.calculateAvgPageViewsPerSession(sessions)
      expect(result).toBe(3) // (3 + 1 + 5) / 3 = 3
    })

    it('should return 0 for empty sessions', () => {
      const result = calculator.calculateAvgPageViewsPerSession([])
      expect(result).toBe(0)
    })

    it('should round to one decimal place', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 2, bounced: false },
        { id: 's2', startTime: new Date(), pageViews: 3, bounced: false },
      ]

      const result = calculator.calculateAvgPageViewsPerSession(sessions)
      expect(result).toBe(2.5)
    })
  })

  describe('calculateMetricsSummary', () => {
    it('should calculate comprehensive metrics summary', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', userId: 'u1', path: '/' },
        { timestamp: new Date(), sessionId: 's1', userId: 'u1', path: '/about' },
        { timestamp: new Date(), sessionId: 's2', userId: 'u2', path: '/' },
      ]

      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:02:00Z'),
          pageViews: 2,
          bounced: false,
        },
        {
          id: 's2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:00:30Z'),
          pageViews: 1,
          bounced: true,
        },
      ]

      const result = calculator.calculateMetricsSummary(pageViews, sessions)

      expect(result.totalPageViews).toBe(3)
      expect(result.uniqueVisitors).toBe(2)
      expect(result.totalSessions).toBe(2)
      expect(result.bounceRate).toBe(50)
      expect(result.avgSessionDuration).toBe(75)
      expect(result.avgPageViewsPerSession).toBe(1.5)
    })

    it('should handle empty data', () => {
      const result = calculator.calculateMetricsSummary([], [])

      expect(result.totalPageViews).toBe(0)
      expect(result.uniqueVisitors).toBe(0)
      expect(result.totalSessions).toBe(0)
      expect(result.bounceRate).toBe(0)
      expect(result.avgSessionDuration).toBe(0)
      expect(result.avgPageViewsPerSession).toBe(0)
    })
  })

  describe('calculatePageViewsPerMinute', () => {
    it('should calculate pageviews per minute', () => {
      const pageViews: PageView[] = Array(60).fill(null).map(() => ({
        timestamp: new Date(),
        sessionId: 's1',
        path: '/',
      }))

      const result = calculator.calculatePageViewsPerMinute(pageViews, 10)
      expect(result).toBe(6) // 60 / 10 = 6
    })

    it('should return 0 when minutes is 0', () => {
      const pageViews: PageView[] = [
        { timestamp: new Date(), sessionId: 's1', path: '/' },
      ]

      const result = calculator.calculatePageViewsPerMinute(pageViews, 0)
      expect(result).toBe(0)
    })

    it('should round to one decimal place', () => {
      const pageViews: PageView[] = Array(10).fill(null).map(() => ({
        timestamp: new Date(),
        sessionId: 's1',
        path: '/',
      }))

      const result = calculator.calculatePageViewsPerMinute(pageViews, 3)
      expect(result).toBe(3.3)
    })
  })

  describe('calculatePageViewsPerHour', () => {
    it('should calculate pageviews per hour', () => {
      const pageViews: PageView[] = Array(100).fill(null).map(() => ({
        timestamp: new Date(),
        sessionId: 's1',
        path: '/',
      }))

      const result = calculator.calculatePageViewsPerHour(pageViews, 2)
      expect(result).toBe(50)
    })

    it('should return 0 when hours is 0', () => {
      const result = calculator.calculatePageViewsPerHour([], 0)
      expect(result).toBe(0)
    })
  })

  describe('calculateEngagementRate', () => {
    it('should calculate engagement rate as inverse of bounce rate', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 1, bounced: true },
        { id: 's2', startTime: new Date(), pageViews: 3, bounced: false },
      ]

      const result = calculator.calculateEngagementRate(sessions)
      expect(result).toBe(50) // 100 - 50 = 50%
    })

    it('should return 0 for empty sessions', () => {
      const result = calculator.calculateEngagementRate([])
      expect(result).toBe(0)
    })

    it('should return 100 when no bounces', () => {
      const sessions: Session[] = [
        { id: 's1', startTime: new Date(), pageViews: 2, bounced: false },
      ]

      const result = calculator.calculateEngagementRate(sessions)
      expect(result).toBe(100)
    })
  })

  describe('compareMetrics', () => {
    it('should compare current and previous metrics', () => {
      const result = calculator.compareMetrics(150, 100)

      expect(result.current).toBe(150)
      expect(result.previous).toBe(100)
      expect(result.change).toBe(50)
      expect(result.changePercent).toBe(50)
    })

    it('should handle negative change', () => {
      const result = calculator.compareMetrics(75, 100)

      expect(result.change).toBe(-25)
      expect(result.changePercent).toBe(-25)
    })

    it('should handle zero previous value', () => {
      const result = calculator.compareMetrics(100, 0)

      expect(result.changePercent).toBe(100)
    })

    it('should handle both zero values', () => {
      const result = calculator.compareMetrics(0, 0)

      expect(result.change).toBe(0)
      expect(result.changePercent).toBe(0)
    })
  })

  describe('calculatePercentile', () => {
    it('should calculate 50th percentile (median)', () => {
      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:01:00Z'),
          pageViews: 1,
          bounced: false,
        },
        {
          id: 's2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:03:00Z'),
          pageViews: 2,
          bounced: false,
        },
        {
          id: 's3',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:05:00Z'),
          pageViews: 3,
          bounced: false,
        },
      ]

      const result = calculator.calculatePercentile(sessions, 50)
      expect(result).toBe(180) // Middle value
    })

    it('should return 0 for empty sessions', () => {
      const result = calculator.calculatePercentile([], 50)
      expect(result).toBe(0)
    })

    it('should calculate 95th percentile', () => {
      const sessions: Session[] = Array(100).fill(null).map((_, i) => ({
        id: `s${i}`,
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date(new Date('2024-01-01T10:00:00Z').getTime() + i * 1000),
        pageViews: 1,
        bounced: false,
      }))

      const result = calculator.calculatePercentile(sessions, 95)
      expect(result).toBeGreaterThan(90)
    })
  })

  describe('calculateConversionRate', () => {
    it('should calculate conversion rate', () => {
      const result = calculator.calculateConversionRate(25, 100)
      expect(result).toBe(25)
    })

    it('should return 0 when no visitors', () => {
      const result = calculator.calculateConversionRate(10, 0)
      expect(result).toBe(0)
    })

    it('should handle 100% conversion', () => {
      const result = calculator.calculateConversionRate(100, 100)
      expect(result).toBe(100)
    })
  })

  describe('isBounced', () => {
    it('should identify bounced session', () => {
      const session: Session = {
        id: 's1',
        startTime: new Date(),
        pageViews: 1,
        bounced: true,
      }

      const result = calculator.isBounced(session)
      expect(result).toBe(true)
    })

    it('should identify non-bounced session', () => {
      const session: Session = {
        id: 's1',
        startTime: new Date(),
        pageViews: 2,
        bounced: false,
      }

      const result = calculator.isBounced(session)
      expect(result).toBe(false)
    })
  })

  describe('classifySessionDuration', () => {
    it('should classify very short sessions', () => {
      const result = calculator.classifySessionDuration(5)
      expect(result).toBe('very-short')
    })

    it('should classify short sessions', () => {
      const result = calculator.classifySessionDuration(20)
      expect(result).toBe('short')
    })

    it('should classify medium sessions', () => {
      const result = calculator.classifySessionDuration(60)
      expect(result).toBe('medium')
    })

    it('should classify long sessions', () => {
      const result = calculator.classifySessionDuration(200)
      expect(result).toBe('long')
    })

    it('should classify very long sessions', () => {
      const result = calculator.classifySessionDuration(400)
      expect(result).toBe('very-long')
    })
  })

  describe('calculateTimeBuckets', () => {
    it('should categorize sessions into time buckets', () => {
      const sessions: Session[] = [
        {
          id: 's1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:00:05Z'),
          pageViews: 1,
          bounced: true,
        },
        {
          id: 's2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:00:25Z'),
          pageViews: 2,
          bounced: false,
        },
        {
          id: 's3',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:01:30Z'),
          pageViews: 3,
          bounced: false,
        },
      ]

      const result = calculator.calculateTimeBuckets(sessions)

      expect(result['very-short']).toBe(1)
      expect(result['short']).toBe(1)
      expect(result['medium']).toBe(1)
    })
  })
})
