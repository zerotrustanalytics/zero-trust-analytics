import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set auth cookie for authenticated access
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])
    await page.goto('/dashboard')
  })

  test('displays dashboard layout', async ({ page }) => {
    await expect(page.getByRole('navigation')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('shows user sites list', async ({ page }) => {
    await expect(page.getByText(/your sites|my sites/i)).toBeVisible()
  })

  test('can add new site', async ({ page }) => {
    await page.getByRole('button', { name: /add.*site|new.*site/i }).click()

    await expect(page.getByLabel(/domain/i)).toBeVisible()
    await expect(page.getByLabel(/name/i)).toBeVisible()

    await page.getByLabel(/domain/i).fill('newsite.com')
    await page.getByLabel(/name/i).fill('New Site')
    await page.getByRole('button', { name: /save|create|add/i }).click()

    await expect(page.getByText('newsite.com')).toBeVisible()
  })

  test('shows site analytics summary', async ({ page }) => {
    // Click on first site if available
    const siteLink = page.locator('[data-testid="site-card"]').first()
    if (await siteLink.isVisible()) {
      await siteLink.click()
      await expect(page.getByText(/pageviews|visitors/i)).toBeVisible()
    }
  })

  test('sidebar navigation works', async ({ page }) => {
    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page).toHaveURL(/settings/)

    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page).toHaveURL(/dashboard/)
  })

  test('shows tracking snippet modal', async ({ page }) => {
    const siteCard = page.locator('[data-testid="site-card"]').first()
    if (await siteCard.isVisible()) {
      await siteCard.getByRole('button', { name: /snippet|code|install/i }).click()
      await expect(page.getByText(/<script/)).toBeVisible()
    }
  })

  test('can delete site with confirmation', async ({ page }) => {
    const siteCard = page.locator('[data-testid="site-card"]').first()
    if (await siteCard.isVisible()) {
      await siteCard.getByRole('button', { name: /delete|remove/i }).click()

      // Confirmation dialog should appear
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/confirm|sure|delete/i)).toBeVisible()

      await page.getByRole('button', { name: /cancel/i }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }
  })

  test('logout works', async ({ page }) => {
    await page.getByRole('button', { name: /logout|sign out/i }).click()
    await expect(page).toHaveURL(/login|\//)
  })
})

test.describe('Dashboard - Empty State', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token_new_user',
        domain: 'localhost',
        path: '/'
      }
    ])
  })

  test('shows empty state for new users', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText(/no sites|get started|add your first/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /add.*site|get started/i })).toBeVisible()
  })
})
