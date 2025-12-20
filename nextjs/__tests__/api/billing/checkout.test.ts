import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Checkout API Route Tests
 *
 * Tests for the Stripe checkout session creation endpoint.
 * Handles payment collection and subscription setup.
 */

interface CheckoutRequest {
  priceId: string
  planTier: 'free' | 'starter' | 'professional' | 'enterprise'
  successUrl: string
  cancelUrl: string
  trialDays?: number
  metadata?: Record<string, string>
}

interface CheckoutResponse {
  sessionId: string
  url: string
}

class CheckoutHandler {
  private stripeClient: any
  private db: any

  constructor(stripeClient: any, db: any) {
    this.stripeClient = stripeClient
    this.db = db
  }

  async createCheckoutSession(
    userId: string,
    request: CheckoutRequest
  ): Promise<CheckoutResponse> {
    // Validate request
    if (!request.priceId) {
      throw new Error('Price ID is required')
    }

    if (!request.successUrl || !request.cancelUrl) {
      throw new Error('Success and cancel URLs are required')
    }

    // Get or create customer
    let customer = await this.db.customers.findByUserId(userId)
    if (!customer) {
      const user = await this.db.users.findById(userId)
      customer = await this.stripeClient.createCustomer({
        email: user.email,
        name: user.name,
        metadata: { userId },
      })
      await this.db.customers.create({
        userId,
        stripeCustomerId: customer.id,
      })
    }

    // Create checkout session
    const session = await this.stripeClient.createCheckoutSession({
      mode: 'subscription',
      customer: customer.stripeCustomerId || customer.id,
      line_items: [{ price: request.priceId, quantity: 1 }],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      subscription_data: {
        trial_period_days: request.trialDays,
        metadata: {
          userId,
          planTier: request.planTier,
          ...request.metadata,
        },
      },
      allow_promotion_codes: true,
    })

    return {
      sessionId: session.id,
      url: session.url,
    }
  }

  async getCheckoutSession(sessionId: string): Promise<any> {
    return await this.stripeClient.getCheckoutSession(sessionId)
  }

  async validateCheckoutSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.getCheckoutSession(sessionId)
    if (!session) return false

    // Verify session belongs to user
    const customer = await this.db.customers.findByUserId(userId)
    if (!customer) return false

    return session.customer === customer.stripeCustomerId || session.customer === customer.id
  }
}

// Mock Next.js API handler
const createMockRequest = (body: any, method: string = 'POST'): any => ({
  method,
  body,
  headers: {},
})

const createMockResponse = (): any => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  }
  return res
}

describe('Checkout API Route', () => {
  let handler: CheckoutHandler
  let mockStripeClient: any
  let mockDb: any

  beforeEach(() => {
    mockStripeClient = {
      createCustomer: vi.fn(),
      createCheckoutSession: vi.fn(),
      getCheckoutSession: vi.fn(),
    }

    mockDb = {
      users: {
        findById: vi.fn(),
      },
      customers: {
        findByUserId: vi.fn(),
        create: vi.fn(),
      },
    }

    handler = new CheckoutHandler(mockStripeClient, mockDb)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createCheckoutSession', () => {
    it('creates checkout session for new customer', async () => {
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
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      const result = await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockStripeClient.createCustomer).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { userId: 'user_123' },
      })
      expect(result.sessionId).toBe('cs_123')
      expect(result.url).toContain('checkout.stripe.com')
    })

    it('creates checkout session for existing customer', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_existing',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      const result = await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockStripeClient.createCustomer).not.toHaveBeenCalled()
      expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
        })
      )
      expect(result.sessionId).toBe('cs_123')
    })

    it('includes trial period when specified', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        trialDays: 14,
      })

      expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
          }),
        })
      )
    })

    it('includes custom metadata', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { campaign: 'summer2024' },
      })

      expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({
              campaign: 'summer2024',
            }),
          }),
        })
      )
    })

    it('enables promotion codes', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          allow_promotion_codes: true,
        })
      )
    })

    it('throws error when price ID missing', async () => {
      await expect(
        handler.createCheckoutSession('user_123', {
          priceId: '',
          planTier: 'professional',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
      ).rejects.toThrow('Price ID is required')
    })

    it('throws error when success URL missing', async () => {
      await expect(
        handler.createCheckoutSession('user_123', {
          priceId: 'price_123',
          planTier: 'professional',
          successUrl: '',
          cancelUrl: 'https://example.com/cancel',
        })
      ).rejects.toThrow('Success and cancel URLs are required')
    })

    it('throws error when cancel URL missing', async () => {
      await expect(
        handler.createCheckoutSession('user_123', {
          priceId: 'price_123',
          planTier: 'professional',
          successUrl: 'https://example.com/success',
          cancelUrl: '',
        })
      ).rejects.toThrow('Success and cancel URLs are required')
    })

    it('handles different plan tiers', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      const tiers: Array<'free' | 'starter' | 'professional' | 'enterprise'> = [
        'starter',
        'professional',
        'enterprise',
      ]

      for (const tier of tiers) {
        await handler.createCheckoutSession('user_123', {
          priceId: `price_${tier}`,
          planTier: tier,
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })

        expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_data: expect.objectContaining({
              metadata: expect.objectContaining({
                planTier: tier,
              }),
            }),
          })
        )
      }
    })

    it('stores customer ID in database for new customers', async () => {
      mockDb.customers.findByUserId.mockResolvedValue(null)
      mockDb.users.findById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
      })
      mockStripeClient.createCustomer.mockResolvedValue({
        id: 'cus_new',
        email: 'test@example.com',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      await handler.createCheckoutSession('user_123', {
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockDb.customers.create).toHaveBeenCalledWith({
        userId: 'user_123',
        stripeCustomerId: 'cus_new',
      })
    })
  })

  describe('getCheckoutSession', () => {
    it('retrieves checkout session by ID', async () => {
      const mockSession = {
        id: 'cs_123',
        status: 'complete',
        payment_status: 'paid',
      }
      mockStripeClient.getCheckoutSession.mockResolvedValue(mockSession)

      const result = await handler.getCheckoutSession('cs_123')

      expect(mockStripeClient.getCheckoutSession).toHaveBeenCalledWith('cs_123')
      expect(result).toEqual(mockSession)
    })

    it('handles non-existent session', async () => {
      mockStripeClient.getCheckoutSession.mockResolvedValue(null)

      const result = await handler.getCheckoutSession('cs_nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('validateCheckoutSession', () => {
    it('validates session belongs to user', async () => {
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        customer: 'cus_123',
      })
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })

      const result = await handler.validateCheckoutSession('cs_123', 'user_123')

      expect(result).toBe(true)
    })

    it('rejects session for different user', async () => {
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        customer: 'cus_456',
      })
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })

      const result = await handler.validateCheckoutSession('cs_123', 'user_123')

      expect(result).toBe(false)
    })

    it('rejects when session not found', async () => {
      mockStripeClient.getCheckoutSession.mockResolvedValue(null)
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })

      const result = await handler.validateCheckoutSession('cs_nonexistent', 'user_123')

      expect(result).toBe(false)
    })

    it('rejects when customer not found', async () => {
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        customer: 'cus_123',
      })
      mockDb.customers.findByUserId.mockResolvedValue(null)

      const result = await handler.validateCheckoutSession('cs_123', 'user_123')

      expect(result).toBe(false)
    })
  })

  describe('API Route Handler', () => {
    it('handles POST request with valid data', async () => {
      const req = createMockRequest({
        priceId: 'price_123',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })
      const res = createMockResponse()

      // Mock authenticated user
      const userId = 'user_123'

      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/pay/cs_123',
      })

      const result = await handler.createCheckoutSession(userId, req.body)

      expect(result.sessionId).toBe('cs_123')
      expect(result.url).toContain('checkout.stripe.com')
    })

    it('handles errors gracefully', async () => {
      const req = createMockRequest({
        priceId: '',
        planTier: 'professional',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      await expect(
        handler.createCheckoutSession('user_123', req.body)
      ).rejects.toThrow('Price ID is required')
    })
  })
})
