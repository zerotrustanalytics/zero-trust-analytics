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
export function useSiteEvents(siteId: string, period: EventsPeriod): State {
  const { getToken } = useAuth()
  const { setActiveSite } = useSiteContext()
  // Results remember what they're for, so a change of site or period shows as loading.
  const request = `${siteId}|${period}`
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
        const res = await fetch(`${apiUrl}/api/events?siteId=${encodeURIComponent(siteId)}&period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 403) return setResult({ request, data: null, error: '', locked: true })
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
  }, [getToken, siteId, period, request])

  if (result?.request !== request) return { data: null, loading: true, error: '', locked: false }
  return { data: result.data, loading: false, error: result.error, locked: result.locked }
}
