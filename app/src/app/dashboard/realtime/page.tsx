'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Card } from '@/components/ui'

interface Site {
  id: string
  domain: string
  name?: string
}

interface RealtimeData {
  activeVisitors: number
  last30Minutes: number
  today: number
  visitors: {
    id: string
    page: string
    referrer: string
    country: string
    device: string
    timestamp: string
  }[]
}

export default function RealtimePage() {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  const [data, setData] = useState<RealtimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const result = await res.json()
      if (res.ok && result.sites) {
        setSites(result.sites)
        if (result.sites.length > 0 && !selectedSiteId) {
          setSelectedSiteId(result.sites[0].id)
        } else if (result.sites.length === 0) {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch {
      console.error('Failed to fetch sites')
      setLoading(false)
    }
  }, [getToken, selectedSiteId])

  const fetchRealtimeData = useCallback(async () => {
    if (!selectedSiteId) {
      setLoading(false)
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/realtime?siteId=${selectedSiteId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!res.ok) {
        const result = await res.json()
        setError(result.error || 'Failed to fetch realtime data')
        setData(null)
        return
      }

      const result = await res.json()
      setData(result)
      setError('')
    } catch {
      setError('Failed to load realtime data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [getToken, selectedSiteId])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  useEffect(() => {
    if (selectedSiteId) {
      setLoading(true)
      fetchRealtimeData()

      // Refresh every 30 seconds
      const interval = setInterval(fetchRealtimeData, 30000)
      return () => clearInterval(interval)
    }
  }, [selectedSiteId, fetchRealtimeData])

  const getTimeAgo = (timestamp: string) => {
    // Parse timestamp as UTC (database stores in UTC format without 'Z')
    const utcTimestamp = timestamp.includes('Z') || timestamp.includes('+')
      ? timestamp
      : timestamp.replace(' ', 'T') + 'Z'
    const seconds = Math.floor((Date.now() - new Date(utcTimestamp).getTime()) / 1000)

    if (seconds < 0) return 'just now' // Handle any edge cases
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  if (loading && sites.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Real-time Analytics</h1>
        <p className="text-muted-foreground">Live visitor activity on your sites</p>
      </div>

      {/* Site Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Site</label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="">Select a site...</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name || site.domain}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {sites.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <h3 className="font-medium mb-2">No sites yet</h3>
          <p className="text-muted-foreground">Add a site to view real-time analytics.</p>
        </Card>
      ) : !selectedSiteId ? (
        <Card className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="font-medium mb-2">Select a site</h3>
          <p className="text-muted-foreground">Choose a site above to view real-time analytics.</p>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Active Visitors Counter */}
          <Card className="p-8 mb-8 text-center bg-gradient-to-br from-primary/10 to-primary/5">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-600">Live</span>
            </div>
            <p className="text-6xl font-bold text-primary">{data?.activeVisitors || 0}</p>
            <p className="text-muted-foreground mt-2">Active visitors right now</p>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{data?.last30Minutes || 0}</p>
              <p className="text-sm text-muted-foreground">Last 30 minutes</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{data?.today || 0}</p>
              <p className="text-sm text-muted-foreground">Today</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{data?.visitors?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Recent visitors</p>
            </Card>
          </div>

          {/* Live Feed */}
          <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold">Live Activity Feed</h2>
            </div>
            {!data?.visitors || data.visitors.length === 0 ? (
              <div className="p-8 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="font-medium mb-2">No recent visitors</h3>
                <p className="text-muted-foreground">Visitor activity will appear here in real-time.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.visitors.map((visitor) => (
                  <div key={visitor.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs">{visitor.country || '?'}</span>
                      </div>
                      <div>
                        <p className="font-medium">{visitor.page}</p>
                        <p className="text-sm text-muted-foreground">
                          {visitor.referrer ? `from ${visitor.referrer}` : 'Direct'} {visitor.device && `• ${visitor.device}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{getTimeAgo(visitor.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
