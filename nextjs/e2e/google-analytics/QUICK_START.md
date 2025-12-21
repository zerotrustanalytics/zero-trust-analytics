# Quick Start Guide - Google Analytics Import E2E Tests

## 🚀 Run Tests (5 seconds to start)

```bash
# Run all GA import tests
npm run test:e2e -- google-analytics/import-flow.spec.ts

# Watch mode for development
npm run test:e2e -- google-analytics/import-flow.spec.ts --ui

# Debug specific test
npm run test:e2e -- google-analytics/import-flow.spec.ts -g "OAuth Connection" --debug
```

## 📋 Test Checklist for Implementation

### Step 1: Add Test IDs to UI Components

```tsx
// In your import wizard component
<div data-testid="import-progress">{progress}%</div>
<div data-testid="import-status">{status}</div>
<div data-testid="imported-rows">{importedRows.toLocaleString()}</div>
<div data-testid="total-rows">{totalRows.toLocaleString()}</div>
<span data-testid="connected-account-email">{userEmail}</span>
```

### Step 2: Add Step Attributes to Wizard

```tsx
<div data-step="1" className={currentStep === 1 ? 'active' : ''}>
  Connect Google Account
</div>
<div data-step="2" className={currentStep === 2 ? 'active' : ''}>
  Select GA4 Property
</div>
<div data-step="3" className={currentStep === 3 ? 'active' : ''}>
  Choose Date Range
</div>
<div data-step="4" className={currentStep === 4 ? 'active' : ''}>
  Review & Start
</div>
```

### Step 3: Ensure Proper ARIA Labels

```tsx
<button aria-label="Connect Google Account">Connect Google</button>
<button aria-label="Start import">Start Import</button>
<div role="alert">{errorMessage}</div>
<div role="status" aria-live="polite">{progressMessage}</div>
```

## 🎯 Common Test Patterns

### Pattern 1: Navigation Flow
```typescript
await importPage.navigate()
await importPage.clickConnectGoogleButton()
await importPage.clickNext()
await importPage.selectGA4Property('My Property')
await importPage.clickNext()
```

### Pattern 2: Verify State
```typescript
expect(await importPage.getCurrentStep()).toBe(2)
expect(await importPage.isGoogleAccountConnected()).toBe(true)
expect(await importPage.getProgressPercentage()).toBe(50)
```

### Pattern 3: Mock API Response
```typescript
await mockGoogleOAuthSuccess(page)
await mockGA4Properties(page, [
  { id: 'GA4-123', name: 'Production' }
])
await mockImportProgress(page, 75, 'in_progress')
```

## 🔍 Debugging Failed Tests

### View Last Test Report
```bash
npx playwright show-report
```

### Run Single Test with Trace
```bash
npm run test:e2e -- google-analytics/import-flow.spec.ts \
  -g "completes full import wizard" \
  --trace on
```

### View Trace File
```bash
npx playwright show-trace test-results/.../trace.zip
```

## 📊 Test Coverage Summary

| Area | Tests | Status |
|------|-------|--------|
| Wizard Flow | 4 | ✅ |
| OAuth | 6 | ✅ |
| Property Selection | 6 | ✅ |
| Date Range | 7 | ✅ |
| Progress | 7 | ✅ |
| Completed Import | 6 | ✅ |
| Cancellation | 6 | ✅ |
| Failed Import | 6 | ✅ |
| History | 8 | ✅ |
| Disconnection | 5 | ✅ |
| Error Handling | 7 | ✅ |
| Mobile | 10 | ✅ |
| Accessibility | 5 | ✅ |
| **TOTAL** | **83** | ✅ |

## 🛠️ Required UI Elements

### Buttons (must be accessible via getByRole)
- "Connect Google" / "Sign in with Google"
- "Next" / "Continue"
- "Previous" / "Back"
- "Start Import" / "Begin Import"
- "Cancel Import" / "Stop Import"
- "Retry" / "Try Again"
- "Disconnect" / "Remove Connection"
- "View Data" / "See Results"
- "Export" (with submenu for CSV/JSON)

### Form Fields (must have labels)
- Property selection dropdown
- Start date input
- End date input
- Search/filter inputs

### Status Indicators
- Progress bar (0-100%)
- Status text (pending, in_progress, completed, failed, cancelled)
- Row counts (imported vs total)
- Error messages

## 🎨 Recommended Component Structure

```tsx
// GoogleAnalyticsImport.tsx
export default function GoogleAnalyticsImport() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isConnected, setIsConnected] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [importJob, setImportJob] = useState(null)

  return (
    <div className="import-wizard">
      {/* Step Indicator */}
      <WizardSteps currentStep={currentStep} />

      {/* Step Content */}
      {currentStep === 1 && (
        <ConnectAccountStep onConnect={handleConnect} />
      )}
      {currentStep === 2 && (
        <SelectPropertyStep onSelect={handlePropertySelect} />
      )}
      {currentStep === 3 && (
        <DateRangeStep onSelect={handleDateRangeSelect} />
      )}
      {currentStep === 4 && (
        <ReviewStep onStart={handleStartImport} />
      )}

      {/* Navigation */}
      <WizardNavigation
        currentStep={currentStep}
        onNext={() => setCurrentStep(s => s + 1)}
        onPrevious={() => setCurrentStep(s => s - 1)}
      />
    </div>
  )
}
```

## 📱 Mobile Testing

Tests automatically run on mobile viewports:
- iPhone 12 (390x844)
- Pixel 5 (393x851)

Mobile-specific assertions:
- Touch target sizes (min 44x44px)
- Native date pickers
- Bottom sheet modals
- Swipe gestures
- Responsive layouts

## ♿ Accessibility Testing

Automated checks for:
- Keyboard navigation (Tab, Enter, Escape)
- ARIA labels and roles
- Screen reader announcements
- Focus indicators
- Color contrast

## 🔄 CI/CD Integration

Tests are configured for CI in `playwright.config.ts`:
- 2 retries on failure
- Screenshots on failure
- Video recording on failure
- Parallel execution disabled for stability

## 💡 Pro Tips

1. **Use Page Object Methods** - Don't write raw selectors in tests
2. **Mock API Calls** - Tests should be deterministic and fast
3. **Test User Flows** - Test complete workflows, not just individual features
4. **Keep Tests Independent** - Each test should run in isolation
5. **Use Descriptive Names** - Test names should explain what they verify

## 🐛 Common Issues

### Issue: "Element not found"
**Solution:** Add `data-testid` to the component or ensure button text matches regex pattern

### Issue: "Test timeout"
**Solution:** Check if API mocks are set up correctly, or increase timeout

### Issue: "OAuth popup blocked"
**Solution:** Mock OAuth flow instead of opening real popup in tests

### Issue: "Flaky tests"
**Solution:** Use `waitFor` methods instead of `waitForTimeout`, ensure proper state cleanup

## 📞 Need Help?

- See `README.md` for detailed documentation
- See `TEST_SUMMARY.md` for test coverage breakdown
- Check `import-flow.spec.ts` for implementation examples
- Review existing tests in `/e2e/auth/` and `/e2e/dashboard/` for patterns

## 🎓 Learning Resources

- [Playwright Documentation](https://playwright.dev)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
