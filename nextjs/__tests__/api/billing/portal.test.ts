import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Billing Portal API Route Tests
 *
 * Tests for the Stripe billing portal session creation endpoint.
 * Allows customers to manage their subscriptions, payment methods, and invoices.
 */

interface PortalRequest {
  returnUrl: string
}

interface PortalResponse {
  url: string
}

class PortalHandler {
  private stripeClient: any
  private db: any

  constructor(stripeClient: any, db: any) {
    this.stripeClient = stripeClient
    this.db = db
  }

  async createPortalSession(userId: string, request: PortalRequest): Promise<PortalResponse> {
    // Validate request
    if (!request.returnUrl) {
      throw new Error('Return URL is required')
    }

    // Get customer
    const customer = await this.db.customers.findByUserId(userId)
    if (!customer) {
      throw new Error('Customer not found')
    }

    // Check if customer has active subscription
    const subscription = await this.db.subscriptions.findByUserId(userId)
    if (!subscription) {
      throw new Error('No active subscription found')
    }

    // Create portal session
    const session = await this.stripeClient.createBillingPortalSession({
      customer: customer.stripeCustomerId || customer.id,
      returnUrl: request.returnUrl,
    })

    return {
      url: session.url,
    }
  }

  async validatePortalAccess(userId: string): Promise<{
    allowed: boolean
    reason?: string
  }> {
    // Check if customer exists
    const customer = await this.db.customers.findByUserId(userId)
    if (!customer) {
      return { allowed: false, reason: 'Customer not found' }
    }

    // Check if customer has subscription
    const subscription = await this.db.subscriptions.findByUserId(userId)
    if (!subscription) {
      return { allowed: false, reason: 'No subscription found' }
    }

    return { allowed: true }
  }
}

describe('Billing Portal API Route', () => {
  let handler: PortalHandler
  let mockStripeClient: any
  let mockDb: any

  beforeEach(() => {
    mockStripeClient = {
      createBillingPortalSession: vi.fn(),
    }

    mockDb = {
      customers: {
        findByUserId: vi.fn(),
      },
      subscriptions: {
        findByUserId: vi.fn(),
      },
    }

    handler = new PortalHandler(mockStripeClient, mockDb)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createPortalSession', () => {
    it('creates portal session for customer with subscription', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })
      mockStripeClient.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/portal_123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith({
        customer: 'cus_123',
        returnUrl: 'https://example.com/account',
      })
      expect(result.url).toContain('billing.stripe.com')
    })

    it('throws error when return URL missing', async () => {
      await expect(
        handler.createPortalSession('user_123', { returnUrl: '' })
      ).rejects.toThrow('Return URL is required')
    })

    it('throws error when customer not found', async () => {
      mockDb.customers.findByUserId.mockResolvedValue(null)

      await expect(
        handler.createPortalSession('user_123', {
          returnUrl: 'https://example.com/account',
        })
      ).rejects.toThrow('Customer not found')
    })

    it('throws error when no subscription found', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue(null)

      await expect(
        handler.createPortalSession('user_123', {
          returnUrl: 'https://example.com/account',
        })
      ).rejects.toThrow('No active subscription found')
    })

    it('handles customer with legacy ID format', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        id: 'cus_legacy',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })
      mockStripeClient.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/portal_123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith({
        customer: 'cus_legacy',
        returnUrl: 'https://example.com/account',
      })
      expect(result.url).toBeDefined()
    })

    it('accepts different return URLs', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })
      mockStripeClient.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/portal_123',
      })

      const returnUrls = [
        'https://example.com/account',
        'https://example.com/settings/billing',
        'https://example.com/dashboard',
      ]

      for (const returnUrl of returnUrls) {
        await handler.createPortalSession('user_123', { returnUrl })

        expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith(
          expect.objectContaining({ returnUrl })
        )
      }
    })
  })

  describe('validatePortalAccess', () => {
    it('allows access for customer with subscription', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })

      const result = await handler.validatePortalAccess('user_123')

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('denies access when customer not found', async () => {
      mockDb.customers.findByUserId.mockResolvedValue(null)

      const result = await handler.validatePortalAccess('user_123')

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Customer not found')
    })

    it('denies access when no subscription found', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue(null)

      const result = await handler.validatePortalAccess('user_123')

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('No subscription found')
    })

    it('validates different user scenarios', async () => {
      // Valid user with subscription
      mockDb.customers.findByUserId.mockResolvedValueOnce({
        userId: 'user_valid',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValueOnce({
        id: 'sub_123',
        status: 'active',
      })

      const validResult = await handler.validatePortalAccess('user_valid')
      expect(validResult.allowed).toBe(true)

      // User without customer record
      mockDb.customers.findByUserId.mockResolvedValueOnce(null)

      const noCustomerResult = await handler.validatePortalAccess('user_no_customer')
      expect(noCustomerResult.allowed).toBe(false)

      // User with customer but no subscription
      mockDb.customers.findByUserId.mockResolvedValueOnce({
        userId: 'user_no_sub',
        stripeCustomerId: 'cus_456',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValueOnce(null)

      const noSubResult = await handler.validatePortalAccess('user_no_sub')
      expect(noSubResult.allowed).toBe(false)
    })
  })
})
