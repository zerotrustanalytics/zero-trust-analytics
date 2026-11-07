'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/gatekeep-auth'
import { useSiteContext } from '@/components/dashboard/SiteContext'
import type { SiteEvents } from './site-events'

export type EventsPeriod = '7d' | '30d' | '90d'

interface Result {
  data: SiteEvents | null
  error: string
  /** The plan doesn't include custom events. */
  locked: boolean
}

interface State extends Result {
  loading: boolean
}

/** Loads /api/events for a site, and registers the site with the sidebar. */
export function useSiteEvents(siteId: string, period: EventsPeriod, prefix = ''): State {
  const { getToken } = useAuth()
  const { setActiveSite } = useSiteContext()
  // Results remember what they're for, so a change of site or period shows as loading.
  const request = `${siteId}|${period}|${prefix}`
  const [result, setResult] = useState<(Result & { request: string }) | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        if (!token || cancelled) return
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
        const res = await fetch(`${apiUrl}/api/sites/list`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok && !cancelled) {
          const data = await res.json()
          const site = data.sites?.find((s: { id: string }) => s.id === siteId)
          if (site) setActiveSite({ id: site.id, name: site.name, domain: site.domain })
        }
      } catch {
        // The sidebar's site name is a nicety; the report doesn't depend on it.
      }
    })()
    return () => {
      cancelled = true
      setActiveSite(null)
    }
  }, [getToken, siteId, setActiveSite])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
        const query = `siteId=${encodeURIComponent(siteId)}&period=${period}${prefix ? `&prefix=${prefix}` : ''}`
        const res = await fetch(`${apiUrl}/api/events?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 403) {
          const body = await res.json().catch(() => null)
          if (cancelled) return
          return body?.code === 'PLAN_REQUIRED'
            ? setResult({ request, data: null, error: '', locked: true })
            : setResult({ request, data: null, error: 'You don’t have access to this site.', locked: false })
        }
        if (!res.ok) throw new Error()
        const data: SiteEvents = await res.json()
        if (!cancelled) setResult({ request, data, error: '', locked: false })
      } catch {
        if (!cancelled) setResult({ request, data: null, error: 'Couldn’t load events. Please try again.', locked: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken, siteId, period, prefix, request])

  if (result?.request !== request) return { data: null, loading: true, error: '', locked: false }
  return { data: result.data, loading: false, error: result.error, locked: result.locked }
}
