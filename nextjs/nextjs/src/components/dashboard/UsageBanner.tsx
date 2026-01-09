'use client'

import Link from 'next/link'
import { useUsage } from './UsageContext'

export function UsageBanner() {
  const { usageData, loading, bannerDismissed, dismissBanner } = useUsage()

  // Don't show if loading, dismissed, or no data
  if (loading || !usageData) return null

  const { percentUsed, isWithinLimit } = usageData.usage
  const { name: planName } = usageData.plan

  // Determine which banner to show
  const showWarningBanner = percentUsed >= 80 && percentUsed < 100 && isWithinLimit
  const showLimitBanner = percentUsed >= 100 || !isWithinLimit

  // Warning banner can be dismissed, limit banner cannot
  if (showWarningBanner && bannerDismissed) return null
  if (!showWarningBanner && !showLimitBanner) return null

  const isWarning = showWarningBanner

  // Styling based on variant
  const styles = isWarning
    ? {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        border: 'border-yellow-200 dark:border-yellow-800',
        text: 'text-yellow-800 dark:text-yellow-200',
        icon: 'text-yellow-600 dark:text-yellow-400',
        buttonBg: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-500',
        dismissHover: 'hover:bg-yellow-100 dark:hover:bg-yellow-800/30'
      }
    : {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        text: 'text-red-800 dark:text-red-200',
        icon: 'text-red-600 dark:text-red-400',
        buttonBg: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500',
        dismissHover: ''
      }

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-lg p-4 mb-6`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {isWarning ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${styles.text}`}>
            {isWarning
              ? `You've used ${Math.round(percentUsed)}% of your monthly pageviews`
              : 'Monthly pageview limit exceeded'
            }
          </p>
          <p className={`text-sm ${styles.text} opacity-80 mt-1`}>
            {isWarning
              ? `Your ${planName} plan is approaching its limit. Upgrade to avoid interruption.`
              : `Your ${planName} plan limit has been reached. New pageviews are not being tracked.`
            }
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/dashboard/billing"
            className={`${styles.buttonBg} text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors`}
          >
            {isWarning ? 'Upgrade Plan' : 'Upgrade Now'}
          </Link>
          {isWarning && (
            <button
              onClick={dismissBanner}
              className={`p-1 rounded ${styles.dismissHover} ${styles.icon}`}
              aria-label="Dismiss banner"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
