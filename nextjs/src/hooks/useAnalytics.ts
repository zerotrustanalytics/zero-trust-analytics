'use client'

import { useState, useEffect, useCallback } from 'react'

interface AnalyticsData {
  uniqueVisitors: number
  pageviews: number
  bounceRate: number
  avgDuration: number
  pages: Array<{ path: string; views: number }>
  referrers: Array<{ source: string; visits: number }>
  devices: Array<{ type: string; count: number }>
  browsers: Array<{ name: string; count: number }>
  countries: Array<{ code: string; count: number }>
  daily: Array<{ date: string; visitors: number; pageviews: number }>
}

interface UseAnalyticsOptions {
  siteId: string
  period?: string
  autoFetch?: boolean
}

interface UseAnalyticsReturn {
  data: AnalyticsData | null
  loading: boolean
  error: string | null
  period: string
  setPeriod: (period: string) => void
  refresh: () => Promise<void>
}

const defaultData: AnalyticsData = {
  uniqueVisitors: 0,
  pageviews: 0,
  bounceRate: 0,
  avgDuration: 0,
  pages: [],
  referrers: [],
  devices: [],
  browsers: [],
  countries: [],
  daily: [],
}

export function useAnalytics({
  siteId,
  period: initialPeriod = '7d',
  autoFetch = true,
}: UseAnalyticsOptions): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(initialPeriod)

  const fetchAnalytics = useCallback(async () => {
    if (!siteId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/sites/${siteId}/stats?period=${period}`)

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Site not found')
        }
        if (res.status === 403) {
          throw new Error('Access denied')
        }
        throw new Error('Failed to fetch analytics')
      }

      const responseData = await res.json()
      setData(responseData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
      setData(defaultData)
    } finally {
      setLoading(false)
    }
  }, [siteId, period])

  useEffect(() => {
    if (autoFetch) {
      fetchAnalytics()
    }
  }, [fetchAnalytics, autoFetch])

  const refresh = async () => {
    await fetchAnalytics()
  }

  return {
    data,
    loading,
    error,
    period,
    setPeriod,
    refresh,
  }
}
