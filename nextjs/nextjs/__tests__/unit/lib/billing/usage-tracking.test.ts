import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Usage Tracking Tests
 *
 * Tests for tracking pageviews and events for billing purposes.
 * Includes quota management, rate limiting, and usage reporting.
 */

interface UsageRecord {
  id: string
  userId: string
  siteId: string
  eventType: 'pageview' | 'event'
  count: number
  timestamp: Date
  metadata?: Record<string, any>
}

interface QuotaLimit {
  planTier: string
  monthlyPageviews: number
  monthlySites: number
  monthlyEvents: number
}

interface UsageStats {
  userId: string
  period: string
  pageviews: number
  events: number
  sites: number
  quotaUsagePercent: number
  isOverQuota: boolean
}

interface TrackUsageParams {
  userId: string
  siteId: string
  eventType: 'pageview' | 'event'
  count?: number
  metadata?: Record<string, any>
}

const QUOTA_LIMITS: Record<string, QuotaLimit> = {
  free: {
    planTier: 'free',
    monthlyPageviews: 10000,
    monthlySites: 1,
    monthlyEvents: 1000,
  },
  starter: {
    planTier: 'starter',
    monthlyPageviews: 100000,
    monthlySites: 5,
    monthlyEvents: 10000,
  },
  professional: {
    planTier: 'professional',
    monthlyPageviews: 1000000,
    monthlySites: 20,
    monthlyEvents: 100000,
  },
  enterprise: {
    planTier: 'enterprise',
    monthlyPageviews: -1, // unlimited
    monthlySites: -1, // unlimited
    monthlyEvents: -1, // unlimited
  },
}

class UsageTracker {
  private db: any
  private cache: any

  constructor(db: any, cache?: any) {
    this.db = db
    this.cache = cache || {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
      increment: vi.fn().mockResolvedValue(1),
    }
  }

  async trackUsage(params: TrackUsageParams): Promise<UsageRecord> {
    if (!params.userId || !params.siteId || !params.eventType) {
      throw new Error('Missing required parameters')
    }

    // Check quota before tracking
    const isAllowed = await this.checkQuota(params.userId, params.eventType)
    if (!isAllowed) {
      throw new Error('Quota exceeded')
    }

    const record: UsageRecord = {
      id: `usage_${Date.now()}_${Math.random()}`,
      userId: params.userId,
      siteId: params.siteId,
      eventType: params.eventType,
      count: params.count || 1,
      timestamp: new Date(),
      metadata: params.metadata,
    }

    await this.db.usage.create(record)

    // Update cache counter
    const cacheKey = this.getCacheKey(params.userId, params.eventType)
    await this.cache.increment(cacheKey, params.count || 1)

    return record
  }

  async trackBulkUsage(records: TrackUsageParams[]): Promise<UsageRecord[]> {
    if (!records || records.length === 0) {
      throw new Error('No records to track')
    }

    const results: UsageRecord[] = []

    for (const params of records) {
      try {
        const record = await this.trackUsage(params)
        results.push(record)
      } catch (error) {
        // Continue tracking other records even if one fails
        console.error(`Failed to track usage: ${error}`)
      }
    }

    return results
  }

  async getUsageStats(userId: string, period?: string): Promise<UsageStats> {
    const periodStart = period ? new Date(period) : this.getMonthStart()
    const periodEnd = this.getMonthEnd(periodStart)

    const pageviews = await this.db.usage.countByType(
      userId,
      'pageview',
      periodStart,
      periodEnd
    )
    const events = await this.db.usage.countByType(userId, 'event', periodStart, periodEnd)
    const sites = await this.db.sites.countByUser(userId)

    const subscription = await this.db.subscriptions.findByUserId(userId)
    const planTier = subscription?.planTier || 'free'
    const quota = QUOTA_LIMITS[planTier]

    let quotaUsagePercent = 0
    let isOverQuota = false

    if (quota.monthlyPageviews !== -1) {
      quotaUsagePercent = (pageviews / quota.monthlyPageviews) * 100
      isOverQuota = pageviews > quota.monthlyPageviews
    }

    return {
      userId,
      period: periodStart.toISOString(),
      pageviews,
      events,
      sites,
      quotaUsagePercent,
      isOverQuota,
    }
  }

  async checkQuota(userId: string, eventType: 'pageview' | 'event'): Promise<boolean> {
    const subscription = await this.db.subscriptions.findByUserId(userId)
    const planTier = subscription?.planTier || 'free'
    const quota = QUOTA_LIMITS[planTier]

    // Enterprise has unlimited quota
    if (planTier === 'enterprise') {
      return true
    }

    const stats = await this.getUsageStats(userId)

    if (eventType === 'pageview') {
      return stats.pageviews < quota.monthlyPageviews
    } else {
      return stats.events < quota.monthlyEvents
    }
  }

  async getRemainingQuota(userId: string): Promise<{
    pageviews: number
    events: number
    sites: number
  }> {
    const subscription = await this.db.subscriptions.findByUserId(userId)
    const planTier = subscription?.planTier || 'free'
    const quota = QUOTA_LIMITS[planTier]

    if (planTier === 'enterprise') {
      return {
        pageviews: -1,
        events: -1,
        sites: -1,
      }
    }

    const stats = await this.getUsageStats(userId)

    return {
      pageviews: Math.max(0, quota.monthlyPageviews - stats.pageviews),
      events: Math.max(0, quota.monthlyEvents - stats.events),
      sites: Math.max(0, quota.monthlySites - stats.sites),
    }
  }

  async resetUsage(userId: string): Promise<void> {
    await this.db.usage.deleteByUser(userId)

    // Clear cache
    const pageviewKey = this.getCacheKey(userId, 'pageview')
    const eventKey = this.getCacheKey(userId, 'event')
    await this.cache.set(pageviewKey, 0)
    await this.cache.set(eventKey, 0)
  }

  async getQuotaLimit(planTier: string): Promise<QuotaLimit> {
    return QUOTA_LIMITS[planTier] || QUOTA_LIMITS['free']
  }

  async isOverQuota(userId: string): Promise<boolean> {
    const stats = await this.getUsageStats(userId)
    return stats.isOverQuota
  }

  async getUsageForSite(siteId: string, period?: string): Promise<number> {
    const periodStart = period ? new Date(period) : this.getMonthStart()
    const periodEnd = this.getMonthEnd(periodStart)

    return await this.db.usage.countBySite(siteId, periodStart, periodEnd)
  }

  async getUsageTrend(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; pageviews: number; events: number }>> {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const data = await this.db.usage.getTrend(userId, startDate, endDate)
    return data
  }

  async exportUsageData(userId: string, startDate: Date, endDate: Date): Promise<UsageRecord[]> {
    return await this.db.usage.findByUserAndDateRange(userId, startDate, endDate)
  }

  private getCacheKey(userId: string, eventType: string): string {
    const month = this.getMonthStart().toISOString().slice(0, 7)
    return `usage:${userId}:${eventType}:${month}`
  }

  private getMonthStart(date?: Date): Date {
    const d = date || new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }

  private getMonthEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  }
}

describe('UsageTracker', () => {
  let tracker: UsageTracker
  let mockDb: any
  let mockCache: any

  beforeEach(() => {
    mockDb = {
      usage: {
        create: vi.fn(),
        countByType: vi.fn(),
        countBySite: vi.fn(),
        deleteByUser: vi.fn(),
        findByUserAndDateRange: vi.fn(),
        getTrend: vi.fn(),
      },
      subscriptions: {
        findByUserId: vi.fn(),
      },
      sites: {
        countByUser: vi.fn(),
      },
    }

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      increment: vi.fn(),
    }

    tracker = new UsageTracker(mockDb, mockCache)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('trackUsage', () => {
    it('tracks pageview usage successfully', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)
      mockCache.increment.mockResolvedValue(1001)

      const result = await tracker.trackUsage({
        userId: 'user_123',
        siteId: 'site_123',
        eventType: 'pageview',
      })

      expect(mockDb.usage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_123',
          siteId: 'site_123',
          eventType: 'pageview',
          count: 1,
        })
      )
      expect(result.eventType).toBe('pageview')
    })

    it('tracks event usage successfully', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(500)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)

      const result = await tracker.trackUsage({
        userId: 'user_123',
        siteId: 'site_123',
        eventType: 'event',
      })

      expect(result.eventType).toBe('event')
    })

    it('tracks usage with custom count', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)

      const result = await tracker.trackUsage({
        userId: 'user_123',
        siteId: 'site_123',
        eventType: 'pageview',
        count: 10,
      })

      expect(result.count).toBe(10)
      expect(mockCache.increment).toHaveBeenCalledWith(expect.any(String), 10)
    })

    it('tracks usage with metadata', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)

      const result = await tracker.trackUsage({
        userId: 'user_123',
        siteId: 'site_123',
        eventType: 'pageview',
        metadata: { browser: 'Chrome', os: 'Windows' },
      })

      expect(result.metadata).toEqual({ browser: 'Chrome', os: 'Windows' })
    })

    it('throws error when userId missing', async () => {
      await expect(
        tracker.trackUsage({
          userId: '',
          siteId: 'site_123',
          eventType: 'pageview',
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('throws error when siteId missing', async () => {
      await expect(
        tracker.trackUsage({
          userId: 'user_123',
          siteId: '',
          eventType: 'pageview',
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('throws error when eventType missing', async () => {
      await expect(
        tracker.trackUsage({
          userId: 'user_123',
          siteId: 'site_123',
          eventType: '' as any,
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('throws error when quota exceeded', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })
      mockDb.usage.countByType.mockResolvedValue(10001)
      mockDb.sites.countByUser.mockResolvedValue(1)

      await expect(
        tracker.trackUsage({
          userId: 'user_123',
          siteId: 'site_123',
          eventType: 'pageview',
        })
      ).rejects.toThrow('Quota exceeded')
    })

    it('increments cache counter', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)
      mockCache.increment.mockResolvedValue(1001)

      await tracker.trackUsage({
        userId: 'user_123',
        siteId: 'site_123',
        eventType: 'pageview',
      })

      expect(mockCache.increment).toHaveBeenCalled()
    })
  })

  describe('trackBulkUsage', () => {
    it('tracks multiple usage records', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create.mockResolvedValue(true)

      const records = [
        { userId: 'user_123', siteId: 'site_123', eventType: 'pageview' as const },
        { userId: 'user_123', siteId: 'site_123', eventType: 'event' as const },
        { userId: 'user_123', siteId: 'site_456', eventType: 'pageview' as const },
      ]

      const results = await tracker.trackBulkUsage(records)

      expect(results).toHaveLength(3)
      expect(mockDb.usage.create).toHaveBeenCalledTimes(3)
    })

    it('continues on individual failures', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })
      mockDb.usage.countByType.mockResolvedValue(1000)
      mockDb.sites.countByUser.mockResolvedValue(5)
      mockDb.usage.create
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(true)

      const records = [
        { userId: 'user_123', siteId: 'site_123', eventType: 'pageview' as const },
        { userId: 'user_123', siteId: 'site_123', eventType: 'event' as const },
        { userId: 'user_123', siteId: 'site_456', eventType: 'pageview' as const },
      ]

      const results = await tracker.trackBulkUsage(records)

      expect(results.length).toBeGreaterThan(0)
    })

    it('throws error when no records provided', async () => {
      await expect(tracker.trackBulkUsage([])).rejects.toThrow('No records to track')
    })
  })

  describe('getUsageStats', () => {
    it('returns usage statistics for user', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(3)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'professional',
      })

      const stats = await tracker.getUsageStats('user_123')

      expect(stats.pageviews).toBe(5000)
      expect(stats.events).toBe(500)
      expect(stats.sites).toBe(3)
      expect(stats.quotaUsagePercent).toBe(0.5)
      expect(stats.isOverQuota).toBe(false)
    })

    it('calculates quota usage for free plan', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const stats = await tracker.getUsageStats('user_123')

      expect(stats.quotaUsagePercent).toBe(50)
      expect(stats.isOverQuota).toBe(false)
    })

    it('detects over quota usage', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(12000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const stats = await tracker.getUsageStats('user_123')

      expect(stats.isOverQuota).toBe(true)
    })

    it('handles enterprise unlimited quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000000).mockResolvedValueOnce(500000)
      mockDb.sites.countByUser.mockResolvedValue(100)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'enterprise',
      })

      const stats = await tracker.getUsageStats('user_123')

      expect(stats.quotaUsagePercent).toBe(0)
      expect(stats.isOverQuota).toBe(false)
    })

    it('defaults to free plan when no subscription', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue(null)

      const stats = await tracker.getUsageStats('user_123')

      expect(stats.quotaUsagePercent).toBe(50)
    })
  })

  describe('checkQuota', () => {
    it('allows usage within quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const result = await tracker.checkQuota('user_123', 'pageview')

      expect(result).toBe(true)
    })

    it('blocks usage over quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(10001).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const result = await tracker.checkQuota('user_123', 'pageview')

      expect(result).toBe(false)
    })

    it('always allows enterprise usage', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(10000000).mockResolvedValueOnce(500000)
      mockDb.sites.countByUser.mockResolvedValue(100)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'enterprise',
      })

      const result = await tracker.checkQuota('user_123', 'pageview')

      expect(result).toBe(true)
    })

    it('checks event quota separately', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(1001)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const result = await tracker.checkQuota('user_123', 'event')

      expect(result).toBe(false)
    })
  })

  describe('getRemainingQuota', () => {
    it('calculates remaining quota correctly', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const remaining = await tracker.getRemainingQuota('user_123')

      expect(remaining.pageviews).toBe(5000)
      expect(remaining.events).toBe(500)
      expect(remaining.sites).toBe(0)
    })

    it('returns unlimited for enterprise', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(1000000).mockResolvedValueOnce(100000)
      mockDb.sites.countByUser.mockResolvedValue(50)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'enterprise',
      })

      const remaining = await tracker.getRemainingQuota('user_123')

      expect(remaining.pageviews).toBe(-1)
      expect(remaining.events).toBe(-1)
      expect(remaining.sites).toBe(-1)
    })

    it('returns 0 when over quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(12000).mockResolvedValueOnce(1500)
      mockDb.sites.countByUser.mockResolvedValue(2)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const remaining = await tracker.getRemainingQuota('user_123')

      expect(remaining.pageviews).toBe(0)
      expect(remaining.events).toBe(0)
    })
  })

  describe('resetUsage', () => {
    it('resets user usage data', async () => {
      mockDb.usage.deleteByUser.mockResolvedValue(true)
      mockCache.set.mockResolvedValue(true)

      await tracker.resetUsage('user_123')

      expect(mockDb.usage.deleteByUser).toHaveBeenCalledWith('user_123')
      expect(mockCache.set).toHaveBeenCalledTimes(2)
    })
  })

  describe('getQuotaLimit', () => {
    it('returns quota for free plan', async () => {
      const quota = await tracker.getQuotaLimit('free')

      expect(quota.monthlyPageviews).toBe(10000)
      expect(quota.monthlySites).toBe(1)
    })

    it('returns quota for professional plan', async () => {
      const quota = await tracker.getQuotaLimit('professional')

      expect(quota.monthlyPageviews).toBe(1000000)
      expect(quota.monthlySites).toBe(20)
    })

    it('returns quota for enterprise plan', async () => {
      const quota = await tracker.getQuotaLimit('enterprise')

      expect(quota.monthlyPageviews).toBe(-1)
      expect(quota.monthlySites).toBe(-1)
    })

    it('defaults to free plan for unknown tier', async () => {
      const quota = await tracker.getQuotaLimit('unknown')

      expect(quota.planTier).toBe('free')
    })
  })

  describe('isOverQuota', () => {
    it('returns false when within quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(5000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const result = await tracker.isOverQuota('user_123')

      expect(result).toBe(false)
    })

    it('returns true when over quota', async () => {
      mockDb.usage.countByType.mockResolvedValueOnce(12000).mockResolvedValueOnce(500)
      mockDb.sites.countByUser.mockResolvedValue(1)
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        planTier: 'free',
      })

      const result = await tracker.isOverQuota('user_123')

      expect(result).toBe(true)
    })
  })

  describe('getUsageForSite', () => {
    it('returns usage count for site', async () => {
      mockDb.usage.countBySite.mockResolvedValue(1500)

      const result = await tracker.getUsageForSite('site_123')

      expect(mockDb.usage.countBySite).toHaveBeenCalledWith(
        'site_123',
        expect.any(Date),
        expect.any(Date)
      )
      expect(result).toBe(1500)
    })

    it('accepts custom period', async () => {
      mockDb.usage.countBySite.mockResolvedValue(2500)

      const result = await tracker.getUsageForSite('site_123', '2024-01-01')

      expect(result).toBe(2500)
    })
  })

  describe('getUsageTrend', () => {
    it('returns usage trend data', async () => {
      const mockTrend = [
        { date: '2024-01-01', pageviews: 100, events: 10 },
        { date: '2024-01-02', pageviews: 150, events: 15 },
      ]
      mockDb.usage.getTrend.mockResolvedValue(mockTrend)

      const result = await tracker.getUsageTrend('user_123', 30)

      expect(mockDb.usage.getTrend).toHaveBeenCalled()
      expect(result).toEqual(mockTrend)
    })

    it('defaults to 30 days', async () => {
      mockDb.usage.getTrend.mockResolvedValue([])

      await tracker.getUsageTrend('user_123')

      expect(mockDb.usage.getTrend).toHaveBeenCalledWith(
        'user_123',
        expect.any(Date),
        expect.any(Date)
      )
    })
  })

  describe('exportUsageData', () => {
    it('exports usage data for date range', async () => {
      const mockData = [
        {
          id: 'usage_1',
          userId: 'user_123',
          siteId: 'site_123',
          eventType: 'pageview',
          count: 1,
          timestamp: new Date(),
        },
      ]
      mockDb.usage.findByUserAndDateRange.mockResolvedValue(mockData)

      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      const result = await tracker.exportUsageData('user_123', startDate, endDate)

      expect(mockDb.usage.findByUserAndDateRange).toHaveBeenCalledWith(
        'user_123',
        startDate,
        endDate
      )
      expect(result).toEqual(mockData)
    })
  })
})
