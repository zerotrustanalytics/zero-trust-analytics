/**
 * E2E Site Management Tests
 * End-to-end tests for site management functionality
 */

import { test, expect } from '@playwright/test'

test.describe('Site Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test.describe('Site List', () => {
    test('should display empty state when no sites', async ({ page }) => {
      await page.goto('/dashboard')

      await expect(page.getByText(/no sites yet/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /add your first site/i })).toBeVisible()
    })

    test('should display all user sites', async ({ page }) => {
      await page.goto('/dashboard')

      // Wait for sites to load
      await page.waitForSelector('[data-testid="site-card"]')

      const siteCards = page.locator('[data-testid="site-card"]')
      const count = await siteCards.count()

      expect(count).toBeGreaterThan(0)
    })

    test('should show site details in card', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()

      await expect(firstCard).toContainText(/pageviews/i)
      await expect(firstCard).toContainText(/visitors/i)
    })

    test('should format large numbers with commas', async ({ page }) => {
      await page.goto('/dashboard')

      const card = page.locator('[data-testid="site-card"]').first()
      const pageviewsText = await card.locator('.pageviews').textContent()

      // Check if number is formatted (contains comma if > 999)
      if (parseInt(pageviewsText?.replace(/,/g, '') || '0') > 999) {
        expect(pageviewsText).toMatch(/,/)
      }
    })
  })

  test.describe('Add Site', () => {
    test('should open add site modal', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/add new site/i)).toBeVisible()
    })

    test('should successfully add a new site', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await page.fill('input[name="domain"]', 'test-site.com')
      await page.fill('input[name="name"]', 'Test Site')

      await page.click('button:has-text("Add Site")')

      await expect(page.getByText(/test site/i)).toBeVisible()
      await expect(page.getByText(/test-site\.com/i)).toBeVisible()
    })

    test('should show validation error for empty domain', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await page.fill('input[name="name"]', 'Test Site')
      await page.click('button:has-text("Add Site")')

      await expect(page.getByText(/domain is required/i)).toBeVisible()
    })

    test('should show validation error for empty name', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await page.fill('input[name="domain"]', 'test-site.com')
      await page.click('button:has-text("Add Site")')

      await expect(page.getByText(/site name is required/i)).toBeVisible()
    })

    test('should show validation error for invalid domain', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await page.fill('input[name="domain"]', 'invalid domain')
      await page.fill('input[name="name"]', 'Test Site')
      await page.click('button:has-text("Add Site")')

      await expect(page.getByText(/invalid domain/i)).toBeVisible()
    })

    test('should sanitize domain input', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      await page.fill('input[name="domain"]', 'https://www.test-site.com/')
      await page.fill('input[name="name"]', 'Test Site')

      const domainInput = page.locator('input[name="domain"]')
      await expect(domainInput).toHaveValue('test-site.com')
    })

    test('should close modal on cancel', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.click('button:has-text("Cancel")')

      await expect(dialog).not.toBeVisible()
    })

    test('should close modal on overlay click', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.click('[data-testid="modal-overlay"]')

      await expect(dialog).not.toBeVisible()
    })

    test('should close modal on Escape key', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Add Site")')

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(dialog).not.toBeVisible()
    })
  })

  test.describe('Edit Site', () => {
    test('should open edit modal for existing site', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Edit")').click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/edit site/i)).toBeVisible()
    })

    test('should pre-fill form with existing site data', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      const siteName = await firstCard.locator('h3').textContent()

      await firstCard.locator('button:has-text("Edit")').click()

      const nameInput = page.locator('input[name="name"]')
      await expect(nameInput).toHaveValue(siteName || '')
    })

    test('should successfully update site', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Edit")').click()

      await page.fill('input[name="name"]', 'Updated Site Name')
      await page.click('button:has-text("Save")')

      await expect(page.getByText(/updated site name/i)).toBeVisible()
    })
  })

  test.describe('Delete Site', () => {
    test('should show confirmation dialog', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Delete")').click()

      await expect(page.getByText(/are you sure/i)).toBeVisible()
    })

    test('should cancel deletion', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      const siteName = await firstCard.locator('h3').textContent()

      await firstCard.locator('button:has-text("Delete")').click()
      await page.click('button:has-text("Cancel")')

      await expect(page.getByText(siteName || '')).toBeVisible()
    })

    test('should successfully delete site', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      const siteName = await firstCard.locator('h3').textContent()

      await firstCard.locator('button:has-text("Delete")').click()
      await page.click('button:has-text("Delete")')

      await expect(page.getByText(siteName || '')).not.toBeVisible()
    })
  })

  test.describe('Tracking Snippet', () => {
    test('should open snippet modal', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Snippet")').click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/tracking snippet/i)).toBeVisible()
    })

    test('should display tracking code', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Snippet")').click()

      const codeBlock = page.locator('[data-testid="code-snippet"]')
      await expect(codeBlock).toBeVisible()
      await expect(codeBlock).toContainText('<script')
    })

    test('should copy snippet to clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Snippet")').click()

      await page.click('button:has-text("Copy")')

      await expect(page.getByText(/copied/i)).toBeVisible()

      // Verify clipboard content
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboardText).toContain('<script')
    })

    test('should show installation instructions', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Snippet")').click()

      await page.click('button:has-text("Show Instructions")')

      await expect(page.getByText(/installation instructions/i)).toBeVisible()
    })

    test('should switch between framework tabs', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("Snippet")').click()

      await page.click('button[role="tab"]:has-text("React")')

      await expect(page.getByText(/useEffect/i)).toBeVisible()
    })
  })

  test.describe('View Analytics', () => {
    test('should navigate to analytics page', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      await firstCard.locator('button:has-text("View Analytics")').click()

      await expect(page).toHaveURL(/\/analytics\//)
    })

    test('should show site name in analytics page', async ({ page }) => {
      await page.goto('/dashboard')

      const firstCard = page.locator('[data-testid="site-card"]').first()
      const siteName = await firstCard.locator('h3').textContent()

      await firstCard.locator('button:has-text("View Analytics")').click()

      await expect(page.getByText(siteName || '')).toBeVisible()
    })
  })

  test.describe('Search and Filter', () => {
    test('should search sites by name', async ({ page }) => {
      await page.goto('/dashboard')

      await page.fill('input[placeholder*="Search"]', 'Test Site')

      await page.waitForTimeout(500) // Debounce

      const cards = page.locator('[data-testid="site-card"]')
      const count = await cards.count()

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i)
        const text = await card.textContent()
        expect(text?.toLowerCase()).toContain('test site')
      }
    })

    test('should filter by active status', async ({ page }) => {
      await page.goto('/dashboard')

      await page.click('button:has-text("Active Only")')

      const cards = page.locator('[data-testid="site-card"]')
      const count = await cards.count()

      // Verify no inactive badges
      const inactiveBadges = page.locator('text=/inactive/i')
      await expect(inactiveBadges).toHaveCount(0)
    })
  })

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/dashboard')

      const cards = page.locator('[data-testid="site-card"]')
      await expect(cards.first()).toBeVisible()

      // Verify mobile layout
      const grid = page.locator('[data-testid="site-list-grid"]')
      const gridColumns = await grid.evaluate(el =>
        window.getComputedStyle(el).gridTemplateColumns
      )

      // Should be single column on mobile
      expect(gridColumns).not.toContain('repeat')
    })

    test('should display correctly on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.goto('/dashboard')

      const cards = page.locator('[data-testid="site-card"]')
      await expect(cards.first()).toBeVisible()
    })
  })
})
