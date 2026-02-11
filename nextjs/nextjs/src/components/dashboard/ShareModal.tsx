'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  siteId: string
  siteDomain: string
}

export function ShareModal({ isOpen, onClose, siteId, siteDomain }: ShareModalProps) {
  const { getToken } = useAuth()

  const [shareUrl, setShareUrl] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [shareTab, setShareTab] = useState<'link' | 'embed'>('link')
  const [embedCopied, setEmbedCopied] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareExpiry, setShareExpiry] = useState('30d')
  const [existingShares, setExistingShares] = useState<Array<{token: string, shareUrl: string, expiresAt: string | null, createdAt: string}>>([])
  const [sharesLoaded, setSharesLoaded] = useState(false)

  const fetchShares = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/share?siteId=${siteId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setExistingShares(data.shares || [])
      }
      setSharesLoaded(true)
    } catch {
      setSharesLoaded(true)
    }
  }, [getToken, siteId])

  useEffect(() => {
    if (isOpen && !sharesLoaded) {
      fetchShares()
    }
  }, [isOpen, sharesLoaded, fetchShares])

  const createShare = async () => {
    setShareLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1] || ''

      const res = await fetch(`${apiUrl}/api/sites/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          siteId,
          expiresIn: shareExpiry === 'never' ? null : shareExpiry,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setShareUrl(data.shareUrl)
        setExistingShares(prev => [data.share, ...prev])
      } else {
        const data = await res.json()
        console.error('Failed to create share:', data.error)
      }
    } catch (err) {
      console.error('Failed to create share:', err)
    } finally {
      setShareLoading(false)
    }
  }

  const deleteShare = async (shareToken: string) => {
    try {
      const token = await getToken()
      if (!token) return
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1] || ''

      const res = await fetch(`${apiUrl}/api/sites/share?token=${shareToken}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      })

      if (res.ok) {
        setExistingShares(prev => prev.filter(s => s.token !== shareToken))
        if (shareUrl.includes(shareToken)) {
          setShareUrl('')
        }
      }
    } catch (err) {
      console.error('Failed to delete share:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">Share Dashboard</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShareTab('link')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
              shareTab === 'link'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Share Link
            </div>
          </button>
          <button
            onClick={() => setShareTab('embed')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
              shareTab === 'embed'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Embed Code
            </div>
          </button>
        </div>

        <div className="p-4">
          {shareTab === 'link' ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Create a shareable link to give others read-only access to this dashboard.
              </p>

              {/* Create New Share */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4">
                <label className="block text-sm font-medium mb-2">Link Expiration</label>
                <div className="flex gap-2">
                  <select
                    value={shareExpiry}
                    onChange={(e) => setShareExpiry(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    <option value="1d">1 day</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                    <option value="never">Never expires</option>
                  </select>
                  <button
                    onClick={createShare}
                    disabled={shareLoading}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {shareLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Current Share URL */}
              {shareUrl && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Share URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm font-mono text-xs"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl)
                        setShareCopied(true)
                        setTimeout(() => setShareCopied(false), 2000)
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        shareCopied
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}
                    >
                      {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Shares */}
              {existingShares.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Active Share Links</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {existingShares.map((share) => (
                      <div key={share.token} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono truncate">{share.shareUrl || `https://ztas.io/shared/${share.token}`}</p>
                          <p className="text-muted-foreground">
                            {share.expiresAt
                              ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
                              : 'Never expires'}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteShare(share.token)}
                          className="ml-2 p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                          title="Revoke this link"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Anyone with this link can view the analytics. Revoke anytime.</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Embed your analytics dashboard on your website or blog. Create a share link first, then use the embed code.
              </p>

              {shareUrl ? (
                <>
                  <div className="mb-4">
                    <textarea
                      readOnly
                      value={`<iframe\n  src="${shareUrl}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border: 1px solid #e5e7eb; border-radius: 8px;"\n  title="Analytics Dashboard - ${siteDomain}"\n></iframe>`}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm font-mono text-xs h-32 resize-none"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const embedCode = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;" title="Analytics Dashboard - ${siteDomain}"></iframe>`
                      navigator.clipboard.writeText(embedCode)
                      setEmbedCopied(true)
                      setTimeout(() => setEmbedCopied(false), 2000)
                    }}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition ${
                      embedCopied
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-primary text-primary-foreground hover:opacity-90'
                    }`}
                  >
                    {embedCopied ? 'Embed Code Copied!' : 'Copy Embed Code'}
                  </button>

                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-xs font-medium mb-2">Customization Options:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>- Adjust <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">width</code> and <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">height</code> to fit your layout</li>
                      <li>- Add <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">?theme=dark</code> to the URL for dark mode</li>
                      <li>- Add <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">?minimal=true</code> for a compact view</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <p className="text-sm text-muted-foreground mb-3">Create a share link first to get the embed code.</p>
                  <button
                    onClick={() => setShareTab('link')}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
                  >
                    Create Share Link
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
