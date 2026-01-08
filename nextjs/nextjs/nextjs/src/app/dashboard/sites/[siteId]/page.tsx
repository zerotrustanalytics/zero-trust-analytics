'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'

interface Stats {
  pageviews: number
  visitors: number
  bounceRate: number
  avgSessionDuration: number
  topPages: { path: string; views: number }[]
  topReferrers: { referrer: string; visits: number }[]
  dailyStats: { date: string; pageviews: number; visitors: number }[]
}

interface Site {
  id: string
  domain: string
  name?: string
}

export default function SiteDetailsPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { getToken } = useAuth()

  const [site, setSite] = useState<Site | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('7d')
  const [copiedCode, setCopiedCode] = useState(false)

  const fetchSiteAndStats = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Fetch site info and stats in parallel
      const [siteRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/api/sites/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/stats?siteId=${siteId}&period=${period}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ])

      const siteData = await siteRes.json()
      const statsData = await statsRes.json()

      if (!siteRes.ok) {
        setError(siteData.error || 'Failed to fetch site')
        return
      }

      // Find the specific site
      const foundSite = siteData.sites?.find((s: Site) => s.id === siteId)
      if (!foundSite) {
        setError('Site not found')
        return
      }

      setSite(foundSite)

      if (statsRes.ok) {
        setStats(statsData)
      }
    } catch {
      setError('Failed to load site data')
    } finally {
      setLoading(false)
    }
  }, [getToken, siteId, period])

  useEffect(() => {
    fetchSiteAndStats()
  }, [fetchSiteAndStats])

  const copyTrackingCode = () => {
    const code = `<script src="https://ztas.io/js/analytics.js" data-site-id="${siteId}"></script>`
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 max-w-md mx-auto">
          {error}
        </div>
        <Link
          href="/dashboard/sites"
          className="text-primary hover:underline"
        >
          Back to Sites
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/sites" className="hover:text-primary">
              Sites
            </Link>
            <span>/</span>
            <span>{site?.domain}</span>
          </div>
          <h1 className="text-2xl font-bold">{site?.name || site?.domain}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>

          <button
            onClick={copyTrackingCode}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            {copiedCode ? 'Copied!' : 'Copy Tracking Code'}
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-sm text-muted-foreground mb-1">Pageviews</div>
          <div className="text-3xl font-bold">{stats?.pageviews?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-sm text-muted-foreground mb-1">Visitors</div>
          <div className="text-3xl font-bold">{stats?.visitors?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-sm text-muted-foreground mb-1">Bounce Rate</div>
          <div className="text-3xl font-bold">{stats?.bounceRate ? `${stats.bounceRate}%` : '0%'}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-sm text-muted-foreground mb-1">Avg. Duration</div>
          <div className="text-3xl font-bold">
            {stats?.avgSessionDuration
              ? `${Math.floor(stats.avgSessionDuration / 60)}m ${stats.avgSessionDuration % 60}s`
              : '0s'
            }
          </div>
        </div>
      </div>

      {/* Top Pages and Referrers */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4">Top Pages</h2>
          {stats?.topPages && stats.topPages.length > 0 ? (
            <div className="space-y-3">
              {stats.topPages.slice(0, 10).map((page, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm truncate flex-1 mr-4">{page.path}</span>
                  <span className="text-sm font-medium">{page.views.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data yet</p>
          )}
        </div>

        {/* Top Referrers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4">Top Referrers</h2>
          {stats?.topReferrers && stats.topReferrers.length > 0 ? (
            <div className="space-y-3">
              {stats.topReferrers.slice(0, 10).map((ref, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm truncate flex-1 mr-4">
                    {ref.referrer || 'Direct'}
                  </span>
                  <span className="text-sm font-medium">{ref.visits.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data yet</p>
          )}
        </div>
      </div>

      {/* Tracking Code Section */}
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Tracking Code</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add this script to your website to start tracking analytics:
        </p>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-green-400">
            {`<script src="https://ztas.io/js/analytics.js" data-site-id="${siteId}"></script>`}
          </code>
        </div>
        <button
          onClick={copyTrackingCode}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          {copiedCode ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}
