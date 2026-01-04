import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

/**
 * Stripe Client Wrapper
 *
 * This module provides a typed wrapper around the Stripe API
 * with error handling, retry logic, and common operations.
 */

interface StripeConfig {
  apiKey: string
  apiVersion?: string
  maxRetries?: number
  timeout?: number
}

class StripeClient {
  private stripe: Stripe
  private config: StripeConfig

  constructor(config: StripeConfig) {
    this.config = {
      maxRetries: 3,
      timeout: 30000,
      ...config,
    }

    this.stripe = new Stripe(config.apiKey, {
      apiVersion: '2024-12-18.acacia',
      maxNetworkRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    })
  }

  async createCustomer(params: {
    email: string
    name?: string
    metadata?: Record<string, string>
  }): Promise<Stripe.Customer> {
    return await this.stripe.customers.create(params)
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      return await this.stripe.customers.retrieve(customerId)
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError && error.statusCode === 404) {
        return null
      }
      throw error
    }
  }

  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    return await this.stripe.customers.update(customerId, params)
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    return await this.stripe.customers.del(customerId)
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams
  ): Promise<Stripe.Checkout.Session> {
    return await this.stripe.checkout.sessions.create(params)
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return await this.stripe.checkout.sessions.retrieve(sessionId)
  }

  async createBillingPortalSession(params: {
    customer: string
    returnUrl: string
  }): Promise<Stripe.BillingPortal.Session> {
    return await this.stripe.billingPortal.sessions.create(params)
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId)
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError && error.statusCode === 404) {
        return null
      }
      throw error
    }
  }

  async createSubscription(
    params: Stripe.SubscriptionCreateParams
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.create(params)
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.update(subscriptionId, params)
  }

  async cancelSubscription(
    subscriptionId: string,
    options?: { immediately?: boolean }
  ): Promise<Stripe.Subscription> {
    if (options?.immediately) {
      return await this.stripe.subscriptions.cancel(subscriptionId)
    }
    return await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  }

  async listPrices(params?: Stripe.PriceListParams): Promise<Stripe.Price[]> {
    const prices = await this.stripe.prices.list(params)
    return prices.data
  }

  async getPrice(priceId: string): Promise<Stripe.Price | null> {
    try {
      return await this.stripe.prices.retrieve(priceId)
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError && error.statusCode === 404) {
        return null
      }
      throw error
    }
  }

  async constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Promise<Stripe.Event> {
    return this.stripe.webhooks.constructEvent(payload, signature, secret)
  }

  getStripeInstance(): Stripe {
    return this.stripe
  }
}

describe('StripeClient', () => {
  let stripeClient: StripeClient
  let mockStripe: any

  beforeEach(() => {
    // Mock Stripe SDK
    mockStripe = {
      customers: {
        create: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
        del: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
          retrieve: vi.fn(),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
      subscriptions: {
        create: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
        cancel: vi.fn(),
      },
      prices: {
        list: vi.fn(),
        retrieve: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    }

    // Mock Stripe constructor
    vi.mock('stripe', () => {
      return {
        default: vi.fn(() => mockStripe),
      }
    })

    stripeClient = new StripeClient({
      apiKey: 'sk_test_mock_key',
    })
    // Replace the internal stripe instance with our mock
    ;(stripeClient as any).stripe = mockStripe
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Constructor', () => {
    it('creates instance with valid API key', () => {
      const client = new StripeClient({ apiKey: 'sk_test_123' })
      expect(client).toBeInstanceOf(StripeClient)
    })

    it('uses default config values', () => {
      const client = new StripeClient({ apiKey: 'sk_test_123' })
      expect((client as any).config.maxRetries).toBe(3)
      expect((client as any).config.timeout).toBe(30000)
    })

    it('accepts custom config values', () => {
      const client = new StripeClient({
        apiKey: 'sk_test_123',
        maxRetries: 5,
        timeout: 60000,
      })
      expect((client as any).config.maxRetries).toBe(5)
      expect((client as any).config.timeout).toBe(60000)
    })
  })

  describe('Customer Operations', () => {
    describe('createCustomer', () => {
      it('creates customer with email only', async () => {
        const mockCustomer = {
          id: 'cus_123',
          email: 'test@example.com',
          object: 'customer',
        }
        mockStripe.customers.create.mockResolvedValue(mockCustomer)

        const result = await stripeClient.createCustomer({
          email: 'test@example.com',
        })

        expect(mockStripe.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
        })
        expect(result).toEqual(mockCustomer)
      })

      it('creates customer with name and metadata', async () => {
        const mockCustomer = {
          id: 'cus_123',
          email: 'test@example.com',
          name: 'John Doe',
          metadata: { userId: '456' },
          object: 'customer',
        }
        mockStripe.customers.create.mockResolvedValue(mockCustomer)

        const result = await stripeClient.createCustomer({
          email: 'test@example.com',
          name: 'John Doe',
          metadata: { userId: '456' },
        })

        expect(mockStripe.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: 'John Doe',
          metadata: { userId: '456' },
        })
        expect(result.metadata).toEqual({ userId: '456' })
      })

      it('throws error for invalid email', async () => {
        const error = new Stripe.errors.StripeInvalidRequestError({
          message: 'Invalid email',
          type: 'invalid_request_error',
        })
        mockStripe.customers.create.mockRejectedValue(error)

        await expect(
          stripeClient.createCustomer({ email: 'invalid-email' })
        ).rejects.toThrow('Invalid email')
      })
    })

    describe('getCustomer', () => {
      it('retrieves existing customer', async () => {
        const mockCustomer = { id: 'cus_123', email: 'test@example.com' }
        mockStripe.customers.retrieve.mockResolvedValue(mockCustomer)

        const result = await stripeClient.getCustomer('cus_123')

        expect(mockStripe.customers.retrieve).toHaveBeenCalledWith('cus_123')
        expect(result).toEqual(mockCustomer)
      })

      it('returns null for non-existent customer', async () => {
        const error = new Stripe.errors.StripeInvalidRequestError({
          message: 'No such customer',
          type: 'invalid_request_error',
        })
        Object.defineProperty(error, 'statusCode', { value: 404 })
        mockStripe.customers.retrieve.mockRejectedValue(error)

        const result = await stripeClient.getCustomer('cus_nonexistent')

        expect(result).toBeNull()
      })

      it('throws error for other Stripe errors', async () => {
        const error = new Stripe.errors.StripeAPIError({
          message: 'API Error',
          type: 'api_error',
        })
        mockStripe.customers.retrieve.mockRejectedValue(error)

        await expect(stripeClient.getCustomer('cus_123')).rejects.toThrow('API Error')
      })
    })

    describe('updateCustomer', () => {
      it('updates customer email', async () => {
        const mockCustomer = { id: 'cus_123', email: 'new@example.com' }
        mockStripe.customers.update.mockResolvedValue(mockCustomer)

        const result = await stripeClient.updateCustomer('cus_123', {
          email: 'new@example.com',
        })

        expect(mockStripe.customers.update).toHaveBeenCalledWith('cus_123', {
          email: 'new@example.com',
        })
        expect(result.email).toBe('new@example.com')
      })

      it('updates customer metadata', async () => {
        const mockCustomer = {
          id: 'cus_123',
          metadata: { plan: 'premium' },
        }
        mockStripe.customers.update.mockResolvedValue(mockCustomer)

        const result = await stripeClient.updateCustomer('cus_123', {
          metadata: { plan: 'premium' },
        })

        expect(result.metadata).toEqual({ plan: 'premium' })
      })
    })

    describe('deleteCustomer', () => {
      it('deletes customer successfully', async () => {
        const mockDeleted = { id: 'cus_123', deleted: true }
        mockStripe.customers.del.mockResolvedValue(mockDeleted)

        const result = await stripeClient.deleteCustomer('cus_123')

        expect(mockStripe.customers.del).toHaveBeenCalledWith('cus_123')
        expect(result.deleted).toBe(true)
      })
    })
  })

  describe('Checkout Operations', () => {
    describe('createCheckoutSession', () => {
      it('creates checkout session with valid params', async () => {
        const mockSession = {
          id: 'cs_123',
          url: 'https://checkout.stripe.com/pay/cs_123',
          mode: 'subscription',
        }
        mockStripe.checkout.sessions.create.mockResolvedValue(mockSession)

        const result = await stripeClient.createCheckoutSession({
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: 'price_123', quantity: 1 }],
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        })

        expect(result).toEqual(mockSession)
        expect(result.url).toContain('checkout.stripe.com')
      })

      it('creates session with metadata', async () => {
        const mockSession = {
          id: 'cs_123',
          metadata: { userId: '456' },
        }
        mockStripe.checkout.sessions.create.mockResolvedValue(mockSession)

        const result = await stripeClient.createCheckoutSession({
          mode: 'subscription',
          customer: 'cus_123',
          line_items: [{ price: 'price_123', quantity: 1 }],
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
          metadata: { userId: '456' },
        })

        expect(result.metadata).toEqual({ userId: '456' })
      })
    })

    describe('getCheckoutSession', () => {
      it('retrieves checkout session', async () => {
        const mockSession = {
          id: 'cs_123',
          status: 'complete',
          payment_status: 'paid',
        }
        mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession)

        const result = await stripeClient.getCheckoutSession('cs_123')

        expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_123')
        expect(result.status).toBe('complete')
      })
    })
  })

  describe('Billing Portal Operations', () => {
    describe('createBillingPortalSession', () => {
      it('creates portal session with customer and return URL', async () => {
        const mockSession = {
          id: 'bps_123',
          url: 'https://billing.stripe.com/session/bps_123',
        }
        mockStripe.billingPortal.sessions.create.mockResolvedValue(mockSession)

        const result = await stripeClient.createBillingPortalSession({
          customer: 'cus_123',
          returnUrl: 'https://example.com/account',
        })

        expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
          customer: 'cus_123',
          returnUrl: 'https://example.com/account',
        })
        expect(result.url).toContain('billing.stripe.com')
      })
    })
  })

  describe('Subscription Operations', () => {
    describe('createSubscription', () => {
      it('creates subscription with customer and items', async () => {
        const mockSubscription = {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          items: { data: [{ price: { id: 'price_123' } }] },
        }
        mockStripe.subscriptions.create.mockResolvedValue(mockSubscription)

        const result = await stripeClient.createSubscription({
          customer: 'cus_123',
          items: [{ price: 'price_123' }],
        })

        expect(result.status).toBe('active')
        expect(result.customer).toBe('cus_123')
      })

      it('creates subscription with trial period', async () => {
        const mockSubscription = {
          id: 'sub_123',
          trial_end: Math.floor(Date.now() / 1000) + 86400 * 14,
        }
        mockStripe.subscriptions.create.mockResolvedValue(mockSubscription)

        const result = await stripeClient.createSubscription({
          customer: 'cus_123',
          items: [{ price: 'price_123' }],
          trial_period_days: 14,
        })

        expect(result.trial_end).toBeDefined()
      })
    })

    describe('getSubscription', () => {
      it('retrieves existing subscription', async () => {
        const mockSubscription = { id: 'sub_123', status: 'active' }
        mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription)

        const result = await stripeClient.getSubscription('sub_123')

        expect(result).toEqual(mockSubscription)
      })

      it('returns null for non-existent subscription', async () => {
        const error = new Stripe.errors.StripeInvalidRequestError({
          message: 'No such subscription',
          type: 'invalid_request_error',
        })
        Object.defineProperty(error, 'statusCode', { value: 404 })
        mockStripe.subscriptions.retrieve.mockRejectedValue(error)

        const result = await stripeClient.getSubscription('sub_nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('updateSubscription', () => {
      it('updates subscription items', async () => {
        const mockSubscription = {
          id: 'sub_123',
          items: { data: [{ price: { id: 'price_456' } }] },
        }
        mockStripe.subscriptions.update.mockResolvedValue(mockSubscription)

        const result = await stripeClient.updateSubscription('sub_123', {
          items: [{ price: 'price_456' }],
        })

        expect(result.items.data[0].price.id).toBe('price_456')
      })
    })

    describe('cancelSubscription', () => {
      it('cancels subscription at period end by default', async () => {
        const mockSubscription = {
          id: 'sub_123',
          cancel_at_period_end: true,
        }
        mockStripe.subscriptions.update.mockResolvedValue(mockSubscription)

        const result = await stripeClient.cancelSubscription('sub_123')

        expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
          cancel_at_period_end: true,
        })
        expect(result.cancel_at_period_end).toBe(true)
      })

      it('cancels subscription immediately when requested', async () => {
        const mockSubscription = {
          id: 'sub_123',
          status: 'canceled',
        }
        mockStripe.subscriptions.cancel.mockResolvedValue(mockSubscription)

        const result = await stripeClient.cancelSubscription('sub_123', {
          immediately: true,
        })

        expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')
        expect(result.status).toBe('canceled')
      })
    })
  })

  describe('Price Operations', () => {
    describe('listPrices', () => {
      it('lists all active prices', async () => {
        const mockPrices = {
          data: [
            { id: 'price_1', active: true },
            { id: 'price_2', active: true },
          ],
        }
        mockStripe.prices.list.mockResolvedValue(mockPrices)

        const result = await stripeClient.listPrices({ active: true })

        expect(result).toHaveLength(2)
        expect(mockStripe.prices.list).toHaveBeenCalledWith({ active: true })
      })

      it('lists prices for specific product', async () => {
        const mockPrices = {
          data: [{ id: 'price_1', product: 'prod_123' }],
        }
        mockStripe.prices.list.mockResolvedValue(mockPrices)

        const result = await stripeClient.listPrices({ product: 'prod_123' })

        expect(result[0].product).toBe('prod_123')
      })
    })

    describe('getPrice', () => {
      it('retrieves price by ID', async () => {
        const mockPrice = {
          id: 'price_123',
          unit_amount: 1999,
          currency: 'usd',
        }
        mockStripe.prices.retrieve.mockResolvedValue(mockPrice)

        const result = await stripeClient.getPrice('price_123')

        expect(result).toEqual(mockPrice)
      })

      it('returns null for non-existent price', async () => {
        const error = new Stripe.errors.StripeInvalidRequestError({
          message: 'No such price',
          type: 'invalid_request_error',
        })
        Object.defineProperty(error, 'statusCode', { value: 404 })
        mockStripe.prices.retrieve.mockRejectedValue(error)

        const result = await stripeClient.getPrice('price_nonexistent')

        expect(result).toBeNull()
      })
    })
  })

  describe('Webhook Operations', () => {
    describe('constructWebhookEvent', () => {
      it('constructs valid webhook event', async () => {
        const mockEvent = {
          id: 'evt_123',
          type: 'customer.subscription.created',
          data: { object: {} },
        }
        mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent)

        const result = await stripeClient.constructWebhookEvent(
          '{"id":"evt_123"}',
          'sig_123',
          'whsec_123'
        )

        expect(result).toEqual(mockEvent)
        expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
          '{"id":"evt_123"}',
          'sig_123',
          'whsec_123'
        )
      })

      it('throws error for invalid signature', async () => {
        const error = new Stripe.errors.StripeSignatureVerificationError({
          message: 'Invalid signature',
          type: 'StripeSignatureVerificationError',
        })
        mockStripe.webhooks.constructEvent.mockImplementation(() => {
          throw error
        })

        await expect(
          stripeClient.constructWebhookEvent('payload', 'invalid_sig', 'whsec_123')
        ).rejects.toThrow('Invalid signature')
      })
    })
  })

  describe('Utility Methods', () => {
    describe('getStripeInstance', () => {
      it('returns Stripe instance', () => {
        const instance = stripeClient.getStripeInstance()
        expect(instance).toBeDefined()
      })
    })
  })
})
