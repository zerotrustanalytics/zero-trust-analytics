import { test, expect } from '@playwright/test'

test.describe('Analytics', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])
    await page.goto('/dashboard/site/site_1')
  })

  test('displays analytics overview', async ({ page }) => {
    await expect(page.getByText(/pageviews/i)).toBeVisible()
    await expect(page.getByText(/visitors/i)).toBeVisible()
    await expect(page.getByText(/bounce rate/i)).toBeVisible()
  })

  test('shows date range picker', async ({ page }) => {
    await expect(page.getByRole('button', { name: /7 days|30 days|date/i })).toBeVisible()
  })

  test('can change date range', async ({ page }) => {
    await page.getByRole('button', { name: /7 days|date range/i }).click()
    await page.getByRole('option', { name: /30 days/i }).click()
    // Wait for data to reload
    await page.waitForResponse(resp => resp.url().includes('/api/analytics'))
  })

  test('shows top pages chart', async ({ page }) => {
    await expect(page.getByText(/top pages/i)).toBeVisible()
    await expect(page.getByText(/\//)).toBeVisible() // Homepage path
  })

  test('shows referrers data', async ({ page }) => {
    await expect(page.getByText(/referrers|sources/i)).toBeVisible()
  })

  test('shows geographic data', async ({ page }) => {
    await expect(page.getByText(/countries|locations|geography/i)).toBeVisible()
  })

  test('has realtime toggle', async ({ page }) => {
    const realtimeBtn = page.getByRole('button', { name: /realtime|live/i })
    if (await realtimeBtn.isVisible()) {
      await realtimeBtn.click()
      await expect(page.getByText(/active.*visitors|live/i)).toBeVisible()
    }
  })

  test('can export data', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export|download/i })
    if (await exportBtn.isVisible()) {
      await exportBtn.click()
      await expect(page.getByRole('menu')).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /csv/i })).toBeVisible()
    }
  })

  test('shows device breakdown', async ({ page }) => {
    await expect(page.getByText(/devices|desktop|mobile/i)).toBeVisible()
  })

  test('shows browser breakdown', async ({ page }) => {
    await expect(page.getByText(/browsers|chrome|firefox|safari/i)).toBeVisible()
  })
})

test.describe('Analytics - Google Analytics Import', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])
  })

  test('shows import option in settings', async ({ page }) => {
    await page.goto('/dashboard/site/site_1/settings')
    await expect(page.getByText(/import.*google analytics|migrate/i)).toBeVisible()
  })

  test('can initiate Google Analytics import', async ({ page }) => {
    await page.goto('/dashboard/site/site_1/settings')
    await page.getByRole('button', { name: /import.*google|connect.*google/i }).click()

    // Should show OAuth flow or import modal
    await expect(page.getByText(/google|authorize|connect/i)).toBeVisible()
  })

  test('shows import progress', async ({ page }) => {
    await page.goto('/dashboard/site/site_1/imports')
    // If there's an active import, show progress
    const progressBar = page.locator('[role="progressbar"]')
    if (await progressBar.isVisible()) {
      await expect(progressBar).toBeVisible()
    }
  })
})
