import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * Chart Component Tests
 * Tests analytics chart components (Line, Bar, Area charts)
 */

interface ChartProps {
  data: Array<{ timestamp: string; value: number }>
  type: 'line' | 'bar' | 'area'
  title?: string
  height?: number
  color?: string
  showLegend?: boolean
  showGrid?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
}

// Mock Chart Component
const Chart = ({ data, type, title, height = 300, color = '#3b82f6', showLegend = true, showGrid = true, xAxisLabel, yAxisLabel }: ChartProps) => {
  if (!data || data.length === 0) {
    return <div data-testid="chart-empty">No data available</div>
  }

  return (
    <div data-testid="chart-container" style={{ height }}>
      {title && <h3 data-testid="chart-title">{title}</h3>}
      <div data-testid={`chart-${type}`} style={{ color }}>
        {showLegend && <div data-testid="chart-legend">Legend</div>}
        {showGrid && <div data-testid="chart-grid">Grid</div>}
        {xAxisLabel && <div data-testid="chart-x-label">{xAxisLabel}</div>}
        {yAxisLabel && <div data-testid="chart-y-label">{yAxisLabel}</div>}
        <div data-testid="chart-data-points">{data.length} points</div>
      </div>
    </div>
  )
}

describe('Chart Component - Analytics Charts', () => {
  const mockData = [
    { timestamp: '2024-01-01T10:00:00Z', value: 100 },
    { timestamp: '2024-01-01T11:00:00Z', value: 150 },
    { timestamp: '2024-01-01T12:00:00Z', value: 120 },
  ]

  describe('Rendering', () => {
    it('should render chart with data', () => {
      render(<Chart data={mockData} type="line" />)

      expect(screen.getByTestId('chart-container')).toBeInTheDocument()
    })

    it('should render line chart', () => {
      render(<Chart data={mockData} type="line" />)

      expect(screen.getByTestId('chart-line')).toBeInTheDocument()
    })

    it('should render bar chart', () => {
      render(<Chart data={mockData} type="bar" />)

      expect(screen.getByTestId('chart-bar')).toBeInTheDocument()
    })

    it('should render area chart', () => {
      render(<Chart data={mockData} type="area" />)

      expect(screen.getByTestId('chart-area')).toBeInTheDocument()
    })

    it('should display title when provided', () => {
      render(<Chart data={mockData} type="line" title="Page Views" />)

      expect(screen.getByTestId('chart-title')).toHaveTextContent('Page Views')
    })

    it('should not display title when not provided', () => {
      render(<Chart data={mockData} type="line" />)

      expect(screen.queryByTestId('chart-title')).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no data', () => {
      render(<Chart data={[]} type="line" />)

      expect(screen.getByTestId('chart-empty')).toBeInTheDocument()
      expect(screen.getByTestId('chart-empty')).toHaveTextContent('No data available')
    })

    it('should not render chart elements when empty', () => {
      render(<Chart data={[]} type="line" />)

      expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument()
    })
  })

  describe('Configuration', () => {
    it('should apply custom height', () => {
      render(<Chart data={mockData} type="line" height={400} />)

      const container = screen.getByTestId('chart-container')
      expect(container).toHaveStyle({ height: '400px' })
    })

    it('should apply default height', () => {
      render(<Chart data={mockData} type="line" />)

      const container = screen.getByTestId('chart-container')
      expect(container).toHaveStyle({ height: '300px' })
    })

    it('should apply custom color', () => {
      render(<Chart data={mockData} type="line" color="#ff0000" />)

      const chart = screen.getByTestId('chart-line')
      expect(chart).toHaveStyle({ color: '#ff0000' })
    })

    it('should show legend when enabled', () => {
      render(<Chart data={mockData} type="line" showLegend={true} />)

      expect(screen.getByTestId('chart-legend')).toBeInTheDocument()
    })

    it('should hide legend when disabled', () => {
      render(<Chart data={mockData} type="line" showLegend={false} />)

      expect(screen.queryByTestId('chart-legend')).not.toBeInTheDocument()
    })

    it('should show grid when enabled', () => {
      render(<Chart data={mockData} type="line" showGrid={true} />)

      expect(screen.getByTestId('chart-grid')).toBeInTheDocument()
    })

    it('should hide grid when disabled', () => {
      render(<Chart data={mockData} type="line" showGrid={false} />)

      expect(screen.queryByTestId('chart-grid')).not.toBeInTheDocument()
    })
  })

  describe('Axis Labels', () => {
    it('should display x-axis label when provided', () => {
      render(<Chart data={mockData} type="line" xAxisLabel="Time" />)

      expect(screen.getByTestId('chart-x-label')).toHaveTextContent('Time')
    })

    it('should display y-axis label when provided', () => {
      render(<Chart data={mockData} type="line" yAxisLabel="Page Views" />)

      expect(screen.getByTestId('chart-y-label')).toHaveTextContent('Page Views')
    })

    it('should not show labels when not provided', () => {
      render(<Chart data={mockData} type="line" />)

      expect(screen.queryByTestId('chart-x-label')).not.toBeInTheDocument()
      expect(screen.queryByTestId('chart-y-label')).not.toBeInTheDocument()
    })
  })

  describe('Data Handling', () => {
    it('should handle single data point', () => {
      const singlePoint = [{ timestamp: '2024-01-01T10:00:00Z', value: 100 }]
      render(<Chart data={singlePoint} type="line" />)

      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('1 points')
    })

    it('should handle large datasets', () => {
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        timestamp: new Date(2024, 0, 1, i).toISOString(),
        value: Math.random() * 1000,
      }))

      render(<Chart data={largeDataset} type="line" />)

      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('1000 points')
    })

    it('should count data points correctly', () => {
      render(<Chart data={mockData} type="line" />)

      expect(screen.getByTestId('chart-data-points')).toHaveTextContent('3 points')
    })
  })
})
