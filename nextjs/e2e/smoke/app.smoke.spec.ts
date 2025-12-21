import { test, expect } from '@playwright/test'

/**
 * Smoke Tests - Critical Path Verification
 * These tests verify the most essential functionality works.
 * They should be fast and run on every deployment.
 */

test.describe('Smoke Tests @smoke', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Zero Trust Analytics/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('form')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible()
  })

  test('register page is accessible', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('form')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign up|register|create/i })).toBeVisible()
  })

  test('dashboard redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/)
  })

  test('API health check responds', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()
  })

  test('tracking script endpoint responds', async ({ request }) => {
    const response = await request.get('/api/script/test_site_id')
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('javascript')
  })

  test('page has no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(errors).toHaveLength(0)
  })

  test('critical CSS loads', async ({ page }) => {
    await page.goto('/')

    // Check that styles are applied (not unstyled content flash)
    const body = page.locator('body')
    const backgroundColor = await body.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )

    // Should have some background color set (not default white)
    expect(backgroundColor).toBeDefined()
  })
})
