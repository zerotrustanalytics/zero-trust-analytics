'use client'

import { Card } from '@/components/ui'
import { clsx } from 'clsx'

interface StatsCardProps {
  title: string
  value: string | number
  previousValue?: string | number
  format?: 'number' | 'percent' | 'duration' | 'currency'
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  loading?: boolean
}

export function StatsCard({
  title,
  value,
  previousValue,
  format = 'number',
  icon,
  trend,
  trendValue,
  loading,
}: StatsCardProps) {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val

    switch (format) {
      case 'number':
        return val.toLocaleString()
      case 'percent':
        return `${val.toFixed(1)}%`
      case 'duration':
        // Convert seconds to human readable
        if (val < 60) return `${Math.round(val)}s`
        if (val < 3600) return `${Math.floor(val / 60)}m ${Math.round(val % 60)}s`
        return `${Math.floor(val / 3600)}h ${Math.floor((val % 3600) / 60)}m`
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(val)
      default:
        return String(val)
    }
  }

  const calculateTrend = (): { direction: 'up' | 'down' | 'neutral'; percent: number } | null => {
    if (trend) return { direction: trend, percent: 0 }
    if (previousValue === undefined || typeof value !== 'number' || typeof previousValue !== 'number')
      return null

    if (previousValue === 0) {
      return value > 0 ? { direction: 'up', percent: 100 } : { direction: 'neutral', percent: 0 }
    }

    const change = ((value - previousValue) / previousValue) * 100
    if (Math.abs(change) < 0.1) return { direction: 'neutral', percent: 0 }
    return {
      direction: change > 0 ? 'up' : 'down',
      percent: Math.abs(change),
    }
  }

  const trendData = calculateTrend()

  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-500',
  }

  const trendIcons = {
    up: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
    down: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
    neutral: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    ),
  }

  if (loading) {
    return (
      <Card variant="bordered" padding="md">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </div>
      </Card>
    )
  }

  return (
    <Card variant="bordered" padding="md" data-testid="stats-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold text-foreground">{formatValue(value)}</p>
          {(trendData || trendValue) && (
            <div
              className={clsx(
                'flex items-center gap-1 mt-2 text-sm',
                trendData && trendColors[trendData.direction]
              )}
            >
              {trendData && trendIcons[trendData.direction]}
              <span>
                {trendValue || (trendData && `${trendData.percent.toFixed(1)}%`)}
              </span>
              {previousValue !== undefined && (
                <span className="text-muted-foreground">vs previous period</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
