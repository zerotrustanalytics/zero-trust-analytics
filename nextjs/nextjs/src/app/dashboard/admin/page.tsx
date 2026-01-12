'use client'

import { useState, useEffect } from 'react'
import { Button, Card } from '@/components/ui'

interface UsageOverview {
  date: string
  active_sites: number
  active_users: number
  total_pageviews: number
  total_api_reads: number
  total_api_writes: number
}

interface TopSite {
  site_id: string
  user_id: string
  total_pageviews: number
  total_api_reads: number
  avg_daily_pageviews: number
  active_days: number
}

interface CacheMetrics {
  hits: number
  misses: number
  total: number
  hitRate: number
  lastReset: string
}

interface StorageInfo {
  totalRows: number
  totalBytes: number
  totalBytesFormatted: string
  siteCount: number
}

interface AdminReport {
  summary: {
    totalPageviews: number
    totalApiReads: number
    avgDailyPageviews: number
    activeSites: number
    activeUsers: number
  }
  daily: UsageOverview[]
  topSites: TopSite[]
  storage: StorageInfo
  pilotCustomers: Array<{ userId: string; isPilot: boolean; notes: string }>
  highSupportCustomers: Array<{ userId: string; supportHoursMtd: number }>
  alerts: {
    overLimitSites: number
    highGrowthSites: number
    highSupportCount: number
  }
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<AdminReport | null>(null)
  const [cacheMetrics, setCacheMetrics] = useState<CacheMetrics | null>(null)
  const [days, setDays] = useState(30)

  // Tag customer state
  const [tagUserId, setTagUserId] = useState('')
  const [tagType, setTagType] = useState('pilot')
  const [tagNotes, setTagNotes] = useState('')

  // Support log state
  const [supportUserId, setSupportUserId] = useState('')
  const [supportMinutes, setSupportMinutes] = useState('')
  const [supportCategory, setSupportCategory] = useState('general')
  const [supportNotes, setSupportNotes] = useState('')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiUrl}/api/admin/usage/?days=${days}`, {
        headers: { 'X-Admin-Key': adminKey }
      })
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Invalid admin key' : 'Failed to fetch')
      }
      const data = await res.json()
      setReport(data)
      setAuthenticated(true)

      // Also fetch cache metrics
      const cacheRes = await fetch(`${apiUrl}/api/admin/usage/cache`, {
        headers: { 'X-Admin-Key': adminKey }
      })
      if (cacheRes.ok) {
        setCacheMetrics(await cacheRes.json())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleTagCustomer = async () => {
    if (!tagUserId) return
    try {
      const res = await fetch(`${apiUrl}/api/admin/usage/tag`, {
        method: 'POST',
        headers: {
          'X-Admin-Key': adminKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: tagUserId,
          isPilot: tagType === 'pilot',
          isInternal: tagType === 'internal',
          customerType: tagType,
          notes: tagNotes
        })
      })
      if (res.ok) {
        alert('Customer tagged successfully')
        setTagUserId('')
        setTagNotes('')
        fetchReport()
      }
    } catch (err) {
      alert('Failed to tag customer')
    }
  }

  const handleLogSupport = async () => {
    if (!supportUserId || !supportMinutes) return
    try {
      const res = await fetch(`${apiUrl}/api/admin/usage/support-log`, {
        method: 'POST',
        headers: {
          'X-Admin-Key': adminKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: supportUserId,
          durationMinutes: parseInt(supportMinutes),
          category: supportCategory,
          notes: supportNotes
        })
      })
      if (res.ok) {
        alert('Support time logged')
        setSupportUserId('')
        setSupportMinutes('')
        setSupportNotes('')
        fetchReport()
      }
    } catch (err) {
      alert('Failed to log support time')
    }
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card className="p-6">
          <h1 className="text-xl font-bold mb-4">Admin Access</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Enter your admin key to access usage metrics.
          </p>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin Key"
            className="w-full px-3 py-2 border rounded mb-4 bg-background"
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button onClick={fetchReport} disabled={loading || !adminKey} fullWidth>
            {loading ? 'Loading...' : 'Access Dashboard'}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Usage Dashboard</h1>
          <p className="text-muted-foreground">Internal metrics for pricing leverage</p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded bg-background"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button onClick={fetchReport} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {report?.alerts && (report.alerts.overLimitSites > 0 || report.alerts.highSupportCount > 0) && (
        <Card className="p-4 mb-6 bg-yellow-500/10 border-yellow-500">
          <h3 className="font-semibold text-yellow-600 mb-2">Alerts</h3>
          <ul className="text-sm space-y-1">
            {report.alerts.overLimitSites > 0 && (
              <li>{report.alerts.overLimitSites} sites over 200k pageviews/month</li>
            )}
            {report.alerts.highGrowthSites > 0 && (
              <li>{report.alerts.highGrowthSites} sites with &gt;5k avg daily pageviews</li>
            )}
            {report.alerts.highSupportCount > 0 && (
              <li>{report.alerts.highSupportCount} customers exceeded 2hr support threshold</li>
            )}
          </ul>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Pageviews</p>
          <p className="text-2xl font-bold">{report?.summary.totalPageviews.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Avg Daily</p>
          <p className="text-2xl font-bold">{report?.summary.avgDailyPageviews.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active Sites</p>
          <p className="text-2xl font-bold">{report?.summary.activeSites}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">API Reads</p>
          <p className="text-2xl font-bold">{report?.summary.totalApiReads.toLocaleString()}</p>
        </Card>
      </div>

      {/* Cache Metrics */}
      {cacheMetrics && (
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-3">Cache Performance</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Hit Rate</p>
              <p className="text-xl font-bold text-green-600">{cacheMetrics.hitRate}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Hits</p>
              <p className="text-lg font-semibold">{cacheMetrics.hits}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Misses</p>
              <p className="text-lg font-semibold">{cacheMetrics.misses}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Since</p>
              <p className="text-sm">{new Date(cacheMetrics.lastReset).toLocaleString()}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Storage */}
      {report?.storage && (
        <Card className="p-4 mb-6">
          <h3 className="font-semibold mb-3">Storage</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Size</p>
              <p className="text-xl font-bold">{report.storage.totalBytesFormatted}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Rows</p>
              <p className="text-lg font-semibold">{report.storage.totalRows.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sites</p>
              <p className="text-lg font-semibold">{report.storage.siteCount}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Top Sites */}
      <Card className="p-4 mb-6">
        <h3 className="font-semibold mb-3">Top Sites by Usage</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Site ID</th>
                <th className="text-left py-2">User ID</th>
                <th className="text-right py-2">Pageviews</th>
                <th className="text-right py-2">API Reads</th>
                <th className="text-right py-2">Avg/Day</th>
                <th className="text-right py-2">Active Days</th>
              </tr>
            </thead>
            <tbody>
              {report?.topSites.slice(0, 10).map((site, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 font-mono text-xs">{site.site_id.substring(0, 12)}...</td>
                  <td className="py-2 font-mono text-xs">{site.user_id.substring(0, 12)}...</td>
                  <td className="py-2 text-right font-semibold">{site.total_pageviews.toLocaleString()}</td>
                  <td className="py-2 text-right">{site.total_api_reads.toLocaleString()}</td>
                  <td className="py-2 text-right">{Math.round(site.avg_daily_pageviews).toLocaleString()}</td>
                  <td className="py-2 text-right">{site.active_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pilot Customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Pilot Customers ({report?.pilotCustomers.length || 0})</h3>
          {report?.pilotCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pilot customers tagged</p>
          ) : (
            <ul className="text-sm space-y-2">
              {report?.pilotCustomers.map((c, i) => (
                <li key={i} className="flex justify-between">
                  <span className="font-mono text-xs">{c.userId.substring(0, 16)}...</span>
                  <span className="text-muted-foreground">{c.notes || 'No notes'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">High Support Customers</h3>
          {report?.highSupportCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customers over 2hr/month</p>
          ) : (
            <ul className="text-sm space-y-2">
              {report?.highSupportCustomers.map((c, i) => (
                <li key={i} className="flex justify-between">
                  <span className="font-mono text-xs">{c.userId.substring(0, 16)}...</span>
                  <span className="text-red-600 font-semibold">{c.supportHoursMtd.toFixed(1)}h MTD</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Tag Customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Tag Customer</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={tagUserId}
              onChange={(e) => setTagUserId(e.target.value)}
              placeholder="User ID"
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            />
            <select
              value={tagType}
              onChange={(e) => setTagType(e.target.value)}
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            >
              <option value="pilot">Pilot Customer</option>
              <option value="internal">Internal</option>
              <option value="enterprise">Enterprise</option>
              <option value="high_touch">High Touch</option>
            </select>
            <input
              type="text"
              value={tagNotes}
              onChange={(e) => setTagNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            />
            <Button onClick={handleTagCustomer} disabled={!tagUserId}>
              Tag Customer
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Log Support Time</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={supportUserId}
              onChange={(e) => setSupportUserId(e.target.value)}
              placeholder="User ID"
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            />
            <input
              type="number"
              value={supportMinutes}
              onChange={(e) => setSupportMinutes(e.target.value)}
              placeholder="Minutes spent"
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            />
            <select
              value={supportCategory}
              onChange={(e) => setSupportCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            >
              <option value="general">General</option>
              <option value="bug">Bug Report</option>
              <option value="setup">Setup Help</option>
              <option value="feature">Feature Request</option>
              <option value="billing">Billing</option>
            </select>
            <input
              type="text"
              value={supportNotes}
              onChange={(e) => setSupportNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full px-3 py-2 border rounded bg-background text-sm"
            />
            <Button onClick={handleLogSupport} disabled={!supportUserId || !supportMinutes}>
              Log Support Time
            </Button>
          </div>
        </Card>
      </div>

      {/* Efficiency Rule Reminder */}
      <Card className="p-4 mt-6 bg-blue-500/10 border-blue-500">
        <h3 className="font-semibold text-blue-600 mb-2">Your Efficiency Rule</h3>
        <p className="text-sm">
          &quot;If support exceeds <strong>2 hours/month</strong> for any customer, pricing changes.&quot;
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          For a solo dev with a day job, this is critical. Track support time religiously.
        </p>
      </Card>
    </div>
  )
}
