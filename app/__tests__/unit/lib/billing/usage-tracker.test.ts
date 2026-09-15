import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Usage Tracker
 *
 * Tracks and meters customer usage for billing purposes.
 * Monitors events, API calls, and other metered resources.
 */

interface UsageRecord {
  userId: string
  resourceType: 'events' | 'api_calls' | 'storage' | 'custom'
  quantity: number
  timestamp: Date
  metadata?: Record<string, any>
}

interface UsageSummary {
  userId: string
  period: { start: Date; end: Date }
  events: number
  apiCalls: number
  storage: number
  custom: Record<string, number>
}

interface MeteringResult {
  success: boolean
  recorded: number
  error?: string
}

class UsageTracker {
  private db: any
  private stripeClient: any

  constructor(db: any, stripeClient?: any) {
    this.db = db
    this.stripeClient = stripeClient
  }

  async recordUsage(record: UsageRecord): Promise<MeteringResult> {
    try {
      // Validate record
      if (record.quantity <= 0) {
        return {
          success: false,
          recorded: 0,
          error: 'Quantity must be positive',
        }
      }

      // Store in database
      await this.db.usage.create({
        ...record,
        timestamp: record.timestamp || new Date(),
      })

      // Report to Stripe if metered billing is enabled
      if (this.stripeClient && record.metadata?.subscriptionItemId) {
        await this.stripeClient.reportUsage(
          record.metadata.subscriptionItemId,
          record.quantity
        )
      }

      return {
        success: true,
        recorded: record.quantity,
      }
    } catch (error: any) {
      return {
        success: false,
        recorded: 0,
        error: error.message,
      }
    }
  }

  async recordBatch(records: UsageRecord[]): Promise<{
    successful: number
    failed: number
    errors: string[]
  }> {
    let successful = 0
    let failed = 0
    const errors: string[] = []

    for (const record of records) {
      const result = await this.recordUsage(record)
      if (result.success) {
        successful++
      } else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }

    return { successful, failed, errors }
  }

  async getUsageSummary(userId: string, startDate: Date, endDate: Date): Promise<UsageSummary> {
    const records = await this.db.usage.findByUserAndDateRange(userId, startDate, endDate)

    const summary: UsageSummary = {
      userId,
      period: { start: startDate, end: endDate },
      events: 0,
      apiCalls: 0,
      storage: 0,
      custom: {},
    }

    for (const record of records) {
      switch (record.resourceType) {
        case 'events':
          summary.events += record.quantity
          break
        case 'api_calls':
          summary.apiCalls += record.quantity
          break
        case 'storage':
          summary.storage = Math.max(summary.storage, record.quantity)
          break
        case 'custom':
          const customKey = record.metadata?.customType || 'other'
          summary.custom[customKey] = (summary.custom[customKey] || 0) + record.quantity
          break
      }
    }

    return summary
  }

  async getCurrentMonthUsage(userId: string): Promise<UsageSummary> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    return this.getUsageSummary(userId, startOfMonth, endOfMonth)
  }

  async getUsageByResourceType(
    userId: string,
    resourceType: UsageRecord['resourceType'],
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const records = await this.db.usage.findByUserResourceAndDateRange(
      userId,
      resourceType,
      startDate,
      endDate
    )

    return records.reduce((total: number, record: UsageRecord) => total + record.quantity, 0)
  }

  async incrementUsage(
    userId: string,
    resourceType: UsageRecord['resourceType'],
    quantity: number = 1,
    metadata?: Record<string, any>
  ): Promise<MeteringResult> {
    return this.recordUsage({
      userId,
      resourceType,
      quantity,
      timestamp: new Date(),
      metadata,
    })
  }

  async resetUsage(userId: string): Promise<void> {
    await this.db.usage.deleteByUser(userId)
  }

  async getTopUsers(
    resourceType: UsageRecord['resourceType'],
    limit: number = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ userId: string; total: number }>> {
    return await this.db.usage.getTopUsersByResource(resourceType, limit, startDate, endDate)
  }

  async getTotalUsage(
    resourceType: UsageRecord['resourceType'],
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const records = await this.db.usage.findByResourceAndDateRange(resourceType, startDate, endDate)
    return records.reduce((total: number, record: UsageRecord) => total + record.quantity, 0)
  }

  async getUsageTimeSeries(
    userId: string,
    resourceType: UsageRecord['resourceType'],
    startDate: Date,
    endDate: Date,
    interval: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<{ timestamp: Date; usage: number }>> {
    const records = await this.db.usage.findByUserResourceAndDateRange(
      userId,
      resourceType,
      startDate,
      endDate
    )

    // Group by interval
    const grouped = new Map<string, number>()

    for (const record of records) {
      const key = this.getIntervalKey(record.timestamp, interval)
      grouped.set(key, (grouped.get(key) || 0) + record.quantity)
    }

    return Array.from(grouped.entries())
      .map(([key, usage]) => ({
        timestamp: this.parseIntervalKey(key, interval),
        usage,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  private getIntervalKey(date: Date, interval: 'hour' | 'day' | 'week' | 'month'): string {
    switch (interval) {
      case 'hour':
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
      case 'day':
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        return `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`
      case 'month':
        return `${date.getFullYear()}-${date.getMonth()}`
    }
  }

  private parseIntervalKey(key: string, interval: 'hour' | 'day' | 'week' | 'month'): Date {
    const parts = key.split('-').map(Number)
    switch (interval) {
      case 'hour':
        return new Date(parts[0], parts[1], parts[2], parts[3])
      case 'day':
      case 'week':
        return new Date(parts[0], parts[1], parts[2])
      case 'month':
        return new Date(parts[0], parts[1], 1)
    }
  }

  async checkQuota(
    userId: string,
    resourceType: UsageRecord['resourceType'],
    quota: number
  ): Promise<{ withinQuota: boolean; current: number; remaining: number }> {
    const current = await this.getUsageByResourceType(
      userId,
      resourceType,
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      new Date()
    )

    return {
      withinQuota: current < quota,
      current,
      remaining: Math.max(0, quota - current),
    }
  }
}

describe('UsageTracker', () => {
  let tracker: UsageTracker
  let mockDb: any
  let mockStripeClient: any

  beforeEach(() => {
    mockDb = {
      usage: {
        create: vi.fn(),
        findByUserAndDateRange: vi.fn(),
        findByUserResourceAndDateRange: vi.fn(),
        findByResourceAndDateRange: vi.fn(),
        deleteByUser: vi.fn(),
        getTopUsersByResource: vi.fn(),
      },
    }

    mockStripeClient = {
      reportUsage: vi.fn(),
    }

    tracker = new UsageTracker(mockDb, mockStripeClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordUsage', () => {
    it('records valid usage successfully', async () => {
      mockDb.usage.create.mockResolvedValue(true)

      const record: UsageRecord = {
        userId: 'user_123',
        resourceType: 'events',
        quantity: 100,
        timestamp: new Date(),
      }

      const result = await tracker.recordUsage(record)

      expect(result.success).toBe(true)
      expect(result.recorded).toBe(100)
      expect(mockDb.usage.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user_123',
        resourceType: 'events',
        quantity: 100,
      }))
    })

    it('rejects negative quantity', async () => {
      const record: UsageRecord = {
        userId: 'user_123',
        resourceType: 'events',
        quantity: -10,
        timestamp: new Date(),
      }

      const result = await tracker.recordUsage(record)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Quantity must be positive')
      expect(mockDb.usage.create).not.toHaveBeenCalled()
    })

    it('rejects zero quantity', async () => {
      const record: UsageRecord = {
        userId: 'user_123',
        resourceType: 'events',
        quantity: 0,
        timestamp: new Date(),
      }

      const result = await tracker.recordUsage(record)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Quantity must be positive')
    })

    it('reports to Stripe when subscription item ID provided', async () => {
      mockDb.usage.create.mockResolvedValue(true)
      mockStripeClient.reportUsage.mockResolvedValue(true)

      const record: UsageRecord = {
        userId: 'user_123',
        resourceType: 'events',
        quantity: 100,
        timestamp: new Date(),
        metadata: { subscriptionItemId: 'si_123' },
      }

      await tracker.recordUsage(record)

      expect(mockStripeClient.reportUsage).toHaveBeenCalledWith('si_123', 100)
    })

    it('handles database errors gracefully', async () => {
      mockDb.usage.create.mockRejectedValue(new Error('Database error'))

      const record: UsageRecord = {
        userId: 'user_123',
        resourceType: 'events',
        quantity: 100,
        timestamp: new Date(),
      }

      const result = await tracker.recordUsage(record)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
    })
  })

  describe('recordBatch', () => {
    it('records multiple usage records', async () => {
      mockDb.usage.create.mockResolvedValue(true)

      const records: UsageRecord[] = [
        { userId: 'user_1', resourceType: 'events', quantity: 10, timestamp: new Date() },
        { userId: 'user_2', resourceType: 'events', quantity: 20, timestamp: new Date() },
        { userId: 'user_3', resourceType: 'events', quantity: 30, timestamp: new Date() },
      ]

      const result = await tracker.recordBatch(records)

      expect(result.successful).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('handles partial failures', async () => {
      mockDb.usage.create
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce(true)

      const records: UsageRecord[] = [
        { userId: 'user_1', resourceType: 'events', quantity: 10, timestamp: new Date() },
        { userId: 'user_2', resourceType: 'events', quantity: 20, timestamp: new Date() },
        { userId: 'user_3', resourceType: 'events', quantity: 30, timestamp: new Date() },
      ]

      const result = await tracker.recordBatch(records)

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toContain('Error 1')
    })

    it('rejects invalid records in batch', async () => {
      mockDb.usage.create.mockResolvedValue(true)

      const records: UsageRecord[] = [
        { userId: 'user_1', resourceType: 'events', quantity: 10, timestamp: new Date() },
        { userId: 'user_2', resourceType: 'events', quantity: -5, timestamp: new Date() },
        { userId: 'user_3', resourceType: 'events', quantity: 30, timestamp: new Date() },
      ]

      const result = await tracker.recordBatch(records)

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toContain('Quantity must be positive')
    })
  })

  describe('getUsageSummary', () => {
    it('aggregates usage across resource types', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockDb.usage.findByUserAndDateRange.mockResolvedValue([
        { resourceType: 'events', quantity: 1000 },
        { resourceType: 'events', quantity: 500 },
        { resourceType: 'api_calls', quantity: 200 },
        { resourceType: 'storage', quantity: 1024 },
      ])

      const summary = await tracker.getUsageSummary('user_123', startDate, endDate)

      expect(summary.userId).toBe('user_123')
      expect(summary.events).toBe(1500)
      expect(summary.apiCalls).toBe(200)
      expect(summary.storage).toBe(1024)
    })

    it('handles custom resource types', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockDb.usage.findByUserAndDateRange.mockResolvedValue([
        { resourceType: 'custom', quantity: 10, metadata: { customType: 'reports' } },
        { resourceType: 'custom', quantity: 5, metadata: { customType: 'exports' } },
        { resourceType: 'custom', quantity: 3, metadata: { customType: 'reports' } },
      ])

      const summary = await tracker.getUsageSummary('user_123', startDate, endDate)

      expect(summary.custom.reports).toBe(13)
      expect(summary.custom.exports).toBe(5)
    })

    it('tracks storage as maximum value', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockDb.usage.findByUserAndDateRange.mockResolvedValue([
        { resourceType: 'storage', quantity: 1024 },
        { resourceType: 'storage', quantity: 2048 },
        { resourceType: 'storage', quantity: 1536 },
      ])

      const summary = await tracker.getUsageSummary('user_123', startDate, endDate)

      expect(summary.storage).toBe(2048)
    })
  })

  describe('getCurrentMonthUsage', () => {
    it('returns usage for current month', async () => {
      mockDb.usage.findByUserAndDateRange.mockResolvedValue([
        { resourceType: 'events', quantity: 1000 },
      ])

      const summary = await tracker.getCurrentMonthUsage('user_123')

      expect(summary.userId).toBe('user_123')
      expect(summary.events).toBe(1000)
      expect(mockDb.usage.findByUserAndDateRange).toHaveBeenCalled()
    })
  })

  describe('getUsageByResourceType', () => {
    it('returns total usage for specific resource type', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockDb.usage.findByUserResourceAndDateRange.mockResolvedValue([
        { quantity: 100 },
        { quantity: 200 },
        { quantity: 300 },
      ])

      const total = await tracker.getUsageByResourceType('user_123', 'events', startDate, endDate)

      expect(total).toBe(600)
      expect(mockDb.usage.findByUserResourceAndDateRange).toHaveBeenCalledWith(
        'user_123',
        'events',
        startDate,
        endDate
      )
    })
  })

  describe('incrementUsage', () => {
    it('increments usage by 1 by default', async () => {
      mockDb.usage.create.mockResolvedValue(true)

      const result = await tracker.incrementUsage('user_123', 'api_calls')

      expect(result.success).toBe(true)
      expect(result.recorded).toBe(1)
      expect(mockDb.usage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_123',
          resourceType: 'api_calls',
          quantity: 1,
        })
      )
    })

    it('increments usage by custom amount', async () => {
      mockDb.usage.create.mockResolvedValue(true)

      const result = await tracker.incrementUsage('user_123', 'events', 50)

      expect(result.recorded).toBe(50)
    })
  })

  describe('resetUsage', () => {
    it('deletes all usage for user', async () => {
      mockDb.usage.deleteByUser.mockResolvedValue(true)

      await tracker.resetUsage('user_123')

      expect(mockDb.usage.deleteByUser).toHaveBeenCalledWith('user_123')
    })
  })

  describe('getTopUsers', () => {
    it('returns top users by usage', async () => {
      mockDb.usage.getTopUsersByResource.mockResolvedValue([
        { userId: 'user_1', total: 10000 },
        { userId: 'user_2', total: 8000 },
        { userId: 'user_3', total: 6000 },
      ])

      const result = await tracker.getTopUsers('events', 3)

      expect(result).toHaveLength(3)
      expect(result[0].userId).toBe('user_1')
      expect(result[0].total).toBe(10000)
    })

    it('uses default limit of 10', async () => {
      mockDb.usage.getTopUsersByResource.mockResolvedValue([])

      await tracker.getTopUsers('events')

      expect(mockDb.usage.getTopUsersByResource).toHaveBeenCalledWith(
        'events',
        10,
        undefined,
        undefined
      )
    })
  })

  describe('getTotalUsage', () => {
    it('calculates total usage across all users', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      mockDb.usage.findByResourceAndDateRange.mockResolvedValue([
        { quantity: 1000 },
        { quantity: 2000 },
        { quantity: 3000 },
      ])

      const total = await tracker.getTotalUsage('events', startDate, endDate)

      expect(total).toBe(6000)
    })
  })

  describe('getUsageTimeSeries', () => {
    it('groups usage by day', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-03')

      mockDb.usage.findByUserResourceAndDateRange.mockResolvedValue([
        { timestamp: new Date('2024-01-01T10:00:00'), quantity: 100 },
        { timestamp: new Date('2024-01-01T15:00:00'), quantity: 50 },
        { timestamp: new Date('2024-01-02T12:00:00'), quantity: 200 },
        { timestamp: new Date('2024-01-03T09:00:00'), quantity: 75 },
      ])

      const result = await tracker.getUsageTimeSeries('user_123', 'events', startDate, endDate, 'day')

      expect(result).toHaveLength(3)
      expect(result[0].usage).toBe(150) // Jan 1: 100 + 50
      expect(result[1].usage).toBe(200) // Jan 2: 200
      expect(result[2].usage).toBe(75)  // Jan 3: 75
    })
  })

  describe('checkQuota', () => {
    it('returns quota status when within limit', async () => {
      mockDb.usage.findByUserResourceAndDateRange.mockResolvedValue([
        { quantity: 300 },
        { quantity: 200 },
      ])

      const result = await tracker.checkQuota('user_123', 'events', 1000)

      expect(result.withinQuota).toBe(true)
      expect(result.current).toBe(500)
      expect(result.remaining).toBe(500)
    })

    it('returns quota status when over limit', async () => {
      mockDb.usage.findByUserResourceAndDateRange.mockResolvedValue([
        { quantity: 800 },
        { quantity: 300 },
      ])

      const result = await tracker.checkQuota('user_123', 'events', 1000)

      expect(result.withinQuota).toBe(false)
      expect(result.current).toBe(1100)
      expect(result.remaining).toBe(0)
    })
  })
})
