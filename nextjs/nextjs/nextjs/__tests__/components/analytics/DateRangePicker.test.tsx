import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * DateRangePicker Component Tests
 * Tests date range selection component for analytics
 */

interface DateRange {
  startDate: Date
  endDate: Date
}

interface DateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (range: DateRange) => void
  minDate?: Date
  maxDate?: Date
  presets?: Array<{ label: string; days: number }>
  disabled?: boolean
}

// Mock DateRangePicker Component
const DateRangePicker = ({
  startDate,
  endDate,
  onChange,
  minDate,
  maxDate,
  presets = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
  ],
  disabled = false,
}: DateRangePickerProps) => {
  const handlePresetClick = (days: number) => {
    if (disabled) return

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)

    onChange({ startDate: start, endDate: end })
  }

  const handleCustomChange = (type: 'start' | 'end', value: string) => {
    if (disabled) return

    const date = new Date(value)
    if (isNaN(date.getTime())) return

    if (minDate && date < minDate) return
    if (maxDate && date > maxDate) return

    if (type === 'start') {
      onChange({ startDate: date, endDate })
    } else {
      onChange({ startDate, endDate: date })
    }
  }

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  return (
    <div data-testid="date-range-picker">
      <div data-testid="presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            data-testid={`preset-${preset.days}`}
            onClick={() => handlePresetClick(preset.days)}
            disabled={disabled}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div data-testid="custom-inputs">
        <input
          type="date"
          data-testid="start-date-input"
          value={formatDate(startDate)}
          onChange={(e) => handleCustomChange('start', e.target.value)}
          disabled={disabled}
          min={minDate ? formatDate(minDate) : undefined}
          max={maxDate ? formatDate(maxDate) : undefined}
        />
        <input
          type="date"
          data-testid="end-date-input"
          value={formatDate(endDate)}
          onChange={(e) => handleCustomChange('end', e.target.value)}
          disabled={disabled}
          min={minDate ? formatDate(minDate) : undefined}
          max={maxDate ? formatDate(maxDate) : undefined}
        />
      </div>
    </div>
  )
}

describe('DateRangePicker Component - Date Range Selection', () => {
  const mockOnChange = vi.fn()
  const defaultStartDate = new Date('2024-01-01')
  const defaultEndDate = new Date('2024-01-31')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render date range picker', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByTestId('date-range-picker')).toBeInTheDocument()
    })

    it('should render preset buttons', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByTestId('preset-7')).toBeInTheDocument()
      expect(screen.getByTestId('preset-30')).toBeInTheDocument()
      expect(screen.getByTestId('preset-90')).toBeInTheDocument()
    })

    it('should render start date input', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      const startInput = screen.getByTestId('start-date-input')
      expect(startInput).toBeInTheDocument()
      expect(startInput).toHaveValue('2024-01-01')
    })

    it('should render end date input', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      const endInput = screen.getByTestId('end-date-input')
      expect(endInput).toBeInTheDocument()
      expect(endInput).toHaveValue('2024-01-31')
    })
  })

  describe('Preset Selection', () => {
    it('should call onChange when preset clicked', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByTestId('preset-7'))

      expect(mockOnChange).toHaveBeenCalledTimes(1)
    })

    it('should calculate correct date range for 7 days preset', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByTestId('preset-7'))

      const call = mockOnChange.mock.calls[0][0]
      const daysDiff = Math.round((call.endDate - call.startDate) / (1000 * 60 * 60 * 24))

      expect(daysDiff).toBe(7)
    })

    it('should calculate correct date range for 30 days preset', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByTestId('preset-30'))

      const call = mockOnChange.mock.calls[0][0]
      const daysDiff = Math.round((call.endDate - call.startDate) / (1000 * 60 * 60 * 24))

      expect(daysDiff).toBe(30)
    })

    it('should not trigger onChange when disabled', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          disabled={true}
        />
      )

      fireEvent.click(screen.getByTestId('preset-7'))

      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Custom Date Input', () => {
    it('should update start date on input change', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      const startInput = screen.getByTestId('start-date-input')
      fireEvent.change(startInput, { target: { value: '2024-02-01' } })

      expect(mockOnChange).toHaveBeenCalled()
      const call = mockOnChange.mock.calls[0][0]
      expect(call.startDate.toISOString().split('T')[0]).toBe('2024-02-01')
    })

    it('should update end date on input change', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      const endInput = screen.getByTestId('end-date-input')
      fireEvent.change(endInput, { target: { value: '2024-02-28' } })

      expect(mockOnChange).toHaveBeenCalled()
      const call = mockOnChange.mock.calls[0][0]
      expect(call.endDate.toISOString().split('T')[0]).toBe('2024-02-28')
    })

    it('should not update on invalid date input', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
        />
      )

      const startInput = screen.getByTestId('start-date-input')
      fireEvent.change(startInput, { target: { value: 'invalid-date' } })

      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Date Constraints', () => {
    it('should respect minDate constraint', () => {
      const minDate = new Date('2024-01-15')

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          minDate={minDate}
        />
      )

      const startInput = screen.getByTestId('start-date-input')
      fireEvent.change(startInput, { target: { value: '2024-01-10' } })

      expect(mockOnChange).not.toHaveBeenCalled()
    })

    it('should respect maxDate constraint', () => {
      const maxDate = new Date('2024-01-15')

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          maxDate={maxDate}
        />
      )

      const endInput = screen.getByTestId('end-date-input')
      fireEvent.change(endInput, { target: { value: '2024-01-20' } })

      expect(mockOnChange).not.toHaveBeenCalled()
    })

    it('should set min attribute on inputs', () => {
      const minDate = new Date('2024-01-01')

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          minDate={minDate}
        />
      )

      const startInput = screen.getByTestId('start-date-input')
      expect(startInput).toHaveAttribute('min', '2024-01-01')
    })

    it('should set max attribute on inputs', () => {
      const maxDate = new Date('2024-12-31')

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          maxDate={maxDate}
        />
      )

      const endInput = screen.getByTestId('end-date-input')
      expect(endInput).toHaveAttribute('max', '2024-12-31')
    })
  })

  describe('Disabled State', () => {
    it('should disable preset buttons when disabled', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          disabled={true}
        />
      )

      expect(screen.getByTestId('preset-7')).toBeDisabled()
      expect(screen.getByTestId('preset-30')).toBeDisabled()
    })

    it('should disable date inputs when disabled', () => {
      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          disabled={true}
        />
      )

      expect(screen.getByTestId('start-date-input')).toBeDisabled()
      expect(screen.getByTestId('end-date-input')).toBeDisabled()
    })
  })

  describe('Custom Presets', () => {
    it('should render custom presets', () => {
      const customPresets = [
        { label: 'Yesterday', days: 1 },
        { label: 'This Month', days: 30 },
      ]

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          presets={customPresets}
        />
      )

      expect(screen.getByTestId('preset-1')).toHaveTextContent('Yesterday')
      expect(screen.getByTestId('preset-30')).toHaveTextContent('This Month')
    })

    it('should work with custom preset values', () => {
      const customPresets = [{ label: 'Last 14 days', days: 14 }]

      render(
        <DateRangePicker
          startDate={defaultStartDate}
          endDate={defaultEndDate}
          onChange={mockOnChange}
          presets={customPresets}
        />
      )

      fireEvent.click(screen.getByTestId('preset-14'))

      expect(mockOnChange).toHaveBeenCalled()
    })
  })
})
