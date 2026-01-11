'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Dogfooding: Track the dashboard itself with Zero Trust Analytics
// Set NEXT_PUBLIC_ZTA_SITE_ID to your own site ID to enable

declare global {
  interface Window {
    ZTA?: {
      init: (siteId: string, options?: Record<string, unknown>) => void
      trackPageView: () => void
      trackEvent: (name: string, props?: Record<string, unknown>) => void
    }
  }
}

export function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Load and initialize ZTA script
  useEffect(() => {
    const siteId = process.env.NEXT_PUBLIC_ZTA_SITE_ID
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

    if (!siteId) {
      console.log('[ZTA] Self-analytics disabled (no NEXT_PUBLIC_ZTA_SITE_ID)')
      return
    }

    // Check if already loaded
    if (window.ZTA) {
      return
    }

    // Load the analytics script
    const script = document.createElement('script')
    script.src = `${apiUrl}/js/analytics.js`
    script.async = true
    script.defer = true

    script.onload = () => {
      if (window.ZTA) {
        window.ZTA.init(siteId, {
          apiUrl: `${apiUrl}/api/track`,
          debug: process.env.NODE_ENV === 'development'
        })
        console.log('[ZTA] Self-analytics initialized (dogfooding)')
      }
    }

    script.onerror = () => {
      console.warn('[ZTA] Failed to load analytics script')
    }

    document.head.appendChild(script)

    return () => {
      // Don't remove script on unmount to avoid reloading
    }
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (window.ZTA) {
      // Small delay to ensure ZTA is ready
      setTimeout(() => {
        window.ZTA?.trackPageView()
      }, 100)
    }
  }, [pathname, searchParams])

  return null
}

// Utility function to track custom events
export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (window.ZTA) {
    window.ZTA.trackEvent(name, props)
  }
}

// Track common dashboard events
export const DashboardEvents = {
  siteCreated: (siteId: string) => trackEvent('site_created', { siteId }),
  siteDeleted: (siteId: string) => trackEvent('site_deleted', { siteId }),
  planUpgraded: (plan: string) => trackEvent('plan_upgraded', { plan }),
  reportExported: (format: string) => trackEvent('report_exported', { format }),
  settingsChanged: (setting: string) => trackEvent('settings_changed', { setting }),
  apiKeyCreated: () => trackEvent('api_key_created'),
  teamMemberInvited: () => trackEvent('team_member_invited'),
}
