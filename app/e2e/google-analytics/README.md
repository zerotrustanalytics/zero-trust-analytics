# Google Analytics Import E2E Tests

Comprehensive end-to-end tests for the Google Analytics Import flow using Playwright.

## Test Coverage

This test suite covers the complete Google Analytics import functionality:

### Core Features (83 test cases)
1. **Full Import Wizard Flow** - Complete happy path and wizard navigation
2. **OAuth Connection** - Google account authentication and authorization
3. **Property Selection** - GA4 property selection and validation
4. **Date Range Selection** - Custom and preset date ranges
5. **Progress Monitoring** - Real-time import progress tracking
6. **Completed Imports** - Viewing and exporting imported data
7. **Import Cancellation** - Cancelling in-progress imports
8. **Failed Imports** - Error handling and retry logic
9. **Import History** - Viewing and managing import history
10. **Account Disconnection** - Disconnecting Google accounts
11. **Error Handling** - Comprehensive error scenarios
12. **Mobile Responsiveness** - Touch-friendly UI for mobile devices
13. **Accessibility** - Keyboard navigation and screen reader support

## Page Object Model

The test suite uses the Page Object Model pattern for better maintainability:

```typescript
class GoogleAnalyticsImportPage {
  // Navigation methods
  async navigate()
  async navigateToImportHistory()

  // OAuth methods
  async clickConnectGoogleButton()
  async disconnectGoogleAccount()

  // Wizard methods
  async selectGA4Property(propertyName)
  async selectDateRange(start, end)
  async startImport()

  // Progress monitoring
  async getProgressPercentage()
  async waitForImportComplete()

  // And many more...
}
```

## Running Tests

### Run all Google Analytics import tests
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts
```

### Run specific test suite
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts -g "OAuth Connection"
```

### Run in headed mode (see browser)
```bash
npm run test:e2e:headed -- google-analytics/import-flow.spec.ts
```

### Run in UI mode (interactive)
```bash
npm run test:e2e:ui -- google-analytics/import-flow.spec.ts
```

### Run on specific browser
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts --project=chromium
npm run test:e2e -- google-analytics/import-flow.spec.ts --project=firefox
npm run test:e2e -- google-analytics/import-flow.spec.ts --project=webkit
```

### Run mobile tests only
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts --project=mobile-chrome
npm run test:e2e -- google-analytics/import-flow.spec.ts --project=mobile-safari
```

## Test Data Setup

The tests use mocked API responses for consistent testing:

```typescript
// Mock Google OAuth success
await mockGoogleOAuthSuccess(page)

// Mock GA4 properties
await mockGA4Properties(page, [
  { id: 'GA4-123456', name: 'Production Site' }
])

// Mock import job creation
await mockImportJobCreation(page, 'import_123')

// Mock import progress
await mockImportProgress(page, 50, 'in_progress')
```

## Expected DOM Structure

The tests expect certain data-testid attributes and ARIA roles:

### Required Test IDs
- `import-progress` - Progress bar/indicator
- `import-status` - Current import status
- `imported-rows` - Number of imported rows
- `total-rows` - Total number of rows
- `data-preview-row` - Data preview table rows
- `import-history-item` - Import history list items
- `import-history-item-{id}` - Specific import history item
- `delete-import-{id}` - Delete button for specific import
- `connected-account-email` - Connected Google account email
- `error-message` - Error message container
- `loading-spinner` - Loading indicator

### Required Step Attributes
- `[data-step="1"]` - Step 1 (Connect Account)
- `[data-step="2"]` - Step 2 (Select Property)
- `[data-step="3"]` - Step 3 (Choose Date Range)
- `[data-step="4"]` - Step 4 (Review & Start)

### Required ARIA Roles
- `button` with names: "Connect Google", "Start Import", "Cancel Import", "Retry", etc.
- `dialog` for modals and confirmation dialogs
- `alert` or `status` for error messages and progress updates
- `navigation` for main navigation
- `option` for dropdown/select options

## Authentication

Tests use authenticated context by default:

```typescript
await context.addCookies([{
  name: 'auth_token',
  value: 'mock_jwt_token',
  domain: 'localhost',
  path: '/'
}])
```

## Debugging Failed Tests

### View test report
```bash
npx playwright show-report
```

### Run with trace
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts --trace on
```

### View specific trace
```bash
npx playwright show-trace test-results/.../trace.zip
```

### Debug specific test
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts -g "test name" --debug
```

## Test Organization

```
e2e/google-analytics/
├── import-flow.spec.ts          # Main test file (1,703 lines)
└── README.md                    # This file
```

### Test Suites Breakdown

1. **Full Wizard Flow** (4 tests)
   - Happy path completion
   - Field validation
   - Back/forth navigation
   - Selection preservation

2. **OAuth Connection** (6 tests)
   - Successful connection
   - OAuth denial
   - Popup blocked
   - Timeout handling
   - Account information
   - Token expiry reconnection

3. **Property Selection** (6 tests)
   - Display properties
   - Search/filter
   - No properties state
   - Property metadata
   - API errors
   - Loading states

4. **Date Range Selection** (7 tests)
   - Custom range
   - Preset ranges
   - Validation (end > start)
   - Future date prevention
   - Maximum range limit
   - Estimated volume
   - Calendar picker

5. **Progress Monitoring** (7 tests)
   - Progress bar display
   - Real-time updates
   - Row counts
   - Time remaining
   - Current phase
   - Completion handling
   - Success metrics

6. **Completed Import** (6 tests)
   - Data summary
   - Preview table
   - CSV export
   - JSON export
   - Dashboard navigation
   - Dimension breakdown

7. **Cancellation** (6 tests)
   - Cancel button visibility
   - Confirmation prompt
   - Successful cancellation
   - Partial data cleanup
   - View partial results
   - Prevent cancel completed

8. **Failed Import** (6 tests)
   - Error message display
   - Retry button
   - Successful retry
   - Partial data preservation
   - Detailed error info
   - Error type handling

9. **Import History** (9 tests)
   - History list display
   - Status indicators
   - Filter by status
   - Sort by date
   - Navigate to details
   - Delete from history
   - Empty state
   - Pagination
   - (implied in implementation)

10. **Account Disconnection** (5 tests)
    - Disconnect option visibility
    - Confirmation prompt
    - Successful disconnect
    - Active import warning
    - Wizard reset

11. **Error Handling** (8 tests)
    - Network errors
    - User-friendly messages
    - Error dismissal
    - Retry for transient errors
    - Quota exceeded
    - Unauthorized errors
    - Error logging
    - (implied in implementation)

12. **Mobile Responsiveness** (10 tests)
    - Mobile-friendly wizard
    - Touch-optimized date picker
    - Mobile dropdowns
    - Vertical stacking
    - Mobile progress indicator
    - Bottom sheet modals
    - Swipe gestures
    - Hamburger menu
    - Touch target sizes
    - Landscape orientation

13. **Accessibility** (5 tests)
    - Keyboard navigation
    - ARIA labels
    - Progress announcements
    - Color contrast
    - Focus indicators

## CI/CD Integration

These tests are configured to run in CI environments:

- Automatic retries (2x in CI)
- Screenshot on failure
- Video recording on failure
- HTML and JSON reports
- Parallel execution disabled in CI for consistency

## Best Practices

1. **Use Page Objects** - All UI interactions go through the `GoogleAnalyticsImportPage` class
2. **Mock API Responses** - Use helper functions like `mockGoogleOAuthSuccess()`
3. **Wait for State** - Use `waitForImportComplete()` instead of arbitrary timeouts
4. **Flexible Selectors** - Use regex patterns for text matching to handle variations
5. **Test Independence** - Each test can run independently with proper setup
6. **Cleanup** - Tests clean up after themselves (implicit in beforeEach)

## Contributing

When adding new tests:

1. Add methods to `GoogleAnalyticsImportPage` class for new UI interactions
2. Create mock helper functions for new API endpoints
3. Group related tests in `test.describe()` blocks
4. Use descriptive test names that explain the behavior
5. Add appropriate `data-testid` attributes to the UI components
6. Update this README with new test coverage

## Known Limitations

- OAuth popup handling is mocked (real popup testing requires special setup)
- Some mobile gesture tests may need adjustment based on actual implementation
- Accessibility tests would benefit from automated tools like axe-core
- Network throttling tests not included (can be added with Playwright's network emulation)

## Related Files

- `/playwright.config.ts` - Playwright configuration
- `/src/app/dashboard/import/google-analytics/page.tsx` - Import wizard UI (assumed path)
- `/__tests__/api/google-analytics-import.test.ts` - API unit tests
- `/e2e/auth/login.spec.ts` - Authentication E2E tests
