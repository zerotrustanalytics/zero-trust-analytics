import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Analytics Data Aggregator Tests
 * Tests for aggregating analytics data by various time periods
 * (hourly, daily, weekly, monthly)
 */

interface AnalyticsEvent {
  timestamp: Date
  sessionId: string
  userId?: string
  path: string
  country?: string
  device?: string
  referrer?: string
}

interface AggregatedData {
  period: string // ISO date string
  pageViews: number
  uniqueVisitors: number
  sessions: number
  bounceRate?: number
  avgSessionDuration?: number
}

interface TimeRange {
  start: Date
  end: Date
}

enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year'
}

// TDD: Implementation will follow these tests
class AnalyticsAggregator {
  /**
   * Aggregate events by time period
   */
  aggregateByPeriod(
    events: AnalyticsEvent[],
    period: TimePeriod,
    timeRange?: TimeRange
  ): AggregatedData[] {
    // Filter events by time range if provided
    let filteredEvents = events
    if (timeRange) {
      filteredEvents = events.filter(
        e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
      )
    }

    // Group events by period
    const groupedEvents = new Map<string, AnalyticsEvent[]>()

    filteredEvents.forEach(event => {
      const periodKey = this.getPeriodKey(event.timestamp, period)
      if (!groupedEvents.has(periodKey)) {
        groupedEvents.set(periodKey, [])
      }
      groupedEvents.get(periodKey)!.push(event)
    })

    // Convert to aggregated data
    const result: AggregatedData[] = []
    groupedEvents.forEach((events, periodKey) => {
      result.push({
        period: periodKey,
        pageViews: events.length,
        uniqueVisitors: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
        sessions: new Set(events.map(e => e.sessionId)).size
      })
    })

    return result.sort((a, b) => a.period.localeCompare(b.period))
  }

  /**
   * Get period key for grouping
   */
  private getPeriodKey(date: Date, period: TimePeriod): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hour = String(date.getUTCHours()).padStart(2, '0')

    switch (period) {
      case TimePeriod.HOUR:
        return `${year}-${month}-${day}T${hour}:00:00Z`
      case TimePeriod.DAY:
        return `${year}-${month}-${day}T00:00:00Z`
      case TimePeriod.WEEK:
        const weekStart = this.getWeekStart(date)
        return weekStart.toISOString().split('T')[0] + 'T00:00:00Z'
      case TimePeriod.MONTH:
        return `${year}-${month}-01T00:00:00Z`
      case TimePeriod.YEAR:
        return `${year}-01-01T00:00:00Z`
      default:
        return date.toISOString()
    }
  }

  /**
   * Get start of week (Sunday)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getUTCDay()
    const diff = d.getUTCDate() - day
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
  }

  /**
   * Aggregate by hour
   */
  aggregateByHour(events: AnalyticsEvent[], timeRange?: TimeRange): AggregatedData[] {
    return this.aggregateByPeriod(events, TimePeriod.HOUR, timeRange)
  }

  /**
   * Aggregate by day
   */
  aggregateByDay(events: AnalyticsEvent[], timeRange?: TimeRange): AggregatedData[] {
    return this.aggregateByPeriod(events, TimePeriod.DAY, timeRange)
  }

  /**
   * Aggregate by week
   */
  aggregateByWeek(events: AnalyticsEvent[], timeRange?: TimeRange): AggregatedData[] {
    return this.aggregateByPeriod(events, TimePeriod.WEEK, timeRange)
  }

  /**
   * Aggregate by month
   */
  aggregateByMonth(events: AnalyticsEvent[], timeRange?: TimeRange): AggregatedData[] {
    return this.aggregateByPeriod(events, TimePeriod.MONTH, timeRange)
  }

  /**
   * Aggregate by custom time window (in minutes)
   */
  aggregateByCustomWindow(
    events: AnalyticsEvent[],
    windowMinutes: number
  ): AggregatedData[] {
    if (windowMinutes <= 0) {
      throw new Error('Window size must be positive')
    }

    const groupedEvents = new Map<string, AnalyticsEvent[]>()

    events.forEach(event => {
      const windowStart = Math.floor(event.timestamp.getTime() / (windowMinutes * 60 * 1000))
      const windowKey = new Date(windowStart * windowMinutes * 60 * 1000).toISOString()

      if (!groupedEvents.has(windowKey)) {
        groupedEvents.set(windowKey, [])
      }
      groupedEvents.get(windowKey)!.push(event)
    })

    const result: AggregatedData[] = []
    groupedEvents.forEach((events, periodKey) => {
      result.push({
        period: periodKey,
        pageViews: events.length,
        uniqueVisitors: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
        sessions: new Set(events.map(e => e.sessionId)).size
      })
    })

    return result.sort((a, b) => a.period.localeCompare(b.period))
  }

  /**
   * Fill missing periods with zero data
   */
  fillMissingPeriods(
    data: AggregatedData[],
    period: TimePeriod,
    timeRange: TimeRange
  ): AggregatedData[] {
    if (data.length === 0) return []

    const result: AggregatedData[] = []
    const existingPeriods = new Set(data.map(d => d.period))

    let currentDate = new Date(timeRange.start)

    while (currentDate <= timeRange.end) {
      const periodKey = this.getPeriodKey(currentDate, period)

      const existing = data.find(d => d.period === periodKey)
      if (existing) {
        result.push(existing)
      } else if (!existingPeriods.has(periodKey) && periodKey >= this.getPeriodKey(timeRange.start, period)) {
        result.push({
          period: periodKey,
          pageViews: 0,
          uniqueVisitors: 0,
          sessions: 0
        })
      }

      currentDate = this.incrementPeriod(currentDate, period)
    }

    return result
  }

  /**
   * Increment date by period
   */
  private incrementPeriod(date: Date, period: TimePeriod): Date {
    const d = new Date(date)

    switch (period) {
      case TimePeriod.HOUR:
        d.setUTCHours(d.getUTCHours() + 1)
        break
      case TimePeriod.DAY:
        d.setUTCDate(d.getUTCDate() + 1)
        break
      case TimePeriod.WEEK:
        d.setUTCDate(d.getUTCDate() + 7)
        break
      case TimePeriod.MONTH:
        d.setUTCMonth(d.getUTCMonth() + 1)
        break
      case TimePeriod.YEAR:
        d.setUTCFullYear(d.getUTCFullYear() + 1)
        break
    }

    return d
  }

  /**
   * Merge multiple aggregated datasets
   */
  mergeAggregatedData(datasets: AggregatedData[][]): AggregatedData[] {
    const merged = new Map<string, AggregatedData>()

    datasets.forEach(dataset => {
      dataset.forEach(data => {
        if (!merged.has(data.period)) {
          merged.set(data.period, { ...data })
        } else {
          const existing = merged.get(data.period)!
          existing.pageViews += data.pageViews
          existing.uniqueVisitors += data.uniqueVisitors
          existing.sessions += data.sessions
        }
      })
    })

    return Array.from(merged.values()).sort((a, b) => a.period.localeCompare(b.period))
  }

  /**
   * Calculate growth rate between periods
   */
  calculateGrowthRate(current: AggregatedData, previous: AggregatedData): number {
    if (previous.pageViews === 0) return current.pageViews > 0 ? 100 : 0
    return Math.round(((current.pageViews - previous.pageViews) / previous.pageViews) * 100 * 10) / 10
  }

  /**
   * Get top N periods by pageviews
   */
  getTopPeriods(data: AggregatedData[], limit: number = 10): AggregatedData[] {
    return [...data]
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, limit)
  }

  /**
   * Calculate rolling average
   */
  calculateRollingAverage(
    data: AggregatedData[],
    windowSize: number,
    metric: 'pageViews' | 'uniqueVisitors' | 'sessions' = 'pageViews'
  ): Array<{ period: string; value: number; rollingAvg: number }> {
    if (windowSize <= 0) {
      throw new Error('Window size must be positive')
    }

    return data.map((item, index) => {
      const startIndex = Math.max(0, index - windowSize + 1)
      const window = data.slice(startIndex, index + 1)
      const sum = window.reduce((acc, d) => acc + d[metric], 0)
      const avg = Math.round((sum / window.length) * 10) / 10

      return {
        period: item.period,
        value: item[metric],
        rollingAvg: avg
      }
    })
  }
}

describe('AnalyticsAggregator', () => {
  let aggregator: AnalyticsAggregator
  let sampleEvents: AnalyticsEvent[]

  beforeEach(() => {
    aggregator = new AnalyticsAggregator()

    // Create sample events spanning multiple days
    sampleEvents = [
      {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        sessionId: 'session1',
        userId: 'user1',
        path: '/home',
        country: 'US'
      },
      {
        timestamp: new Date('2024-01-01T10:30:00Z'),
        sessionId: 'session1',
        userId: 'user1',
        path: '/about',
        country: 'US'
      },
      {
        timestamp: new Date('2024-01-01T11:00:00Z'),
        sessionId: 'session2',
        userId: 'user2',
        path: '/home',
        country: 'UK'
      },
      {
        timestamp: new Date('2024-01-02T09:00:00Z'),
        sessionId: 'session3',
        userId: 'user3',
        path: '/products',
        country: 'CA'
      },
      {
        timestamp: new Date('2024-01-02T10:00:00Z'),
        sessionId: 'session3',
        userId: 'user3',
        path: '/cart',
        country: 'CA'
      }
    ]
  })

  describe('Basic Aggregation', () => {
    it('should aggregate events by hour', () => {
      const result = aggregator.aggregateByHour(sampleEvents)

      expect(result).toHaveLength(3)
      expect(result[0].period).toBe('2024-01-01T10:00:00Z')
      expect(result[0].pageViews).toBe(2)
      expect(result[1].period).toBe('2024-01-01T11:00:00Z')
      expect(result[1].pageViews).toBe(1)
    })

    it('should aggregate events by day', () => {
      const result = aggregator.aggregateByDay(sampleEvents)

      expect(result).toHaveLength(2)
      expect(result[0].period).toBe('2024-01-01T00:00:00Z')
      expect(result[0].pageViews).toBe(3)
      expect(result[1].period).toBe('2024-01-02T00:00:00Z')
      expect(result[1].pageViews).toBe(2)
    })

    it('should aggregate events by week', () => {
      const result = aggregator.aggregateByWeek(sampleEvents)

      expect(result).toHaveLength(1)
      expect(result[0].pageViews).toBe(5)
    })

    it('should aggregate events by month', () => {
      const result = aggregator.aggregateByMonth(sampleEvents)

      expect(result).toHaveLength(1)
      expect(result[0].period).toBe('2024-01-01T00:00:00Z')
      expect(result[0].pageViews).toBe(5)
    })

    it('should count unique visitors correctly', () => {
      const result = aggregator.aggregateByDay(sampleEvents)

      expect(result[0].uniqueVisitors).toBe(2) // user1 and user2
      expect(result[1].uniqueVisitors).toBe(1) // user3
    })

    it('should count sessions correctly', () => {
      const result = aggregator.aggregateByDay(sampleEvents)

      expect(result[0].sessions).toBe(2) // session1 and session2
      expect(result[1].sessions).toBe(1) // session3
    })

    it('should handle empty event array', () => {
      const result = aggregator.aggregateByDay([])

      expect(result).toHaveLength(0)
    })

    it('should handle events without userId', () => {
      const eventsWithoutUser: AnalyticsEvent[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          sessionId: 'session1',
          path: '/home'
        }
      ]

      const result = aggregator.aggregateByDay(eventsWithoutUser)

      expect(result[0].uniqueVisitors).toBe(0)
      expect(result[0].pageViews).toBe(1)
    })
  })

  describe('Time Range Filtering', () => {
    it('should filter events by time range', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-01T23:59:59Z')
      }

      const result = aggregator.aggregateByDay(sampleEvents, timeRange)

      expect(result).toHaveLength(1)
      expect(result[0].pageViews).toBe(3)
    })

    it('should handle time range with no matching events', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-02-01T00:00:00Z'),
        end: new Date('2024-02-28T23:59:59Z')
      }

      const result = aggregator.aggregateByDay(sampleEvents, timeRange)

      expect(result).toHaveLength(0)
    })

    it('should handle time range spanning multiple periods', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T10:30:00Z'),
        end: new Date('2024-01-02T09:30:00Z')
      }

      const result = aggregator.aggregateByDay(sampleEvents, timeRange)

      expect(result).toHaveLength(2)
    })

    it('should include events at exact time range boundaries', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T10:00:00Z'),
        end: new Date('2024-01-01T11:00:00Z')
      }

      const result = aggregator.aggregateByHour(sampleEvents, timeRange)

      expect(result).toHaveLength(2)
    })
  })

  describe('Custom Time Windows', () => {
    it('should aggregate by custom time window', () => {
      const result = aggregator.aggregateByCustomWindow(sampleEvents, 60) // 60 minutes

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].pageViews).toBeGreaterThan(0)
    })

    it('should handle 15-minute windows', () => {
      const result = aggregator.aggregateByCustomWindow(sampleEvents, 15)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle 5-minute windows', () => {
      const result = aggregator.aggregateByCustomWindow(sampleEvents, 5)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should throw error for non-positive window size', () => {
      expect(() => {
        aggregator.aggregateByCustomWindow(sampleEvents, 0)
      }).toThrow('Window size must be positive')
    })

    it('should throw error for negative window size', () => {
      expect(() => {
        aggregator.aggregateByCustomWindow(sampleEvents, -10)
      }).toThrow('Window size must be positive')
    })
  })

  describe('Missing Period Handling', () => {
    it('should fill missing hours with zero data', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T09:00:00Z'),
        end: new Date('2024-01-01T12:00:00Z')
      }

      const aggregated = aggregator.aggregateByHour(sampleEvents, timeRange)
      const filled = aggregator.fillMissingPeriods(aggregated, TimePeriod.HOUR, timeRange)

      expect(filled.length).toBeGreaterThanOrEqual(aggregated.length)
      const zeroData = filled.find(d => d.pageViews === 0)
      expect(zeroData).toBeDefined()
    })

    it('should fill missing days with zero data', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-05T00:00:00Z')
      }

      const aggregated = aggregator.aggregateByDay(sampleEvents, timeRange)
      const filled = aggregator.fillMissingPeriods(aggregated, TimePeriod.DAY, timeRange)

      expect(filled.length).toBe(5)
    })

    it('should maintain existing data when filling', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-03T00:00:00Z')
      }

      const aggregated = aggregator.aggregateByDay(sampleEvents, timeRange)
      const filled = aggregator.fillMissingPeriods(aggregated, TimePeriod.DAY, timeRange)

      const jan1 = filled.find(d => d.period === '2024-01-01T00:00:00Z')
      expect(jan1?.pageViews).toBe(3)
    })

    it('should handle empty data array', () => {
      const timeRange: TimeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-03T00:00:00Z')
      }

      const filled = aggregator.fillMissingPeriods([], TimePeriod.DAY, timeRange)

      expect(filled).toHaveLength(0)
    })
  })

  describe('Data Merging', () => {
    it('should merge multiple datasets', () => {
      const dataset1: AggregatedData[] = [
        { period: '2024-01-01T00:00:00Z', pageViews: 10, uniqueVisitors: 5, sessions: 8 }
      ]
      const dataset2: AggregatedData[] = [
        { period: '2024-01-01T00:00:00Z', pageViews: 5, uniqueVisitors: 3, sessions: 4 }
      ]

      const merged = aggregator.mergeAggregatedData([dataset1, dataset2])

      expect(merged).toHaveLength(1)
      expect(merged[0].pageViews).toBe(15)
      expect(merged[0].uniqueVisitors).toBe(8)
      expect(merged[0].sessions).toBe(12)
    })

    it('should merge datasets with different periods', () => {
      const dataset1: AggregatedData[] = [
        { period: '2024-01-01T00:00:00Z', pageViews: 10, uniqueVisitors: 5, sessions: 8 }
      ]
      const dataset2: AggregatedData[] = [
        { period: '2024-01-02T00:00:00Z', pageViews: 5, uniqueVisitors: 3, sessions: 4 }
      ]

      const merged = aggregator.mergeAggregatedData([dataset1, dataset2])

      expect(merged).toHaveLength(2)
    })

    it('should handle empty datasets', () => {
      const merged = aggregator.mergeAggregatedData([[], []])

      expect(merged).toHaveLength(0)
    })

    it('should sort merged results by period', () => {
      const dataset1: AggregatedData[] = [
        { period: '2024-01-02T00:00:00Z', pageViews: 5, uniqueVisitors: 3, sessions: 4 }
      ]
      const dataset2: AggregatedData[] = [
        { period: '2024-01-01T00:00:00Z', pageViews: 10, uniqueVisitors: 5, sessions: 8 }
      ]

      const merged = aggregator.mergeAggregatedData([dataset1, dataset2])

      expect(merged[0].period).toBe('2024-01-01T00:00:00Z')
      expect(merged[1].period).toBe('2024-01-02T00:00:00Z')
    })
  })

  describe('Growth Calculations', () => {
    it('should calculate positive growth rate', () => {
      const previous: AggregatedData = { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      const current: AggregatedData = { period: '2024-01-02', pageViews: 150, uniqueVisitors: 75, sessions: 120 }

      const growthRate = aggregator.calculateGrowthRate(current, previous)

      expect(growthRate).toBe(50)
    })

    it('should calculate negative growth rate', () => {
      const previous: AggregatedData = { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      const current: AggregatedData = { period: '2024-01-02', pageViews: 80, uniqueVisitors: 40, sessions: 60 }

      const growthRate = aggregator.calculateGrowthRate(current, previous)

      expect(growthRate).toBe(-20)
    })

    it('should handle zero previous pageviews', () => {
      const previous: AggregatedData = { period: '2024-01-01', pageViews: 0, uniqueVisitors: 0, sessions: 0 }
      const current: AggregatedData = { period: '2024-01-02', pageViews: 100, uniqueVisitors: 50, sessions: 80 }

      const growthRate = aggregator.calculateGrowthRate(current, previous)

      expect(growthRate).toBe(100)
    })

    it('should handle both zero pageviews', () => {
      const previous: AggregatedData = { period: '2024-01-01', pageViews: 0, uniqueVisitors: 0, sessions: 0 }
      const current: AggregatedData = { period: '2024-01-02', pageViews: 0, uniqueVisitors: 0, sessions: 0 }

      const growthRate = aggregator.calculateGrowthRate(current, previous)

      expect(growthRate).toBe(0)
    })
  })

  describe('Top Periods', () => {
    it('should return top N periods by pageviews', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 },
        { period: '2024-01-02', pageViews: 200, uniqueVisitors: 100, sessions: 160 },
        { period: '2024-01-03', pageViews: 50, uniqueVisitors: 25, sessions: 40 }
      ]

      const top = aggregator.getTopPeriods(data, 2)

      expect(top).toHaveLength(2)
      expect(top[0].pageViews).toBe(200)
      expect(top[1].pageViews).toBe(100)
    })

    it('should return all periods if limit exceeds data length', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      ]

      const top = aggregator.getTopPeriods(data, 10)

      expect(top).toHaveLength(1)
    })

    it('should handle empty data array', () => {
      const top = aggregator.getTopPeriods([], 5)

      expect(top).toHaveLength(0)
    })
  })

  describe('Rolling Average', () => {
    it('should calculate rolling average for pageviews', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 },
        { period: '2024-01-02', pageViews: 200, uniqueVisitors: 100, sessions: 160 },
        { period: '2024-01-03', pageViews: 150, uniqueVisitors: 75, sessions: 120 }
      ]

      const result = aggregator.calculateRollingAverage(data, 2, 'pageViews')

      expect(result).toHaveLength(3)
      expect(result[0].rollingAvg).toBe(100)
      expect(result[1].rollingAvg).toBe(150)
      expect(result[2].rollingAvg).toBe(175)
    })

    it('should calculate rolling average for uniqueVisitors', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 },
        { period: '2024-01-02', pageViews: 200, uniqueVisitors: 100, sessions: 160 }
      ]

      const result = aggregator.calculateRollingAverage(data, 2, 'uniqueVisitors')

      expect(result[1].rollingAvg).toBe(75)
    })

    it('should calculate rolling average for sessions', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 },
        { period: '2024-01-02', pageViews: 200, uniqueVisitors: 100, sessions: 160 }
      ]

      const result = aggregator.calculateRollingAverage(data, 2, 'sessions')

      expect(result[1].rollingAvg).toBe(120)
    })

    it('should handle window size of 1', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      ]

      const result = aggregator.calculateRollingAverage(data, 1, 'pageViews')

      expect(result[0].rollingAvg).toBe(100)
    })

    it('should throw error for non-positive window size', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      ]

      expect(() => {
        aggregator.calculateRollingAverage(data, 0, 'pageViews')
      }).toThrow('Window size must be positive')
    })

    it('should handle window size larger than data length', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      ]

      const result = aggregator.calculateRollingAverage(data, 5, 'pageViews')

      expect(result[0].rollingAvg).toBe(100)
    })

    it('should include original values in result', () => {
      const data: AggregatedData[] = [
        { period: '2024-01-01', pageViews: 100, uniqueVisitors: 50, sessions: 80 }
      ]

      const result = aggregator.calculateRollingAverage(data, 2, 'pageViews')

      expect(result[0].value).toBe(100)
      expect(result[0].period).toBe('2024-01-01')
    })
  })

  describe('Edge Cases', () => {
    it('should handle events with same timestamp', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), sessionId: 'session1', path: '/home' },
        { timestamp: new Date('2024-01-01T10:00:00Z'), sessionId: 'session2', path: '/about' }
      ]

      const result = aggregator.aggregateByHour(events)

      expect(result).toHaveLength(1)
      expect(result[0].pageViews).toBe(2)
    })

    it('should handle large number of events', () => {
      const largeEventSet: AnalyticsEvent[] = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: new Date(`2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`),
        sessionId: `session${i}`,
        path: '/home'
      }))

      const result = aggregator.aggregateByHour(largeEventSet)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should preserve data types correctly', () => {
      const result = aggregator.aggregateByDay(sampleEvents)

      expect(typeof result[0].pageViews).toBe('number')
      expect(typeof result[0].uniqueVisitors).toBe('number')
      expect(typeof result[0].sessions).toBe('number')
      expect(typeof result[0].period).toBe('string')
    })
  })
})
