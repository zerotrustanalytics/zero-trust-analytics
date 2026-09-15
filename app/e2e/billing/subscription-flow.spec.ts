import { test, expect } from '@playwright/test'

/**
 * Subscription Flow E2E Tests
 *
 * End-to-end tests for the complete billing and subscription flow.
 * Tests user journey from pricing page through checkout to subscription management.
 */

test.describe('Subscription Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Clear cookies and local storage
    await page.context().clearCookies()
    await page.goto('/')
  })

  test.describe('Pricing Page', () => {
    test('displays all pricing tiers', async ({ page }) => {
      await page.goto('/pricing')

      // Check all plan cards are visible
      await expect(page.getByTestId('pricing-card-free')).toBeVisible()
      await expect(page.getByTestId('pricing-card-starter')).toBeVisible()
      await expect(page.getByTestId('pricing-card-professional')).toBeVisible()
      await expect(page.getByTestId('pricing-card-enterprise')).toBeVisible()
    })

    test('shows monthly and annual pricing toggle', async ({ page }) => {
      await page.goto('/pricing')

      const monthlyToggle = page.getByTestId('billing-interval-monthly')
      const annualToggle = page.getByTestId('billing-interval-annual')

      await expect(monthlyToggle).toBeVisible()
      await expect(annualToggle).toBeVisible()
    })

    test('updates prices when switching to annual billing', async ({ page }) => {
      await page.goto('/pricing')

      // Get initial monthly price
      const monthlyPrice = await page.getByTestId('price-professional-monthly').textContent()

      // Switch to annual
      await page.getByTestId('billing-interval-annual').click()

      // Verify annual price is different
      const annualPrice = await page.getByTestId('price-professional-annual').textContent()
      expect(annualPrice).not.toBe(monthlyPrice)
    })

    test('highlights recommended plan', async ({ page }) => {
      await page.goto('/pricing')

      const professionalCard = page.getByTestId('pricing-card-professional')
      await expect(professionalCard).toHaveClass(/highlighted/)
    })
  })

  test.describe('Checkout Flow - Unauthenticated', () => {
    test('redirects to login when selecting plan without authentication', async ({ page }) => {
      await page.goto('/pricing')

      await page.getByTestId('select-plan-starter').click()

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test.describe('Checkout Flow - Authenticated', () => {
    test.beforeEach(async ({ page }) => {
      // Login first
      await page.goto('/login')
      await page.getByLabel('Email').fill('test@example.com')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: 'Sign In' }).click()
      await expect(page).toHaveURL('/dashboard')
    })

    test('initiates checkout for professional plan', async ({ page }) => {
      await page.goto('/pricing')

      await page.getByTestId('select-plan-professional').click()

      // Should redirect to Stripe checkout (mocked in test env)
      await expect(page).toHaveURL(/\/api\/billing\/checkout/)
    })

    test('includes trial period for eligible plans', async ({ page }) => {
      await page.goto('/pricing')

      const starterCard = page.getByTestId('pricing-card-starter')
      await expect(starterCard).toContainText('14-day free trial')

      await page.getByTestId('select-plan-starter').click()

      // Verify trial parameter in checkout URL
      const url = new URL(page.url())
      expect(url.searchParams.get('trial')).toBe('true')
    })

    test('allows applying promotion code during checkout', async ({ page }) => {
      await page.goto('/pricing')
      await page.getByTestId('select-plan-professional').click()

      // On checkout page
      await page.getByTestId('apply-promo-code').click()
      await page.getByLabel('Promotion Code').fill('SAVE20')
      await page.getByRole('button', { name: 'Apply' }).click()

      await expect(page.getByTestId('promo-applied-notice')).toBeVisible()
    })
  })

  test.describe('Subscription Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login with user who has active subscription
      await page.goto('/login')
      await page.getByLabel('Email').fill('subscriber@example.com')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: 'Sign In' }).click()
      await expect(page).toHaveURL('/dashboard')
    })

    test('displays current subscription status', async ({ page }) => {
      await page.goto('/settings/billing')

      await expect(page.getByTestId('subscription-status')).toBeVisible()
      await expect(page.getByTestId('plan-name')).toContainText('Professional Plan')
      await expect(page.getByTestId('status-badge')).toContainText('active')
    })

    test('shows usage metrics', async ({ page }) => {
      await page.goto('/settings/billing')

      await expect(page.getByTestId('usage-section')).toBeVisible()
      await expect(page.getByTestId('usage-projects')).toBeVisible()
      await expect(page.getByTestId('usage-events')).toBeVisible()
      await expect(page.getByTestId('usage-team-members')).toBeVisible()
    })

    test('opens Stripe billing portal', async ({ page }) => {
      await page.goto('/settings/billing')

      const portalButton = page.getByTestId('manage-subscription-button')
      await expect(portalButton).toBeVisible()

      // Click and verify navigation to Stripe portal (mocked in test)
      await portalButton.click()
      await expect(page).toHaveURL(/billing\.stripe\.com/)
    })

    test('allows upgrading to higher tier', async ({ page }) => {
      await page.goto('/settings/billing')

      await page.getByTestId('upgrade-button').click()

      // Should show upgrade options
      await expect(page.getByTestId('upgrade-modal')).toBeVisible()
      await expect(page.getByTestId('upgrade-to-enterprise')).toBeVisible()
    })

    test('warns before downgrading plan', async ({ page }) => {
      await page.goto('/settings/billing')

      await page.getByTestId('change-plan-button').click()
      await page.getByTestId('select-plan-starter').click()

      // Should show confirmation dialog
      await expect(page.getByTestId('downgrade-warning')).toBeVisible()
      await expect(page.getByText('You will lose access to')).toBeVisible()
    })

    test('schedules subscription cancellation', async ({ page }) => {
      await page.goto('/settings/billing')

      await page.getByTestId('cancel-subscription-link').click()

      // Confirmation dialog
      await expect(page.getByTestId('cancel-confirmation-dialog')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel Subscription' }).click()

      // Should show cancellation scheduled message
      await expect(page.getByTestId('cancellation-notice')).toBeVisible()
      await expect(page.getByText('will be canceled at the end')).toBeVisible()
    })

    test('allows reactivating scheduled cancellation', async ({ page }) => {
      // First cancel
      await page.goto('/settings/billing')
      await page.getByTestId('cancel-subscription-link').click()
      await page.getByRole('button', { name: 'Cancel Subscription' }).click()

      // Then reactivate
      await page.getByTestId('reactivate-subscription-button').click()

      // Should remove cancellation notice
      await expect(page.getByTestId('cancellation-notice')).not.toBeVisible()
      await expect(page.getByTestId('status-text')).toContainText('Renews')
    })
  })

  test.describe('Trial Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login with user on trial
      await page.goto('/login')
      await page.getByLabel('Email').fill('trial@example.com')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: 'Sign In' }).click()
    })

    test('displays trial status and expiration', async ({ page }) => {
      await page.goto('/settings/billing')

      await expect(page.getByTestId('status-badge')).toContainText('trialing')
      await expect(page.getByTestId('status-text')).toContainText('Trial ends')
    })

    test('shows trial expiration warning banner', async ({ page }) => {
      await page.goto('/dashboard')

      // Trial ending soon warning
      await expect(page.getByTestId('trial-expiring-banner')).toBeVisible()
      await expect(page.getByText('days left in your trial')).toBeVisible()
    })

    test('allows converting trial to paid subscription', async ({ page }) => {
      await page.goto('/settings/billing')

      await page.getByTestId('subscribe-now-button').click()

      // Should proceed to payment
      await expect(page).toHaveURL(/\/api\/billing\/checkout/)
    })
  })

  test.describe('Payment Failure Handling', () => {
    test.beforeEach(async ({ page }) => {
      // Login with user who has past due subscription
      await page.goto('/login')
      await page.getByLabel('Email').fill('pastdue@example.com')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: 'Sign In' }).click()
    })

    test('displays payment failed status', async ({ page }) => {
      await page.goto('/settings/billing')

      await expect(page.getByTestId('status-badge')).toContainText('past_due')
      await expect(page.getByTestId('status-text')).toContainText('Payment failed')
    })

    test('shows payment update prompt', async ({ page }) => {
      await page.goto('/dashboard')

      await expect(page.getByTestId('payment-failed-banner')).toBeVisible()
      await expect(page.getByText('Update payment method')).toBeVisible()
    })

    test('allows updating payment method', async ({ page }) => {
      await page.goto('/settings/billing')

      await page.getByTestId('update-payment-method-button').click()

      // Should open billing portal
      await expect(page).toHaveURL(/billing\.stripe\.com/)
    })
  })

  test.describe('Invoice History', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill('subscriber@example.com')
      await page.getByLabel('Password').fill('password123')
      await page.getByRole('button', { name: 'Sign In' }).click()
    })

    test('displays invoice history', async ({ page }) => {
      await page.goto('/settings/billing/invoices')

      await expect(page.getByTestId('invoice-list')).toBeVisible()
      await expect(page.getByTestId('invoice-item')).toHaveCount(3)
    })

    test('allows downloading invoice PDF', async ({ page }) => {
      await page.goto('/settings/billing/invoices')

      const downloadPromise = page.waitForEvent('download')
      await page.getByTestId('download-invoice-0').click()

      const download = await downloadPromise
      expect(download.suggestedFilename()).toContain('.pdf')
    })
  })
})
