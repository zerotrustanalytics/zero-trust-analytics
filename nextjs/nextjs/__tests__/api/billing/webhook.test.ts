import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

/**
 * Stripe Webhooks API Route Tests
 *
 * Tests for handling Stripe webhook events.
 * Processes subscription lifecycle events, payment notifications, and more.
 */

type WebhookEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'checkout.session.completed'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'

interface WebhookEvent {
  id: string
  type: WebhookEventType
  data: {
    object: any
  }
}

class WebhookHandler {
  private stripeClient: any
  private db: any
  private subscriptionManager: any

  constructor(stripeClient: any, db: any, subscriptionManager: any) {
    this.stripeClient = stripeClient
    this.db = db
    this.subscriptionManager = subscriptionManager
  }

  async verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Promise<WebhookEvent> {
    return await this.stripeClient.constructWebhookEvent(payload, signature, secret)
  }

  async handleWebhook(event: WebhookEvent): Promise<{ success: boolean; message: string }> {
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(event)
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(event)
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(event)
        case 'invoice.paid':
          return await this.handleInvoicePaid(event)
        case 'invoice.payment_failed':
          return await this.handleInvoicePaymentFailed(event)
        case 'checkout.session.completed':
          return await this.handleCheckoutSessionCompleted(event)
        case 'customer.created':
          return await this.handleCustomerCreated(event)
        case 'customer.updated':
          return await this.handleCustomerUpdated(event)
        case 'customer.deleted':
          return await this.handleCustomerDeleted(event)
        default:
          return { success: true, message: `Unhandled event type: ${event.type}` }
      }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  }

  private async handleSubscriptionCreated(event: WebhookEvent) {
    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.userId

    if (!userId) {
      throw new Error('User ID not found in subscription metadata')
    }

    await this.db.subscriptions.create({
      id: subscription.id,
      userId,
      customerId: subscription.customer as string,
      status: subscription.status,
      planTier: subscription.metadata?.planTier || 'free',
      priceId: subscription.items.data[0]?.price.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
    })

    return { success: true, message: 'Subscription created' }
  }

  private async handleSubscriptionUpdated(event: WebhookEvent) {
    const subscription = event.data.object as Stripe.Subscription

    await this.db.subscriptions.update(subscription.id, {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId: subscription.items.data[0]?.price.id,
    })

    return { success: true, message: 'Subscription updated' }
  }

  private async handleSubscriptionDeleted(event: WebhookEvent) {
    const subscription = event.data.object as Stripe.Subscription

    await this.db.subscriptions.update(subscription.id, {
      status: 'canceled',
    })

    return { success: true, message: 'Subscription deleted' }
  }

  private async handleInvoicePaid(event: WebhookEvent) {
    const invoice = event.data.object as Stripe.Invoice

    await this.db.invoices.create({
      id: invoice.id,
      customerId: invoice.customer as string,
      subscriptionId: invoice.subscription as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      paidAt: new Date(invoice.status_transitions.paid_at! * 1000),
    })

    // Update subscription status to active if it was past_due
    if (invoice.subscription) {
      const subscription = await this.db.subscriptions.findById(invoice.subscription as string)
      if (subscription && subscription.status === 'past_due') {
        await this.db.subscriptions.update(invoice.subscription as string, {
          status: 'active',
        })
      }
    }

    return { success: true, message: 'Invoice paid recorded' }
  }

  private async handleInvoicePaymentFailed(event: WebhookEvent) {
    const invoice = event.data.object as Stripe.Invoice

    await this.db.invoices.create({
      id: invoice.id,
      customerId: invoice.customer as string,
      subscriptionId: invoice.subscription as string,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'payment_failed',
    })

    // Update subscription status to past_due
    if (invoice.subscription) {
      await this.db.subscriptions.update(invoice.subscription as string, {
        status: 'past_due',
      })
    }

    return { success: true, message: 'Payment failure recorded' }
  }

  private async handleCheckoutSessionCompleted(event: WebhookEvent) {
    const session = event.data.object as Stripe.Checkout.Session

    // Record successful checkout
    await this.db.checkouts.create({
      id: session.id,
      customerId: session.customer as string,
      subscriptionId: session.subscription as string,
      mode: session.mode,
      status: 'complete',
      completedAt: new Date(),
    })

    return { success: true, message: 'Checkout session completed' }
  }

  private async handleCustomerCreated(event: WebhookEvent) {
    const customer = event.data.object as Stripe.Customer
    const userId = customer.metadata?.userId

    if (userId) {
      await this.db.customers.create({
        userId,
        stripeCustomerId: customer.id,
        email: customer.email,
        name: customer.name,
      })
    }

    return { success: true, message: 'Customer created' }
  }

  private async handleCustomerUpdated(event: WebhookEvent) {
    const customer = event.data.object as Stripe.Customer

    await this.db.customers.updateByStripeId(customer.id, {
      email: customer.email,
      name: customer.name,
    })

    return { success: true, message: 'Customer updated' }
  }

  private async handleCustomerDeleted(event: WebhookEvent) {
    const customer = event.data.object as Stripe.Customer

    await this.db.customers.deleteByStripeId(customer.id)

    return { success: true, message: 'Customer deleted' }
  }
}

describe('Stripe Webhooks API Route', () => {
  let handler: WebhookHandler
  let mockStripeClient: any
  let mockDb: any
  let mockSubscriptionManager: any

  beforeEach(() => {
    mockStripeClient = {
      constructWebhookEvent: vi.fn(),
    }

    mockDb = {
      subscriptions: {
        create: vi.fn(),
        update: vi.fn(),
        findById: vi.fn(),
      },
      invoices: {
        create: vi.fn(),
      },
      checkouts: {
        create: vi.fn(),
      },
      customers: {
        create: vi.fn(),
        updateByStripeId: vi.fn(),
        deleteByStripeId: vi.fn(),
      },
    }

    mockSubscriptionManager = {}

    handler = new WebhookHandler(mockStripeClient, mockDb, mockSubscriptionManager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('verifyWebhookSignature', () => {
    it('verifies valid webhook signature', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: { object: {} },
      }
      mockStripeClient.constructWebhookEvent.mockResolvedValue(mockEvent)

      const result = await handler.verifyWebhookSignature(
        '{"id":"evt_123"}',
        'sig_123',
        'whsec_123'
      )

      expect(result).toEqual(mockEvent)
      expect(mockStripeClient.constructWebhookEvent).toHaveBeenCalledWith(
        '{"id":"evt_123"}',
        'sig_123',
        'whsec_123'
      )
    })

    it('rejects invalid signature', async () => {
      const error = new Error('Invalid signature')
      mockStripeClient.constructWebhookEvent.mockRejectedValue(error)

      await expect(
        handler.verifyWebhookSignature('payload', 'invalid_sig', 'whsec_123')
      ).rejects.toThrow('Invalid signature')
    })
  })

  describe('handleWebhook', () => {
    describe('customer.subscription.created', () => {
      it('creates subscription in database', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: false,
              items: {
                data: [{ price: { id: 'price_123' } }],
              },
              metadata: {
                userId: 'user_123',
                planTier: 'professional',
              },
            },
          },
        }

        mockDb.subscriptions.create.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'sub_123',
            userId: 'user_123',
            planTier: 'professional',
          })
        )
      })

      it('throws error when userId missing from metadata', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: false,
              items: { data: [{ price: { id: 'price_123' } }] },
              metadata: {},
            },
          },
        }

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(false)
        expect(result.message).toContain('User ID not found')
      })

      it('handles trial subscriptions', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'trialing',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: false,
              trial_end: 1641000000,
              items: { data: [{ price: { id: 'price_123' } }] },
              metadata: { userId: 'user_123', planTier: 'professional' },
            },
          },
        }

        mockDb.subscriptions.create.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'trialing',
            trialEnd: expect.any(Date),
          })
        )
      })
    })

    describe('customer.subscription.updated', () => {
      it('updates subscription in database', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              status: 'active',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: false,
              items: { data: [{ price: { id: 'price_456' } }] },
            },
          },
        }

        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.update).toHaveBeenCalledWith(
          'sub_123',
          expect.objectContaining({
            status: 'active',
            priceId: 'price_456',
          })
        )
      })

      it('handles subscription cancellation scheduling', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              status: 'active',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: true,
              items: { data: [{ price: { id: 'price_123' } }] },
            },
          },
        }

        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.update).toHaveBeenCalledWith(
          'sub_123',
          expect.objectContaining({
            cancelAtPeriodEnd: true,
          })
        )
      })
    })

    describe('customer.subscription.deleted', () => {
      it('marks subscription as canceled', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.deleted',
          data: {
            object: {
              id: 'sub_123',
              status: 'canceled',
            },
          },
        }

        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.update).toHaveBeenCalledWith('sub_123', {
          status: 'canceled',
        })
      })
    })

    describe('invoice.paid', () => {
      it('records paid invoice', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_paid: 2999,
              currency: 'usd',
              status_transitions: {
                paid_at: 1640000000,
              },
            },
          },
        }

        mockDb.invoices.create.mockResolvedValue(true)
        mockDb.subscriptions.findById.mockResolvedValue(null)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.invoices.create).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'in_123',
            amount: 2999,
            status: 'paid',
          })
        )
      })

      it('updates past_due subscription to active', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'invoice.paid',
          data: {
            object: {
              id: 'in_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_paid: 2999,
              currency: 'usd',
              status_transitions: {
                paid_at: 1640000000,
              },
            },
          },
        }

        mockDb.invoices.create.mockResolvedValue(true)
        mockDb.subscriptions.findById.mockResolvedValue({
          id: 'sub_123',
          status: 'past_due',
        })
        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.update).toHaveBeenCalledWith('sub_123', {
          status: 'active',
        })
      })
    })

    describe('invoice.payment_failed', () => {
      it('records failed payment', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_due: 2999,
              currency: 'usd',
            },
          },
        }

        mockDb.invoices.create.mockResolvedValue(true)
        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.invoices.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'payment_failed',
          })
        )
      })

      it('updates subscription to past_due', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              amount_due: 2999,
              currency: 'usd',
            },
          },
        }

        mockDb.invoices.create.mockResolvedValue(true)
        mockDb.subscriptions.update.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.subscriptions.update).toHaveBeenCalledWith('sub_123', {
          status: 'past_due',
        })
      })
    })

    describe('checkout.session.completed', () => {
      it('records completed checkout session', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              mode: 'subscription',
            },
          },
        }

        mockDb.checkouts.create.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.checkouts.create).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'cs_123',
            status: 'complete',
          })
        )
      })
    })

    describe('customer.created', () => {
      it('creates customer in database when userId in metadata', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.created',
          data: {
            object: {
              id: 'cus_123',
              email: 'test@example.com',
              name: 'Test User',
              metadata: {
                userId: 'user_123',
              },
            },
          },
        }

        mockDb.customers.create.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.customers.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user_123',
            stripeCustomerId: 'cus_123',
          })
        )
      })

      it('skips database creation when no userId in metadata', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.created',
          data: {
            object: {
              id: 'cus_123',
              email: 'test@example.com',
              metadata: {},
            },
          },
        }

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.customers.create).not.toHaveBeenCalled()
      })
    })

    describe('customer.updated', () => {
      it('updates customer in database', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.updated',
          data: {
            object: {
              id: 'cus_123',
              email: 'newemail@example.com',
              name: 'Updated Name',
            },
          },
        }

        mockDb.customers.updateByStripeId.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.customers.updateByStripeId).toHaveBeenCalledWith('cus_123', {
          email: 'newemail@example.com',
          name: 'Updated Name',
        })
      })
    })

    describe('customer.deleted', () => {
      it('deletes customer from database', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.deleted',
          data: {
            object: {
              id: 'cus_123',
            },
          },
        }

        mockDb.customers.deleteByStripeId.mockResolvedValue(true)

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(mockDb.customers.deleteByStripeId).toHaveBeenCalledWith('cus_123')
      })
    })

    describe('unhandled events', () => {
      it('returns success for unhandled event types', async () => {
        const event: any = {
          id: 'evt_123',
          type: 'customer.source.created',
          data: { object: {} },
        }

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(true)
        expect(result.message).toContain('Unhandled event type')
      })
    })

    describe('error handling', () => {
      it('catches and returns errors', async () => {
        const event: WebhookEvent = {
          id: 'evt_123',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              current_period_start: 1640000000,
              current_period_end: 1642592000,
              cancel_at_period_end: false,
              items: { data: [{ price: { id: 'price_123' } }] },
              metadata: { userId: 'user_123', planTier: 'professional' },
            },
          },
        }

        mockDb.subscriptions.create.mockRejectedValue(new Error('Database error'))

        const result = await handler.handleWebhook(event)

        expect(result.success).toBe(false)
        expect(result.message).toBe('Database error')
      })
    })
  })
})
