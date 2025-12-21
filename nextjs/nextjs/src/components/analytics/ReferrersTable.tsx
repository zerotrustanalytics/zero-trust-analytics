'use client'

import { Card } from '@/components/ui'

interface ReferrerData {
  source: string
  visits: number
  bounceRate?: number
}

interface ReferrersTableProps {
  referrers: ReferrerData[]
  title?: string
  loading?: boolean
  maxItems?: number
  showPercentage?: boolean
}

export function ReferrersTable({
  referrers,
  title = 'Top Referrers',
  loading = false,
  maxItems = 10,
  showPercentage = true,
}: ReferrersTableProps) {
  const totalVisits = referrers.reduce((sum, ref) => sum + ref.visits, 0)
  const displayedReferrers = referrers.slice(0, maxItems)
  const maxVisits = Math.max(...referrers.map((r) => r.visits), 1)

  // Helper to get favicon URL
  const getFaviconUrl = (source: string): string | null => {
    if (source === 'Direct' || source === 'direct' || !source.includes('.')) {
      return null
    }
    try {
      const domain = source.replace(/^(https?:\/\/)?/, '').split('/')[0]
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    } catch {
      return null
    }
  }

  if (loading) {
    return (
      <Card variant="bordered" padding="md">
        <h3 className="font-semibold text-foreground mb-4">{title}</h3>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (referrers.length === 0) {
    return (
      <Card variant="bordered" padding="md">
        <h3 className="font-semibold text-foreground mb-4">{title}</h3>
        <p className="text-muted-foreground text-center py-8">No referrer data available</p>
      </Card>
    )
  }

  return (
    <Card variant="bordered" padding="md">
      <h3 className="font-semibold text-foreground mb-4">{title}</h3>
      <div className="space-y-3">
        {displayedReferrers.map((referrer, index) => {
          const percentage = totalVisits > 0 ? (referrer.visits / totalVisits) * 100 : 0
          const barWidth = (referrer.visits / maxVisits) * 100
          const favicon = getFaviconUrl(referrer.source)

          return (
            <div key={referrer.source}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground text-sm w-5">{index + 1}</span>
                  {favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favicon}
                      alt=""
                      width={16}
                      height={16}
                      className="flex-shrink-0"
                    />
                  ) : (
                    <svg
                      className="w-4 h-4 text-muted-foreground flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                  )}
                  <span className="text-sm truncate" title={referrer.source}>
                    {referrer.source}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium">{referrer.visits.toLocaleString()}</span>
                  {showPercentage && (
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {referrers.length > maxItems && (
        <p className="text-sm text-muted-foreground text-center mt-4">
          Showing {maxItems} of {referrers.length} referrers
        </p>
      )}
    </Card>
  )
}
