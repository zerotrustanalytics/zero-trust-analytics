'use client'

import { Card } from '@/components/ui'
import { clsx } from 'clsx'

interface PageData {
  path: string
  views: number
  uniqueViews?: number
  avgDuration?: number
  bounceRate?: number
}

interface TopPagesTableProps {
  pages: PageData[]
  title?: string
  loading?: boolean
  maxItems?: number
  showPercentage?: boolean
}

export function TopPagesTable({
  pages,
  title = 'Top Pages',
  loading = false,
  maxItems = 10,
  showPercentage = true,
}: TopPagesTableProps) {
  const totalViews = pages.reduce((sum, page) => sum + page.views, 0)
  const displayedPages = pages.slice(0, maxItems)
  const maxViews = Math.max(...pages.map((p) => p.views), 1)

  if (loading) {
    return (
      <Card variant="bordered" padding="md">
        <h3 className="font-semibold text-foreground mb-4">{title}</h3>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (pages.length === 0) {
    return (
      <Card variant="bordered" padding="md">
        <h3 className="font-semibold text-foreground mb-4">{title}</h3>
        <p className="text-muted-foreground text-center py-8">No page data available</p>
      </Card>
    )
  }

  return (
    <Card variant="bordered" padding="md">
      <h3 className="font-semibold text-foreground mb-4">{title}</h3>
      <div className="space-y-3">
        {displayedPages.map((page, index) => {
          const percentage = totalViews > 0 ? (page.views / totalViews) * 100 : 0
          const barWidth = (page.views / maxViews) * 100

          return (
            <div key={page.path}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground text-sm w-5">{index + 1}</span>
                  <span className="text-sm truncate" title={page.path}>
                    {page.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium">{page.views.toLocaleString()}</span>
                  {showPercentage && (
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div
                className="h-1 bg-secondary rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(barWidth)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${page.path}: ${percentage.toFixed(1)}% of total views`}
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {pages.length > maxItems && (
        <p className="text-sm text-muted-foreground text-center mt-4">
          Showing {maxItems} of {pages.length} pages
        </p>
      )}
    </Card>
  )
}
