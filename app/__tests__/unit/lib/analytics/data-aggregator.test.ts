import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Data Aggregator Module - Aggregates analytics data by time periods
 */

interface AnalyticsEvent {
  timestamp: Date
  pageView: number
  uniqueVisitor?: boolean
  sessionId?: string
  duration?: number
}

interface TimeSeriesData {
  timestamp: Date
  value: number
}

interface AggregatedData {
  period: string
  pageViews: number
  uniqueVisitors: number
  sessions: number
  avgDuration?: number
}

// TDD: Implementation will follow these tests
class DataAggregator {
  /**
   * Aggregate events by hour
   */
  aggregateByHour(events: AnalyticsEvent[]): AggregatedData[] {
    const hourlyMap = new Map<string, AggregatedData>()

    events.forEach(event => {
      const hour = new Date(event.timestamp)
      hour.setMinutes(0, 0, 0)
      const key = hour.toISOString()

      if (!hourlyMap.has(key)) {
        hourlyMap.set(key, {
          period: key,
          pageViews: 0,
          uniqueVisitors: 0,
          sessions: 0,
        })
      }

      const data = hourlyMap.get(key)!
      data.pageViews += event.pageView
      if (event.uniqueVisitor) data.uniqueVisitors += 1
      if (event.sessionId) data.sessions += 1
    })

    return Array.from(hourlyMap.values()).sort((a, b) =>
      new Date(a.period).getTime() - new Date(b.period).getTime()
    )
  }

  /**
   * Aggregate events by day
   */
  aggregateByDay(events: AnalyticsEvent[]): AggregatedData[] {
    const dailyMap = new Map<string, AggregatedData>()

    events.forEach(event => {
      const day = new Date(event.timestamp)
      day.setHours(0, 0, 0, 0)
      const key = day.toISOString().split('T')[0]

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          period: key,
          pageViews: 0,
          uniqueVisitors: 0,
          sessions: 0,
        })
      }

      const data = dailyMap.get(key)!
      data.pageViews += event.pageView
      if (event.uniqueVisitor) data.uniqueVisitors += 1
      if (event.sessionId) data.sessions += 1
    })

    return Array.from(dailyMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )
  }

  /**
   * Aggregate events by week
   */
  aggregateByWeek(events: AnalyticsEvent[]): AggregatedData[] {
    const weeklyMap = new Map<string, AggregatedData>()

    events.forEach(event => {
      const date = new Date(event.timestamp)
      const week = this.getWeekNumber(date)
      const year = date.getFullYear()
      const key = `${year}-W${week.toString().padStart(2, '0')}`

      if (!weeklyMap.has(key)) {
        weeklyMap.set(key, {
          period: key,
          pageViews: 0,
          uniqueVisitors: 0,
          sessions: 0,
        })
      }

      const data = weeklyMap.get(key)!
      data.pageViews += event.pageView
      if (event.uniqueVisitor) data.uniqueVisitors += 1
      if (event.sessionId) data.sessions += 1
    })

    return Array.from(weeklyMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )
  }

  /**
   * Aggregate events by month
   */
  aggregateByMonth(events: AnalyticsEvent[]): AggregatedData[] {
    const monthlyMap = new Map<string, AggregatedData>()

    events.forEach(event => {
      const date = new Date(event.timestamp)
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          period: key,
          pageViews: 0,
          uniqueVisitors: 0,
          sessions: 0,
        })
      }

      const data = monthlyMap.get(key)!
      data.pageViews += event.pageView
      if (event.uniqueVisitor) data.uniqueVisitors += 1
      if (event.sessionId) data.sessions += 1
    })

    return Array.from(monthlyMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )
  }

  /**
   * Aggregate time series data with custom interval
   */
  aggregateTimeSeries(
    data: TimeSeriesData[],
    intervalMinutes: number
  ): TimeSeriesData[] {
    if (data.length === 0) return []

    const result: TimeSeriesData[] = []
    const intervalMs = intervalMinutes * 60 * 1000

    let currentInterval = new Date(data[0].timestamp)
    currentInterval.setMinutes(0, 0, 0)
    let sum = 0
    let count = 0

    data.forEach(point => {
      const pointTime = new Date(point.timestamp).getTime()
      const intervalEnd = currentInterval.getTime() + intervalMs

      if (pointTime >= intervalEnd) {
        if (count > 0) {
          result.push({
            timestamp: new Date(currentInterval),
            value: sum / count,
          })
        }

        currentInterval = new Date(Math.floor(pointTime / intervalMs) * intervalMs)
        sum = point.value
        count = 1
      } else {
        sum += point.value
        count++
      }
    })

    if (count > 0) {
      result.push({
        timestamp: new Date(currentInterval),
        value: sum / count,
      })
    }

    return result
  }

  /**
   * Get rolling average over specified window
   */
  getRollingAverage(data: TimeSeriesData[], windowSize: number): TimeSeriesData[] {
    if (data.length === 0 || windowSize <= 0) return []

    const result: TimeSeriesData[] = []

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1)
      const window = data.slice(start, i + 1)
      const avg = window.reduce((sum, d) => sum + d.value, 0) / window.length

      result.push({
        timestamp: data[i].timestamp,
        value: Math.round(avg * 100) / 100,
      })
    }

    return result
  }

  /**
   * Calculate growth rate between periods
   */
  calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100 * 10) / 10
  }

  /**
   * Fill gaps in time series data
   */
  fillGaps(data: TimeSeriesData[], intervalMinutes: number): TimeSeriesData[] {
    if (data.length === 0) return []

    const result: TimeSeriesData[] = []
    const intervalMs = intervalMinutes * 60 * 1000

    for (let i = 0; i < data.length - 1; i++) {
      result.push(data[i])

      const currentTime = data[i].timestamp.getTime()
      const nextTime = data[i + 1].timestamp.getTime()
      const gap = nextTime - currentTime

      if (gap > intervalMs) {
        const gapCount = Math.floor(gap / intervalMs)
        for (let j = 1; j < gapCount; j++) {
          result.push({
            timestamp: new Date(currentTime + j * intervalMs),
            value: 0,
          })
        }
      }
    }

    result.push(data[data.length - 1])
    return result
  }

  /**
   * Helper: Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  /**
   * Group by custom time bucket
   */
  groupByTimeBucket(
    events: AnalyticsEvent[],
    bucketSizeMs: number
  ): Map<number, AnalyticsEvent[]> {
    const buckets = new Map<number, AnalyticsEvent[]>()

    events.forEach(event => {
      const bucketKey = Math.floor(event.timestamp.getTime() / bucketSizeMs) * bucketSizeMs
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, [])
      }
      buckets.get(bucketKey)!.push(event)
    })

    return buckets
  }
}

describe('DataAggregator - Time Period Aggregation', () => {
  let aggregator: DataAggregator

  beforeEach(() => {
    aggregator = new DataAggregator()
  })

  describe('aggregateByHour', () => {
    it('should aggregate events into hourly buckets', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:15:00Z'), pageView: 1, uniqueVisitor: true, sessionId: 's1' },
        { timestamp: new Date('2024-01-01T10:30:00Z'), pageView: 1, uniqueVisitor: false, sessionId: 's1' },
        { timestamp: new Date('2024-01-01T11:00:00Z'), pageView: 1, uniqueVisitor: true, sessionId: 's2' },
      ]

      const result = aggregator.aggregateByHour(events)

      expect(result).toHaveLength(2)
      expect(result[0].pageViews).toBe(2)
      expect(result[0].uniqueVisitors).toBe(1)
      expect(result[1].pageViews).toBe(1)
    })

    it('should handle empty events array', () => {
      const result = aggregator.aggregateByHour([])
      expect(result).toHaveLength(0)
    })

    it('should normalize timestamps to hour boundaries', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:15:30.500Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByHour(events)
      const hour = new Date(result[0].period)

      expect(hour.getMinutes()).toBe(0)
      expect(hour.getSeconds()).toBe(0)
      expect(hour.getMilliseconds()).toBe(0)
    })

    it('should sort results chronologically', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T15:00:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-01T12:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByHour(events)

      expect(new Date(result[0].period).getHours()).toBe(10)
      expect(new Date(result[1].period).getHours()).toBe(12)
      expect(new Date(result[2].period).getHours()).toBe(15)
    })

    it('should count sessions correctly', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1, sessionId: 's1' },
        { timestamp: new Date('2024-01-01T10:30:00Z'), pageView: 1, sessionId: 's2' },
        { timestamp: new Date('2024-01-01T10:45:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByHour(events)

      expect(result[0].sessions).toBe(2)
      expect(result[0].pageViews).toBe(3)
    })
  })

  describe('aggregateByDay', () => {
    it('should aggregate events into daily buckets', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1, uniqueVisitor: true },
        { timestamp: new Date('2024-01-01T15:00:00Z'), pageView: 1, uniqueVisitor: false },
        { timestamp: new Date('2024-01-02T10:00:00Z'), pageView: 1, uniqueVisitor: true },
      ]

      const result = aggregator.aggregateByDay(events)

      expect(result).toHaveLength(2)
      expect(result[0].pageViews).toBe(2)
      expect(result[0].uniqueVisitors).toBe(1)
      expect(result[1].pageViews).toBe(1)
    })

    it('should format period as YYYY-MM-DD', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-15T10:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByDay(events)

      expect(result[0].period).toBe('2024-01-15')
    })

    it('should handle events across multiple days', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T23:59:59Z'), pageView: 1 },
        { timestamp: new Date('2024-01-02T00:00:01Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByDay(events)

      expect(result).toHaveLength(2)
      expect(result[0].period).toBe('2024-01-01')
      expect(result[1].period).toBe('2024-01-02')
    })

    it('should aggregate across different timezones correctly', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T05:00:00+05:00'), pageView: 1 },
        { timestamp: new Date('2024-01-01T05:00:00-05:00'), pageView: 1 },
      ]

      const result = aggregator.aggregateByDay(events)

      expect(result.length).toBeGreaterThan(0)
      expect(result.reduce((sum, d) => sum + d.pageViews, 0)).toBe(2)
    })
  })

  describe('aggregateByWeek', () => {
    it('should aggregate events into weekly buckets', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1, uniqueVisitor: true },
        { timestamp: new Date('2024-01-03T10:00:00Z'), pageView: 1, uniqueVisitor: false },
        { timestamp: new Date('2024-01-08T10:00:00Z'), pageView: 1, uniqueVisitor: true },
      ]

      const result = aggregator.aggregateByWeek(events)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].pageViews).toBeGreaterThan(0)
    })

    it('should format period as YYYY-WWW', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-15T10:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByWeek(events)

      expect(result[0].period).toMatch(/^\d{4}-W\d{2}$/)
    })

    it('should handle year boundaries correctly', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2023-12-31T10:00:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByWeek(events)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should count unique visitors per week', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1, uniqueVisitor: true },
        { timestamp: new Date('2024-01-02T10:00:00Z'), pageView: 1, uniqueVisitor: true },
        { timestamp: new Date('2024-01-03T10:00:00Z'), pageView: 1, uniqueVisitor: false },
      ]

      const result = aggregator.aggregateByWeek(events)

      expect(result[0].uniqueVisitors).toBe(2)
      expect(result[0].pageViews).toBe(3)
    })
  })

  describe('aggregateByMonth', () => {
    it('should aggregate events into monthly buckets', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1, uniqueVisitor: true },
        { timestamp: new Date('2024-01-15T10:00:00Z'), pageView: 1, uniqueVisitor: false },
        { timestamp: new Date('2024-02-01T10:00:00Z'), pageView: 1, uniqueVisitor: true },
      ]

      const result = aggregator.aggregateByMonth(events)

      expect(result).toHaveLength(2)
      expect(result[0].period).toBe('2024-01')
      expect(result[0].pageViews).toBe(2)
      expect(result[1].period).toBe('2024-02')
    })

    it('should format period as YYYY-MM', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-03-15T10:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByMonth(events)

      expect(result[0].period).toBe('2024-03')
    })

    it('should handle year transitions', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2023-12-15T10:00:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-15T10:00:00Z'), pageView: 1 },
      ]

      const result = aggregator.aggregateByMonth(events)

      expect(result).toHaveLength(2)
      expect(result[0].period).toBe('2023-12')
      expect(result[1].period).toBe('2024-01')
    })

    it('should accumulate all metrics within month', () => {
      const events: AnalyticsEvent[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(`2024-01-${(i + 1).toString().padStart(2, '0')}T10:00:00Z`),
        pageView: 1,
        uniqueVisitor: i % 2 === 0,
        sessionId: `s${i}`,
      }))

      const result = aggregator.aggregateByMonth(events)

      expect(result).toHaveLength(1)
      expect(result[0].pageViews).toBe(30)
      expect(result[0].uniqueVisitors).toBe(15)
      expect(result[0].sessions).toBe(30)
    })
  })

  describe('aggregateTimeSeries', () => {
    it('should aggregate time series by custom interval', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T10:05:00Z'), value: 20 },
        { timestamp: new Date('2024-01-01T10:15:00Z'), value: 30 },
      ]

      const result = aggregator.aggregateTimeSeries(data, 10)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].value).toBe(15) // Average of 10 and 20
    })

    it('should handle empty data array', () => {
      const result = aggregator.aggregateTimeSeries([], 5)
      expect(result).toHaveLength(0)
    })

    it('should calculate averages correctly', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 100 },
        { timestamp: new Date('2024-01-01T10:02:00Z'), value: 200 },
        { timestamp: new Date('2024-01-01T10:04:00Z'), value: 300 },
      ]

      const result = aggregator.aggregateTimeSeries(data, 60)

      expect(result[0].value).toBe(200) // Average of 100, 200, 300
    })

    it('should handle single data point', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 42 },
      ]

      const result = aggregator.aggregateTimeSeries(data, 10)

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(42)
    })
  })

  describe('getRollingAverage', () => {
    it('should calculate rolling average with specified window', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T11:00:00Z'), value: 20 },
        { timestamp: new Date('2024-01-01T12:00:00Z'), value: 30 },
        { timestamp: new Date('2024-01-01T13:00:00Z'), value: 40 },
      ]

      const result = aggregator.getRollingAverage(data, 2)

      expect(result).toHaveLength(4)
      expect(result[0].value).toBe(10) // First point
      expect(result[1].value).toBe(15) // (10 + 20) / 2
      expect(result[2].value).toBe(25) // (20 + 30) / 2
      expect(result[3].value).toBe(35) // (30 + 40) / 2
    })

    it('should handle empty array', () => {
      const result = aggregator.getRollingAverage([], 3)
      expect(result).toHaveLength(0)
    })

    it('should handle window size of 1', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 100 },
      ]

      const result = aggregator.getRollingAverage(data, 1)

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(100)
    })

    it('should handle window larger than data array', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T11:00:00Z'), value: 20 },
      ]

      const result = aggregator.getRollingAverage(data, 5)

      expect(result).toHaveLength(2)
      expect(result[0].value).toBe(10)
      expect(result[1].value).toBe(15)
    })

    it('should round to 2 decimal places', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T11:00:00Z'), value: 11 },
        { timestamp: new Date('2024-01-01T12:00:00Z'), value: 12 },
      ]

      const result = aggregator.getRollingAverage(data, 3)

      expect(result[2].value).toBe(11) // (10 + 11 + 12) / 3 = 11
    })
  })

  describe('calculateGrowthRate', () => {
    it('should calculate positive growth rate', () => {
      const growth = aggregator.calculateGrowthRate(150, 100)
      expect(growth).toBe(50)
    })

    it('should calculate negative growth rate', () => {
      const growth = aggregator.calculateGrowthRate(75, 100)
      expect(growth).toBe(-25)
    })

    it('should handle zero previous value', () => {
      const growth = aggregator.calculateGrowthRate(100, 0)
      expect(growth).toBe(100)
    })

    it('should handle zero current value', () => {
      const growth = aggregator.calculateGrowthRate(0, 100)
      expect(growth).toBe(-100)
    })

    it('should handle both zero values', () => {
      const growth = aggregator.calculateGrowthRate(0, 0)
      expect(growth).toBe(0)
    })

    it('should round to one decimal place', () => {
      const growth = aggregator.calculateGrowthRate(103, 100)
      expect(growth).toBe(3)
    })

    it('should handle decimal precision', () => {
      const growth = aggregator.calculateGrowthRate(101, 100)
      expect(growth).toBe(1)
    })
  })

  describe('fillGaps', () => {
    it('should fill gaps in time series data', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T10:30:00Z'), value: 30 },
      ]

      const result = aggregator.fillGaps(data, 10)

      expect(result.length).toBeGreaterThan(2)
      expect(result[1].value).toBe(0)
      expect(result[2].value).toBe(0)
    })

    it('should not add points when no gaps exist', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 10 },
        { timestamp: new Date('2024-01-01T10:10:00Z'), value: 20 },
        { timestamp: new Date('2024-01-01T10:20:00Z'), value: 30 },
      ]

      const result = aggregator.fillGaps(data, 10)

      expect(result).toHaveLength(3)
    })

    it('should handle empty array', () => {
      const result = aggregator.fillGaps([], 10)
      expect(result).toHaveLength(0)
    })

    it('should preserve original data points', () => {
      const data: TimeSeriesData[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), value: 100 },
        { timestamp: new Date('2024-01-01T11:00:00Z'), value: 200 },
      ]

      const result = aggregator.fillGaps(data, 30)

      expect(result[0].value).toBe(100)
      expect(result[result.length - 1].value).toBe(200)
    })
  })

  describe('groupByTimeBucket', () => {
    it('should group events by time buckets', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-01T10:05:00Z'), pageView: 1 },
        { timestamp: new Date('2024-01-01T10:15:00Z'), pageView: 1 },
      ]

      const bucketSize = 10 * 60 * 1000 // 10 minutes
      const result = aggregator.groupByTimeBucket(events, bucketSize)

      expect(result.size).toBeGreaterThan(0)
      const firstBucket = Array.from(result.values())[0]
      expect(firstBucket.length).toBeGreaterThan(0)
    })

    it('should handle empty events array', () => {
      const result = aggregator.groupByTimeBucket([], 60000)
      expect(result.size).toBe(0)
    })

    it('should create correct bucket keys', () => {
      const events: AnalyticsEvent[] = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), pageView: 1 },
      ]

      const bucketSize = 60 * 60 * 1000 // 1 hour
      const result = aggregator.groupByTimeBucket(events, bucketSize)

      const keys = Array.from(result.keys())
      expect(keys.length).toBe(1)
      expect(typeof keys[0]).toBe('number')
    })
  })
})
