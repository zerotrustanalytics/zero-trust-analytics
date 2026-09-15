import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

/**
 * Subscription Manager
 *
 * Handles subscription lifecycle operations including creation,
 * updates, cancellation, and status tracking.
 */

type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise'

interface SubscriptionData {
  id: string
  userId: string
  customerId: string
  status: SubscriptionStatus
  planTier: PlanTier
  priceId: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  trialEnd?: Date
  metadata?: Record<string, string>
}

interface CreateSubscriptionParams {
  userId: string
  customerId: string
  priceId: string
  planTier: PlanTier
  trialDays?: number
  metadata?: Record<string, string>
}

interface UpdateSubscriptionParams {
  priceId?: string
  planTier?: PlanTier
  metadata?: Record<string, string>
}

class SubscriptionManager {
  private stripeClient: any
  private db: any

  constructor(stripeClient: any, db: any) {
    this.stripeClient = stripeClient
    this.db = db
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionData> {
    // Create Stripe subscription
    const stripeSubscription = await this.stripeClient.createSubscription({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      trial_period_days: params.trialDays,
      metadata: {
        userId: params.userId,
        planTier: params.planTier,
        ...params.metadata,
      },
    })

    // Store in database
    const subscription: SubscriptionData = {
      id: stripeSubscription.id,
      userId: params.userId,
      customerId: params.customerId,
      status: stripeSubscription.status as SubscriptionStatus,
      planTier: params.planTier,
      priceId: params.priceId,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      trialEnd: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : undefined,
      metadata: params.metadata,
    }

    await this.db.subscriptions.create(subscription)
    return subscription
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionData | null> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    return subscription
  }

  async getSubscriptionByUserId(userId: string): Promise<SubscriptionData | null> {
    const subscription = await this.db.subscriptions.findByUserId(userId)
    return subscription
  }

  async updateSubscription(
    subscriptionId: string,
    params: UpdateSubscriptionParams
  ): Promise<SubscriptionData> {
    // Get current subscription
    const current = await this.getSubscription(subscriptionId)
    if (!current) {
      throw new Error('Subscription not found')
    }

    // Update Stripe subscription if price changed
    if (params.priceId && params.priceId !== current.priceId) {
      await this.stripeClient.updateSubscription(subscriptionId, {
        items: [{ price: params.priceId }],
        metadata: params.metadata,
      })
    }

    // Update database
    const updated = await this.db.subscriptions.update(subscriptionId, {
      priceId: params.priceId || current.priceId,
      planTier: params.planTier || current.planTier,
      metadata: { ...current.metadata, ...params.metadata },
    })

    return updated
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<SubscriptionData> {
    // Cancel in Stripe
    await this.stripeClient.cancelSubscription(subscriptionId, { immediately })

    // Update database
    const updated = await this.db.subscriptions.update(subscriptionId, {
      status: immediately ? 'canceled' : 'active',
      cancelAtPeriodEnd: !immediately,
    })

    return updated
  }

  async reactivateSubscription(subscriptionId: string): Promise<SubscriptionData> {
    // Get current subscription
    const current = await this.getSubscription(subscriptionId)
    if (!current) {
      throw new Error('Subscription not found')
    }

    if (!current.cancelAtPeriodEnd) {
      throw new Error('Subscription is not scheduled for cancellation')
    }

    // Reactivate in Stripe
    await this.stripeClient.updateSubscription(subscriptionId, {
      cancel_at_period_end: false,
    })

    // Update database
    const updated = await this.db.subscriptions.update(subscriptionId, {
      cancelAtPeriodEnd: false,
    })

    return updated
  }

  async syncSubscriptionStatus(subscriptionId: string): Promise<SubscriptionData> {
    // Fetch from Stripe
    const stripeSubscription = await this.stripeClient.getSubscription(subscriptionId)
    if (!stripeSubscription) {
      throw new Error('Subscription not found in Stripe')
    }

    // Update database with Stripe data
    const updated = await this.db.subscriptions.update(subscriptionId, {
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    })

    return updated
  }

  async isSubscriptionActive(subscriptionId: string): Promise<boolean> {
    const subscription = await this.getSubscription(subscriptionId)
    if (!subscription) return false
    return ['active', 'trialing'].includes(subscription.status)
  }

  async getActiveSubscriptionCount(): Promise<number> {
    return await this.db.subscriptions.countByStatus(['active', 'trialing'])
  }

  async listSubscriptionsByStatus(status: SubscriptionStatus): Promise<SubscriptionData[]> {
    return await this.db.subscriptions.findByStatus(status)
  }

  async upgradeSubscription(
    subscriptionId: string,
    newPriceId: string,
    newPlanTier: PlanTier
  ): Promise<SubscriptionData> {
    return await this.updateSubscription(subscriptionId, {
      priceId: newPriceId,
      planTier: newPlanTier,
    })
  }

  async downgradeSubscription(
    subscriptionId: string,
    newPriceId: string,
    newPlanTier: PlanTier
  ): Promise<SubscriptionData> {
    // Downgrade at period end
    const current = await this.getSubscription(subscriptionId)
    if (!current) {
      throw new Error('Subscription not found')
    }

    // Schedule the downgrade
    await this.db.subscriptions.update(subscriptionId, {
      metadata: {
        ...current.metadata,
        scheduledPriceId: newPriceId,
        scheduledPlanTier: newPlanTier,
      },
    })

    return await this.getSubscription(subscriptionId) as SubscriptionData
  }

  async applyScheduledChanges(subscriptionId: string): Promise<SubscriptionData> {
    const current = await this.getSubscription(subscriptionId)
    if (!current || !current.metadata?.scheduledPriceId) {
      throw new Error('No scheduled changes found')
    }

    return await this.updateSubscription(subscriptionId, {
      priceId: current.metadata.scheduledPriceId,
      planTier: current.metadata.scheduledPlanTier as PlanTier,
      metadata: {
        ...current.metadata,
        scheduledPriceId: undefined,
        scheduledPlanTier: undefined,
      },
    })
  }

  async getTrialingSubscriptions(): Promise<SubscriptionData[]> {
    return await this.listSubscriptionsByStatus('trialing')
  }

  async getPastDueSubscriptions(): Promise<SubscriptionData[]> {
    return await this.listSubscriptionsByStatus('past_due')
  }

  async getExpiringTrials(daysFromNow: number): Promise<SubscriptionData[]> {
    const now = Date.now()
    const targetDate = now + daysFromNow * 24 * 60 * 60 * 1000

    const trialing = await this.getTrialingSubscriptions()
    return trialing.filter((sub) => {
      if (!sub.trialEnd) return false
      const trialEndTime = sub.trialEnd.getTime()
      return trialEndTime >= now && trialEndTime <= targetDate
    })
  }
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager
  let mockStripeClient: any
  let mockDb: any

  beforeEach(() => {
    // Mock Stripe client
    mockStripeClient = {
      createSubscription: vi.fn(),
      getSubscription: vi.fn(),
      updateSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
    }

    // Mock database
    mockDb = {
      subscriptions: {
        create: vi.fn(),
        findById: vi.fn(),
        findByUserId: vi.fn(),
        update: vi.fn(),
        countByStatus: vi.fn(),
        findByStatus: vi.fn(),
      },
    }

    manager = new SubscriptionManager(mockStripeClient, mockDb)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createSubscription', () => {
    it('creates subscription without trial', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stripeResponse = {
        id: 'sub_123',
        status: 'active',
        current_period_start: now,
        current_period_end: now + 2592000,
        cancel_at_period_end: false,
      }
      mockStripeClient.createSubscription.mockResolvedValue(stripeResponse)
      mockDb.subscriptions.create.mockResolvedValue(true)

      const result = await manager.createSubscription({
        userId: 'user_123',
        customerId: 'cus_123',
        priceId: 'price_123',
        planTier: 'professional',
      })

      expect(mockStripeClient.createSubscription).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_123' }],
        trial_period_days: undefined,
        metadata: {
          userId: 'user_123',
          planTier: 'professional',
        },
      })
      expect(result.id).toBe('sub_123')
      expect(result.status).toBe('active')
      expect(result.planTier).toBe('professional')
    })

    it('creates subscription with trial period', async () => {
      const now = Math.floor(Date.now() / 1000)
      const trialEnd = now + 14 * 86400
      const stripeResponse = {
        id: 'sub_123',
        status: 'trialing',
        current_period_start: now,
        current_period_end: now + 2592000,
        cancel_at_period_end: false,
        trial_end: trialEnd,
      }
      mockStripeClient.createSubscription.mockResolvedValue(stripeResponse)
      mockDb.subscriptions.create.mockResolvedValue(true)

      const result = await manager.createSubscription({
        userId: 'user_123',
        customerId: 'cus_123',
        priceId: 'price_123',
        planTier: 'professional',
        trialDays: 14,
      })

      expect(result.status).toBe('trialing')
      expect(result.trialEnd).toBeDefined()
    })

    it('creates subscription with metadata', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stripeResponse = {
        id: 'sub_123',
        status: 'active',
        current_period_start: now,
        current_period_end: now + 2592000,
        cancel_at_period_end: false,
      }
      mockStripeClient.createSubscription.mockResolvedValue(stripeResponse)
      mockDb.subscriptions.create.mockResolvedValue(true)

      const result = await manager.createSubscription({
        userId: 'user_123',
        customerId: 'cus_123',
        priceId: 'price_123',
        planTier: 'professional',
        metadata: { source: 'website' },
      })

      expect(result.metadata).toEqual({ source: 'website' })
    })

    it('stores subscription in database', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stripeResponse = {
        id: 'sub_123',
        status: 'active',
        current_period_start: now,
        current_period_end: now + 2592000,
        cancel_at_period_end: false,
      }
      mockStripeClient.createSubscription.mockResolvedValue(stripeResponse)
      mockDb.subscriptions.create.mockResolvedValue(true)

      await manager.createSubscription({
        userId: 'user_123',
        customerId: 'cus_123',
        priceId: 'price_123',
        planTier: 'professional',
      })

      expect(mockDb.subscriptions.create).toHaveBeenCalled()
      const created = mockDb.subscriptions.create.mock.calls[0][0]
      expect(created.id).toBe('sub_123')
      expect(created.userId).toBe('user_123')
      expect(created.customerId).toBe('cus_123')
    })
  })

  describe('getSubscription', () => {
    it('retrieves subscription by ID', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)

      const result = await manager.getSubscription('sub_123')

      expect(mockDb.subscriptions.findById).toHaveBeenCalledWith('sub_123')
      expect(result).toEqual(mockSubscription)
    })

    it('returns null for non-existent subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      const result = await manager.getSubscription('sub_nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getSubscriptionByUserId', () => {
    it('retrieves subscription by user ID', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      }
      mockDb.subscriptions.findByUserId.mockResolvedValue(mockSubscription)

      const result = await manager.getSubscriptionByUserId('user_123')

      expect(mockDb.subscriptions.findByUserId).toHaveBeenCalledWith('user_123')
      expect(result).toEqual(mockSubscription)
    })

    it('returns null when user has no subscription', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue(null)

      const result = await manager.getSubscriptionByUserId('user_no_sub')

      expect(result).toBeNull()
    })
  })

  describe('updateSubscription', () => {
    it('updates subscription price', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_old',
        planTier: 'starter',
        metadata: {},
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockStripeClient.updateSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        priceId: 'price_new',
      })

      const result = await manager.updateSubscription('sub_123', {
        priceId: 'price_new',
      })

      expect(mockStripeClient.updateSubscription).toHaveBeenCalledWith('sub_123', {
        items: [{ price: 'price_new' }],
        metadata: undefined,
      })
      expect(result.priceId).toBe('price_new')
    })

    it('updates subscription plan tier', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_123',
        planTier: 'starter',
        metadata: {},
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        planTier: 'professional',
      })

      const result = await manager.updateSubscription('sub_123', {
        planTier: 'professional',
      })

      expect(result.planTier).toBe('professional')
    })

    it('throws error for non-existent subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(
        manager.updateSubscription('sub_nonexistent', { priceId: 'price_new' })
      ).rejects.toThrow('Subscription not found')
    })

    it('merges metadata on update', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_123',
        planTier: 'starter',
        metadata: { existing: 'value' },
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        metadata: { existing: 'value', new: 'data' },
      })

      const result = await manager.updateSubscription('sub_123', {
        metadata: { new: 'data' },
      })

      expect(result.metadata).toEqual({ existing: 'value', new: 'data' })
    })
  })

  describe('cancelSubscription', () => {
    it('cancels subscription at period end', async () => {
      mockStripeClient.cancelSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        cancelAtPeriodEnd: true,
      })

      const result = await manager.cancelSubscription('sub_123', false)

      expect(mockStripeClient.cancelSubscription).toHaveBeenCalledWith('sub_123', {
        immediately: false,
      })
      expect(result.cancelAtPeriodEnd).toBe(true)
      expect(result.status).toBe('active')
    })

    it('cancels subscription immediately', async () => {
      mockStripeClient.cancelSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled',
        cancelAtPeriodEnd: false,
      })

      const result = await manager.cancelSubscription('sub_123', true)

      expect(mockStripeClient.cancelSubscription).toHaveBeenCalledWith('sub_123', {
        immediately: true,
      })
      expect(result.status).toBe('canceled')
    })
  })

  describe('reactivateSubscription', () => {
    it('reactivates subscription scheduled for cancellation', async () => {
      const current = {
        id: 'sub_123',
        cancelAtPeriodEnd: true,
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockStripeClient.updateSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        cancelAtPeriodEnd: false,
      })

      const result = await manager.reactivateSubscription('sub_123')

      expect(mockStripeClient.updateSubscription).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: false,
      })
      expect(result.cancelAtPeriodEnd).toBe(false)
    })

    it('throws error for non-existent subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(manager.reactivateSubscription('sub_nonexistent')).rejects.toThrow(
        'Subscription not found'
      )
    })

    it('throws error if subscription not scheduled for cancellation', async () => {
      const current = {
        id: 'sub_123',
        cancelAtPeriodEnd: false,
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)

      await expect(manager.reactivateSubscription('sub_123')).rejects.toThrow(
        'Subscription is not scheduled for cancellation'
      )
    })
  })

  describe('syncSubscriptionStatus', () => {
    it('syncs status from Stripe to database', async () => {
      const now = Math.floor(Date.now() / 1000)
      const stripeSubscription = {
        id: 'sub_123',
        status: 'active',
        current_period_start: now,
        current_period_end: now + 2592000,
        cancel_at_period_end: false,
      }
      mockStripeClient.getSubscription.mockResolvedValue(stripeSubscription)
      mockDb.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        cancelAtPeriodEnd: false,
      })

      const result = await manager.syncSubscriptionStatus('sub_123')

      expect(mockStripeClient.getSubscription).toHaveBeenCalledWith('sub_123')
      expect(result.status).toBe('active')
    })

    it('throws error if subscription not found in Stripe', async () => {
      mockStripeClient.getSubscription.mockResolvedValue(null)

      await expect(manager.syncSubscriptionStatus('sub_123')).rejects.toThrow(
        'Subscription not found in Stripe'
      )
    })
  })

  describe('isSubscriptionActive', () => {
    it('returns true for active subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
      })

      const result = await manager.isSubscriptionActive('sub_123')

      expect(result).toBe(true)
    })

    it('returns true for trialing subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        status: 'trialing',
      })

      const result = await manager.isSubscriptionActive('sub_123')

      expect(result).toBe(true)
    })

    it('returns false for canceled subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled',
      })

      const result = await manager.isSubscriptionActive('sub_123')

      expect(result).toBe(false)
    })

    it('returns false for non-existent subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      const result = await manager.isSubscriptionActive('sub_nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('getActiveSubscriptionCount', () => {
    it('returns count of active subscriptions', async () => {
      mockDb.subscriptions.countByStatus.mockResolvedValue(42)

      const result = await manager.getActiveSubscriptionCount()

      expect(mockDb.subscriptions.countByStatus).toHaveBeenCalledWith(['active', 'trialing'])
      expect(result).toBe(42)
    })
  })

  describe('listSubscriptionsByStatus', () => {
    it('lists subscriptions by status', async () => {
      const mockSubs = [
        { id: 'sub_1', status: 'active' },
        { id: 'sub_2', status: 'active' },
      ]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.listSubscriptionsByStatus('active')

      expect(mockDb.subscriptions.findByStatus).toHaveBeenCalledWith('active')
      expect(result).toEqual(mockSubs)
    })
  })

  describe('upgradeSubscription', () => {
    it('upgrades subscription to higher tier', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_starter',
        planTier: 'starter',
        metadata: {},
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockStripeClient.updateSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        priceId: 'price_pro',
        planTier: 'professional',
      })

      const result = await manager.upgradeSubscription('sub_123', 'price_pro', 'professional')

      expect(result.priceId).toBe('price_pro')
      expect(result.planTier).toBe('professional')
    })
  })

  describe('downgradeSubscription', () => {
    it('schedules downgrade for period end', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_pro',
        planTier: 'professional',
        metadata: {},
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        metadata: {
          scheduledPriceId: 'price_starter',
          scheduledPlanTier: 'starter',
        },
      })

      const result = await manager.downgradeSubscription('sub_123', 'price_starter', 'starter')

      expect(result.metadata?.scheduledPriceId).toBe('price_starter')
      expect(result.metadata?.scheduledPlanTier).toBe('starter')
    })

    it('throws error for non-existent subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(
        manager.downgradeSubscription('sub_nonexistent', 'price_starter', 'starter')
      ).rejects.toThrow('Subscription not found')
    })
  })

  describe('applyScheduledChanges', () => {
    it('applies scheduled downgrade', async () => {
      const current = {
        id: 'sub_123',
        priceId: 'price_pro',
        planTier: 'professional',
        metadata: {
          scheduledPriceId: 'price_starter',
          scheduledPlanTier: 'starter',
        },
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)
      mockStripeClient.updateSubscription.mockResolvedValue({})
      mockDb.subscriptions.update.mockResolvedValue({
        ...current,
        priceId: 'price_starter',
        planTier: 'starter',
        metadata: {},
      })

      const result = await manager.applyScheduledChanges('sub_123')

      expect(result.priceId).toBe('price_starter')
      expect(result.planTier).toBe('starter')
      expect(result.metadata?.scheduledPriceId).toBeUndefined()
    })

    it('throws error when no scheduled changes exist', async () => {
      const current = {
        id: 'sub_123',
        metadata: {},
      }
      mockDb.subscriptions.findById.mockResolvedValue(current)

      await expect(manager.applyScheduledChanges('sub_123')).rejects.toThrow(
        'No scheduled changes found'
      )
    })
  })

  describe('getTrialingSubscriptions', () => {
    it('returns all trialing subscriptions', async () => {
      const mockSubs = [
        { id: 'sub_1', status: 'trialing' },
        { id: 'sub_2', status: 'trialing' },
      ]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.getTrialingSubscriptions()

      expect(result).toEqual(mockSubs)
    })
  })

  describe('getPastDueSubscriptions', () => {
    it('returns all past due subscriptions', async () => {
      const mockSubs = [{ id: 'sub_1', status: 'past_due' }]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.getPastDueSubscriptions()

      expect(result).toEqual(mockSubs)
    })
  })

  describe('getExpiringTrials', () => {
    it('returns trials expiring within specified days', async () => {
      const now = new Date()
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)

      const mockSubs = [
        { id: 'sub_1', status: 'trialing', trialEnd: threeDaysFromNow },
        { id: 'sub_2', status: 'trialing', trialEnd: fiveDaysFromNow },
        { id: 'sub_3', status: 'trialing', trialEnd: tenDaysFromNow },
      ]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.getExpiringTrials(7)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('sub_1')
      expect(result[1].id).toBe('sub_2')
    })

    it('excludes expired trials', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

      const mockSubs = [
        { id: 'sub_1', status: 'trialing', trialEnd: yesterday },
        { id: 'sub_2', status: 'trialing', trialEnd: tomorrow },
      ]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.getExpiringTrials(7)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('sub_2')
    })

    it('excludes subscriptions without trial end date', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

      const mockSubs = [
        { id: 'sub_1', status: 'trialing', trialEnd: undefined },
        { id: 'sub_2', status: 'trialing', trialEnd: tomorrow },
      ]
      mockDb.subscriptions.findByStatus.mockResolvedValue(mockSubs)

      const result = await manager.getExpiringTrials(7)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('sub_2')
    })
  })
})
