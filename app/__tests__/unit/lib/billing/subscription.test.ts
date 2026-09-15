import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

/**
 * Subscription Management Tests
 *
 * Tests for subscription lifecycle management including creation,
 * updates, cancellation, plan changes, and trial handling.
 */

type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise'
type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid'

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
  canceledAt?: Date
}

interface CreateSubscriptionParams {
  userId: string
  priceId: string
  planTier: PlanTier
  trialDays?: number
  metadata?: Record<string, string>
}

interface UpdateSubscriptionParams {
  priceId?: string
  planTier?: PlanTier
  cancelAtPeriodEnd?: boolean
}

class SubscriptionManager {
  private stripeClient: any
  private db: any

  constructor(stripeClient: any, db: any) {
    this.stripeClient = stripeClient
    this.db = db
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionData> {
    // Validate params
    if (!params.userId || !params.priceId || !params.planTier) {
      throw new Error('Missing required parameters')
    }

    // Get or create customer
    let customer = await this.db.customers.findByUserId(params.userId)
    if (!customer) {
      const user = await this.db.users.findById(params.userId)
      customer = await this.stripeClient.createCustomer({
        email: user.email,
        name: user.name,
        metadata: { userId: params.userId },
      })
      await this.db.customers.create({
        userId: params.userId,
        stripeCustomerId: customer.id,
      })
    }

    // Create Stripe subscription
    const subscriptionParams: any = {
      customer: customer.stripeCustomerId || customer.id,
      items: [{ price: params.priceId }],
      metadata: {
        userId: params.userId,
        planTier: params.planTier,
        ...params.metadata,
      },
    }

    if (params.trialDays) {
      subscriptionParams.trial_period_days = params.trialDays
    }

    const stripeSubscription = await this.stripeClient.createSubscription(subscriptionParams)

    // Save to database
    const subscription: SubscriptionData = {
      id: stripeSubscription.id,
      userId: params.userId,
      customerId: customer.stripeCustomerId || customer.id,
      status: stripeSubscription.status,
      planTier: params.planTier,
      priceId: params.priceId,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      trialEnd: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : undefined,
    }

    await this.db.subscriptions.create(subscription)

    return subscription
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionData | null> {
    return await this.db.subscriptions.findById(subscriptionId)
  }

  async getSubscriptionByUserId(userId: string): Promise<SubscriptionData | null> {
    return await this.db.subscriptions.findByUserId(userId)
  }

  async updateSubscription(
    subscriptionId: string,
    params: UpdateSubscriptionParams
  ): Promise<SubscriptionData> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    if (!subscription) {
      throw new Error('Subscription not found')
    }

    const updateParams: any = {}

    if (params.priceId) {
      updateParams.items = [{ price: params.priceId }]
    }

    if (params.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = params.cancelAtPeriodEnd
    }

    if (params.planTier) {
      updateParams.metadata = { planTier: params.planTier }
    }

    const stripeSubscription = await this.stripeClient.updateSubscription(
      subscriptionId,
      updateParams
    )

    const updated: Partial<SubscriptionData> = {
      status: stripeSubscription.status,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    }

    if (params.priceId) {
      updated.priceId = params.priceId
    }

    if (params.planTier) {
      updated.planTier = params.planTier
    }

    await this.db.subscriptions.update(subscriptionId, updated)

    return { ...subscription, ...updated } as SubscriptionData
  }

  async cancelSubscription(
    subscriptionId: string,
    options?: { immediately?: boolean }
  ): Promise<SubscriptionData> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    if (!subscription) {
      throw new Error('Subscription not found')
    }

    const stripeSubscription = await this.stripeClient.cancelSubscription(
      subscriptionId,
      options
    )

    const updated: Partial<SubscriptionData> = {
      status: stripeSubscription.status,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    }

    if (options?.immediately) {
      updated.canceledAt = new Date()
      updated.status = 'canceled'
    }

    await this.db.subscriptions.update(subscriptionId, updated)

    return { ...subscription, ...updated } as SubscriptionData
  }

  async reactivateSubscription(subscriptionId: string): Promise<SubscriptionData> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    if (!subscription) {
      throw new Error('Subscription not found')
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new Error('Subscription is not scheduled for cancellation')
    }

    const stripeSubscription = await this.stripeClient.updateSubscription(subscriptionId, {
      cancel_at_period_end: false,
    })

    await this.db.subscriptions.update(subscriptionId, {
      cancelAtPeriodEnd: false,
      status: stripeSubscription.status,
    })

    return { ...subscription, cancelAtPeriodEnd: false, status: stripeSubscription.status }
  }

  async changePlan(
    subscriptionId: string,
    newPriceId: string,
    newPlanTier: PlanTier
  ): Promise<SubscriptionData> {
    return await this.updateSubscription(subscriptionId, {
      priceId: newPriceId,
      planTier: newPlanTier,
    })
  }

  async isSubscriptionActive(subscriptionId: string): Promise<boolean> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    if (!subscription) return false

    return subscription.status === 'active' || subscription.status === 'trialing'
  }

  async getActiveSubscriptionForUser(userId: string): Promise<SubscriptionData | null> {
    const subscription = await this.db.subscriptions.findByUserId(userId)
    if (!subscription) return null

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      return subscription
    }

    return null
  }

  async getRemainingTrialDays(subscriptionId: string): Promise<number> {
    const subscription = await this.db.subscriptions.findById(subscriptionId)
    if (!subscription || !subscription.trialEnd) return 0

    const now = new Date()
    const trialEnd = subscription.trialEnd
    const diffTime = trialEnd.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays > 0 ? diffDays : 0
  }

  async syncSubscriptionWithStripe(subscriptionId: string): Promise<SubscriptionData> {
    const stripeSubscription = await this.stripeClient.getSubscription(subscriptionId)
    if (!stripeSubscription) {
      throw new Error('Subscription not found in Stripe')
    }

    const updated: Partial<SubscriptionData> = {
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    }

    await this.db.subscriptions.update(subscriptionId, updated)

    const subscription = await this.db.subscriptions.findById(subscriptionId)
    return subscription!
  }
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager
  let mockStripeClient: any
  let mockDb: any

  beforeEach(() => {
    mockStripeClient = {
      createCustomer: vi.fn(),
      createSubscription: vi.fn(),
      getSubscription: vi.fn(),
      updateSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
    }

    mockDb = {
      users: {
        findById: vi.fn(),
      },
      customers: {
        findByUserId: vi.fn(),
        create: vi.fn(),
      },
      subscriptions: {
        create: vi.fn(),
        findById: vi.fn(),
        findByUserId: vi.fn(),
        update: vi.fn(),
      },
    }

    manager = new SubscriptionManager(mockStripeClient, mockDb)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createSubscription', () => {
    it('creates subscription for new customer', async () => {
      mockDb.customers.findByUserId.mockResolvedValue(null)
      mockDb.users.findById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      })
      mockStripeClient.createCustomer.mockResolvedValue({
        id: 'cus_123',
        email: 'test@example.com',
      })
      mockStripeClient.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
      })

      const result = await manager.createSubscription({
        userId: 'user_123',
        priceId: 'price_123',
        planTier: 'professional',
      })

      expect(mockStripeClient.createCustomer).toHaveBeenCalled()
      expect(mockDb.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub_123',
          userId: 'user_123',
          planTier: 'professional',
        })
      )
      expect(result.id).toBe('sub_123')
    })

    it('creates subscription for existing customer', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_existing',
      })
      mockStripeClient.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
      })

      const result = await manager.createSubscription({
        userId: 'user_123',
        priceId: 'price_123',
        planTier: 'professional',
      })

      expect(mockStripeClient.createCustomer).not.toHaveBeenCalled()
      expect(result.customerId).toBe('cus_existing')
    })

    it('creates subscription with trial period', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'trialing',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
        trial_end: 1641000000,
      })

      const result = await manager.createSubscription({
        userId: 'user_123',
        priceId: 'price_123',
        planTier: 'professional',
        trialDays: 14,
      })

      expect(mockStripeClient.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          trial_period_days: 14,
        })
      )
      expect(result.status).toBe('trialing')
      expect(result.trialEnd).toBeInstanceOf(Date)
    })

    it('includes custom metadata', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
      })

      await manager.createSubscription({
        userId: 'user_123',
        priceId: 'price_123',
        planTier: 'professional',
        metadata: { campaign: 'summer2024' },
      })

      expect(mockStripeClient.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            campaign: 'summer2024',
          }),
        })
      )
    })

    it('throws error when userId missing', async () => {
      await expect(
        manager.createSubscription({
          userId: '',
          priceId: 'price_123',
          planTier: 'professional',
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('throws error when priceId missing', async () => {
      await expect(
        manager.createSubscription({
          userId: 'user_123',
          priceId: '',
          planTier: 'professional',
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('throws error when planTier missing', async () => {
      await expect(
        manager.createSubscription({
          userId: 'user_123',
          priceId: 'price_123',
          planTier: '' as PlanTier,
        })
      ).rejects.toThrow('Missing required parameters')
    })

    it('handles all plan tiers correctly', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createSubscription.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
      })

      const tiers: PlanTier[] = ['free', 'starter', 'professional', 'enterprise']

      for (const tier of tiers) {
        await manager.createSubscription({
          userId: 'user_123',
          priceId: `price_${tier}`,
          planTier: tier,
        })

        expect(mockDb.subscriptions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            planTier: tier,
          })
        )
      }
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

      const result = await manager.getSubscriptionByUserId('user_123')

      expect(result).toBeNull()
    })
  })

  describe('updateSubscription', () => {
    it('updates subscription price', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        priceId: 'price_old',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.updateSubscription('sub_123', {
        priceId: 'price_new',
      })

      expect(mockStripeClient.updateSubscription).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          items: [{ price: 'price_new' }],
        })
      )
      expect(result.priceId).toBe('price_new')
    })

    it('updates subscription cancel at period end', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        cancelAtPeriodEnd: false,
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: true,
      })

      const result = await manager.updateSubscription('sub_123', {
        cancelAtPeriodEnd: true,
      })

      expect(result.cancelAtPeriodEnd).toBe(true)
    })

    it('updates subscription plan tier', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        planTier: 'starter',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.updateSubscription('sub_123', {
        planTier: 'professional',
      })

      expect(result.planTier).toBe('professional')
    })

    it('throws error when subscription not found', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(
        manager.updateSubscription('sub_nonexistent', { priceId: 'price_new' })
      ).rejects.toThrow('Subscription not found')
    })
  })

  describe('cancelSubscription', () => {
    it('cancels subscription at period end', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.cancelSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: true,
      })

      const result = await manager.cancelSubscription('sub_123')

      expect(mockStripeClient.cancelSubscription).toHaveBeenCalledWith('sub_123', undefined)
      expect(result.cancelAtPeriodEnd).toBe(true)
    })

    it('cancels subscription immediately', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.cancelSubscription.mockResolvedValue({
        status: 'canceled',
        cancel_at_period_end: false,
      })

      const result = await manager.cancelSubscription('sub_123', { immediately: true })

      expect(mockStripeClient.cancelSubscription).toHaveBeenCalledWith('sub_123', {
        immediately: true,
      })
      expect(result.status).toBe('canceled')
      expect(result.canceledAt).toBeInstanceOf(Date)
    })

    it('throws error when subscription not found', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(manager.cancelSubscription('sub_nonexistent')).rejects.toThrow(
        'Subscription not found'
      )
    })
  })

  describe('reactivateSubscription', () => {
    it('reactivates scheduled cancellation', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        cancelAtPeriodEnd: true,
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.reactivateSubscription('sub_123')

      expect(mockStripeClient.updateSubscription).toHaveBeenCalledWith('sub_123', {
        cancel_at_period_end: false,
      })
      expect(result.cancelAtPeriodEnd).toBe(false)
    })

    it('throws error when subscription not found', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      await expect(manager.reactivateSubscription('sub_nonexistent')).rejects.toThrow(
        'Subscription not found'
      )
    })

    it('throws error when subscription not scheduled for cancellation', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        cancelAtPeriodEnd: false,
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)

      await expect(manager.reactivateSubscription('sub_123')).rejects.toThrow(
        'Subscription is not scheduled for cancellation'
      )
    })
  })

  describe('changePlan', () => {
    it('changes subscription plan', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        planTier: 'starter',
        priceId: 'price_starter',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.changePlan('sub_123', 'price_pro', 'professional')

      expect(result.priceId).toBe('price_pro')
      expect(result.planTier).toBe('professional')
    })

    it('handles upgrade from starter to professional', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        planTier: 'starter',
        priceId: 'price_starter',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.changePlan('sub_123', 'price_pro', 'professional')

      expect(result.planTier).toBe('professional')
    })

    it('handles downgrade from professional to starter', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
        planTier: 'professional',
        priceId: 'price_pro',
      }
      mockDb.subscriptions.findById.mockResolvedValue(mockSubscription)
      mockStripeClient.updateSubscription.mockResolvedValue({
        status: 'active',
        cancel_at_period_end: false,
      })

      const result = await manager.changePlan('sub_123', 'price_starter', 'starter')

      expect(result.planTier).toBe('starter')
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

    it('returns false for past_due subscription', async () => {
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        status: 'past_due',
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

  describe('getActiveSubscriptionForUser', () => {
    it('returns active subscription', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      }
      mockDb.subscriptions.findByUserId.mockResolvedValue(mockSubscription)

      const result = await manager.getActiveSubscriptionForUser('user_123')

      expect(result).toEqual(mockSubscription)
    })

    it('returns trialing subscription', async () => {
      const mockSubscription = {
        id: 'sub_123',
        userId: 'user_123',
        status: 'trialing',
      }
      mockDb.subscriptions.findByUserId.mockResolvedValue(mockSubscription)

      const result = await manager.getActiveSubscriptionForUser('user_123')

      expect(result).toEqual(mockSubscription)
    })

    it('returns null for canceled subscription', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'canceled',
      })

      const result = await manager.getActiveSubscriptionForUser('user_123')

      expect(result).toBeNull()
    })

    it('returns null when no subscription exists', async () => {
      mockDb.subscriptions.findByUserId.mockResolvedValue(null)

      const result = await manager.getActiveSubscriptionForUser('user_123')

      expect(result).toBeNull()
    })
  })

  describe('getRemainingTrialDays', () => {
    it('calculates remaining trial days correctly', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 10)

      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        trialEnd: futureDate,
      })

      const result = await manager.getRemainingTrialDays('sub_123')

      expect(result).toBe(10)
    })

    it('returns 0 for expired trial', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        trialEnd: pastDate,
      })

      const result = await manager.getRemainingTrialDays('sub_123')

      expect(result).toBe(0)
    })

    it('returns 0 when no trial end date', async () => {
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        trialEnd: undefined,
      })

      const result = await manager.getRemainingTrialDays('sub_123')

      expect(result).toBe(0)
    })

    it('returns 0 when subscription not found', async () => {
      mockDb.subscriptions.findById.mockResolvedValue(null)

      const result = await manager.getRemainingTrialDays('sub_nonexistent')

      expect(result).toBe(0)
    })
  })

  describe('syncSubscriptionWithStripe', () => {
    it('syncs subscription data from Stripe', async () => {
      const mockStripeSubscription = {
        id: 'sub_123',
        status: 'active',
        current_period_start: 1640000000,
        current_period_end: 1642592000,
        cancel_at_period_end: false,
      }
      mockStripeClient.getSubscription.mockResolvedValue(mockStripeSubscription)
      mockDb.subscriptions.findById.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })

      const result = await manager.syncSubscriptionWithStripe('sub_123')

      expect(mockStripeClient.getSubscription).toHaveBeenCalledWith('sub_123')
      expect(mockDb.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          status: 'active',
        })
      )
      expect(result).toBeDefined()
    })

    it('throws error when subscription not found in Stripe', async () => {
      mockStripeClient.getSubscription.mockResolvedValue(null)

      await expect(manager.syncSubscriptionWithStripe('sub_nonexistent')).rejects.toThrow(
        'Subscription not found in Stripe'
      )
    })
  })
})
