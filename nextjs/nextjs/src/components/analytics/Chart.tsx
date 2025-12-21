'use client'

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card } from '@/components/ui'
import { clsx } from 'clsx'

export interface ChartDataPoint {
  label: string
  value: number
  previousValue?: number
  [key: string]: string | number | undefined
}

interface ChartProps {
  data: ChartDataPoint[]
  type?: 'line' | 'area' | 'bar'
  title?: string
  subtitle?: string
  height?: number
  showGrid?: boolean
  showLegend?: boolean
  showPrevious?: boolean
  color?: string
  previousColor?: string
  loading?: boolean
  emptyMessage?: string
}

export function Chart({
  data,
  type = 'area',
  title,
  subtitle,
  height = 300,
  showGrid = true,
  showLegend = false,
  showPrevious = false,
  color = '#3b82f6',
  previousColor = '#94a3b8',
  loading = false,
  emptyMessage = 'No data available',
}: ChartProps) {
  if (loading) {
    return (
      <Card variant="bordered" padding="md">
        {title && (
          <div className="mb-4">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-1 animate-pulse" />
            {subtitle && (
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse" />
            )}
          </div>
        )}
        <div
          className="bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
          style={{ height }}
        />
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card variant="bordered" padding="md">
        {title && (
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <div
          className="flex items-center justify-center text-muted-foreground"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      </Card>
    )
  }

  const commonProps = {
    data,
    margin: { top: 10, right: 10, left: 0, bottom: 0 },
  }

  const xAxisProps = {
    dataKey: 'label',
    tick: { fontSize: 12 },
    tickLine: false,
    axisLine: false,
    dy: 10,
  }

  const yAxisProps = {
    tick: { fontSize: 12 },
    tickLine: false,
    axisLine: false,
    tickFormatter: (value: number) =>
      value >= 1000000
        ? `${(value / 1000000).toFixed(1)}M`
        : value >= 1000
        ? `${(value / 1000).toFixed(0)}K`
        : String(value),
  }

  const tooltipProps = {
    contentStyle: {
      backgroundColor: 'var(--background)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      fontSize: '12px',
    },
    labelStyle: { fontWeight: 600, marginBottom: 4 },
    formatter: (value: number) => [value.toLocaleString(), ''],
  }

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            {showLegend && <Legend />}
            {showPrevious && (
              <Line
                type="monotone"
                dataKey="previousValue"
                name="Previous Period"
                stroke={previousColor}
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name="Current Period"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        )

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            {showLegend && <Legend />}
            {showPrevious && (
              <Bar
                dataKey="previousValue"
                name="Previous Period"
                fill={previousColor}
                radius={[4, 4, 0, 0]}
              />
            )}
            <Bar dataKey="value" name="Current Period" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        )

      case 'area':
      default:
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip {...tooltipProps} />
            {showLegend && <Legend />}
            {showPrevious && (
              <Area
                type="monotone"
                dataKey="previousValue"
                name="Previous Period"
                stroke={previousColor}
                fill={previousColor}
                fillOpacity={0.1}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              name="Current Period"
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        )
    }
  }

  return (
    <Card variant="bordered" padding="md" data-testid="chart">
      {title && (
        <div className="mb-4">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div
        style={{ height }}
        role="img"
        aria-label={title ? `${title} chart with ${data.length} data points` : `Chart with ${data.length} data points`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
