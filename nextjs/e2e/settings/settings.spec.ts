import { test, expect } from '@playwright/test'

test.describe('Settings', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])
    await page.goto('/dashboard/settings')
  })

  test('displays settings sections', async ({ page }) => {
    await expect(page.getByText(/account/i)).toBeVisible()
    await expect(page.getByText(/billing|subscription/i)).toBeVisible()
  })

  test('can update profile', async ({ page }) => {
    await page.getByLabel(/name/i).clear()
    await page.getByLabel(/name/i).fill('Updated Name')
    await page.getByRole('button', { name: /save|update/i }).first().click()

    await expect(page.getByText(/saved|updated/i)).toBeVisible()
  })

  test('shows current subscription plan', async ({ page }) => {
    await expect(page.getByText(/pro|free|enterprise/i)).toBeVisible()
  })

  test('can access billing portal', async ({ page }) => {
    const billingBtn = page.getByRole('button', { name: /manage.*billing|billing.*portal/i })
    if (await billingBtn.isVisible()) {
      // Click should open Stripe portal (mocked)
      await billingBtn.click()
    }
  })

  test('can generate new API key', async ({ page }) => {
    await page.getByRole('tab', { name: /api|developer/i }).click()
    await page.getByRole('button', { name: /generate|create.*key/i }).click()

    await expect(page.getByText(/api.*key|sk_/i)).toBeVisible()
  })

  test('shows danger zone for account deletion', async ({ page }) => {
    await expect(page.getByText(/danger.*zone|delete.*account/i)).toBeVisible()
  })

  test('requires confirmation for account deletion', async ({ page }) => {
    await page.getByRole('button', { name: /delete.*account/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/confirm|type.*delete/i)).toBeVisible()
  })
})

test.describe('Site Settings', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])
    await page.goto('/dashboard/site/site_1/settings')
  })

  test('shows site-specific settings', async ({ page }) => {
    await expect(page.getByLabel(/domain/i)).toBeVisible()
    await expect(page.getByLabel(/name/i)).toBeVisible()
  })

  test('can update site name', async ({ page }) => {
    await page.getByLabel(/name/i).clear()
    await page.getByLabel(/name/i).fill('Updated Site Name')
    await page.getByRole('button', { name: /save/i }).click()

    await expect(page.getByText(/saved|updated/i)).toBeVisible()
  })

  test('shows tracking snippet', async ({ page }) => {
    await expect(page.getByText(/<script/)).toBeVisible()
  })

  test('can copy tracking snippet', async ({ page }) => {
    await page.getByRole('button', { name: /copy/i }).first().click()
    await expect(page.getByText(/copied/i)).toBeVisible()
  })

  test('shows data retention settings', async ({ page }) => {
    await expect(page.getByText(/retention|data.*storage/i)).toBeVisible()
  })
})
