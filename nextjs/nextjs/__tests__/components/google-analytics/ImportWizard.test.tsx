/**
 * TDD Test Suite for Google Analytics Import Wizard Components
 *
 * This test suite defines expected behavior for the GA Import wizard components
 * before implementation (TDD approach). Each test describes the expected functionality
 * that should be implemented.
 *
 * Components tested:
 * - ImportWizard: Main wizard orchestrator with step navigation
 * - GoogleAccountSelector: GA account selection interface
 * - PropertySelector: GA4 property selection interface
 * - DateRangePicker: Date range selection for import
 * - ImportProgress: Real-time import progress display
 * - ImportHistory: Historical import records display
 * - ImportConfirmation: Pre-import confirmation dialog
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// Component imports - these will be implemented
import { ImportWizard } from '@/components/google-analytics/ImportWizard'
import { GoogleAccountSelector } from '@/components/google-analytics/GoogleAccountSelector'
import { PropertySelector } from '@/components/google-analytics/PropertySelector'
import { DateRangePicker } from '@/components/google-analytics/DateRangePicker'
import { ImportProgress } from '@/components/google-analytics/ImportProgress'
import { ImportHistory } from '@/components/google-analytics/ImportHistory'
import { ImportConfirmation } from '@/components/google-analytics/ImportConfirmation'

// Mock data for testing
const mockGoogleAccounts = [
  { id: 'acc-1', name: 'Company Account', email: 'analytics@company.com' },
  { id: 'acc-2', name: 'Personal Account', email: 'personal@gmail.com' },
]

const mockProperties = [
  {
    id: 'prop-1',
    name: 'Website Production',
    propertyId: '123456789',
    accountId: 'acc-1',
    industryCategory: 'Technology',
    timezone: 'America/New_York'
  },
  {
    id: 'prop-2',
    name: 'Mobile App',
    propertyId: '987654321',
    accountId: 'acc-1',
    industryCategory: 'Technology',
    timezone: 'America/New_York'
  },
]

const mockImportHistory = [
  {
    id: 'imp-1',
    propertyName: 'Website Production',
    dateRange: { start: '2024-01-01', end: '2024-01-31' },
    status: 'completed',
    recordsImported: 45623,
    completedAt: '2024-02-01T10:30:00Z',
  },
  {
    id: 'imp-2',
    propertyName: 'Mobile App',
    dateRange: { start: '2024-01-01', end: '2024-01-15' },
    status: 'failed',
    error: 'API quota exceeded',
    completedAt: '2024-01-16T14:22:00Z',
  },
]

describe('ImportWizard', () => {
  describe('Step Navigation', () => {
    it('should render the wizard with initial step (account selection)', () => {
      // TDD: Define expected behavior
      // When the wizard is first rendered, it should show step 1 (account selection)
      // and display the step indicator showing we're on step 1 of 4
      render(<ImportWizard />)

      expect(screen.getByRole('heading', { name: /select google account/i })).toBeInTheDocument()
      expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    })

    it('should disable next button when no account is selected', () => {
      // TDD: Next button should be disabled until user makes a selection
      render(<ImportWizard />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
    })

    it('should enable next button after account selection', async () => {
      // TDD: After selecting an account, next button should become enabled
      const user = userEvent.setup()
      render(<ImportWizard />)

      const accountOption = screen.getByRole('radio', { name: /company account/i })
      await user.click(accountOption)

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeEnabled()
    })

    it('should navigate to property selection step when next is clicked', async () => {
      // TDD: Clicking next should advance to step 2 (property selection)
      const user = userEvent.setup()
      render(<ImportWizard />)

      const accountOption = screen.getByRole('radio', { name: /company account/i })
      await user.click(accountOption)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      expect(screen.getByRole('heading', { name: /select ga4 property/i })).toBeInTheDocument()
      expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
    })

    it('should show back button on steps after the first', async () => {
      // TDD: Back button should appear once user moves past first step
      const user = userEvent.setup()
      render(<ImportWizard />)

      const accountOption = screen.getByRole('radio', { name: /company account/i })
      await user.click(accountOption)
      await user.click(screen.getByRole('button', { name: /next/i }))

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    })

    it('should navigate back to previous step when back is clicked', async () => {
      // TDD: Back button should return to previous step without losing selections
      const user = userEvent.setup()
      render(<ImportWizard />)

      const accountOption = screen.getByRole('radio', { name: /company account/i })
      await user.click(accountOption)
      await user.click(screen.getByRole('button', { name: /next/i }))
      await user.click(screen.getByRole('button', { name: /back/i }))

      expect(screen.getByRole('heading', { name: /select google account/i })).toBeInTheDocument()
      expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
      // Previous selection should be preserved
      expect(accountOption).toBeChecked()
    })

    it('should complete all steps in order: account -> property -> dates -> confirm', async () => {
      // TDD: Complete wizard flow through all 4 steps
      const user = userEvent.setup()
      render(<ImportWizard />)

      // Step 1: Select account
      await user.click(screen.getByRole('radio', { name: /company account/i }))
      await user.click(screen.getByRole('button', { name: /next/i }))

      // Step 2: Select property
      expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
      await user.click(screen.getByRole('radio', { name: /website production/i }))
      await user.click(screen.getByRole('button', { name: /next/i }))

      // Step 3: Select date range
      expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument()
      const startDateInput = screen.getByLabelText(/start date/i)
      const endDateInput = screen.getByLabelText(/end date/i)
      await user.type(startDateInput, '2024-01-01')
      await user.type(endDateInput, '2024-01-31')
      await user.click(screen.getByRole('button', { name: /next/i }))

      // Step 4: Confirmation
      expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /confirm import/i })).toBeInTheDocument()
    })

    it('should display progress indicator showing current step', () => {
      // TDD: Visual progress indicator should show which step user is on
      render(<ImportWizard />)

      const stepIndicator = screen.getByRole('progressbar', { name: /wizard progress/i })
      expect(stepIndicator).toHaveAttribute('aria-valuenow', '1')
      expect(stepIndicator).toHaveAttribute('aria-valuemax', '4')
    })
  })

  describe('Error States', () => {
    it('should display error message when navigation fails', async () => {
      // TDD: Show user-friendly error if step navigation fails
      const user = userEvent.setup()
      const onStepChange = vi.fn().mockRejectedValue(new Error('Navigation failed'))

      render(<ImportWizard onStepChange={onStepChange} />)

      await user.click(screen.getByRole('radio', { name: /company account/i }))
      await user.click(screen.getByRole('button', { name: /next/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/navigation failed/i)
      })
    })

    it('should allow retry after error', async () => {
      // TDD: Provide retry mechanism when errors occur
      const user = userEvent.setup()
      const onStepChange = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined)

      render(<ImportWizard onStepChange={onStepChange} />)

      await user.click(screen.getByRole('radio', { name: /company account/i }))
      await user.click(screen.getByRole('button', { name: /next/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /retry/i }))

      await waitFor(() => {
        expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
      })
    })

    it('should handle cancel action and show confirmation dialog', async () => {
      // TDD: Warn user before canceling wizard with unsaved progress
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ImportWizard onCancel={onCancel} />)

      await user.click(screen.getByRole('radio', { name: /company account/i }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.getByRole('dialog', { name: /confirm cancellation/i })).toBeInTheDocument()
      expect(screen.getByText(/lose your progress/i)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should support keyboard navigation between steps', async () => {
      // TDD: Full keyboard navigation support
      const user = userEvent.setup()
      render(<ImportWizard />)

      const accountOption = screen.getByRole('radio', { name: /company account/i })
      accountOption.focus()
      await user.keyboard('{Space}')

      expect(accountOption).toBeChecked()

      await user.tab()
      expect(screen.getByRole('button', { name: /next/i })).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
    })

    it('should announce step changes to screen readers', async () => {
      // TDD: ARIA live regions for step changes
      const user = userEvent.setup()
      render(<ImportWizard />)

      await user.click(screen.getByRole('radio', { name: /company account/i }))
      await user.click(screen.getByRole('button', { name: /next/i }))

      const liveRegion = screen.getByRole('status', { name: /current step/i })
      expect(liveRegion).toHaveTextContent(/step 2 of 4/i)
    })

    it('should have proper ARIA labels for all interactive elements', () => {
      // TDD: All controls should have accessible names
      render(<ImportWizard />)

      expect(screen.getByRole('button', { name: /next/i })).toHaveAccessibleName()
      expect(screen.getByRole('button', { name: /cancel/i })).toHaveAccessibleName()
      expect(screen.getByRole('radiogroup', { name: /google accounts/i })).toBeInTheDocument()
    })
  })
})

describe('GoogleAccountSelector', () => {
  it('should render list of available Google accounts', () => {
    // TDD: Display all available Google accounts for selection
    render(<GoogleAccountSelector accounts={mockGoogleAccounts} />)

    expect(screen.getByRole('radio', { name: /company account/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /personal account/i })).toBeInTheDocument()
    expect(screen.getByText('analytics@company.com')).toBeInTheDocument()
  })

  it('should call onSelect callback when account is selected', async () => {
    // TDD: Trigger callback with selected account data
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<GoogleAccountSelector accounts={mockGoogleAccounts} onSelect={onSelect} />)

    await user.click(screen.getByRole('radio', { name: /company account/i }))

    expect(onSelect).toHaveBeenCalledWith(mockGoogleAccounts[0])
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('should show loading state while fetching accounts', () => {
    // TDD: Display loading indicator during data fetch
    render(<GoogleAccountSelector isLoading={true} />)

    expect(screen.getByRole('status', { name: /loading accounts/i })).toBeInTheDocument()
    expect(screen.getByText(/loading google accounts/i)).toBeInTheDocument()
  })

  it('should display error message when account fetch fails', () => {
    // TDD: Show error state with retry option
    const error = new Error('Failed to fetch accounts')
    render(<GoogleAccountSelector error={error} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to fetch accounts/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('should show empty state when no accounts are available', () => {
    // TDD: Handle empty accounts list gracefully
    render(<GoogleAccountSelector accounts={[]} />)

    expect(screen.getByText(/no google accounts found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect account/i })).toBeInTheDocument()
  })

  it('should highlight selected account', async () => {
    // TDD: Visual indication of selection
    const user = userEvent.setup()
    render(<GoogleAccountSelector accounts={mockGoogleAccounts} />)

    const accountOption = screen.getByRole('radio', { name: /company account/i })
    await user.click(accountOption)

    const selectedCard = accountOption.closest('[data-selected="true"]')
    expect(selectedCard).toBeInTheDocument()
  })

  it('should support keyboard selection with arrow keys', async () => {
    // TDD: Arrow key navigation in radio group
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<GoogleAccountSelector accounts={mockGoogleAccounts} onSelect={onSelect} />)

    const radioGroup = screen.getByRole('radiogroup')
    radioGroup.focus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /company account/i })).toBeChecked()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /personal account/i })).toBeChecked()
  })

  it('should display account metadata (email, type)', () => {
    // TDD: Show relevant account information
    render(<GoogleAccountSelector accounts={mockGoogleAccounts} />)

    expect(screen.getByText('analytics@company.com')).toBeInTheDocument()
    expect(screen.getByText('Company Account')).toBeInTheDocument()
  })
})

describe('PropertySelector', () => {
  it('should render list of GA4 properties for selected account', () => {
    // TDD: Display properties filtered by account
    render(<PropertySelector properties={mockProperties} accountId="acc-1" />)

    expect(screen.getByRole('radio', { name: /website production/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /mobile app/i })).toBeInTheDocument()
  })

  it('should display property details (ID, industry, timezone)', () => {
    // TDD: Show comprehensive property information
    render(<PropertySelector properties={mockProperties} />)

    expect(screen.getByText('123456789')).toBeInTheDocument()
    expect(screen.getByText(/technology/i)).toBeInTheDocument()
    expect(screen.getByText(/america\/new_york/i)).toBeInTheDocument()
  })

  it('should call onSelect when property is chosen', async () => {
    // TDD: Callback with selected property
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<PropertySelector properties={mockProperties} onSelect={onSelect} />)

    await user.click(screen.getByRole('radio', { name: /website production/i }))

    expect(onSelect).toHaveBeenCalledWith(mockProperties[0])
  })

  it('should filter properties by search term', async () => {
    // TDD: Search/filter functionality
    const user = userEvent.setup()
    render(<PropertySelector properties={mockProperties} />)

    const searchInput = screen.getByRole('searchbox', { name: /search properties/i })
    await user.type(searchInput, 'mobile')

    expect(screen.getByRole('radio', { name: /mobile app/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /website production/i })).not.toBeInTheDocument()
  })

  it('should show loading skeleton while fetching properties', () => {
    // TDD: Loading state for properties
    render(<PropertySelector isLoading={true} />)

    expect(screen.getByRole('status', { name: /loading properties/i })).toBeInTheDocument()
  })

  it('should handle error state with retry button', () => {
    // TDD: Error handling for property fetch
    const onRetry = vi.fn()
    const error = new Error('Failed to load properties')

    render(<PropertySelector error={error} onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load properties/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('should show empty state when no properties match filter', async () => {
    // TDD: Empty search results
    const user = userEvent.setup()
    render(<PropertySelector properties={mockProperties} />)

    await user.type(screen.getByRole('searchbox'), 'nonexistent')

    expect(screen.getByText(/no properties found/i)).toBeInTheDocument()
  })

  it('should display property count badge', () => {
    // TDD: Show total number of properties
    render(<PropertySelector properties={mockProperties} />)

    expect(screen.getByText(/2 properties/i)).toBeInTheDocument()
  })
})

describe('DateRangePicker', () => {
  it('should render start and end date inputs', () => {
    // TDD: Basic date range input fields
    render(<DateRangePicker />)

    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument()
  })

  it('should validate that end date is after start date', async () => {
    // TDD: Date validation logic
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const startDate = screen.getByLabelText(/start date/i)
    const endDate = screen.getByLabelText(/end date/i)

    await user.type(startDate, '2024-01-31')
    await user.type(endDate, '2024-01-01')

    expect(screen.getByRole('alert')).toHaveTextContent(/end date must be after start date/i)
  })

  it('should not allow future dates', async () => {
    // TDD: Prevent selection of future dates
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const startDate = screen.getByLabelText(/start date/i)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    await user.type(startDate, futureDate.toISOString().split('T')[0])

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot select future dates/i)
  })

  it('should provide preset date ranges (last 7 days, last 30 days, last 90 days)', async () => {
    // TDD: Quick select for common ranges
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DateRangePicker onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /last 30 days/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.any(String),
        end: expect.any(String),
      })
    )
  })

  it('should call onChange with selected date range', async () => {
    // TDD: Callback with date range object
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DateRangePicker onChange={onChange} />)

    await user.type(screen.getByLabelText(/start date/i), '2024-01-01')
    await user.type(screen.getByLabelText(/end date/i), '2024-01-31')

    expect(onChange).toHaveBeenCalledWith({
      start: '2024-01-01',
      end: '2024-01-31',
    })
  })

  it('should display calendar picker on input click', async () => {
    // TDD: Calendar UI for date selection
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const startDate = screen.getByLabelText(/start date/i)
    await user.click(startDate)

    expect(screen.getByRole('dialog', { name: /select date/i })).toBeInTheDocument()
  })

  it('should format dates according to locale', () => {
    // TDD: Localized date formatting
    render(<DateRangePicker value={{ start: '2024-01-01', end: '2024-01-31' }} locale="en-US" />)

    expect(screen.getByDisplayValue('01/01/2024')).toBeInTheDocument()
  })

  it('should enforce maximum date range limit', async () => {
    // TDD: Prevent excessively large date ranges
    const user = userEvent.setup()
    render(<DateRangePicker maxRangeDays={90} />)

    await user.type(screen.getByLabelText(/start date/i), '2024-01-01')
    await user.type(screen.getByLabelText(/end date/i), '2024-06-01')

    expect(screen.getByRole('alert')).toHaveTextContent(/date range cannot exceed 90 days/i)
  })

  it('should be keyboard accessible', async () => {
    // TDD: Full keyboard support
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const startDate = screen.getByLabelText(/start date/i)
    startDate.focus()

    await user.keyboard('2024-01-01')
    expect(startDate).toHaveValue('2024-01-01')
  })
})

describe('ImportProgress', () => {
  it('should display progress bar with current percentage', () => {
    // TDD: Visual progress indicator
    render(<ImportProgress progress={45} total={100} />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '45')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
    expect(screen.getByText('45%')).toBeInTheDocument()
  })

  it('should show records imported count', () => {
    // TDD: Display import statistics
    render(<ImportProgress recordsImported={1523} totalRecords={5000} />)

    expect(screen.getByText(/1,523 of 5,000 records imported/i)).toBeInTheDocument()
  })

  it('should display estimated time remaining', () => {
    // TDD: Time estimation based on progress
    render(<ImportProgress progress={25} estimatedTimeRemaining={180} />)

    expect(screen.getByText(/estimated time remaining: 3 minutes/i)).toBeInTheDocument()
  })

  it('should show current import status message', () => {
    // TDD: Descriptive status messages
    render(<ImportProgress status="Importing page views..." />)

    expect(screen.getByText('Importing page views...')).toBeInTheDocument()
  })

  it('should display success state when import completes', () => {
    // TDD: Completion indicator
    render(<ImportProgress progress={100} status="completed" />)

    expect(screen.getByRole('status')).toHaveTextContent(/import completed successfully/i)
    expect(screen.getByTestId('success-icon')).toBeInTheDocument()
  })

  it('should show error state when import fails', () => {
    // TDD: Error state display
    const error = 'API quota exceeded'
    render(<ImportProgress status="failed" error={error} />)

    expect(screen.getByRole('alert')).toHaveTextContent(error)
    expect(screen.getByTestId('error-icon')).toBeInTheDocument()
  })

  it('should provide cancel import button', async () => {
    // TDD: Allow user to cancel in-progress import
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(<ImportProgress progress={30} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: /cancel import/i }))

    expect(screen.getByRole('dialog', { name: /confirm cancellation/i })).toBeInTheDocument()
  })

  it('should update progress in real-time', async () => {
    // TDD: Dynamic progress updates
    const { rerender } = render(<ImportProgress progress={10} />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')

    rerender(<ImportProgress progress={50} />)

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    })
  })

  it('should show processing speed (records per second)', () => {
    // TDD: Display import performance metrics
    render(<ImportProgress recordsPerSecond={142} />)

    expect(screen.getByText(/142 records\/sec/i)).toBeInTheDocument()
  })
})

describe('ImportHistory', () => {
  it('should render list of past imports', () => {
    // TDD: Display historical import records
    render(<ImportHistory imports={mockImportHistory} />)

    expect(screen.getByText('Website Production')).toBeInTheDocument()
    expect(screen.getByText('Mobile App')).toBeInTheDocument()
  })

  it('should display import details (date range, status, records)', () => {
    // TDD: Show comprehensive import information
    render(<ImportHistory imports={mockImportHistory} />)

    expect(screen.getByText(/2024-01-01.*2024-01-31/i)).toBeInTheDocument()
    expect(screen.getByText('45,623 records')).toBeInTheDocument()
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
  })

  it('should show failed imports with error messages', () => {
    // TDD: Display failed import details
    render(<ImportHistory imports={mockImportHistory} />)

    expect(screen.getByText(/failed/i)).toBeInTheDocument()
    expect(screen.getByText('API quota exceeded')).toBeInTheDocument()
  })

  it('should provide retry button for failed imports', async () => {
    // TDD: Allow retry of failed imports
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<ImportHistory imports={mockImportHistory} onRetry={onRetry} />)

    const retryButtons = screen.getAllByRole('button', { name: /retry import/i })
    await user.click(retryButtons[0])

    expect(onRetry).toHaveBeenCalledWith('imp-2')
  })

  it('should sort imports by date (newest first)', () => {
    // TDD: Chronological sorting
    render(<ImportHistory imports={mockImportHistory} />)

    const importItems = screen.getAllByTestId('import-item')
    expect(importItems[0]).toHaveTextContent('Website Production')
    expect(importItems[1]).toHaveTextContent('Mobile App')
  })

  it('should filter imports by status', async () => {
    // TDD: Status filter dropdown
    const user = userEvent.setup()
    render(<ImportHistory imports={mockImportHistory} />)

    const filterSelect = screen.getByRole('combobox', { name: /filter by status/i })
    await user.selectOptions(filterSelect, 'completed')

    expect(screen.getByText('Website Production')).toBeInTheDocument()
    expect(screen.queryByText('Mobile App')).not.toBeInTheDocument()
  })

  it('should show empty state when no imports exist', () => {
    // TDD: Empty state message
    render(<ImportHistory imports={[]} />)

    expect(screen.getByText(/no import history/i)).toBeInTheDocument()
    expect(screen.getByText(/start your first import/i)).toBeInTheDocument()
  })

  it('should display pagination for large import lists', () => {
    // TDD: Paginate long lists
    const manyImports = Array.from({ length: 25 }, (_, i) => ({
      ...mockImportHistory[0],
      id: `imp-${i}`,
    }))

    render(<ImportHistory imports={manyImports} pageSize={10} />)

    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument()
  })

  it('should show import duration', () => {
    // TDD: Display how long import took
    const importWithDuration = {
      ...mockImportHistory[0],
      startedAt: '2024-02-01T10:00:00Z',
      completedAt: '2024-02-01T10:30:00Z',
    }

    render(<ImportHistory imports={[importWithDuration]} />)

    expect(screen.getByText(/duration: 30 minutes/i)).toBeInTheDocument()
  })
})

describe('ImportConfirmation', () => {
  const confirmationData = {
    account: mockGoogleAccounts[0],
    property: mockProperties[0],
    dateRange: { start: '2024-01-01', end: '2024-01-31' },
  }

  it('should display summary of import configuration', () => {
    // TDD: Show all selected options for review
    render(<ImportConfirmation data={confirmationData} />)

    expect(screen.getByText('Company Account')).toBeInTheDocument()
    expect(screen.getByText('Website Production')).toBeInTheDocument()
    expect(screen.getByText(/2024-01-01.*2024-01-31/i)).toBeInTheDocument()
  })

  it('should show estimated records to import', () => {
    // TDD: Display import size estimate
    render(<ImportConfirmation data={confirmationData} estimatedRecords={45000} />)

    expect(screen.getByText(/estimated 45,000 records/i)).toBeInTheDocument()
  })

  it('should display import warnings if any', () => {
    // TDD: Warn about potential issues
    const warnings = ['Large date range may take several hours', 'Some metrics may be sampled']

    render(<ImportConfirmation data={confirmationData} warnings={warnings} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/large date range may take several hours/i)).toBeInTheDocument()
  })

  it('should require user confirmation checkbox before proceeding', async () => {
    // TDD: Explicit confirmation required
    const user = userEvent.setup()
    render(<ImportConfirmation data={confirmationData} />)

    const confirmButton = screen.getByRole('button', { name: /start import/i })
    expect(confirmButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /i confirm/i }))
    expect(confirmButton).toBeEnabled()
  })

  it('should call onConfirm when start import is clicked', async () => {
    // TDD: Trigger import on confirmation
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(<ImportConfirmation data={confirmationData} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('checkbox', { name: /i confirm/i }))
    await user.click(screen.getByRole('button', { name: /start import/i }))

    expect(onConfirm).toHaveBeenCalledWith(confirmationData)
  })

  it('should show edit buttons to modify selections', async () => {
    // TDD: Allow editing before confirmation
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(<ImportConfirmation data={confirmationData} onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: /edit property/i }))

    expect(onEdit).toHaveBeenCalledWith('property')
  })

  it('should display cost estimate if applicable', () => {
    // TDD: Show API usage cost
    render(<ImportConfirmation data={confirmationData} estimatedCost={0.15} />)

    expect(screen.getByText(/estimated cost: \$0.15/i)).toBeInTheDocument()
  })

  it('should show loading state during import initialization', () => {
    // TDD: Loading state when starting import
    render(<ImportConfirmation data={confirmationData} isInitializing={true} />)

    expect(screen.getByRole('button', { name: /starting import/i })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/initializing/i)
  })
})

describe('Form Validation', () => {
  it('should validate required fields in GoogleAccountSelector', () => {
    // TDD: Required field validation
    const onSubmit = vi.fn()
    render(<GoogleAccountSelector accounts={mockGoogleAccounts} onSubmit={onSubmit} />)

    const submitButton = screen.getByRole('button', { name: /continue/i })
    expect(submitButton).toBeDisabled()
  })

  it('should validate date range constraints in DateRangePicker', async () => {
    // TDD: Date validation rules
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<DateRangePicker onChange={onChange} maxRangeDays={365} />)

    await user.type(screen.getByLabelText(/start date/i), '2023-01-01')
    await user.type(screen.getByLabelText(/end date/i), '2024-12-31')

    expect(screen.getByRole('alert')).toHaveTextContent(/date range cannot exceed 365 days/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('should show validation errors inline', async () => {
    // TDD: Inline error messages
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const endDate = screen.getByLabelText(/end date/i)
    await user.type(endDate, '2024-01-01')

    const errorMessage = screen.getByRole('alert')
    expect(errorMessage).toHaveAttribute('id', expect.stringContaining('error'))
    expect(endDate).toHaveAttribute('aria-describedby', expect.stringContaining('error'))
  })

  it('should clear validation errors when input is corrected', async () => {
    // TDD: Dynamic error clearing
    const user = userEvent.setup()
    render(<DateRangePicker />)

    const startDate = screen.getByLabelText(/start date/i)
    const endDate = screen.getByLabelText(/end date/i)

    await user.type(startDate, '2024-01-31')
    await user.type(endDate, '2024-01-01')

    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.clear(endDate)
    await user.type(endDate, '2024-02-28')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Loading States', () => {
  it('should show skeleton loader for GoogleAccountSelector during load', () => {
    // TDD: Skeleton UI for better UX
    render(<GoogleAccountSelector isLoading={true} />)

    expect(screen.getAllByTestId('skeleton-loader')).toHaveLength(3)
  })

  it('should show spinner for PropertySelector during load', () => {
    // TDD: Loading spinner
    render(<PropertySelector isLoading={true} />)

    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(screen.getByText(/loading properties/i)).toBeInTheDocument()
  })

  it('should disable form interactions during loading', () => {
    // TDD: Prevent interactions during load
    render(<ImportWizard isLoading={true} />)

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('should show progress indicator for multi-step data loading', async () => {
    // TDD: Multi-step loading feedback
    render(<PropertySelector isLoading={true} loadingSteps={['Fetching properties', 'Loading metrics']} />)

    expect(screen.getByText('Fetching properties')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Loading metrics')).toBeInTheDocument()
    })
  })
})
