'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useSiteContext } from '@/components/dashboard/SiteContext'

interface Site {
  id: string
  domain: string
  name?: string
  createdAt?: string
}

export default function SiteSettingsPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { getToken } = useAuth()
  const { setActiveSite } = useSiteContext()

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Danger zone state
  const [dangerOpen, setDangerOpen] = useState(false)
  const [deleteRangeStart, setDeleteRangeStart] = useState('')
  const [deleteRangeEnd, setDeleteRangeEnd] = useState('')
  const [purgeConfirmText, setPurgeConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{ message: string; success: boolean } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'range' | 'all' | null>(null)

  const fetchSite = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch site')
        return
      }
      const foundSite = data.sites?.find((s: Site) => s.id === siteId)
      if (!foundSite) {
        setError('Site not found')
        return
      }
      setSite(foundSite)
      setActiveSite({ id: foundSite.id, name: foundSite.name, domain: foundSite.domain })
    } catch {
      setError('Failed to load site data')
    } finally {
      setLoading(false)
    }
  }, [getToken, siteId, setActiveSite])

  useEffect(() => {
    fetchSite()
    return () => setActiveSite(null)
  }, [fetchSite, setActiveSite])

  const handleDeleteData = async (mode: 'range' | 'all') => {
    setDeleteLoading(true)
    setDeleteResult(null)
    try {
      const token = await getToken()
      if (!token) return
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1] || ''

      const body: Record<string, string> = { siteId, mode }
      if (mode === 'range') {
        body.startDate = deleteRangeStart
        body.endDate = deleteRangeEnd
      }

      const res = await fetch(`${apiUrl}/api/sites/data/delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (res.ok) {
        setDeleteResult({ message: data.message, success: true })
        setShowDeleteConfirm(null)
        setPurgeConfirmText('')
        setDeleteRangeStart('')
        setDeleteRangeEnd('')
      } else {
        setDeleteResult({ message: data.error || 'Deletion failed', success: false })
      }
    } catch {
      setDeleteResult({ message: 'Failed to delete data. Please try again.', success: false })
    } finally {
      setDeleteLoading(false)
    }
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
        <Link href="/dashboard/sites" className="text-primary hover:underline">Back to Sites</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/dashboard/sites" className="hover:text-primary">Sites</Link>
          <span>/</span>
          <Link href={`/dashboard/sites/${siteId}`} className="hover:text-primary">{site?.domain}</Link>
          <span>/</span>
          <span>Settings</span>
        </div>
        <h1 className="text-xl font-semibold">Site Settings</h1>
      </div>

      {/* Site Information */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Site Information</h2>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-sm text-muted-foreground">Site ID</dt>
            <dd className="text-sm font-mono">{site?.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-muted-foreground">Domain</dt>
            <dd className="text-sm">{site?.domain}</dd>
          </div>
          {site?.name && (
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="text-sm">{site.name}</dd>
            </div>
          )}
          {site?.createdAt && (
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="text-sm">{new Date(site.createdAt).toLocaleDateString()}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-300 dark:border-red-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setDangerOpen(!dangerOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="font-semibold text-red-700 dark:text-red-400">Danger Zone</span>
          </div>
          <svg className={`w-5 h-5 text-red-600 dark:text-red-400 transition-transform ${dangerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dangerOpen && (
          <div className="p-4 space-y-6 bg-white dark:bg-gray-800">
            {/* Result banner */}
            {deleteResult && (
              <div className={`px-4 py-3 rounded-lg text-sm ${
                deleteResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              }`}>
                {deleteResult.message}
              </div>
            )}

            {/* Delete by date range */}
            <div>
              <h4 className="font-medium text-sm mb-1">Delete data by date range</h4>
              <p className="text-xs text-muted-foreground mb-3">Remove analytics data for a specific period (e.g., test or junk data).</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Start date</label>
                  <input
                    type="date"
                    value={deleteRangeStart}
                    onChange={(e) => setDeleteRangeStart(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">End date</label>
                  <input
                    type="date"
                    value={deleteRangeEnd}
                    onChange={(e) => setDeleteRangeEnd(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
                <button
                  onClick={() => setShowDeleteConfirm('range')}
                  disabled={!deleteRangeStart || !deleteRangeEnd || deleteRangeStart > deleteRangeEnd}
                  className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Delete Range
                </button>
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Purge all data */}
            <div>
              <h4 className="font-medium text-sm mb-1">Purge all analytics data</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Permanently delete <strong>all</strong> pageviews, rollups, and usage data for this site. This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-muted-foreground mb-1">
                    Type <strong>{site?.domain}</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={purgeConfirmText}
                    onChange={(e) => setPurgeConfirmText(e.target.value)}
                    placeholder={site?.domain || ''}
                    className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
                <button
                  onClick={() => setShowDeleteConfirm('all')}
                  disabled={purgeConfirmText !== site?.domain}
                  className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Purge All Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !deleteLoading && setShowDeleteConfirm(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold">
                  {showDeleteConfirm === 'all' ? 'Purge All Data' : 'Delete Date Range'}
                </h3>
              </div>

              <p className="text-sm text-muted-foreground mb-2">
                {showDeleteConfirm === 'all'
                  ? `This will permanently delete ALL analytics data for ${site?.domain}. This action cannot be undone.`
                  : `This will permanently delete analytics data from ${deleteRangeStart} to ${deleteRangeEnd}. This action cannot be undone.`
                }
              </p>

              <p className="text-sm text-muted-foreground mb-4">
                The following tables will be affected: pageviews, daily rollups, page rollups, dimension rollups, UTM rollups, and monthly usage.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  disabled={deleteLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteData(showDeleteConfirm)}
                  disabled={deleteLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {deleteLoading && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
