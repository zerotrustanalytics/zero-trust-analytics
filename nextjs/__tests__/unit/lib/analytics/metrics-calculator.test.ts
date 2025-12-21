import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Metrics Calculator Tests
 * Tests for calculating analytics metrics including bounce rate,
 * session duration, conversion rate, and engagement metrics
 */

interface PageView {
  id: string
  timestamp: Date
  sessionId: string
  userId?: string
  path: string
  duration?: number
  exitPage?: boolean
}

interface Session {
  id: string
  userId?: string
  startTime: Date
  endTime?: Date
  pageViews: PageView[]
  bounced: boolean
  converted?: boolean
  totalEngagementTime?: number
}

interface ConversionEvent {
  sessionId: string
  timestamp: Date
  eventType: string
  value?: number
}

interface EngagementMetrics {
  avgTimeOnPage: number
  avgScrollDepth: number
  interactionRate: number
  returnVisitorRate: number
}

interface MetricsSummary {
  totalPageViews: number
  uniqueVisitors: number
  totalSessions: number
  bounceRate: number
  avgSessionDuration: number
  avgPageViewsPerSession: number
  conversionRate?: number
}

interface PerformanceMetrics {
  metric: string
  value: number
  percentile50: number
  percentile75: number
  percentile95: number
}

// TDD: Implementation will follow these tests
class MetricsCalculator {
  /**
   * Calculate bounce rate as percentage
   */
  calculateBounceRate(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const bouncedSessions = sessions.filter(s => s.bounced).length
    return Math.round((bouncedSessions / sessions.length) * 100 * 10) / 10
  }

  /**
   * Calculate average session duration in seconds
   */
  calculateAvgSessionDuration(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const sessionsWithEndTime = sessions.filter(s => s.endTime)
    if (sessionsWithEndTime.length === 0) return 0

    const totalDuration = sessionsWithEndTime.reduce((sum, session) => {
      const duration = (session.endTime!.getTime() - session.startTime.getTime()) / 1000
      return sum + duration
    }, 0)

    return Math.round(totalDuration / sessionsWithEndTime.length)
  }

  /**
   * Calculate median session duration
   */
  calculateMedianSessionDuration(sessions: Session[]): number {
    const sessionsWithEndTime = sessions.filter(s => s.endTime)
    if (sessionsWithEndTime.length === 0) return 0

    const durations = sessionsWithEndTime
      .map(s => (s.endTime!.getTime() - s.startTime.getTime()) / 1000)
      .sort((a, b) => a - b)

    const mid = Math.floor(durations.length / 2)

    if (durations.length % 2 === 0) {
      return Math.round((durations[mid - 1] + durations[mid]) / 2)
    }
    return Math.round(durations[mid])
  }

  /**
   * Calculate average pageviews per session
   */
  calculateAvgPageViewsPerSession(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const totalPageViews = sessions.reduce((sum, s) => sum + s.pageViews.length, 0)
    return Math.round((totalPageViews / sessions.length) * 10) / 10
  }

  /**
   * Calculate conversion rate
   */
  calculateConversionRate(sessions: Session[], conversions: ConversionEvent[]): number {
    if (sessions.length === 0) return 0

    const convertedSessionIds = new Set(conversions.map(c => c.sessionId))
    const convertedSessions = sessions.filter(s => convertedSessionIds.has(s.id))

    return Math.round((convertedSessions.length / sessions.length) * 100 * 10) / 10
  }

  /**
   * Calculate exit rate for a specific page
   */
  calculateExitRate(pageViews: PageView[], path: string): number {
    const pageViewsForPath = pageViews.filter(pv => pv.path === path)
    if (pageViewsForPath.length === 0) return 0

    const exits = pageViewsForPath.filter(pv => pv.exitPage).length
    return Math.round((exits / pageViewsForPath.length) * 100 * 10) / 10
  }

  /**
   * Calculate average time on page
   */
  calculateAvgTimeOnPage(pageViews: PageView[]): number {
    const pageViewsWithDuration = pageViews.filter(pv => pv.duration !== undefined)
    if (pageViewsWithDuration.length === 0) return 0

    const totalDuration = pageViewsWithDuration.reduce((sum, pv) => sum + (pv.duration || 0), 0)
    return Math.round(totalDuration / pageViewsWithDuration.length)
  }

  /**
   * Calculate unique visitors count
   */
  calculateUniqueVisitors(pageViews: PageView[]): number {
    const uniqueUsers = new Set(
      pageViews.filter(pv => pv.userId).map(pv => pv.userId)
    )
    return uniqueUsers.size
  }

  /**
   * Calculate return visitor rate
   */
  calculateReturnVisitorRate(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    // Group sessions by userId
    const sessionsByUser = new Map<string, Session[]>()
    sessions.forEach(session => {
      if (session.userId) {
        if (!sessionsByUser.has(session.userId)) {
          sessionsByUser.set(session.userId, [])
        }
        sessionsByUser.get(session.userId)!.push(session)
      }
    })

    // Count users with multiple sessions
    const returningUsers = Array.from(sessionsByUser.values())
      .filter(userSessions => userSessions.length > 1).length

    const totalUsers = sessionsByUser.size
    if (totalUsers === 0) return 0

    return Math.round((returningUsers / totalUsers) * 100 * 10) / 10
  }

  /**
   * Calculate comprehensive metrics summary
   */
  calculateMetricsSummary(pageViews: PageView[], sessions: Session[]): MetricsSummary {
    return {
      totalPageViews: pageViews.length,
      uniqueVisitors: this.calculateUniqueVisitors(pageViews),
      totalSessions: sessions.length,
      bounceRate: this.calculateBounceRate(sessions),
      avgSessionDuration: this.calculateAvgSessionDuration(sessions),
      avgPageViewsPerSession: this.calculateAvgPageViewsPerSession(sessions)
    }
  }

  /**
   * Calculate percentile for a set of values
   */
  calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100')
    }

    const sorted = [...values].sort((a, b) => a - b)
    const index = (percentile / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index - lower

    if (lower === upper) {
      return Math.round(sorted[lower] * 10) / 10
    }

    return Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 10) / 10
  }

  /**
   * Calculate performance metrics with percentiles
   */
  calculatePerformanceMetrics(
    values: number[],
    metricName: string
  ): PerformanceMetrics {
    const avg = values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : 0

    return {
      metric: metricName,
      value: avg,
      percentile50: this.calculatePercentile(values, 50),
      percentile75: this.calculatePercentile(values, 75),
      percentile95: this.calculatePercentile(values, 95)
    }
  }

  /**
   * Calculate engagement score (0-100)
   */
  calculateEngagementScore(session: Session): number {
    let score = 0

    // Page views factor (max 30 points)
    const pageViewScore = Math.min(session.pageViews.length * 5, 30)
    score += pageViewScore

    // Duration factor (max 40 points)
    if (session.endTime) {
      const durationMinutes = (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60)
      const durationScore = Math.min(durationMinutes * 4, 40)
      score += durationScore
    }

    // Conversion factor (30 points)
    if (session.converted) {
      score += 30
    }

    return Math.min(Math.round(score), 100)
  }

  /**
   * Calculate session quality score
   */
  calculateSessionQuality(sessions: Session[]): number {
    if (sessions.length === 0) return 0

    const totalScore = sessions.reduce((sum, session) => {
      return sum + this.calculateEngagementScore(session)
    }, 0)

    return Math.round((totalScore / sessions.length) * 10) / 10
  }

  /**
   * Identify trending pages
   */
  identifyTrendingPages(
    currentPageViews: PageView[],
    previousPageViews: PageView[],
    minGrowth: number = 50
  ): Array<{ path: string; current: number; previous: number; growth: number }> {
    const currentCounts = new Map<string, number>()
    const previousCounts = new Map<string, number>()

    currentPageViews.forEach(pv => {
      currentCounts.set(pv.path, (currentCounts.get(pv.path) || 0) + 1)
    })

    previousPageViews.forEach(pv => {
      previousCounts.set(pv.path, (previousCounts.get(pv.path) || 0) + 1)
    })

    const trending: Array<{ path: string; current: number; previous: number; growth: number }> = []

    currentCounts.forEach((current, path) => {
      const previous = previousCounts.get(path) || 0
      if (previous === 0 && current > 0) {
        trending.push({ path, current, previous, growth: 100 })
      } else if (previous > 0) {
        const growth = Math.round(((current - previous) / previous) * 100)
        if (growth >= minGrowth) {
          trending.push({ path, current, previous, growth })
        }
      }
    })

    return trending.sort((a, b) => b.growth - a.growth)
  }

  /**
   * Calculate new vs returning visitor ratio
   */
  calculateVisitorRatio(sessions: Session[]): { new: number; returning: number } {
    const sessionsByUser = new Map<string, Session[]>()

    sessions.forEach(session => {
      if (session.userId) {
        if (!sessionsByUser.has(session.userId)) {
          sessionsByUser.set(session.userId, [])
        }
        sessionsByUser.get(session.userId)!.push(session)
      }
    })

    const newVisitors = Array.from(sessionsByUser.values())
      .filter(userSessions => userSessions.length === 1).length
    const returningVisitors = Array.from(sessionsByUser.values())
      .filter(userSessions => userSessions.length > 1).length

    return {
      new: newVisitors,
      returning: returningVisitors
    }
  }

  /**
   * Calculate time-based metrics
   */
  calculateTimeMetrics(pageViews: PageView[]): {
    avgTimeOnPage: number
    medianTimeOnPage: number
    totalTimeOnSite: number
  } {
    const durations = pageViews
      .filter(pv => pv.duration !== undefined)
      .map(pv => pv.duration!)

    const totalTime = durations.reduce((sum, d) => sum + d, 0)
    const avgTime = durations.length > 0
      ? Math.round(totalTime / durations.length)
      : 0

    const sortedDurations = [...durations].sort((a, b) => a - b)
    const mid = Math.floor(sortedDurations.length / 2)
    const medianTime = sortedDurations.length > 0
      ? sortedDurations.length % 2 === 0
        ? Math.round((sortedDurations[mid - 1] + sortedDurations[mid]) / 2)
        : sortedDurations[mid]
      : 0

    return {
      avgTimeOnPage: avgTime,
      medianTimeOnPage: medianTime,
      totalTimeOnSite: totalTime
    }
  }

  /**
   * Calculate comparison metrics
   */
  calculateComparison(current: number, previous: number): {
    change: number
    changePercent: number
    trend: 'up' | 'down' | 'flat'
  } {
    const change = current - previous
    const changePercent = previous === 0
      ? (current > 0 ? 100 : 0)
      : Math.round((change / previous) * 100 * 10) / 10

    const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

    return { change, changePercent, trend }
  }

  /**
   * Calculate pages per session distribution
   */
  calculatePagesPerSessionDistribution(sessions: Session[]): Map<number, number> {
    const distribution = new Map<number, number>()

    sessions.forEach(session => {
      const pageCount = session.pageViews.length
      distribution.set(pageCount, (distribution.get(pageCount) || 0) + 1)
    })

    return distribution
  }

  /**
   * Calculate session duration buckets
   */
  calculateDurationBuckets(sessions: Session[]): {
    '0-30s': number
    '30s-1m': number
    '1m-3m': number
    '3m-10m': number
    '10m+': number
  } {
    const buckets = {
      '0-30s': 0,
      '30s-1m': 0,
      '1m-3m': 0,
      '3m-10m': 0,
      '10m+': 0
    }

    sessions.forEach(session => {
      if (!session.endTime) return

      const durationSeconds = (session.endTime.getTime() - session.startTime.getTime()) / 1000

      if (durationSeconds < 30) {
        buckets['0-30s']++
      } else if (durationSeconds < 60) {
        buckets['30s-1m']++
      } else if (durationSeconds < 180) {
        buckets['1m-3m']++
      } else if (durationSeconds < 600) {
        buckets['3m-10m']++
      } else {
        buckets['10m+']++
      }
    })

    return buckets
  }

  /**
   * Detect anomalies in metrics
   */
  detectAnomalies(
    values: number[],
    threshold: number = 2
  ): { anomalies: number[]; mean: number; stdDev: number } {
    if (values.length === 0) {
      return { anomalies: [], mean: 0, stdDev: 0 }
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    const anomalies = values.filter(v => {
      const zScore = Math.abs((v - mean) / (stdDev || 1))
      return zScore > threshold
    })

    return {
      anomalies,
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10
    }
  }
}

describe('MetricsCalculator', () => {
  let calculator: MetricsCalculator
  let sampleSessions: Session[]
  let samplePageViews: PageView[]

  beforeEach(() => {
    calculator = new MetricsCalculator()

    samplePageViews = [
      {
        id: 'pv1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        sessionId: 'session1',
        userId: 'user1',
        path: '/home',
        duration: 30
      },
      {
        id: 'pv2',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        sessionId: 'session1',
        userId: 'user1',
        path: '/about',
        duration: 45,
        exitPage: true
      },
      {
        id: 'pv3',
        timestamp: new Date('2024-01-01T11:00:00Z'),
        sessionId: 'session2',
        userId: 'user2',
        path: '/home',
        duration: 60,
        exitPage: true
      }
    ]

    sampleSessions = [
      {
        id: 'session1',
        userId: 'user1',
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T10:05:00Z'),
        pageViews: [samplePageViews[0], samplePageViews[1]],
        bounced: false
      },
      {
        id: 'session2',
        userId: 'user2',
        startTime: new Date('2024-01-01T11:00:00Z'),
        endTime: new Date('2024-01-01T11:01:00Z'),
        pageViews: [samplePageViews[2]],
        bounced: true
      }
    ]
  })

  describe('Bounce Rate Calculations', () => {
    it('should calculate bounce rate correctly', () => {
      const bounceRate = calculator.calculateBounceRate(sampleSessions)

      expect(bounceRate).toBe(50) // 1 out of 2 sessions bounced
    })

    it('should return 0 for empty sessions array', () => {
      const bounceRate = calculator.calculateBounceRate([])

      expect(bounceRate).toBe(0)
    })

    it('should return 100% when all sessions bounced', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date(),
          pageViews: [],
          bounced: true
        },
        {
          id: 'session2',
          startTime: new Date(),
          pageViews: [],
          bounced: true
        }
      ]

      const bounceRate = calculator.calculateBounceRate(sessions)

      expect(bounceRate).toBe(100)
    })

    it('should return 0% when no sessions bounced', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date(),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session2',
          startTime: new Date(),
          pageViews: [],
          bounced: false
        }
      ]

      const bounceRate = calculator.calculateBounceRate(sessions)

      expect(bounceRate).toBe(0)
    })

    it('should round bounce rate to one decimal place', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date(),
          pageViews: [],
          bounced: true
        },
        {
          id: 'session2',
          startTime: new Date(),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session3',
          startTime: new Date(),
          pageViews: [],
          bounced: false
        }
      ]

      const bounceRate = calculator.calculateBounceRate(sessions)

      expect(bounceRate).toBe(33.3)
    })
  })

  describe('Session Duration Calculations', () => {
    it('should calculate average session duration', () => {
      const avgDuration = calculator.calculateAvgSessionDuration(sampleSessions)

      expect(avgDuration).toBe(180) // (300 + 60) / 2 = 180 seconds
    })

    it('should return 0 for empty sessions array', () => {
      const avgDuration = calculator.calculateAvgSessionDuration([])

      expect(avgDuration).toBe(0)
    })

    it('should ignore sessions without endTime', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:02:00Z'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session2',
          startTime: new Date('2024-01-01T11:00:00Z'),
          pageViews: [],
          bounced: false
        }
      ]

      const avgDuration = calculator.calculateAvgSessionDuration(sessions)

      expect(avgDuration).toBe(120)
    })

    it('should calculate median session duration', () => {
      const medianDuration = calculator.calculateMedianSessionDuration(sampleSessions)

      expect(medianDuration).toBe(180)
    })

    it('should handle even number of sessions for median', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:01:00Z'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session2',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:02:00Z'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session3',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:03:00Z'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session4',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T10:04:00Z'),
          pageViews: [],
          bounced: false
        }
      ]

      const medianDuration = calculator.calculateMedianSessionDuration(sessions)

      expect(medianDuration).toBe(150) // (120 + 180) / 2
    })
  })

  describe('Page Views Per Session', () => {
    it('should calculate average pageviews per session', () => {
      const avgPageViews = calculator.calculateAvgPageViewsPerSession(sampleSessions)

      expect(avgPageViews).toBe(1.5) // (2 + 1) / 2
    })

    it('should return 0 for empty sessions array', () => {
      const avgPageViews = calculator.calculateAvgPageViewsPerSession([])

      expect(avgPageViews).toBe(0)
    })

    it('should handle sessions with no pageviews', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          startTime: new Date(),
          pageViews: [],
          bounced: true
        }
      ]

      const avgPageViews = calculator.calculateAvgPageViewsPerSession(sessions)

      expect(avgPageViews).toBe(0)
    })
  })

  describe('Conversion Rate Calculations', () => {
    it('should calculate conversion rate', () => {
      const conversions: ConversionEvent[] = [
        {
          sessionId: 'session1',
          timestamp: new Date(),
          eventType: 'purchase'
        }
      ]

      const conversionRate = calculator.calculateConversionRate(sampleSessions, conversions)

      expect(conversionRate).toBe(50) // 1 out of 2 sessions converted
    })

    it('should return 0 when no conversions', () => {
      const conversionRate = calculator.calculateConversionRate(sampleSessions, [])

      expect(conversionRate).toBe(0)
    })

    it('should return 0 for empty sessions array', () => {
      const conversions: ConversionEvent[] = [
        {
          sessionId: 'session1',
          timestamp: new Date(),
          eventType: 'purchase'
        }
      ]

      const conversionRate = calculator.calculateConversionRate([], conversions)

      expect(conversionRate).toBe(0)
    })

    it('should handle multiple conversions in same session', () => {
      const conversions: ConversionEvent[] = [
        {
          sessionId: 'session1',
          timestamp: new Date(),
          eventType: 'purchase'
        },
        {
          sessionId: 'session1',
          timestamp: new Date(),
          eventType: 'signup'
        }
      ]

      const conversionRate = calculator.calculateConversionRate(sampleSessions, conversions)

      expect(conversionRate).toBe(50) // Still just 1 session
    })
  })

  describe('Exit Rate Calculations', () => {
    it('should calculate exit rate for a page', () => {
      const exitRate = calculator.calculateExitRate(samplePageViews, '/home')

      expect(exitRate).toBe(50) // 1 out of 2 /home views is an exit
    })

    it('should return 0 for page with no views', () => {
      const exitRate = calculator.calculateExitRate(samplePageViews, '/nonexistent')

      expect(exitRate).toBe(0)
    })

    it('should return 0 for page with no exits', () => {
      const pageViews: PageView[] = [
        {
          id: 'pv1',
          timestamp: new Date(),
          sessionId: 'session1',
          path: '/home',
          exitPage: false
        }
      ]

      const exitRate = calculator.calculateExitRate(pageViews, '/home')

      expect(exitRate).toBe(0)
    })
  })

  describe('Unique Visitors', () => {
    it('should count unique visitors', () => {
      const uniqueVisitors = calculator.calculateUniqueVisitors(samplePageViews)

      expect(uniqueVisitors).toBe(2) // user1 and user2
    })

    it('should return 0 for empty pageviews', () => {
      const uniqueVisitors = calculator.calculateUniqueVisitors([])

      expect(uniqueVisitors).toBe(0)
    })

    it('should handle pageviews without userId', () => {
      const pageViews: PageView[] = [
        {
          id: 'pv1',
          timestamp: new Date(),
          sessionId: 'session1',
          path: '/home'
        }
      ]

      const uniqueVisitors = calculator.calculateUniqueVisitors(pageViews)

      expect(uniqueVisitors).toBe(0)
    })
  })

  describe('Time On Page', () => {
    it('should calculate average time on page', () => {
      const avgTime = calculator.calculateAvgTimeOnPage(samplePageViews)

      expect(avgTime).toBe(45) // (30 + 45 + 60) / 3
    })

    it('should return 0 for pageviews without duration', () => {
      const pageViews: PageView[] = [
        {
          id: 'pv1',
          timestamp: new Date(),
          sessionId: 'session1',
          path: '/home'
        }
      ]

      const avgTime = calculator.calculateAvgTimeOnPage(pageViews)

      expect(avgTime).toBe(0)
    })

    it('should calculate time metrics including median', () => {
      const timeMetrics = calculator.calculateTimeMetrics(samplePageViews)

      expect(timeMetrics.avgTimeOnPage).toBe(45)
      expect(timeMetrics.medianTimeOnPage).toBe(45)
      expect(timeMetrics.totalTimeOnSite).toBe(135)
    })
  })

  describe('Return Visitor Rate', () => {
    it('should calculate return visitor rate', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          userId: 'user1',
          startTime: new Date('2024-01-01'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session2',
          userId: 'user1',
          startTime: new Date('2024-01-02'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session3',
          userId: 'user2',
          startTime: new Date('2024-01-01'),
          pageViews: [],
          bounced: false
        }
      ]

      const returnRate = calculator.calculateReturnVisitorRate(sessions)

      expect(returnRate).toBe(50) // 1 out of 2 users returned
    })

    it('should return 0 when no users have multiple sessions', () => {
      const returnRate = calculator.calculateReturnVisitorRate(sampleSessions)

      expect(returnRate).toBe(0)
    })

    it('should return 0 for empty sessions', () => {
      const returnRate = calculator.calculateReturnVisitorRate([])

      expect(returnRate).toBe(0)
    })
  })

  describe('Metrics Summary', () => {
    it('should calculate comprehensive metrics summary', () => {
      const summary = calculator.calculateMetricsSummary(samplePageViews, sampleSessions)

      expect(summary.totalPageViews).toBe(3)
      expect(summary.uniqueVisitors).toBe(2)
      expect(summary.totalSessions).toBe(2)
      expect(summary.bounceRate).toBe(50)
      expect(summary.avgSessionDuration).toBe(180)
      expect(summary.avgPageViewsPerSession).toBe(1.5)
    })
  })

  describe('Percentile Calculations', () => {
    it('should calculate 50th percentile (median)', () => {
      const values = [1, 2, 3, 4, 5]
      const p50 = calculator.calculatePercentile(values, 50)

      expect(p50).toBe(3)
    })

    it('should calculate 75th percentile', () => {
      const values = [1, 2, 3, 4, 5]
      const p75 = calculator.calculatePercentile(values, 75)

      expect(p75).toBe(4)
    })

    it('should calculate 95th percentile', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const p95 = calculator.calculatePercentile(values, 95)

      expect(p95).toBe(9.5)
    })

    it('should throw error for invalid percentile', () => {
      expect(() => {
        calculator.calculatePercentile([1, 2, 3], 101)
      }).toThrow('Percentile must be between 0 and 100')
    })

    it('should return 0 for empty array', () => {
      const p50 = calculator.calculatePercentile([], 50)

      expect(p50).toBe(0)
    })
  })

  describe('Performance Metrics', () => {
    it('should calculate performance metrics with percentiles', () => {
      const values = [100, 200, 300, 400, 500]
      const metrics = calculator.calculatePerformanceMetrics(values, 'loadTime')

      expect(metrics.metric).toBe('loadTime')
      expect(metrics.value).toBe(300)
      expect(metrics.percentile50).toBe(300)
      expect(metrics.percentile75).toBe(400)
      expect(metrics.percentile95).toBe(500)
    })
  })

  describe('Engagement Score', () => {
    it('should calculate engagement score based on multiple factors', () => {
      const session: Session = {
        id: 'session1',
        userId: 'user1',
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T10:10:00Z'),
        pageViews: [samplePageViews[0], samplePageViews[1]],
        bounced: false,
        converted: true
      }

      const score = calculator.calculateEngagementScore(session)

      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should cap engagement score at 100', () => {
      const session: Session = {
        id: 'session1',
        userId: 'user1',
        startTime: new Date('2024-01-01T10:00:00Z'),
        endTime: new Date('2024-01-01T12:00:00Z'),
        pageViews: Array(20).fill(samplePageViews[0]),
        bounced: false,
        converted: true
      }

      const score = calculator.calculateEngagementScore(session)

      expect(score).toBe(100)
    })

    it('should calculate session quality score', () => {
      const quality = calculator.calculateSessionQuality(sampleSessions)

      expect(quality).toBeGreaterThan(0)
    })
  })

  describe('Trending Pages', () => {
    it('should identify trending pages', () => {
      const current: PageView[] = [
        { id: '1', timestamp: new Date(), sessionId: 's1', path: '/trending', duration: 30 },
        { id: '2', timestamp: new Date(), sessionId: 's2', path: '/trending', duration: 30 },
        { id: '3', timestamp: new Date(), sessionId: 's3', path: '/trending', duration: 30 }
      ]
      const previous: PageView[] = [
        { id: '4', timestamp: new Date(), sessionId: 's4', path: '/trending', duration: 30 }
      ]

      const trending = calculator.identifyTrendingPages(current, previous, 50)

      expect(trending.length).toBeGreaterThan(0)
      expect(trending[0].path).toBe('/trending')
      expect(trending[0].growth).toBeGreaterThanOrEqual(50)
    })

    it('should handle new pages with no previous data', () => {
      const current: PageView[] = [
        { id: '1', timestamp: new Date(), sessionId: 's1', path: '/new-page', duration: 30 }
      ]
      const previous: PageView[] = []

      const trending = calculator.identifyTrendingPages(current, previous, 50)

      expect(trending.length).toBeGreaterThan(0)
      expect(trending[0].growth).toBe(100)
    })
  })

  describe('Visitor Ratio', () => {
    it('should calculate new vs returning visitor ratio', () => {
      const sessions: Session[] = [
        {
          id: 'session1',
          userId: 'user1',
          startTime: new Date('2024-01-01'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session2',
          userId: 'user1',
          startTime: new Date('2024-01-02'),
          pageViews: [],
          bounced: false
        },
        {
          id: 'session3',
          userId: 'user2',
          startTime: new Date('2024-01-01'),
          pageViews: [],
          bounced: false
        }
      ]

      const ratio = calculator.calculateVisitorRatio(sessions)

      expect(ratio.new).toBe(0)
      expect(ratio.returning).toBe(1)
    })
  })

  describe('Comparison Metrics', () => {
    it('should calculate comparison with positive growth', () => {
      const comparison = calculator.calculateComparison(150, 100)

      expect(comparison.change).toBe(50)
      expect(comparison.changePercent).toBe(50)
      expect(comparison.trend).toBe('up')
    })

    it('should calculate comparison with negative growth', () => {
      const comparison = calculator.calculateComparison(80, 100)

      expect(comparison.change).toBe(-20)
      expect(comparison.changePercent).toBe(-20)
      expect(comparison.trend).toBe('down')
    })

    it('should handle zero previous value', () => {
      const comparison = calculator.calculateComparison(100, 0)

      expect(comparison.changePercent).toBe(100)
    })
  })

  describe('Distribution Metrics', () => {
    it('should calculate pages per session distribution', () => {
      const distribution = calculator.calculatePagesPerSessionDistribution(sampleSessions)

      expect(distribution.get(2)).toBe(1)
      expect(distribution.get(1)).toBe(1)
    })

    it('should calculate session duration buckets', () => {
      const buckets = calculator.calculateDurationBuckets(sampleSessions)

      expect(buckets['0-30s']).toBeGreaterThanOrEqual(0)
      expect(buckets['30s-1m']).toBeGreaterThanOrEqual(0)
      expect(buckets['1m-3m']).toBeGreaterThanOrEqual(0)
      expect(buckets['3m-10m']).toBeGreaterThanOrEqual(0)
      expect(buckets['10m+']).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Anomaly Detection', () => {
    it('should detect anomalies in metric values', () => {
      const values = [100, 105, 98, 102, 500, 99, 103]
      const result = calculator.detectAnomalies(values, 2)

      expect(result.anomalies.length).toBeGreaterThan(0)
      expect(result.mean).toBeGreaterThan(0)
      expect(result.stdDev).toBeGreaterThan(0)
    })

    it('should handle empty values array', () => {
      const result = calculator.detectAnomalies([])

      expect(result.anomalies).toHaveLength(0)
      expect(result.mean).toBe(0)
      expect(result.stdDev).toBe(0)
    })

    it('should detect no anomalies in consistent data', () => {
      const values = [100, 100, 100, 100]
      const result = calculator.detectAnomalies(values, 2)

      expect(result.anomalies).toHaveLength(0)
    })
  })
})
