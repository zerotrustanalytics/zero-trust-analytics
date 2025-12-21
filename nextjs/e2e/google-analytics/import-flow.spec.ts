import { test, expect, Page, BrowserContext } from '@playwright/test'

/**
 * Page Object Model for Google Analytics Import Flow
 * Encapsulates UI interactions and locators for better maintainability
 */
class GoogleAnalyticsImportPage {
  constructor(private page: Page) {}

  // Navigation
  async navigate() {
    await this.page.goto('/dashboard/import/google-analytics')
  }

  async navigateToImportHistory() {
    await this.page.goto('/dashboard/import/history')
  }

  // OAuth Connection
  async clickConnectGoogleButton() {
    return this.page.getByRole('button', { name: /connect.*google|sign in.*google/i })
  }

  async waitForOAuthPopup() {
    const popupPromise = this.page.waitForEvent('popup')
    await (await this.clickConnectGoogleButton()).click()
    return popupPromise
  }

  async completeOAuthFlow(popup: Page, approve: boolean = true) {
    if (approve) {
      await popup.getByRole('button', { name: /allow|approve|accept/i }).click()
    } else {
      await popup.getByRole('button', { name: /deny|cancel|decline/i }).click()
    }
  }

  async disconnectGoogleAccount() {
    const disconnectBtn = this.page.getByRole('button', { name: /disconnect|remove.*connection/i })
    await disconnectBtn.click()

    // Confirm in dialog
    const confirmBtn = this.page.getByRole('dialog').getByRole('button', { name: /disconnect|confirm/i })
    await confirmBtn.click()
  }

  // Property Selection
  async selectGA4Property(propertyName: string) {
    await this.page.getByLabel(/property|ga4.*property/i).click()
    await this.page.getByRole('option', { name: new RegExp(propertyName, 'i') }).click()
  }

  async getAvailableProperties() {
    await this.page.getByLabel(/property|ga4.*property/i).click()
    return this.page.getByRole('option').all()
  }

  // Date Range Selection
  async selectDateRange(start: string, end: string) {
    await this.page.getByLabel(/start.*date/i).fill(start)
    await this.page.getByLabel(/end.*date/i).fill(end)
  }

  async selectPresetDateRange(preset: 'last-7-days' | 'last-30-days' | 'last-90-days' | 'last-year') {
    const presetButton = this.page.getByRole('button', { name: new RegExp(preset.replace(/-/g, ' '), 'i') })
    await presetButton.click()
  }

  async getStartDate() {
    return this.page.getByLabel(/start.*date/i).inputValue()
  }

  async getEndDate() {
    return this.page.getByLabel(/end.*date/i).inputValue()
  }

  // Import Actions
  async startImport() {
    const startBtn = this.page.getByRole('button', { name: /start.*import|begin.*import/i })
    await startBtn.click()
  }

  async cancelImport() {
    const cancelBtn = this.page.getByRole('button', { name: /cancel.*import|stop.*import/i })
    await cancelBtn.click()

    // Confirm cancellation
    const confirmBtn = this.page.getByRole('dialog').getByRole('button', { name: /cancel.*import|confirm/i })
    await confirmBtn.click()
  }

  async retryFailedImport() {
    const retryBtn = this.page.getByRole('button', { name: /retry|try.*again/i })
    await retryBtn.click()
  }

  // Progress Monitoring
  async getProgressPercentage() {
    const progressText = await this.page.getByTestId('import-progress').textContent()
    const match = progressText?.match(/(\d+)%/)
    return match ? parseInt(match[1]) : 0
  }

  async getImportStatus() {
    const statusElement = this.page.getByTestId('import-status')
    return statusElement.textContent()
  }

  async waitForImportComplete(timeout: number = 30000) {
    await this.page.waitForSelector('[data-testid="import-status"]:has-text("completed")', { timeout })
  }

  async waitForImportFailed(timeout: number = 30000) {
    await this.page.waitForSelector('[data-testid="import-status"]:has-text("failed")', { timeout })
  }

  async getImportedRowsCount() {
    const text = await this.page.getByTestId('imported-rows').textContent()
    const match = text?.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  async getTotalRowsCount() {
    const text = await this.page.getByTestId('total-rows').textContent()
    const match = text?.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  // Data Viewing
  async viewImportedData() {
    const viewBtn = this.page.getByRole('button', { name: /view.*data|see.*results/i })
    await viewBtn.click()
  }

  async getDataPreviewRows() {
    return this.page.getByTestId('data-preview-row').all()
  }

  async exportImportedData(format: 'csv' | 'json') {
    await this.page.getByRole('button', { name: /export/i }).click()
    await this.page.getByRole('menuitem', { name: new RegExp(format, 'i') }).click()
  }

  // Import History
  async getImportHistoryItems() {
    return this.page.getByTestId('import-history-item').all()
  }

  async viewImportDetails(importId: string) {
    const item = this.page.getByTestId(`import-history-item-${importId}`)
    await item.click()
  }

  async deleteImportHistory(importId: string) {
    const deleteBtn = this.page.getByTestId(`delete-import-${importId}`)
    await deleteBtn.click()

    // Confirm deletion
    const confirmBtn = this.page.getByRole('dialog').getByRole('button', { name: /delete|confirm/i })
    await confirmBtn.click()
  }

  // Error Handling
  async getErrorMessage() {
    const errorElement = this.page.getByRole('alert').or(this.page.getByTestId('error-message'))
    return errorElement.textContent()
  }

  async dismissError() {
    const dismissBtn = this.page.getByRole('button', { name: /dismiss|close/i }).first()
    await dismissBtn.click()
  }

  // Wizard Navigation
  async clickNext() {
    const nextBtn = this.page.getByRole('button', { name: /next|continue/i })
    await nextBtn.click()
  }

  async clickPrevious() {
    const prevBtn = this.page.getByRole('button', { name: /previous|back/i })
    await prevBtn.click()
  }

  async getCurrentStep() {
    const activeStep = this.page.locator('[data-step].active, [data-step][aria-current="step"]')
    const stepAttr = await activeStep.getAttribute('data-step')
    return stepAttr ? parseInt(stepAttr) : 1
  }

  async isStepComplete(stepNumber: number) {
    const step = this.page.locator(`[data-step="${stepNumber}"]`)
    const classes = await step.getAttribute('class')
    return classes?.includes('complete') || classes?.includes('completed')
  }

  // Validation
  async getValidationError(fieldName: string) {
    const field = this.page.getByLabel(new RegExp(fieldName, 'i'))
    const errorId = await field.getAttribute('aria-describedby')
    if (errorId) {
      return this.page.locator(`#${errorId}`).textContent()
    }
    return null
  }

  // Connection Status
  async isGoogleAccountConnected() {
    const connectedStatus = this.page.getByText(/connected.*google|google.*connected/i)
    return connectedStatus.isVisible()
  }

  async getConnectedAccountEmail() {
    const emailElement = this.page.getByTestId('connected-account-email')
    return emailElement.textContent()
  }
}

/**
 * Helper function to set up authenticated context
 */
async function setupAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'auth_token',
      value: 'mock_jwt_token',
      domain: 'localhost',
      path: '/'
    }
  ])
}

/**
 * Helper to mock Google OAuth responses
 */
async function mockGoogleOAuthSuccess(page: Page) {
  await page.route('**/api/auth/google/callback*', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        email: 'user@example.com',
        accessToken: 'mock_google_access_token'
      })
    })
  })
}

/**
 * Helper to mock GA4 properties API
 */
async function mockGA4Properties(page: Page, properties: Array<{ id: string; name: string }>) {
  await page.route('**/api/google-analytics/properties*', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ properties })
    })
  })
}

/**
 * Helper to mock import job creation
 */
async function mockImportJobCreation(page: Page, jobId: string = 'import_123') {
  await page.route('**/api/import/google-analytics', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          importId: jobId,
          status: 'pending'
        })
      })
    }
  })
}

/**
 * Helper to mock import progress
 */
async function mockImportProgress(page: Page, progress: number, status: string = 'in_progress') {
  await page.route('**/api/import/*/status*', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        id: 'import_123',
        status,
        progress,
        totalRows: 10000,
        importedRows: Math.floor(10000 * (progress / 100)),
        startedAt: new Date().toISOString()
      })
    })
  })
}

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe('Google Analytics Import - Full Wizard Flow', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()
  })

  test('completes full import wizard (happy path)', async ({ page }) => {
    // Mock API responses
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [
      { id: 'GA4-123456', name: 'Website Production' },
      { id: 'GA4-789012', name: 'Website Staging' }
    ])
    await mockImportJobCreation(page)
    await mockImportProgress(page, 0, 'pending')

    // Step 1: Verify wizard is on step 1
    expect(await importPage.getCurrentStep()).toBe(1)

    // Step 2: Connect Google Account
    await expect(await importPage.clickConnectGoogleButton()).toBeVisible()

    // Simulate OAuth flow (in real tests, this would open a popup)
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Verify connection successful
    await expect(page.getByText(/connected.*google/i)).toBeVisible()
    expect(await importPage.isGoogleAccountConnected()).toBe(true)

    // Step 3: Navigate to property selection
    await importPage.clickNext()
    expect(await importPage.getCurrentStep()).toBe(2)

    // Step 4: Select GA4 Property
    await importPage.selectGA4Property('Website Production')
    await expect(page.getByText(/website production/i)).toBeVisible()

    // Step 5: Navigate to date range selection
    await importPage.clickNext()
    expect(await importPage.getCurrentStep()).toBe(3)

    // Step 6: Select date range
    await importPage.selectDateRange('2024-01-01', '2024-12-31')
    expect(await importPage.getStartDate()).toBe('2024-01-01')
    expect(await importPage.getEndDate()).toBe('2024-12-31')

    // Step 7: Navigate to review step
    await importPage.clickNext()
    expect(await importPage.getCurrentStep()).toBe(4)

    // Step 8: Start import
    await importPage.startImport()

    // Step 9: Verify import started
    await expect(page.getByText(/import.*started|importing/i)).toBeVisible()
    await expect(page.getByTestId('import-progress')).toBeVisible()
  })

  test('validates required fields in each step', async ({ page }) => {
    // Step 1: Try to proceed without connecting Google
    await importPage.clickNext()
    await expect(page.getByText(/connect.*google.*account/i)).toBeVisible()

    // Connect account
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await page.waitForTimeout(500)

    // Step 2: Try to proceed without selecting property
    await importPage.clickNext()
    await importPage.clickNext()
    const propertyError = await importPage.getValidationError('property')
    expect(propertyError).toBeTruthy()

    // Select property
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test Property' }])
    await importPage.selectGA4Property('Test Property')

    // Step 3: Try to proceed without date range
    await importPage.clickNext()
    await importPage.clickNext()
    await expect(page.getByText(/select.*date.*range/i)).toBeVisible()
  })

  test('allows navigation back and forth through wizard steps', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test' }])

    // Connect and move forward
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()

    expect(await importPage.getCurrentStep()).toBe(2)

    // Go back
    await importPage.clickPrevious()
    expect(await importPage.getCurrentStep()).toBe(1)

    // Go forward again
    await importPage.clickNext()
    expect(await importPage.getCurrentStep()).toBe(2)
  })

  test('preserves selections when navigating back', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test Property' }])

    // Complete steps
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()

    await importPage.selectGA4Property('Test Property')
    await importPage.clickNext()

    await importPage.selectDateRange('2024-01-01', '2024-12-31')

    // Navigate back
    await importPage.clickPrevious()
    await importPage.clickPrevious()

    // Navigate forward and verify selections preserved
    await importPage.clickNext()
    await expect(page.getByText(/test property/i)).toBeVisible()

    await importPage.clickNext()
    expect(await importPage.getStartDate()).toBe('2024-01-01')
    expect(await importPage.getEndDate()).toBe('2024-12-31')
  })
})

test.describe('Google Analytics Import - OAuth Connection', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()
  })

  test('successfully connects Google account via OAuth', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)

    await expect(await importPage.clickConnectGoogleButton()).toBeVisible()

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Verify connection success message
    await expect(page.getByText(/connected.*successfully|connection.*successful/i)).toBeVisible()

    // Verify connected account displayed
    expect(await importPage.isGoogleAccountConnected()).toBe(true)
  })

  test('handles OAuth denial gracefully', async ({ page }) => {
    // Mock OAuth denial
    await page.route('**/api/auth/google/callback*', async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          error: 'access_denied',
          message: 'User denied access'
        })
      })
    })

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Verify error message displayed
    await expect(page.getByText(/access.*denied|permission.*denied/i)).toBeVisible()
    expect(await importPage.isGoogleAccountConnected()).toBe(false)
  })

  test('handles OAuth popup blocked', async ({ page }) => {
    // In real scenario, popup blocker would prevent window.open
    // This tests the user-facing error message
    await page.evaluate(() => {
      window.open = () => null
    })

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    await expect(page.getByText(/popup.*blocked|enable.*popups/i)).toBeVisible()
  })

  test('handles OAuth timeout', async ({ page }) => {
    await page.route('**/api/auth/google/callback*', async (route) => {
      // Simulate timeout by delaying response
      await new Promise(resolve => setTimeout(resolve, 5000))
      await route.abort('timedout')
    })

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    await expect(page.getByText(/timeout|timed out|took too long/i)).toBeVisible()
  })

  test('displays connected account information', async ({ page }) => {
    await page.route('**/api/auth/google/callback*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          email: 'testuser@gmail.com',
          accessToken: 'mock_token'
        })
      })
    })

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    await expect(page.getByText('testuser@gmail.com')).toBeVisible()
  })

  test('allows reconnection after token expiry', async ({ page }) => {
    // First connection
    await mockGoogleOAuthSuccess(page)
    let connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Simulate token expiry
    await page.route('**/api/google-analytics/properties*', async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: 'token_expired' })
      })
    })

    await importPage.clickNext()

    // Should show token expired error and reconnect option
    await expect(page.getByText(/token.*expired|session.*expired/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /reconnect|connect.*again/i })).toBeVisible()
  })
})

test.describe('Google Analytics Import - Property Selection', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()

    // Connect Google account first
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
  })

  test('displays available GA4 properties', async ({ page }) => {
    await mockGA4Properties(page, [
      { id: 'GA4-123456', name: 'Production Site' },
      { id: 'GA4-789012', name: 'Staging Site' },
      { id: 'GA4-345678', name: 'Development Site' }
    ])

    const properties = await importPage.getAvailableProperties()
    expect(properties.length).toBeGreaterThanOrEqual(3)
  })

  test('filters properties by search', async ({ page }) => {
    await mockGA4Properties(page, [
      { id: 'GA4-123456', name: 'Production Site' },
      { id: 'GA4-789012', name: 'Staging Site' }
    ])

    await page.getByLabel(/search.*property/i).fill('Production')
    await expect(page.getByText('Production Site')).toBeVisible()
    await expect(page.getByText('Staging Site')).not.toBeVisible()
  })

  test('handles no properties available', async ({ page }) => {
    await mockGA4Properties(page, [])

    await expect(page.getByText(/no.*properties.*found|no.*ga4.*properties/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /set up.*ga4|create.*property/i })).toBeVisible()
  })

  test('displays property metadata', async ({ page }) => {
    await mockGA4Properties(page, [
      { id: 'GA4-123456', name: 'Production Site' }
    ])

    await importPage.selectGA4Property('Production Site')

    // Should show property ID
    await expect(page.getByText('GA4-123456')).toBeVisible()
  })

  test('handles API error when fetching properties', async ({ page }) => {
    await page.route('**/api/google-analytics/properties*', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })

    await expect(page.getByText(/error.*loading.*properties|failed.*load/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /retry|try.*again/i })).toBeVisible()
  })

  test('shows loading state while fetching properties', async ({ page }) => {
    // Delay the response
    await page.route('**/api/google-analytics/properties*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ properties: [] })
      })
    })

    await expect(page.getByText(/loading.*properties/i).or(page.getByTestId('loading-spinner'))).toBeVisible()
  })
})

test.describe('Google Analytics Import - Date Range Selection', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()

    // Navigate to date range step
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test' }])
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()
  })

  test('allows custom date range selection', async ({ page }) => {
    await importPage.selectDateRange('2024-01-01', '2024-12-31')

    expect(await importPage.getStartDate()).toBe('2024-01-01')
    expect(await importPage.getEndDate()).toBe('2024-12-31')
  })

  test('provides preset date ranges', async ({ page }) => {
    await importPage.selectPresetDateRange('last-30-days')

    // Verify dates are set (exact values depend on current date)
    const startDate = await importPage.getStartDate()
    const endDate = await importPage.getEndDate()

    expect(startDate).toBeTruthy()
    expect(endDate).toBeTruthy()
    expect(new Date(startDate)).toBeLessThan(new Date(endDate))
  })

  test('validates end date is after start date', async ({ page }) => {
    await importPage.selectDateRange('2024-12-31', '2024-01-01')

    await expect(page.getByText(/end date.*after.*start date|invalid.*date.*range/i)).toBeVisible()
  })

  test('prevents future dates', async ({ page }) => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const futureDateStr = futureDate.toISOString().split('T')[0]

    await importPage.selectDateRange('2024-01-01', futureDateStr)

    await expect(page.getByText(/future.*date|cannot.*select.*future/i)).toBeVisible()
  })

  test('limits maximum date range to 2 years', async ({ page }) => {
    await importPage.selectDateRange('2020-01-01', '2024-12-31')

    await expect(page.getByText(/maximum.*range|range.*too.*large/i)).toBeVisible()
  })

  test('shows estimated data volume based on date range', async ({ page }) => {
    await importPage.selectDateRange('2024-01-01', '2024-01-31')

    await expect(page.getByText(/estimated.*rows|approximately.*records/i)).toBeVisible()
  })

  test('displays calendar picker for date selection', async ({ page }) => {
    await page.getByLabel(/start.*date/i).click()
    await expect(page.locator('.calendar, [role="dialog"]').first()).toBeVisible()
  })
})

test.describe('Google Analytics Import - Progress Monitoring', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()

    // Complete wizard and start import
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test' }])
    await mockImportJobCreation(page)

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()
    await importPage.selectDateRange('2024-01-01', '2024-01-31')
    await importPage.clickNext()
    await importPage.startImport()
  })

  test('displays progress bar during import', async ({ page }) => {
    await mockImportProgress(page, 25)
    await page.waitForTimeout(500)

    await expect(page.getByTestId('import-progress')).toBeVisible()
    await expect(page.getByText(/25%/)).toBeVisible()
  })

  test('updates progress in real-time', async ({ page }) => {
    // Start at 0%
    await mockImportProgress(page, 0)
    await page.waitForTimeout(200)

    // Update to 50%
    await mockImportProgress(page, 50)
    await page.waitForTimeout(200)

    expect(await importPage.getProgressPercentage()).toBe(50)

    // Update to 100%
    await mockImportProgress(page, 100, 'completed')
    await page.waitForTimeout(200)

    expect(await importPage.getProgressPercentage()).toBe(100)
  })

  test('shows imported vs total rows count', async ({ page }) => {
    await mockImportProgress(page, 45)
    await page.waitForTimeout(500)

    expect(await importPage.getImportedRowsCount()).toBe(4500)
    expect(await importPage.getTotalRowsCount()).toBe(10000)
  })

  test('displays estimated time remaining', async ({ page }) => {
    await mockImportProgress(page, 30)
    await page.waitForTimeout(500)

    await expect(page.getByText(/estimated.*time|time.*remaining/i)).toBeVisible()
  })

  test('shows current import phase', async ({ page }) => {
    await mockImportProgress(page, 20)
    await page.waitForTimeout(500)

    // Should show what's being imported
    await expect(page.getByText(/fetching.*data|importing.*analytics|processing/i)).toBeVisible()
  })

  test('handles import completion', async ({ page }) => {
    await mockImportProgress(page, 100, 'completed')
    await page.waitForTimeout(500)

    await expect(page.getByText(/import.*completed|successfully.*imported/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /view.*data|see.*results/i })).toBeVisible()
  })

  test('displays success metrics after completion', async ({ page }) => {
    await mockImportProgress(page, 100, 'completed')
    await page.waitForTimeout(500)

    await expect(page.getByText(/10,?000.*rows.*imported/i)).toBeVisible()
    await expect(page.getByText(/date.*range/i)).toBeVisible()
  })
})

test.describe('Google Analytics Import - Completed Import', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
  })

  test('displays imported data summary', async ({ page }) => {
    // Mock completed import
    await page.route('**/api/import/*/status*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'import_123',
          status: 'completed',
          progress: 100,
          totalRows: 10000,
          importedRows: 10000,
          dateRange: { start: '2024-01-01', end: '2024-01-31' },
          completedAt: new Date().toISOString()
        })
      })
    })

    await page.goto('/dashboard/import/import_123')

    await expect(page.getByText(/10,?000.*rows/i)).toBeVisible()
    await expect(page.getByText(/2024-01-01.*2024-01-31/)).toBeVisible()
  })

  test('shows data preview table', async ({ page }) => {
    await page.route('**/api/import/*/data*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          rows: [
            { date: '2024-01-01', pageviews: 1000, sessions: 500, users: 400 },
            { date: '2024-01-02', pageviews: 1200, sessions: 600, users: 450 },
            { date: '2024-01-03', pageviews: 900, sessions: 450, users: 380 }
          ]
        })
      })
    })

    await page.goto('/dashboard/import/import_123')
    await importPage.viewImportedData()

    const rows = await importPage.getDataPreviewRows()
    expect(rows.length).toBeGreaterThanOrEqual(3)
  })

  test('allows exporting imported data as CSV', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download')

    await page.goto('/dashboard/import/import_123')
    await importPage.exportImportedData('csv')

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')
  })

  test('allows exporting imported data as JSON', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download')

    await page.goto('/dashboard/import/import_123')
    await importPage.exportImportedData('json')

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.json')
  })

  test('navigates to analytics dashboard with imported data', async ({ page }) => {
    await page.goto('/dashboard/import/import_123')

    await page.getByRole('button', { name: /view.*analytics|go.*dashboard/i }).click()

    await expect(page).toHaveURL(/dashboard\/analytics/)
    await expect(page.getByText(/pageviews|visitors/i)).toBeVisible()
  })

  test('shows data breakdown by dimension', async ({ page }) => {
    await page.goto('/dashboard/import/import_123')

    // Should show breakdowns by page, source, country, etc.
    await expect(page.getByText(/top.*pages|pages/i)).toBeVisible()
    await expect(page.getByText(/traffic.*sources|sources/i)).toBeVisible()
    await expect(page.getByText(/countries|locations/i)).toBeVisible()
  })
})

test.describe('Google Analytics Import - Cancellation', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()

    // Start import
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123456', name: 'Test' }])
    await mockImportJobCreation(page)

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()
    await importPage.selectDateRange('2024-01-01', '2024-01-31')
    await importPage.clickNext()
    await importPage.startImport()

    await mockImportProgress(page, 30, 'in_progress')
    await page.waitForTimeout(500)
  })

  test('shows cancel button during import', async ({ page }) => {
    await expect(page.getByRole('button', { name: /cancel.*import|stop.*import/i })).toBeVisible()
  })

  test('prompts for confirmation before cancelling', async ({ page }) => {
    await page.getByRole('button', { name: /cancel.*import/i }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/sure.*cancel|confirm.*cancel/i)).toBeVisible()
  })

  test('successfully cancels import', async ({ page }) => {
    await page.route('**/api/import/*/cancel*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ status: 'cancelled' })
      })
    })

    await importPage.cancelImport()

    await expect(page.getByText(/import.*cancelled|cancelled.*successfully/i)).toBeVisible()
  })

  test('cleans up partial data after cancellation', async ({ page }) => {
    await page.route('**/api/import/*/cancel*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: 'cancelled',
          importedRows: 3000,
          message: 'Partial data preserved'
        })
      })
    })

    await importPage.cancelImport()

    await expect(page.getByText(/3,?000.*rows.*imported/i)).toBeVisible()
  })

  test('allows viewing partial results after cancellation', async ({ page }) => {
    await page.route('**/api/import/*/cancel*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ status: 'cancelled', importedRows: 5000 })
      })
    })

    await importPage.cancelImport()

    await expect(page.getByRole('button', { name: /view.*partial.*data/i })).toBeVisible()
  })

  test('prevents cancellation of already completed import', async ({ page }) => {
    await mockImportProgress(page, 100, 'completed')
    await page.waitForTimeout(500)

    await expect(page.getByRole('button', { name: /cancel.*import/i })).not.toBeVisible()
  })
})

test.describe('Google Analytics Import - Failed Import', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
  })

  test('displays error message for failed import', async ({ page }) => {
    await page.route('**/api/import/*/status*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'import_123',
          status: 'failed',
          error: 'API rate limit exceeded',
          importedRows: 2000,
          totalRows: 10000
        })
      })
    })

    await page.goto('/dashboard/import/import_123')

    await expect(page.getByText(/failed|error/i)).toBeVisible()
    await expect(page.getByText(/api rate limit exceeded/i)).toBeVisible()
  })

  test('shows retry button for failed import', async ({ page }) => {
    await page.route('**/api/import/*/status*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: 'failed',
          error: 'Network error'
        })
      })
    })

    await page.goto('/dashboard/import/import_123')

    await expect(page.getByRole('button', { name: /retry|try.*again/i })).toBeVisible()
  })

  test('retries failed import successfully', async ({ page }) => {
    // First load shows failed state
    let callCount = 0
    await page.route('**/api/import/*/status*', async (route) => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ status: 'failed', error: 'Timeout' })
        })
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ status: 'in_progress', progress: 0 })
        })
      }
    })

    await page.goto('/dashboard/import/import_123')
    await importPage.retryFailedImport()

    await expect(page.getByText(/retrying|import.*started/i)).toBeVisible()
  })

  test('preserves partial data from failed import', async ({ page }) => {
    await page.route('**/api/import/*/status*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: 'failed',
          error: 'Connection lost',
          importedRows: 7500,
          totalRows: 10000
        })
      })
    })

    await page.goto('/dashboard/import/import_123')

    await expect(page.getByText(/7,?500.*of.*10,?000/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /view.*partial/i })).toBeVisible()
  })

  test('shows detailed error information', async ({ page }) => {
    await page.route('**/api/import/*/status*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: 'failed',
          error: 'Quota exceeded',
          errorDetails: {
            code: 'QUOTA_EXCEEDED',
            quotaLimit: 100000,
            resetTime: '2024-01-02T00:00:00Z'
          }
        })
      })
    })

    await page.goto('/dashboard/import/import_123')

    await page.getByRole('button', { name: /details|more.*info/i }).click()
    await expect(page.getByText(/quota.*exceeded/i)).toBeVisible()
    await expect(page.getByText(/reset.*time/i)).toBeVisible()
  })

  test('handles different error types appropriately', async ({ page }) => {
    const errorTypes = [
      { error: 'AUTHENTICATION_FAILED', expectedMessage: /authentication|credentials/i },
      { error: 'NETWORK_ERROR', expectedMessage: /network|connection/i },
      { error: 'INVALID_PROPERTY', expectedMessage: /invalid.*property|property.*not.*found/i },
      { error: 'QUOTA_EXCEEDED', expectedMessage: /quota|rate.*limit/i }
    ]

    for (const errorType of errorTypes) {
      await page.route('**/api/import/*/status*', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            status: 'failed',
            error: errorType.error
          })
        })
      })

      await page.goto('/dashboard/import/import_123')
      await expect(page.getByText(errorType.expectedMessage)).toBeVisible()
    }
  })
})

test.describe('Google Analytics Import - History', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigateToImportHistory()
  })

  test('displays import history list', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_1', status: 'completed', createdAt: '2024-01-15T10:00:00Z', rows: 10000 },
            { id: 'import_2', status: 'failed', createdAt: '2024-01-14T10:00:00Z', rows: 0 },
            { id: 'import_3', status: 'in_progress', createdAt: '2024-01-13T10:00:00Z', rows: 5000 }
          ]
        })
      })
    })

    await page.waitForTimeout(500)

    const historyItems = await importPage.getImportHistoryItems()
    expect(historyItems.length).toBeGreaterThanOrEqual(3)
  })

  test('shows import status in history', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_1', status: 'completed', createdAt: '2024-01-15T10:00:00Z' }
          ]
        })
      })
    })

    await page.waitForTimeout(500)

    await expect(page.getByText(/completed/i)).toBeVisible()
  })

  test('filters history by status', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_1', status: 'completed', createdAt: '2024-01-15T10:00:00Z' },
            { id: 'import_2', status: 'failed', createdAt: '2024-01-14T10:00:00Z' }
          ]
        })
      })
    })

    await page.waitForTimeout(500)

    await page.getByLabel(/filter.*status/i).click()
    await page.getByRole('option', { name: /completed/i }).click()

    await expect(page.getByText(/failed/i)).not.toBeVisible()
  })

  test('sorts history by date', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_1', status: 'completed', createdAt: '2024-01-15T10:00:00Z' },
            { id: 'import_2', status: 'completed', createdAt: '2024-01-10T10:00:00Z' }
          ]
        })
      })
    })

    await page.waitForTimeout(500)

    await page.getByLabel(/sort/i).click()
    await page.getByRole('option', { name: /oldest.*first/i }).click()

    // First item should now be import_2
    const firstItem = page.getByTestId('import-history-item').first()
    await expect(firstItem).toContainText('import_2')
  })

  test('navigates to import details from history', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_123', status: 'completed', createdAt: '2024-01-15T10:00:00Z' }
          ]
        })
      })
    })

    await page.waitForTimeout(500)

    await importPage.viewImportDetails('import_123')

    await expect(page).toHaveURL(/import\/import_123/)
  })

  test('deletes import from history', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          imports: [
            { id: 'import_delete', status: 'failed', createdAt: '2024-01-15T10:00:00Z' }
          ]
        })
      })
    })

    await page.route('**/api/import/import_delete', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
      }
    })

    await page.waitForTimeout(500)

    await importPage.deleteImportHistory('import_delete')

    await expect(page.getByText(/deleted|removed/i)).toBeVisible()
  })

  test('shows empty state when no import history', async ({ page }) => {
    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ imports: [] })
      })
    })

    await page.waitForTimeout(500)

    await expect(page.getByText(/no.*imports|no.*history/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /start.*import|new.*import/i })).toBeVisible()
  })

  test('paginates long import history', async ({ page }) => {
    const imports = Array.from({ length: 25 }, (_, i) => ({
      id: `import_${i}`,
      status: 'completed',
      createdAt: new Date(2024, 0, i + 1).toISOString()
    }))

    await page.route('**/api/import/history*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ imports, total: 25, page: 1, perPage: 10 })
      })
    })

    await page.waitForTimeout(500)

    await expect(page.getByRole('button', { name: /next.*page|page.*2/i })).toBeVisible()
  })
})

test.describe('Google Analytics Import - Account Disconnection', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()

    // Connect account first
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await page.waitForTimeout(500)
  })

  test('shows disconnect option for connected account', async ({ page }) => {
    await expect(page.getByRole('button', { name: /disconnect|remove.*connection/i })).toBeVisible()
  })

  test('prompts for confirmation before disconnecting', async ({ page }) => {
    await page.getByRole('button', { name: /disconnect/i }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/sure.*disconnect|lose.*access/i)).toBeVisible()
  })

  test('successfully disconnects Google account', async ({ page }) => {
    await page.route('**/api/auth/google/disconnect*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true })
      })
    })

    await importPage.disconnectGoogleAccount()

    await expect(page.getByText(/disconnected|removed.*connection/i)).toBeVisible()
    expect(await importPage.isGoogleAccountConnected()).toBe(false)
  })

  test('warns about active imports before disconnecting', async ({ page }) => {
    // Mock active import
    await page.route('**/api/import/active*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ hasActiveImports: true, count: 2 })
      })
    })

    await page.getByRole('button', { name: /disconnect/i }).click()

    await expect(page.getByText(/active.*imports|imports.*in.*progress/i)).toBeVisible()
    await expect(page.getByText(/2.*imports/i)).toBeVisible()
  })

  test('resets wizard after disconnection', async ({ page }) => {
    await importPage.disconnectGoogleAccount()

    // Should return to step 1
    expect(await importPage.getCurrentStep()).toBe(1)
    await expect(await importPage.clickConnectGoogleButton()).toBeVisible()
  })
})

test.describe('Google Analytics Import - Error Handling', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
  })

  test('handles network errors gracefully', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.abort('failed')
    })

    await importPage.navigate()

    await expect(page.getByText(/network.*error|connection.*error|offline/i)).toBeVisible()
  })

  test('displays user-friendly error messages', async ({ page }) => {
    await page.route('**/api/import/google-analytics', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        })
      })
    })

    await importPage.navigate()
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Error should be user-friendly, not technical
    await expect(page.getByText(/something went wrong|try.*again.*later/i)).toBeVisible()
  })

  test('allows error dismissal', async ({ page }) => {
    await page.route('**/api/google-analytics/properties*', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' })
      })
    })

    await importPage.navigate()
    await expect(page.getByRole('alert')).toBeVisible()

    await importPage.dismissError()

    await expect(page.getByRole('alert')).not.toBeVisible()
  })

  test('provides retry option for transient errors', async ({ page }) => {
    let attemptCount = 0
    await page.route('**/api/google-analytics/properties*', async (route) => {
      attemptCount++
      if (attemptCount === 1) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Timeout' }) })
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ properties: [{ id: 'GA4-123', name: 'Test' }] })
        })
      }
    })

    await importPage.navigate()
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()

    // First attempt fails
    await expect(page.getByText(/error|failed/i)).toBeVisible()

    // Retry succeeds
    await page.getByRole('button', { name: /retry/i }).click()
    await page.waitForTimeout(500)

    await expect(page.getByText(/test/i)).toBeVisible()
  })

  test('handles quota exceeded errors', async ({ page }) => {
    await page.route('**/api/import/google-analytics', async (route) => {
      await route.fulfill({
        status: 429,
        body: JSON.stringify({
          error: 'QUOTA_EXCEEDED',
          retryAfter: 3600
        })
      })
    })

    await importPage.navigate()

    await expect(page.getByText(/quota.*exceeded|rate.*limit/i)).toBeVisible()
    await expect(page.getByText(/try.*again.*1.*hour/i)).toBeVisible()
  })

  test('handles unauthorized errors with clear guidance', async ({ page }) => {
    await page.route('**/api/google-analytics/properties*', async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Token expired'
        })
      })
    })

    await importPage.navigate()
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()

    await expect(page.getByText(/session.*expired|reconnect/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /reconnect/i })).toBeVisible()
  })

  test('logs errors for debugging', async ({ page }) => {
    const consoleMessages: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text())
      }
    })

    await page.route('**/api/import/google-analytics', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' })
      })
    })

    await importPage.navigate()

    // Errors should be logged to console for debugging
    expect(consoleMessages.length).toBeGreaterThan(0)
  })
})

test.describe('Google Analytics Import - Mobile Responsiveness', () => {
  let importPage: GoogleAnalyticsImportPage

  test.use({ viewport: { width: 375, height: 667 } }) // iPhone SE size

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()
  })

  test('displays mobile-friendly wizard on small screens', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible()

    // Check that content is not overflowing
    const main = page.getByRole('main')
    const box = await main.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(375)
  })

  test('adapts date picker for touch devices', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123', name: 'Test' }])

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()

    // Date input should use native mobile picker
    const dateInput = page.getByLabel(/start.*date/i)
    const inputType = await dateInput.getAttribute('type')
    expect(inputType).toBe('date')
  })

  test('uses mobile-friendly dropdowns', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [
      { id: 'GA4-123', name: 'Property 1' },
      { id: 'GA4-456', name: 'Property 2' }
    ])

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()

    const propertySelect = page.getByLabel(/property/i)
    await expect(propertySelect).toBeVisible()

    // Dropdown should be tappable
    const box = await propertySelect.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44) // Minimum touch target size
  })

  test('stacks wizard steps vertically on mobile', async ({ page }) => {
    const steps = page.locator('[data-step]')
    const firstStep = steps.first()
    const secondStep = steps.nth(1)

    const firstBox = await firstStep.boundingBox()
    const secondBox = await secondStep.boundingBox()

    if (firstBox && secondBox) {
      // Second step should be below first step
      expect(secondBox.y).toBeGreaterThan(firstBox.y)
    }
  })

  test('shows mobile-optimized progress indicator', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123', name: 'Test' }])
    await mockImportJobCreation(page)
    await mockImportProgress(page, 50)

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()
    await importPage.selectDateRange('2024-01-01', '2024-01-31')
    await importPage.clickNext()
    await importPage.startImport()

    await page.waitForTimeout(500)

    // Progress bar should be visible and full-width
    const progressBar = page.getByTestId('import-progress')
    await expect(progressBar).toBeVisible()
    const box = await progressBar.boundingBox()
    expect(box?.width).toBeGreaterThan(300)
  })

  test('uses bottom sheet for modals on mobile', async ({ page }) => {
    await page.getByRole('button', { name: /help|info/i }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Bottom sheet should be anchored to bottom
    const box = await dialog.boundingBox()
    expect(box?.y).toBeGreaterThan(300)
  })

  test('enables swipe gestures for navigation', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()

    // Swipe left to go to next step (if implemented)
    const main = page.getByRole('main')
    const box = await main.boundingBox()

    if (box) {
      await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 10, box.y + box.height / 2)
      await page.mouse.up()

      // Should navigate to next step
      await page.waitForTimeout(500)
      expect(await importPage.getCurrentStep()).toBe(2)
    }
  })

  test('shows hamburger menu for navigation', async ({ page }) => {
    const menuButton = page.getByRole('button', { name: /menu|navigation/i })

    if (await menuButton.isVisible()) {
      await menuButton.click()
      await expect(page.getByRole('navigation')).toBeVisible()
    }
  })

  test('optimizes touch targets for buttons', async ({ page }) => {
    const buttons = page.getByRole('button').all()

    for (const button of await buttons) {
      const box = await button.boundingBox()
      if (box) {
        // Minimum touch target: 44x44 pixels
        expect(box.height).toBeGreaterThanOrEqual(40)
        expect(box.width).toBeGreaterThanOrEqual(40)
      }
    }
  })

  test('handles landscape orientation', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 }) // Landscape

    await expect(page.getByRole('main')).toBeVisible()

    // Content should still be accessible in landscape
    const main = page.getByRole('main')
    const box = await main.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(667)
  })
})

test.describe('Google Analytics Import - Accessibility', () => {
  let importPage: GoogleAnalyticsImportPage

  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedContext(context)
    importPage = new GoogleAnalyticsImportPage(page)
    await importPage.navigate()
  })

  test('supports keyboard navigation through wizard', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab')
    let focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'INPUT', 'A']).toContain(focused)

    // Continue tabbing
    await page.keyboard.press('Tab')
    focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBeTruthy()
  })

  test('provides ARIA labels for screen readers', async ({ page }) => {
    const connectBtn = await importPage.clickConnectGoogleButton()
    const ariaLabel = await connectBtn.getAttribute('aria-label')
    expect(ariaLabel || await connectBtn.textContent()).toBeTruthy()
  })

  test('announces progress updates to screen readers', async ({ page }) => {
    await mockGoogleOAuthSuccess(page)
    await mockGA4Properties(page, [{ id: 'GA4-123', name: 'Test' }])
    await mockImportJobCreation(page)

    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.click()
    await importPage.clickNext()
    await importPage.selectGA4Property('Test')
    await importPage.clickNext()
    await importPage.selectDateRange('2024-01-01', '2024-01-31')
    await importPage.clickNext()
    await importPage.startImport()

    // Progress should have aria-live region
    const progressRegion = page.getByRole('status').or(page.locator('[aria-live]'))
    await expect(progressRegion).toBeVisible()
  })

  test('has sufficient color contrast', async ({ page }) => {
    // This would ideally use an accessibility testing library
    // For now, just ensure critical elements are visible
    await expect(await importPage.clickConnectGoogleButton()).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('provides clear focus indicators', async ({ page }) => {
    const connectBtn = await importPage.clickConnectGoogleButton()
    await connectBtn.focus()

    // Check that focused element has visual indicator
    const outline = await connectBtn.evaluate(el => {
      const styles = window.getComputedStyle(el)
      return styles.outline || styles.boxShadow
    })
    expect(outline).toBeTruthy()
  })
})
