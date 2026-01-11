'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import Link from 'next/link'

interface Site {
  id: string
  domain: string
  name?: string
}

interface EmailReport {
  id: string
  siteId: string
  siteName: string
  frequency: 'daily' | 'weekly' | 'monthly'
  recipients: string[]
  enabled: boolean
  lastSent?: string
  nextSend?: string
  createdAt: string
}

interface PreviewStats {
  visitors: number
  pageviews: number
  bounceRate: number
  visitorsChange: number
  pageviewsChange: number
  bounceRateChange: number
  dateRange: string
  loading: boolean
}

export default function ReportsPage() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [sites, setSites] = useState<Site[]>([])
  const [reports, setReports] = useState<EmailReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [previewStats, setPreviewStats] = useState<PreviewStats>({
    visitors: 0,
    pageviews: 0,
    bounceRate: 0,
    visitorsChange: 0,
    pageviewsChange: 0,
    bounceRateChange: 0,
    dateRange: '',
    loading: true
  })

  // Form state
  const [newReport, setNewReport] = useState({
    siteId: '',
    frequency: 'weekly' as EmailReport['frequency'],
    recipients: ''
  })

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Fetch sites
      const sitesRes = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (sitesRes.ok) {
        const data = await sitesRes.json()
        setSites(data.sites || [])
        if (data.sites?.length > 0 && !newReport.siteId) {
          setNewReport(prev => ({ ...prev, siteId: data.sites[0].id }))
        }
      }

      // Fetch email reports (mock data for now)
      // In production, this would fetch from /api/email-reports
      const mockReports: EmailReport[] = []
      setReports(mockReports)

    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken, newReport.siteId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch preview stats when selected site changes
  const fetchPreviewStats = useCallback(async (siteId: string) => {
    if (!siteId) return

    setPreviewStats(prev => ({ ...prev, loading: true }))

    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Calculate date range for last 7 days
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)

      // Previous period for comparison
      const prevEndDate = new Date(startDate)
      prevEndDate.setDate(prevEndDate.getDate() - 1)
      const prevStartDate = new Date(prevEndDate)
      prevStartDate.setDate(prevStartDate.getDate() - 7)

      const formatDate = (d: Date) => d.toISOString().split('T')[0]

      // Fetch current period stats
      const [currentRes, prevRes] = await Promise.all([
        fetch(`${apiUrl}/api/stats?siteId=${siteId}&period=7d`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/stats?siteId=${siteId}&startDate=${formatDate(prevStartDate)}&endDate=${formatDate(prevEndDate)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])

      if (currentRes.ok) {
        const current = await currentRes.json()
        const prev = prevRes.ok ? await prevRes.json() : null

        const currentVisitors = current.visitors || 0
        const currentPageviews = current.pageviews || 0
        const currentBounceRate = current.bounceRate || 0

        const prevVisitors = prev?.visitors || 0
        const prevPageviews = prev?.pageviews || 0
        const prevBounceRate = prev?.bounceRate || 0

        // Calculate percentage changes
        const calcChange = (curr: number, prev: number) => {
          if (prev === 0) return curr > 0 ? 100 : 0
          return Math.round(((curr - prev) / prev) * 100 * 10) / 10
        }

        // Format date range
        const dateRange = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

        setPreviewStats({
          visitors: currentVisitors,
          pageviews: currentPageviews,
          bounceRate: Math.round(currentBounceRate),
          visitorsChange: calcChange(currentVisitors, prevVisitors),
          pageviewsChange: calcChange(currentPageviews, prevPageviews),
          bounceRateChange: calcChange(currentBounceRate, prevBounceRate),
          dateRange,
          loading: false
        })
      }
    } catch (err) {
      console.error('Failed to fetch preview stats:', err)
      setPreviewStats(prev => ({ ...prev, loading: false }))
    }
  }, [getToken])

  useEffect(() => {
    if (newReport.siteId) {
      fetchPreviewStats(newReport.siteId)
    }
  }, [newReport.siteId, fetchPreviewStats])

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReport.siteId || !newReport.recipients) return

    const site = sites.find(s => s.id === newReport.siteId)
    const recipients = newReport.recipients.split(',').map(r => r.trim()).filter(r => r)

    // Calculate next send date
    const now = new Date()
    let nextSend = new Date()
    switch (newReport.frequency) {
      case 'daily':
        nextSend.setDate(now.getDate() + 1)
        nextSend.setHours(9, 0, 0, 0)
        break
      case 'weekly':
        nextSend.setDate(now.getDate() + (7 - now.getDay() + 1) % 7 + 1) // Next Monday
        nextSend.setHours(9, 0, 0, 0)
        break
      case 'monthly':
        nextSend.setMonth(now.getMonth() + 1, 1)
        nextSend.setHours(9, 0, 0, 0)
        break
    }

    const report: EmailReport = {
      id: `report_${Date.now()}`,
      siteId: newReport.siteId,
      siteName: site?.name || site?.domain || '',
      frequency: newReport.frequency,
      recipients,
      enabled: true,
      nextSend: nextSend.toISOString(),
      createdAt: new Date().toISOString()
    }

    setReports([...reports, report])
    setShowCreateModal(false)
    setNewReport({ siteId: sites[0]?.id || '', frequency: 'weekly', recipients: '' })
  }

  const handleToggleReport = (reportId: string) => {
    setReports(reports.map(r =>
      r.id === reportId ? { ...r, enabled: !r.enabled } : r
    ))
  }

  const handleDeleteReport = (reportId: string) => {
    if (!confirm('Are you sure you want to delete this email report?')) return
    setReports(reports.filter(r => r.id !== reportId))
  }

  const getFrequencyLabel = (freq: EmailReport['frequency']) => {
    switch (freq) {
      case 'daily': return 'Daily'
      case 'weekly': return 'Weekly'
      case 'monthly': return 'Monthly'
    }
  }

  const getFrequencyColor = (freq: EmailReport['frequency']) => {
    switch (freq) {
      case 'daily': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'weekly': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'monthly': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    }
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
          <h1 className="text-2xl font-bold">Email Reports</h1>
          <p className="text-muted-foreground">Schedule automated analytics reports to your inbox</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition text-sm font-medium"
        >
          Create Report
        </button>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="font-medium mb-2">No email reports configured</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            Set up automated email reports to receive your analytics summary on a regular schedule.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Create Your First Report
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Frequency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Recipients</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Next Send</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {reports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium">{report.siteName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFrequencyColor(report.frequency)}`}>
                      {getFrequencyLabel(report.frequency)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="max-w-[200px] truncate" title={report.recipients.join(', ')}>
                      {report.recipients.join(', ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {report.nextSend ? new Date(report.nextSend).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    }) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleReport(report.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        report.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          report.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Report Preview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold">Email Report Preview</h2>
          {sites.length > 1 && (
            <select
              value={newReport.siteId}
              onChange={(e) => setNewReport({ ...newReport, siteId: e.target.value })}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
            >
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name || site.domain}</option>
              ))}
            </select>
          )}
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs text-muted-foreground">
              Subject: Weekly Analytics Report - {sites.find(s => s.id === newReport.siteId)?.domain || 'yoursite.com'}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Weekly Analytics Summary</p>
                <p className="text-sm text-muted-foreground">{previewStats.dateRange || 'Loading...'}</p>
              </div>
            </div>

            {previewStats.loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-2xl font-bold">{previewStats.visitors.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Visitors</p>
                  <p className={`text-xs ${previewStats.visitorsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {previewStats.visitorsChange >= 0 ? '+' : ''}{previewStats.visitorsChange}% vs last week
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-2xl font-bold">{previewStats.pageviews.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Page Views</p>
                  <p className={`text-xs ${previewStats.pageviewsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {previewStats.pageviewsChange >= 0 ? '+' : ''}{previewStats.pageviewsChange}% vs last week
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-2xl font-bold">{previewStats.bounceRate}%</p>
                  <p className="text-xs text-muted-foreground">Bounce Rate</p>
                  <p className={`text-xs ${previewStats.bounceRateChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {previewStats.bounceRateChange >= 0 ? '+' : ''}{previewStats.bounceRateChange}% vs last week
                  </p>
                </div>
              </div>
            )}

            <div className="text-center pt-4">
              <Link
                href={newReport.siteId ? `/dashboard/sites/${newReport.siteId}` : '/dashboard'}
                className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity"
              >
                View Full Report
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Create Report Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Create Email Report</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Site</label>
                <select
                  value={newReport.siteId}
                  onChange={(e) => setNewReport({ ...newReport, siteId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  required
                >
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name || site.domain}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Frequency</label>
                <select
                  value={newReport.frequency}
                  onChange={(e) => setNewReport({ ...newReport, frequency: e.target.value as EmailReport['frequency'] })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="daily">Daily (sent at 9am)</option>
                  <option value="weekly">Weekly (sent Monday 9am)</option>
                  <option value="monthly">Monthly (sent 1st of month)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Recipients</label>
                <input
                  type="text"
                  value={newReport.recipients}
                  onChange={(e) => setNewReport({ ...newReport, recipients: e.target.value })}
                  placeholder={user?.primaryEmailAddress?.emailAddress || 'email@example.com'}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate multiple emails with commas
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition text-sm font-medium"
                >
                  Create Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
