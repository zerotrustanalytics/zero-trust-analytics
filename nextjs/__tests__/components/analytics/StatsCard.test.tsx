import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * StatsCard Component Tests
 * Tests analytics statistics display cards
 */

interface StatsCardProps {
  title: string
  value: number | string
  change?: number
  changeType?: 'increase' | 'decrease' | 'neutral'
  format?: 'number' | 'percentage' | 'duration' | 'currency'
  icon?: string
  loading?: boolean
  error?: string
}

// Mock StatsCard Component
const StatsCard = ({
  title,
  value,
  change,
  changeType = 'neutral',
  format = 'number',
  icon,
  loading = false,
  error,
}: StatsCardProps) => {
  if (error) {
    return (
      <div data-testid="stats-card-error">
        <p>{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div data-testid="stats-card-loading">
        <p>Loading...</p>
      </div>
    )
  }

  const formatValue = (val: number | string, fmt: string) => {
    if (typeof val === 'string') return val

    switch (fmt) {
      case 'percentage':
        return `${val}%`
      case 'duration':
        return `${val}s`
      case 'currency':
        return `$${val.toLocaleString()}`
      default:
        return val.toLocaleString()
    }
  }

  const getChangeColor = (type: string) => {
    if (type === 'increase') return 'green'
    if (type === 'decrease') return 'red'
    return 'gray'
  }

  return (
    <div data-testid="stats-card">
      {icon && <div data-testid="stats-card-icon">{icon}</div>}
      <div data-testid="stats-card-title">{title}</div>
      <div data-testid="stats-card-value">{formatValue(value, format)}</div>
      {change !== undefined && (
        <div
          data-testid="stats-card-change"
          style={{ color: getChangeColor(changeType) }}
        >
          {change > 0 ? '+' : ''}{change}%
        </div>
      )}
    </div>
  )
}

describe('StatsCard Component - Statistics Display', () => {
  describe('Basic Rendering', () => {
    it('should render with title and value', () => {
      render(<StatsCard title="Page Views" value={1500} />)

      expect(screen.getByTestId('stats-card-title')).toHaveTextContent('Page Views')
      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('1,500')
    })

    it('should render without change indicator', () => {
      render(<StatsCard title="Visitors" value={450} />)

      expect(screen.queryByTestId('stats-card-change')).not.toBeInTheDocument()
    })

    it('should render with icon when provided', () => {
      render(<StatsCard title="Sessions" value={520} icon="📊" />)

      expect(screen.getByTestId('stats-card-icon')).toHaveTextContent('📊')
    })

    it('should not render icon when not provided', () => {
      render(<StatsCard title="Sessions" value={520} />)

      expect(screen.queryByTestId('stats-card-icon')).not.toBeInTheDocument()
    })
  })

  describe('Value Formatting', () => {
    it('should format numbers with commas', () => {
      render(<StatsCard title="Total Views" value={1234567} />)

      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('1,234,567')
    })

    it('should format as percentage', () => {
      render(<StatsCard title="Bounce Rate" value={35.5} format="percentage" />)

      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('35.5%')
    })

    it('should format as duration', () => {
      render(<StatsCard title="Avg Duration" value={180} format="duration" />)

      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('180s')
    })

    it('should format as currency', () => {
      render(<StatsCard title="Revenue" value={5000} format="currency" />)

      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('$5,000')
    })

    it('should handle string values', () => {
      render(<StatsCard title="Status" value="Active" />)

      expect(screen.getByTestId('stats-card-value')).toHaveTextContent('Active')
    })
  })

  describe('Change Indicator', () => {
    it('should display positive change', () => {
      render(<StatsCard title="Views" value={1500} change={25} changeType="increase" />)

      const change = screen.getByTestId('stats-card-change')
      expect(change).toHaveTextContent('+25%')
      expect(change).toHaveStyle({ color: 'green' })
    })

    it('should display negative change', () => {
      render(<StatsCard title="Views" value={1200} change={-15} changeType="decrease" />)

      const change = screen.getByTestId('stats-card-change')
      expect(change).toHaveTextContent('-15%')
      expect(change).toHaveStyle({ color: 'red' })
    })

    it('should display neutral change', () => {
      render(<StatsCard title="Views" value={1500} change={0} changeType="neutral" />)

      const change = screen.getByTestId('stats-card-change')
      expect(change).toHaveTextContent('0%')
      expect(change).toHaveStyle({ color: 'gray' })
    })

    it('should use neutral as default changeType', () => {
      render(<StatsCard title="Views" value={1500} change={5} />)

      const change = screen.getByTestId('stats-card-change')
      expect(change).toHaveStyle({ color: 'gray' })
    })
  })

  describe('Loading State', () => {
    it('should show loading state', () => {
      render(<StatsCard title="Views" value={0} loading={true} />)

      expect(screen.getByTestId('stats-card-loading')).toBeInTheDocument()
      expect(screen.getByTestId('stats-card-loading')).toHaveTextContent('Loading...')
    })

    it('should not show card content while loading', () => {
      render(<StatsCard title="Views" value={1500} loading={true} />)

      expect(screen.queryByTestId('stats-card')).not.toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('should show error state', () => {
      render(<StatsCard title="Views" value={0} error="Failed to load data" />)

      expect(screen.getByTestId('stats-card-error')).toBeInTheDocument()
      expect(screen.getByTestId('stats-card-error')).toHaveTextContent('Failed to load data')
    })

    it('should not show card content when error', () => {
      render(<StatsCard title="Views" value={1500} error="Error" />)

      expect(screen.queryByTestId('stats-card')).not.toBeInTheDocument()
    })

    it('should prioritize error over loading', () => {
      render(<StatsCard title="Views" value={0} loading={true} error="Error occurred" />)

      expect(screen.getByTestId('stats-card-error')).toBeInTheDocument()
      expect(screen.queryByTestId('stats-card-loading')).not.toBeInTheDocument()
    })
  })
})
