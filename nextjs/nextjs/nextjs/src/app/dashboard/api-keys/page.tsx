'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface ApiKey {
  id: string
  name: string
  key?: string
  keyPrefix: string
  permissions: string[]
  createdAt: string
  lastUsed?: string
}

export default function ApiKeysPage() {
  const { getToken } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read'])
  const [creating, setCreating] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/keys`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch API keys')
        return
      }

      setKeys(data.keys || [])
    } catch {
      setError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const createKey = async () => {
    if (!newKeyName.trim()) {
      alert('Please enter a name for the API key')
      return
    }

    setCreating(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKeyName,
          permissions: newKeyPermissions,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to create API key')
        return
      }

      setNewlyCreatedKey(data.key.key)
      setKeys([data.key, ...keys])
      setNewKeyName('')
      setNewKeyPermissions(['read'])
      setShowCreateModal(false)
    } catch {
      alert('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const deleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return
    }

    setDeletingId(keyId)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/keys?keyId=${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        setKeys(keys.filter(k => k.id !== keyId))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to revoke API key')
      }
    } catch {
      alert('Failed to revoke API key')
    } finally {
      setDeletingId(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const togglePermission = (perm: string) => {
    if (newKeyPermissions.includes(perm)) {
      setNewKeyPermissions(newKeyPermissions.filter(p => p !== perm))
    } else {
      setNewKeyPermissions([...newKeyPermissions, perm])
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          Create API Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {newlyCreatedKey && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Save your API key now!</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">This is the only time you will see this key.</p>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded border">
                <code className="flex-1 text-sm font-mono break-all">{newlyCreatedKey}</code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedKey)}
                  className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 flex-shrink-0"
                >
                  {copiedKey ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <button onClick={() => setNewlyCreatedKey(null)} className="text-yellow-600 hover:text-yellow-800 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 && !error ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium">No API keys yet</h3>
          <p className="mt-2 text-muted-foreground">Create an API key to access your analytics programmatically.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Create Your First API Key
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Permissions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">{key.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{key.keyPrefix}...</code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      {key.permissions.map(perm => (
                        <span key={perm} className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">{perm}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => deleteKey(key.id)}
                      disabled={deletingId === key.id}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm disabled:opacity-50"
                    >
                      {deletingId === key.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Create API Key</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="My API Key"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="space-y-2">
                  {['read', 'write', 'admin'].map(perm => (
                    <label key={perm} className="flex items-center gap-2">
                      <input type="checkbox" checked={newKeyPermissions.includes(perm)} onChange={() => togglePermission(perm)} className="rounded" />
                      <span className="capitalize">{perm}</span>
                      <span className="text-xs text-muted-foreground">
                        {perm === 'read' && '- View analytics data'}
                        {perm === 'write' && '- Track events'}
                        {perm === 'admin' && '- Full access'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setNewKeyName(''); setNewKeyPermissions(['read']) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={createKey} disabled={creating || !newKeyName.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : 'Create Key'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
