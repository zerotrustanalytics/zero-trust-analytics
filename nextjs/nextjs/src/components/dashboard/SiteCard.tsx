'use client'

import Link from 'next/link'
import { Card, Button } from '@/components/ui'
import { clsx } from 'clsx'

export interface Site {
  id: string
  domain: string
  name: string
  pageviews: number
  visitors: number
  bounceRate?: number
  status?: 'active' | 'pending' | 'error'
}

interface SiteCardProps {
  site: Site
  onViewAnalytics?: (siteId: string) => void
  onShowSnippet?: (siteId: string) => void
  onSettings?: (siteId: string) => void
}

export function SiteCard({
  site,
  onViewAnalytics,
  onShowSnippet,
  onSettings,
}: SiteCardProps) {
  const statusColors = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  }

  const statusLabels = {
    active: 'Active',
    pending: 'Pending',
    error: 'Error',
  }

  return (
    <Card
      variant="bordered"
      hover
      data-testid="site-card"
      className="group"
      role="article"
      aria-label={`Site: ${site.name}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{site.name}</h3>
          <p className="text-sm text-muted-foreground truncate">{site.domain}</p>
        </div>
        {site.status && (
          <span
            className={clsx(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              statusColors[site.status]
            )}
            role="status"
            aria-label={`Status: ${statusLabels[site.status]}`}
          >
            {statusLabels[site.status]}
          </span>
        )}
      </div>

      {/* Statistics with proper accessibility */}
      <dl className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <dt className="text-xs text-muted-foreground order-2">Pageviews</dt>
          <dd className="text-2xl font-bold text-foreground order-1">
            {site.pageviews.toLocaleString()}
          </dd>
        </div>
        <div className="text-center">
          <dt className="text-xs text-muted-foreground order-2">Visitors</dt>
          <dd className="text-2xl font-bold text-foreground order-1">
            {site.visitors.toLocaleString()}
          </dd>
        </div>
        {site.bounceRate !== undefined && (
          <div className="text-center">
            <dt className="text-xs text-muted-foreground order-2">Bounce</dt>
            <dd className="text-2xl font-bold text-foreground order-1">
              {site.bounceRate}%
            </dd>
          </div>
        )}
      </dl>

      <div className="flex gap-2 pt-4 border-t border-border">
        <Link
          href={`/dashboard/sites/${site.id}`}
          className="flex-1"
          onClick={(e) => {
            if (onViewAnalytics) {
              e.preventDefault()
              onViewAnalytics(site.id)
            }
          }}
        >
          <Button variant="outline" size="sm" fullWidth>
            View Analytics
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShowSnippet?.(site.id)}
          aria-label={`View tracking code for ${site.name}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span className="sr-only">View tracking code</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSettings?.(site.id)}
          aria-label={`Settings for ${site.name}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="sr-only">Settings</span>
        </Button>
      </div>
    </Card>
  )
}
