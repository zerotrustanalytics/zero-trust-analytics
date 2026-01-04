'use client'

import { useState } from 'react'
import { Button, Card, Input } from '@/components/ui'
import { Modal, ModalFooter } from '@/components/ui/Modal'

interface ApiKey {
  id: string
  name: string
  key: string
  scopes: string[]
  createdAt: string
  lastUsed: string | null
}

const mockKeys: ApiKey[] = [
  {
    id: '1',
    name: 'Production API Key',
    key: 'zta_live_••••••••••••••••••••••••1234',
    scopes: ['read', 'write'],
    createdAt: '2024-12-01',
    lastUsed: '2026-01-03',
  },
]

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>(mockKeys)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read'])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes }),
      })

      const data = await res.json()
      if (res.ok) {
        setCreatedKey(data.key)
        setKeys([
          ...keys,
          {
            id: data.id || Date.now().toString(),
            name: newKeyName,
            key: `zta_live_••••••••••••••••••••••••${data.key?.slice(-4) || '0000'}`,
            scopes: newKeyScopes,
            createdAt: new Date().toISOString(),
            lastUsed: null,
          },
        ])
        setShowCreateModal(false)
        setShowKeyModal(true)
        setNewKeyName('')
        setNewKeyScopes(['read'])
      }
    } catch (error) {
      console.error('Create key error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      await fetch(`${apiUrl}/api/api-keys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setKeys(keys.filter((k) => k.id !== keyId))
    } catch (error) {
      console.error('Delete key error:', error)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </Button>
      </div>

      {/* API Keys List */}
      <div className="space-y-4">
        {keys.map((apiKey) => (
          <Card key={apiKey.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium">{apiKey.name}</h3>
                  <div className="flex gap-1">
                    {apiKey.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-mono mt-1">{apiKey.key}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Created {new Date(apiKey.createdAt).toLocaleDateString()} •{' '}
                  {apiKey.lastUsed ? `Last used ${new Date(apiKey.lastUsed).toLocaleDateString()}` : 'Never used'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteKey(apiKey.id)}
                className="text-red-600 hover:text-red-700"
              >
                Revoke
              </Button>
            </div>
          </Card>
        ))}

        {keys.length === 0 && (
          <Card className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h3 className="font-medium mb-2">No API keys yet</h3>
            <p className="text-muted-foreground mb-4">Create an API key to access your analytics programmatically</p>
            <Button onClick={() => setShowCreateModal(true)}>Create Your First API Key</Button>
          </Card>
        )}
      </div>

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create API Key"
        description="Generate a new API key for programmatic access"
      >
        <form onSubmit={handleCreateKey}>
          <div className="space-y-4">
            <div>
              <label htmlFor="keyName" className="block text-sm font-medium mb-1">
                Key Name
              </label>
              <Input
                id="keyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production Server"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Permissions</label>
              <div className="space-y-2">
                {['read', 'write', 'admin'].map((scope) => (
                  <label key={scope} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes(scope)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewKeyScopes([...newKeyScopes, scope])
                        } else {
                          setNewKeyScopes(newKeyScopes.filter((s) => s !== scope))
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm capitalize">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !newKeyName}>
              {loading ? 'Creating...' : 'Create Key'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Show Created Key Modal */}
      <Modal
        isOpen={showKeyModal}
        onClose={() => {
          setShowKeyModal(false)
          setCreatedKey(null)
        }}
        title="API Key Created"
        description="Make sure to copy your API key now. You won't be able to see it again!"
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <code className="text-sm break-all">{createdKey || 'zta_live_xxxxxxxxxxxxxxxxxxxxxxxx'}</code>
          </div>
          <Button fullWidth onClick={() => createdKey && copyToClipboard(createdKey)}>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy to Clipboard
          </Button>
        </div>
        <ModalFooter>
          <Button onClick={() => {
            setShowKeyModal(false)
            setCreatedKey(null)
          }}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
