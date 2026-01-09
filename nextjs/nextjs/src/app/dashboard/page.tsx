'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { format, parseISO, subDays } from 'date-fns'

interface Site {
  id: string
  domain: string
  name?: string
}

interface SiteStats {
  siteId: string
  domain: string
  name?: string
  summary: {
    pageviews: number
    unique_visitors: number
    sessions: number
    bounce_rate: number
    avg_duration: number
  }
  daily: { date: string; pageviews: number; unique_visitors: number }[]
  realtime?: {
    active_visitors: number
  }
}

interface AggregateStats {
  totalPageviews: number
  totalVisitors: number
  totalSessions: number
  avgBounceRate: number
  avgDuration: number
  totalCurrentVisitors: number
}

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [siteStats, setSiteStats] = useState<SiteStats[]>([])
  const [aggregate, setAggregate] = useState<AggregateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('7d')
  const [chartMode, setChartMode] = useState<'combined' | 'perSite'>('combined')

  const getPeriodDays = (p: string) => {
    switch (p) {
      case '24h': return 1
      case '7d': return 7
      case '30d': return 30
      default: return 7
    }
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Fetch sites
      const sitesRes = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!sitesRes.ok) {
        setError('Failed to load sites')
        setLoading(false)
        return
      }

      const sitesData = await sitesRes.json()
      const fetchedSites = sitesData.sites || []
      setSites(fetchedSites)

      if (fetchedSites.length === 0) {
        setLoading(false)
        return
      }

      // Fetch stats for each site in parallel
      const statsPromises = fetchedSites.map(async (site: Site) => {
        try {
          const [statsRes, realtimeRes] = await Promise.all([
            fetch(`${apiUrl}/api/stats?siteId=${site.id}&period=${period}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            }),
            fetch(`${apiUrl}/api/realtime?siteId=${site.id}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
          ])

          const statsData = statsRes.ok ? await statsRes.json() : null
          const realtimeData = realtimeRes.ok ? await realtimeRes.json() : null

          return {
            siteId: site.id,
            domain: site.domain,
            name: site.name,
            summary: statsData?.summary || {
              pageviews: 0,
              unique_visitors: 0,
              sessions: 0,
              bounce_rate: 0,
              avg_duration: 0
            },
            daily: statsData?.daily || [],
            realtime: realtimeData
          } as SiteStats
        } catch {
          return {
            siteId: site.id,
            domain: site.domain,
            name: site.name,
            summary: { pageviews: 0, unique_visitors: 0, sessions: 0, bounce_rate: 0, avg_duration: 0 },
            daily: [],
            realtime: undefined
          } as SiteStats
        }
      })

      const allStats = await Promise.all(statsPromises)
      setSiteStats(allStats)

      // Calculate aggregate stats
      const agg: AggregateStats = {
        totalPageviews: allStats.reduce((sum, s) => sum + (s.summary?.pageviews || 0), 0),
        totalVisitors: allStats.reduce((sum, s) => sum + (s.summary?.unique_visitors || 0), 0),
        totalSessions: allStats.reduce((sum, s) => sum + (s.summary?.sessions || 0), 0),
        avgBounceRate: allStats.length > 0
          ? allStats.reduce((sum, s) => sum + (s.summary?.bounce_rate || 0), 0) / allStats.length
          : 0,
        avgDuration: allStats.length > 0
          ? allStats.reduce((sum, s) => sum + (s.summary?.avg_duration || 0), 0) / allStats.length
          : 0,
        totalCurrentVisitors: allStats.reduce((sum, s) => sum + (s.realtime?.active_visitors || 0), 0)
      }
      setAggregate(agg)

    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [getToken, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Aggregate daily data across all sites
  const aggregateDailyData = () => {
    const dateMap = new Map<string, { visitors: number; pageviews: number }>()

    siteStats.forEach(site => {
      site.daily?.forEach(day => {
        const existing = dateMap.get(day.date) || { visitors: 0, pageviews: 0 }
        dateMap.set(day.date, {
          visitors: existing.visitors + (day.unique_visitors || 0),
          pageviews: existing.pageviews + (day.pageviews || 0)
        })
      })
    })

    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        formattedDate: format(new Date(date + 'T12:00:00'), 'MMM d'), // Use noon to avoid timezone date shifts
        ...data
      }))
  }

  const chartData = aggregateDailyData()

  // Generate per-site chart data (each site as separate line)
  const getPerSiteChartData = () => {
    // Get all unique dates
    const allDates = new Set<string>()
    siteStats.forEach(site => {
      site.daily?.forEach(day => allDates.add(day.date))
    })

    // Sort dates
    const sortedDates = Array.from(allDates).sort()

    // Build data array with each date having values for each site
    return sortedDates.map(date => {
      const dataPoint: Record<string, string | number> = {
        date,
        formattedDate: format(new Date(date + 'T12:00:00'), 'MMM d') // Use noon to avoid timezone date shifts
      }

      siteStats.forEach(site => {
        const dayData = site.daily?.find(d => d.date === date)
        const siteName = site.name || site.domain
        dataPoint[siteName] = dayData?.unique_visitors || 0
      })

      return dataPoint
    })
  }

  const perSiteChartData = getPerSiteChartData()

  // Colors for per-site lines
  const siteColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

  // Format duration
  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds === 0) return '0s'
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (minutes === 0) return `${secs}s`
    return `${minutes}m ${secs}s`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview across all your sites</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Current Visitors Badge */}
      {aggregate && aggregate.totalCurrentVisitors > 0 && (
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium">
            <span className="text-green-600 dark:text-green-400">{aggregate.totalCurrentVisitors}</span>
            {' '}current visitor{aggregate.totalCurrentVisitors !== 1 ? 's' : ''} across all sites
          </span>
        </div>
      )}

      {/* Aggregate Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Sites</p>
          <p className="text-2xl font-bold">{sites.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Visitors</p>
          <p className="text-2xl font-bold">{aggregate?.totalVisitors?.toLocaleString() || '0'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Page Views</p>
          <p className="text-2xl font-bold">{aggregate?.totalPageviews?.toLocaleString() || '0'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Sessions</p>
          <p className="text-2xl font-bold">{aggregate?.totalSessions?.toLocaleString() || '0'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg. Bounce Rate</p>
          <p className="text-2xl font-bold">{aggregate?.avgBounceRate?.toFixed(1) || '0'}%</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg. Duration</p>
          <p className="text-2xl font-bold">{formatDuration(aggregate?.avgDuration || 0)}</p>
        </div>
      </div>

      {/* Traffic Chart with Toggle */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold">
              {chartMode === 'combined' ? 'Combined Traffic Overview' : 'Traffic by Site'}
            </h2>
            {sites.length > 1 && (
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setChartMode('combined')}
                  className={`px-3 py-1 text-xs rounded-md transition ${
                    chartMode === 'combined'
                      ? 'bg-white dark:bg-gray-600 shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Combined
                </button>
                <button
                  onClick={() => setChartMode('perSite')}
                  className={`px-3 py-1 text-xs rounded-md transition ${
                    chartMode === 'perSite'
                      ? 'bg-white dark:bg-gray-600 shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Per Site
                </button>
              </div>
            )}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'combined' ? (
                <LineChart data={chartData}>
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dx={-10} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F9FAFB' }}
                  />
                  <Line type="monotone" dataKey="visitors" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} name="Visitors" />
                  <Line type="monotone" dataKey="pageviews" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} name="Page Views" />
                </LineChart>
              ) : (
                <LineChart data={perSiteChartData}>
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dx={-10} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F9FAFB' }}
                  />
                  {siteStats.map((site, index) => (
                    <Line
                      key={site.siteId}
                      type="monotone"
                      dataKey={site.name || site.domain}
                      stroke={siteColors[index % siteColors.length]}
                      strokeWidth={2}
                      dot={{ fill: siteColors[index % siteColors.length], r: 3 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          {/* Legend for per-site view */}
          {chartMode === 'perSite' && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              {siteStats.map((site, index) => (
                <div key={site.siteId} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: siteColors[index % siteColors.length] }}
                  ></span>
                  <span className="text-muted-foreground">{site.name || site.domain}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sites Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="font-semibold">Sites Performance</h2>
          <Link href="/dashboard/sites" className="text-sm text-primary hover:underline">
            Manage Sites
          </Link>
        </div>

        {sites.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <h3 className="font-medium mb-2">No sites yet</h3>
            <p className="text-muted-foreground mb-4">Add your first website to start tracking analytics.</p>
            <Link
              href="/dashboard/sites"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              Add Your First Site
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Visitors</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Page Views</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Bounce</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Avg. Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {siteStats.map((site) => (
                  <tr key={site.siteId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{site.name || site.domain}</p>
                        <p className="text-xs text-muted-foreground">{site.domain}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {site.realtime?.active_visitors ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                          {site.realtime.active_visitors}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {(site.summary?.unique_visitors || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(site.summary?.pageviews || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {site.summary?.bounce_rate?.toFixed(1) || '0'}%
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatDuration(site.summary?.avg_duration || 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/sites/${site.siteId}`}
                        className="text-primary hover:underline text-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-site Mini Charts */}
      {siteStats.length > 0 && siteStats.length <= 6 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {siteStats.map((site) => {
            const siteChartData = site.daily?.slice().reverse().map(d => ({
              date: d.date,
              visitors: d.unique_visitors || 0
            })) || []

            return (
              <Link
                key={site.siteId}
                href={`/dashboard/sites/${site.siteId}`}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-medium text-sm">{site.name || site.domain}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <span className="relative flex h-2 w-2">
                        <span className={`${site.realtime?.active_visitors ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75`}></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className={site.realtime?.active_visitors ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                        {site.realtime?.active_visitors || 0}
                      </span>
                      <span>current visitors</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{(site.summary?.unique_visitors || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">visitors</p>
                  </div>
                </div>
                {siteChartData.length > 0 && (
                  <div className="h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={siteChartData}>
                        <Bar dataKey="visitors" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/dashboard/sites"
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <span className="font-medium">Manage Sites</span>
          </div>
        </Link>

        <Link
          href="/dashboard/realtime"
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-medium">Real-time</span>
          </div>
        </Link>

        <Link
          href="/dashboard/annotations"
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <span className="font-medium">Annotations</span>
          </div>
        </Link>

        <Link
          href="/dashboard/settings"
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-medium">Settings</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
