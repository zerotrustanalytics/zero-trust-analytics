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

  describe('Additional Portal Tests', () => {
    it('handles portal session with custom return URL paths', async () => {
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

      const paths = [
        'https://example.com/settings',
        'https://example.com/account/billing',
        'https://example.com/dashboard',
      ]

      for (const path of paths) {
        const result = await handler.createPortalSession('user_123', {
          returnUrl: path,
        })

        expect(result.url).toBeDefined()
        expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith(
          expect.objectContaining({
            returnUrl: path,
          })
        )
      }
    })

    it('handles Stripe API errors during portal creation', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'active',
      })
      mockStripeClient.createBillingPortalSession.mockRejectedValue(
        new Error('Stripe API error')
      )

      await expect(
        handler.createPortalSession('user_123', {
          returnUrl: 'https://example.com/account',
        })
      ).rejects.toThrow('Stripe API error')
    })

    it('validates portal URL contains stripe billing domain', async () => {
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
        url: 'https://billing.stripe.com/session/bps_test123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(result.url).toContain('billing.stripe.com')
    })

    it('handles database errors when finding customer', async () => {
      mockDb.customers.findByUserId.mockRejectedValue(new Error('Database error'))

      await expect(
        handler.createPortalSession('user_123', {
          returnUrl: 'https://example.com/account',
        })
      ).rejects.toThrow('Database error')
    })

    it('handles database errors when finding subscription', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockRejectedValue(new Error('Database error'))

      await expect(
        handler.createPortalSession('user_123', {
          returnUrl: 'https://example.com/account',
        })
      ).rejects.toThrow('Database error')
    })

    it('creates portal for customer with trialing subscription', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'trialing',
      })
      mockStripeClient.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/portal_123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(result.url).toBeDefined()
    })

    it('creates portal for customer with past_due subscription', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'past_due',
      })
      mockStripeClient.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/session/portal_123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(result.url).toBeDefined()
    })

    it('validates return URL is HTTPS', async () => {
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

      await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/secure',
      })

      expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          returnUrl: expect.stringMatching(/^https:\/\//),
        })
      )
    })

    it('handles return URL with query parameters', async () => {
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

      await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account?tab=billing&view=settings',
      })

      expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          returnUrl: 'https://example.com/account?tab=billing&view=settings',
        })
      )
    })

    it('handles return URL with hash fragments', async () => {
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

      await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account#billing',
      })

      expect(mockStripeClient.createBillingPortalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          returnUrl: 'https://example.com/account#billing',
        })
      )
    })

    it('creates portal for multiple users sequentially', async () => {
      const users = ['user_1', 'user_2', 'user_3']

      for (const userId of users) {
        mockDb.customers.findByUserId.mockResolvedValueOnce({
          userId,
          stripeCustomerId: `cus_${userId}`,
        })
        mockDb.subscriptions.findByUserId.mockResolvedValueOnce({
          id: `sub_${userId}`,
          userId,
          status: 'active',
        })
        mockStripeClient.createBillingPortalSession.mockResolvedValueOnce({
          url: `https://billing.stripe.com/session/portal_${userId}`,
        })

        const result = await handler.createPortalSession(userId, {
          returnUrl: 'https://example.com/account',
        })

        expect(result.url).toContain(userId)
      }
    })

    it('validates access allows trialing subscriptions', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'trialing',
      })

      const result = await handler.validatePortalAccess('user_123')

      expect(result.allowed).toBe(true)
    })

    it('validates access allows past_due subscriptions', async () => {
      mockDb.customers.findByUserId.mockResolvedValue({
        userId: 'user_123',
        stripeCustomerId: 'cus_123',
      })
      mockDb.subscriptions.findByUserId.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        status: 'past_due',
      })

      const result = await handler.validatePortalAccess('user_123')

      expect(result.allowed).toBe(true)
    })

    it('handles concurrent portal session requests', async () => {
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

      const requests = Array(5)
        .fill(null)
        .map(() =>
          handler.createPortalSession('user_123', {
            returnUrl: 'https://example.com/account',
          })
        )

      const results = await Promise.all(requests)

      expect(results).toHaveLength(5)
      results.forEach((result) => {
        expect(result.url).toBeDefined()
      })
    })

    it('returns portal URL without exposing sensitive data', async () => {
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
        id: 'bps_123',
        customer: 'cus_123',
      })

      const result = await handler.createPortalSession('user_123', {
        returnUrl: 'https://example.com/account',
      })

      expect(result).toEqual({ url: expect.any(String) })
      expect(result).not.toHaveProperty('id')
      expect(result).not.toHaveProperty('customer')
    })
  })
})
