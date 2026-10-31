'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Dogfooding: Track the dashboard itself with Zero Trust Analytics
// Set NEXT_PUBLIC_ZTA_SITE_ID to your own site ID to enable

declare global {
  interface Window {
    ZTA?: {
      init: (siteId: string, options?: Record<string, unknown>) => void
      trackPageView: () => void
      track: (name: string, props?: { label?: string; value?: number }) => void
    }
  }
}

// The tracker script is served by the marketing site; events go to the API.
const SCRIPT_URL = 'https://ztas.io/js/analytics.js'

export function Analytics() {
  const pathname = usePathname()
  const lastTracked = useRef<string | null>(null)

  // Load and initialize ZTA script
  useEffect(() => {
    const siteId = process.env.NEXT_PUBLIC_ZTA_SITE_ID

    if (!siteId) {
      return
    }

    // Check if already loaded
    if (window.ZTA) {
      return
    }

    // Load the analytics script. No data-site-id attribute, so it doesn't
    // auto-init; we init here with SPA tracking handled by this component.
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true

    script.onload = () => {
      if (window.ZTA) {
        lastTracked.current = window.location.pathname
        window.ZTA.init(siteId, {
          // Same-origin API in self-host; explicit origin otherwise.
          endpoint: `${process.env.NEXT_PUBLIC_API_URL || window.location.origin}/api/track`,
          debug: process.env.NODE_ENV === 'development'
        })
      }
    }

    script.onerror = () => {
      console.warn('[ZTA] Failed to load analytics script')
    }

    document.head.appendChild(script)
  }, [])

  // Track a page view per route change (pathname only — query-string updates
  // are not new pages). init() tracks the first page itself.
  useEffect(() => {
    if (!window.ZTA || lastTracked.current === pathname) return
    lastTracked.current = pathname
    window.ZTA.trackPageView()
  }, [pathname])

  return null
}

// Utility function to track custom events. Only `label` and `value` are
// recorded by the tracker; anything else is dropped.
export function trackEvent(name: string, props?: { label?: string; value?: number }) {
  if (window.ZTA) {
    window.ZTA.track(name, props)
  }
}

// Track common dashboard events
export const DashboardEvents = {
  siteCreated: (siteId: string) => trackEvent('site_created', { label: siteId }),
  siteDeleted: (siteId: string) => trackEvent('site_deleted', { label: siteId }),
  planUpgraded: (plan: string) => trackEvent('plan_upgraded', { label: plan }),
  reportExported: (format: string) => trackEvent('report_exported', { label: format }),
  settingsChanged: (setting: string) => trackEvent('settings_changed', { label: setting }),
  apiKeyCreated: () => trackEvent('api_key_created'),
  teamMemberInvited: () => trackEvent('team_member_invited'),
}
