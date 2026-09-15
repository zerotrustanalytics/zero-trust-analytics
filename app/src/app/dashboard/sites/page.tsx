'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { AddSiteModal } from '@/components/dashboard/AddSiteModal'
import { usePlan } from '@/components/dashboard/PlanContext'
import Link from 'next/link'

interface Site {
  id: string
  domain: string
  name?: string
  createdAt: string
  pageviews?: number
}

export default function SitesPage() {
  const { getToken } = useAuth()
  const { planData, canAddSite, refetch: refetchPlan } = usePlan()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch sites')
        return
      }

      setSites(data.sites || [])
    } catch {
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const copyTrackingCode = (siteId: string) => {
    const code = `<script src="https://ztas.io/js/analytics.js" data-site-id="${siteId}"></script>`
    navigator.clipboard.writeText(code)
    setCopiedId(siteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSiteAdded = (site: { id: string; domain: string; name: string }) => {
    setSites([...sites, { ...site, createdAt: new Date().toISOString() }])
    refetchPlan() // Update plan limits after adding site
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-muted-foreground">
            Manage your tracked websites
            {planData && (
              <span className="ml-2 text-xs">
                ({planData.limits.sites.current} / {planData.limits.sites.max === Infinity ? 'Unlimited' : planData.limits.sites.max})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!canAddSite() && (
            <Link
              href="/dashboard/billing"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Upgrade for more sites
            </Link>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!canAddSite()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Site
          </button>
        </div>
      </div>

      {/* Site limit exceeded banner */}
      {planData && planData.limits.sites.max !== Infinity && sites.length > planData.limits.sites.max && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 rounded-lg mb-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Site limit exceeded ({sites.length}/{planData.limits.sites.max})</span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-300 mt-1">
            You have more sites than your current plan allows. All sites remain active, but you cannot add new ones.{' '}
            <Link href="/dashboard/billing" className="underline font-medium">
              Upgrade your plan
            </Link>{' '}
            to add more sites.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
          <button
            onClick={() => setError('')}
            className="ml-4 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {sites.length === 0 && !error ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No sites yet</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Get started by adding your first website.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
          >
            Add Your First Site
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <div
              key={site.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{site.name || site.domain}</h3>
                  <p className="text-sm text-muted-foreground">{site.domain}</p>
                </div>
                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                  Active
                </span>
              </div>

              <div className="text-sm text-muted-foreground mb-4">
                Added {new Date(site.createdAt).toLocaleDateString()}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => copyTrackingCode(site.id)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center justify-center gap-2"
                >
                  {copiedId === site.id ? (
                    <>
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Tracking Code
                    </>
                  )}
                </button>

                <Link
                  href={`/dashboard/sites/${site.id}`}
                  className="w-full px-3 py-2 text-sm text-center bg-primary text-primary-foreground rounded hover:opacity-90 transition block"
                >
                  View Analytics
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddSiteModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleSiteAdded}
      />

    </div>
  )
}
