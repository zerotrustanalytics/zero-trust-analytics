import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('displays login form', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible()
  })

  test('shows validation errors for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page.getByText(/email is required|enter.*email/i)).toBeVisible()
    await expect(page.getByText(/password is required|enter.*password/i)).toBeVisible()
  })

  test('shows error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('notanemail')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page.getByText(/valid email|invalid email/i)).toBeVisible()
  })

  test('shows error for wrong credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page).toHaveURL(/dashboard/)
  })

  test('has link to register page', async ({ page }) => {
    await page.getByRole('link', { name: /sign up|register|create account/i }).click()
    await expect(page).toHaveURL(/register/)
  })

  test('has link to forgot password', async ({ page }) => {
    await expect(page.getByRole('link', { name: /forgot|reset/i })).toBeVisible()
  })

  test('supports OAuth login buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
  })
})

test.describe('Login - Authenticated User', () => {
  test('redirects authenticated user to dashboard', async ({ page, context }) => {
    // Set auth cookie/token
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'mock_jwt_token',
        domain: 'localhost',
        path: '/'
      }
    ])

    await page.goto('/login')
    await expect(page).toHaveURL(/dashboard/)
  })
})
