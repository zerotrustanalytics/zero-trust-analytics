'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface GSCStatus {
  connected: boolean
  connectedAt?: string
}

interface GSCSite {
  url: string
  permissionLevel: string
}

export default function IntegrationsPage() {
  const { getToken } = useAuth()
  const searchParams = useSearchParams()

  const [gscStatus, setGscStatus] = useState<GSCStatus | null>(null)
  const [gscSites, setGscSites] = useState<GSCSite[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingGsc, setConnectingGsc] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Check for URL params from OAuth callback
  useEffect(() => {
    const gscConnected = searchParams.get('gsc_connected')
    const gscError = searchParams.get('gsc_error')

    if (gscConnected === 'true') {
      setMessage({ type: 'success', text: 'Google Search Console connected successfully!' })
    } else if (gscError) {
      setMessage({ type: 'error', text: `Failed to connect GSC: ${gscError}` })
    }
  }, [searchParams])

  const fetchGscStatus = useCallback(async () => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/gsc?action=status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        setGscStatus(data)

        // If connected, fetch sites
        if (data.connected) {
          const sitesRes = await fetch(`${apiUrl}/api/gsc?action=sites`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          if (sitesRes.ok) {
            const sitesData = await sitesRes.json()
            setGscSites(sitesData.sites || [])
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch GSC status:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchGscStatus()
  }, [fetchGscStatus])

  const connectGsc = async () => {
    setConnectingGsc(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/gsc?action=connect`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        // Redirect to Google OAuth
        window.location.href = data.authUrl
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.message || 'Failed to start GSC connection' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to connect GSC' })
    } finally {
      setConnectingGsc(false)
    }
  }

  const disconnectGsc = async () => {
    if (!confirm('Are you sure you want to disconnect Google Search Console?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/gsc?action=disconnect`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        setGscStatus({ connected: false })
        setGscSites([])
        setMessage({ type: 'success', text: 'GSC disconnected successfully' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect GSC' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/settings"
          className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block"
        >
          &larr; Back to Settings
        </Link>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Connect external services to enhance your analytics
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
            : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Google Search Console */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg shadow flex items-center justify-center">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Google Search Console</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              View organic search keywords, impressions, clicks, and rankings directly in your analytics dashboard.
            </p>

            {gscStatus?.connected ? (
              <div className="mt-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Connected</span>
                  {gscStatus.connectedAt && (
                    <span className="text-xs text-gray-500">
                      since {new Date(gscStatus.connectedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Connected Sites */}
                {gscSites.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Available Properties
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {gscSites.map((site) => (
                        <div
                          key={site.url}
                          className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm"
                        >
                          <span className="truncate flex-1">{site.url}</span>
                          <span className="text-xs text-gray-500 ml-2">{site.permissionLevel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={disconnectGsc}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectGsc}
                disabled={connectingGsc}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {connectingGsc ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Connect Google Search Console
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      {gscStatus?.connected && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">How to use GSC data</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>1. Go to any site&apos;s analytics page</li>
            <li>2. Look for the &quot;Search Keywords&quot; section</li>
            <li>3. Select the matching GSC property from the dropdown</li>
            <li>4. View organic search queries, clicks, and rankings</li>
          </ul>
        </div>
      )}

      {/* Future Integrations */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Coming Soon</h2>
        <div className="grid gap-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium">Email Reports</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automated weekly/monthly report delivery</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 opacity-60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium">Slack Notifications</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Get alerts for traffic spikes and anomalies</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
