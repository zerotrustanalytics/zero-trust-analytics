import { test, expect } from '@playwright/test'

test.describe('Register', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('displays registration form', async ({ page }) => {
    await expect(page.getByLabel(/name/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign up|register|create/i })).toBeVisible()
  })

  test('shows validation errors for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /sign up|register|create/i }).click()

    await expect(page.getByText(/name.*required|enter.*name/i)).toBeVisible()
    await expect(page.getByText(/email.*required|enter.*email/i)).toBeVisible()
    await expect(page.getByText(/password.*required|enter.*password/i)).toBeVisible()
  })

  test('validates password strength', async ({ page }) => {
    await page.getByLabel(/name/i).fill('Test User')
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('weak')
    await page.getByRole('button', { name: /sign up|register|create/i }).click()

    await expect(page.getByText(/password.*8|stronger|weak/i)).toBeVisible()
  })

  test('successful registration redirects to dashboard', async ({ page }) => {
    await page.getByLabel(/name/i).fill('New User')
    await page.getByLabel(/email/i).fill('newuser@example.com')
    await page.getByLabel(/password/i).fill('SecurePass123!')
    await page.getByRole('button', { name: /sign up|register|create/i }).click()

    await expect(page).toHaveURL(/dashboard|onboarding/)
  })

  test('has link to login page', async ({ page }) => {
    await page.getByRole('link', { name: /sign in|log in|already have/i }).click()
    await expect(page).toHaveURL(/login/)
  })

  test('shows terms and privacy links', async ({ page }) => {
    await expect(page.getByRole('link', { name: /terms/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /privacy/i })).toBeVisible()
  })

  test('supports OAuth registration', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
  })
})
