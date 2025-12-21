'use client'

import { useState, useEffect, useCallback } from 'react'

interface Site {
  id: string
  domain: string
  name: string
  pageviews: number
  visitors: number
  bounceRate?: number
  status?: 'active' | 'pending' | 'error'
}

interface UseSitesReturn {
  sites: Site[]
  loading: boolean
  error: string | null
  addSite: (domain: string, name?: string) => Promise<Site | null>
  deleteSite: (siteId: string) => Promise<boolean>
  updateSite: (siteId: string, data: { name?: string }) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useSites(): UseSitesReturn {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSites = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sites')
      if (!res.ok) {
        throw new Error('Failed to fetch sites')
      }
      const data = await res.json()
      setSites(data.sites || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sites')
      setSites([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const addSite = async (domain: string, name?: string): Promise<Site | null> => {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add site')
      }

      const data = await res.json()
      const newSite: Site = {
        ...data.site,
        pageviews: 0,
        visitors: 0,
        status: 'pending',
      }
      setSites((prev) => [...prev, newSite])
      return newSite
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add site')
      return null
    }
  }

  const deleteSite = async (siteId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete site')
      }

      setSites((prev) => prev.filter((site) => site.id !== siteId))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete site')
      return false
    }
  }

  const updateSite = async (
    siteId: string,
    data: { name?: string }
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const responseData = await res.json()
        throw new Error(responseData.error || 'Failed to update site')
      }

      setSites((prev) =>
        prev.map((site) =>
          site.id === siteId ? { ...site, ...data } : site
        )
      )
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update site')
      return false
    }
  }

  const refresh = async () => {
    await fetchSites()
  }

  return {
    sites,
    loading,
    error,
    addSite,
    deleteSite,
    updateSite,
    refresh,
  }
}
