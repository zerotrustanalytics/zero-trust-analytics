'use client'

import { useState, useEffect, useCallback, JSX } from 'react'
import { useParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'

interface PublicStats {
  site: {
    domain: string
    nickname?: string
  }
  period: string
  allowedPeriods?: string[]
  uniqueVisitors: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  pages: Record<string, number>
  referrers: Record<string, number>
  devices: Record<string, number>
  browsers: Record<string, number>
  countries: Record<string, number>
  daily: Array<{ date: string; pageviews: number; unique_visitors: number }>
}

const PERIOD_OPTIONS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '12 months' },
]

// Country flag emoji helper
function countryToEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍'
  const offset = 127397
  const emoji = String.fromCodePoint(
    ...countryCode.toUpperCase().split('').map(char => char.charCodeAt(0) + offset)
  )
  return emoji
}

// Format duration from seconds
function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

// Source icons mapping
const SOURCE_ICONS: Record<string, JSX.Element> = {
  'google': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  ),
  'direct': (
    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
}

export default function SharedDashboardPage() {
  const params = useParams()
  const token = params.token as string

  const [stats, setStats] = useState<PublicStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('7d')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/public/stats?token=${token}&period=${period}`)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load dashboard')
      }

      const data = await res.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [token, period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Chart data
  const chartData = stats?.daily?.map(d => ({
    date: d.date,
    visitors: d.unique_visitors,
    pageviews: d.pageviews,
    label: format(parseISO(d.date), 'MMM d')
  })) || []

  // Convert objects to arrays for tables
  const pagesData = stats?.pages
    ? Object.entries(stats.pages)
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
    : []

  const referrersData = stats?.referrers
    ? Object.entries(stats.referrers)
        .map(([name, views]) => ({ name: name || 'Direct', views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
    : []

  const devicesData = stats?.devices
    ? Object.entries(stats.devices)
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
    : []

  const browsersData = stats?.browsers
    ? Object.entries(stats.browsers)
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
    : []

  const countriesData = stats?.countries
    ? Object.entries(stats.countries)
        .map(([name, views]) => ({ name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
    : []

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error === 'Invalid or expired share link' ? 'Link Expired' : 'Access Denied'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {error === 'Invalid or expired share link'
              ? 'This share link has expired or is no longer valid.'
              : error}
          </p>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const allowedPeriods = stats.allowedPeriods || PERIOD_OPTIONS.map(p => p.value)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.site.nickname || stats.site.domain}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Analytics Dashboard
            </p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              {PERIOD_OPTIONS.filter(p => allowedPeriods.includes(p.value)).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">Unique Visitors</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.uniqueVisitors.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">Page Views</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.pageviews.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">Bounce Rate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.bounceRate}%
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">Avg. Session</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatDuration(stats.avgSessionDuration)}
            </p>
          </div>
        </div>

        {/* Traffic Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Traffic Overview</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="visitors"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  name="Visitors"
                />
                <Line
                  type="monotone"
                  dataKey="pageviews"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  name="Page Views"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Visitors</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Page Views</span>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Pages */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Pages</h2>
            <div className="space-y-3">
              {pagesData.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
              ) : (
                pagesData.map((page, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 mr-4">
                      {page.name}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {page.views.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Referrers */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Sources</h2>
            <div className="space-y-3">
              {referrersData.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
              ) : (
                referrersData.map((ref, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      {SOURCE_ICONS[ref.name.toLowerCase()] || SOURCE_ICONS['direct']}
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {ref.name}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {ref.views.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Countries */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Countries</h2>
            <div className="space-y-3">
              {countriesData.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
              ) : (
                countriesData.map((country, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <span className="text-lg">{countryToEmoji(country.name)}</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {country.name}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {country.views.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Devices & Browsers */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Devices & Browsers</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Devices</p>
                <div className="space-y-2">
                  {devicesData.map((device, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {device.name}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {device.views.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Browsers</p>
                <div className="space-y-2">
                  {browsersData.map((browser, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {browser.name}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {browser.views.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
          Powered by <a href="https://ztas.io" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Zero Trust Analytics</a>
        </div>
      </div>
    </div>
  )
}
