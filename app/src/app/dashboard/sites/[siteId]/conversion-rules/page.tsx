'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useSiteContext } from '@/components/dashboard/SiteContext'

interface ConversionRule {
  id: string
  name: string
  enabled: boolean
  conditions: {
    page?: string
    event?: string
    eventData?: Record<string, string>
  }
  action: 'exclude_bounce' | 'force_conversion'
  createdAt: string
  updatedAt?: string
}

interface AllowedActions {
  exclude_bounce: boolean
  force_conversion: boolean
}

export default function ConversionRulesPage() {
  const params = useParams()
  const router = useRouter()
  const { getToken } = useAuth()
  const { setActiveSite } = useSiteContext()
  const siteId = params.siteId as string

  const [rules, setRules] = useState<ConversionRule[]>([])
  const [allowedActions, setAllowedActions] = useState<AllowedActions>({
    exclude_bounce: false,
    force_conversion: false
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Register with SiteContext for sidebar
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        if (!token || cancelled) return
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
        const res = await fetch(`${apiUrl}/api/sites/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          const site = data.sites?.find((s: { id: string }) => s.id === siteId)
          if (site) setActiveSite({ id: site.id, name: site.name, domain: site.domain })
        }
      } catch {}
    })()
    return () => { cancelled = true; setActiveSite(null) }
  }, [getToken, siteId, setActiveSite])

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<ConversionRule | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    page: '',
    event: '',
    eventDataKey: '',
    eventDataValue: '',
    action: 'exclude_bounce' as 'exclude_bounce' | 'force_conversion',
    enabled: true
  })

  const fetchRules = useCallback(async () => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/conversion-rules?siteId=${siteId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!res.ok) {
        throw new Error('Failed to fetch conversion rules')
      }

      const data = await res.json()
      setRules(data.rules || [])
      setAllowedActions(data.allowedActions || { exclude_bounce: false, force_conversion: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [getToken, siteId])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const openAddModal = () => {
    setEditingRule(null)
    setFormData({
      name: '',
      page: '',
      event: '',
      eventDataKey: '',
      eventDataValue: '',
      action: 'exclude_bounce',
      enabled: true
    })
    setShowModal(true)
  }

  const openEditModal = (rule: ConversionRule) => {
    setEditingRule(rule)
    const eventDataEntries = Object.entries(rule.conditions.eventData || {})
    setFormData({
      name: rule.name,
      page: rule.conditions.page || '',
      event: rule.conditions.event || '',
      eventDataKey: eventDataEntries[0]?.[0] || '',
      eventDataValue: eventDataEntries[0]?.[1] || '',
      action: rule.action,
      enabled: rule.enabled
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const token = await getToken()
      const conditions: ConversionRule['conditions'] = {}

      if (formData.page) conditions.page = formData.page
      if (formData.event) conditions.event = formData.event
      if (formData.eventDataKey && formData.eventDataValue) {
        conditions.eventData = { [formData.eventDataKey]: formData.eventDataValue }
      }

      const body = {
        name: formData.name,
        conditions,
        action: formData.action,
        enabled: formData.enabled
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const url = editingRule
        ? `${apiUrl}/api/conversion-rules?siteId=${siteId}&ruleId=${editingRule.id}`
        : `${apiUrl}/api/conversion-rules?siteId=${siteId}`

      const res = await fetch(url, {
        method: editingRule ? 'PATCH' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || data.error || 'Failed to save rule')
      }

      setShowModal(false)
      fetchRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/conversion-rules?siteId=${siteId}&ruleId=${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!res.ok) {
        throw new Error('Failed to delete rule')
      }

      fetchRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  const handleToggle = async (rule: ConversionRule) => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/conversion-rules?siteId=${siteId}&ruleId=${rule.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled: !rule.enabled })
      })

      if (!res.ok) {
        throw new Error('Failed to update rule')
      }

      fetchRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const canAddRules = allowedActions.exclude_bounce || allowedActions.force_conversion

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href={`/dashboard/sites/${siteId}`}
              className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block"
            >
              ← Back to Site Analytics
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Conversion Rules</h1>
            <p className="text-gray-600 mt-1">
              Define when a &quot;bounce&quot; should actually count as a conversion
            </p>
          </div>
          {canAddRules && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Rule
            </button>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Plan restriction notice */}
        {!canAddRules && (
          <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Unlock</h3>
            <p className="text-gray-600 mb-4">
              Conversion rules are available on Business plans and above.
            </p>
            <ul className="text-sm text-gray-600 mb-4 space-y-1">
              <li><strong>Business:</strong> Fix inaccurate bounce rates by excluding intentional redirects</li>
              <li><strong>Scale:</strong> Track custom conversion goals with advanced rule conditions</li>
            </ul>
            <Link
              href="/dashboard/billing"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Plans
            </Link>
          </div>
        )}

        {/* Feature explanation */}
        {canAddRules && rules.length === 0 && (
          <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">How Conversion Rules Work</h3>
            <p className="text-gray-600 mb-4">
              Sometimes what looks like a &quot;bounce&quot; is actually a successful conversion. For example:
            </p>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• A user visits <code className="bg-white px-1 rounded">/start-now</code>, clicks &quot;Sign Up&quot;, and gets redirected to your LMS</li>
              <li>• That redirect triggers a &quot;bounce&quot; because they left your site quickly</li>
              <li>• But it&apos;s actually a conversion! Create a rule to fix this.</li>
            </ul>
          </div>
        )}

        {/* Rules list */}
        {rules.length > 0 && (
          <div className="space-y-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-white rounded-xl shadow-sm border p-6 ${
                  !rule.enabled ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          rule.action === 'force_conversion'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {rule.action === 'force_conversion' ? 'Conversion Goal' : 'Exclude Bounce'}
                      </span>
                      {!rule.enabled && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                          Disabled
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                      {rule.conditions.page && (
                        <div>
                          <span className="text-gray-500">Page:</span>{' '}
                          <code className="bg-gray-100 px-1 rounded">{rule.conditions.page}</code>
                        </div>
                      )}
                      {rule.conditions.event && (
                        <div>
                          <span className="text-gray-500">Event:</span>{' '}
                          <code className="bg-gray-100 px-1 rounded">{rule.conditions.event}</code>
                        </div>
                      )}
                      {rule.conditions.eventData && Object.keys(rule.conditions.eventData).length > 0 && (
                        <div>
                          <span className="text-gray-500">Event Data:</span>{' '}
                          {Object.entries(rule.conditions.eventData).map(([key, value]) => (
                            <code key={key} className="bg-gray-100 px-1 rounded">
                              {key}={value}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`p-2 rounded-lg transition-colors ${
                        rule.enabled
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={rule.enabled ? 'Disable' : 'Enable'}
                    >
                      {rule.enabled ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Edit"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {canAddRules && rules.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversion rules yet</h3>
            <p className="text-gray-600 mb-4">Create your first rule to improve bounce rate accuracy</p>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Rule
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {editingRule ? 'Edit Rule' : 'Add Conversion Rule'}
            </h2>

            <div className="space-y-4">
              {/* Rule name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., LMS Signup Redirect"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Page condition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Page Path (optional)
                </label>
                <input
                  type="text"
                  value={formData.page}
                  onChange={(e) => setFormData({ ...formData, page: e.target.value })}
                  placeholder="/start-now"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exact match or regex pattern (e.g., /signup.*)
                </p>
              </div>

              {/* Event condition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type (optional)
                </label>
                <input
                  type="text"
                  value={formData.event}
                  onChange={(e) => setFormData({ ...formData, event: e.target.value })}
                  placeholder="button_click"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Event data condition */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Data (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.eventDataKey}
                    onChange={(e) => setFormData({ ...formData, eventDataKey: e.target.value })}
                    placeholder="key (e.g., button)"
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-400 self-center">=</span>
                  <input
                    type="text"
                    value={formData.eventDataValue}
                    onChange={(e) => setFormData({ ...formData, eventDataValue: e.target.value })}
                    placeholder="value (e.g., sign up)"
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action
                </label>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.action === 'exclude_bounce'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    } ${!allowedActions.exclude_bounce ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="action"
                      value="exclude_bounce"
                      checked={formData.action === 'exclude_bounce'}
                      onChange={(e) => setFormData({ ...formData, action: e.target.value as 'exclude_bounce' })}
                      disabled={!allowedActions.exclude_bounce}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Exclude from Bounce</div>
                      <div className="text-sm text-gray-600">
                        Don&apos;t count this as a bounce (improves bounce rate)
                      </div>
                      {!allowedActions.exclude_bounce && (
                        <div className="text-xs text-blue-600 mt-1">Requires Business plan</div>
                      )}
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.action === 'force_conversion'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    } ${!allowedActions.force_conversion ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="action"
                      value="force_conversion"
                      checked={formData.action === 'force_conversion'}
                      onChange={(e) => setFormData({ ...formData, action: e.target.value as 'force_conversion' })}
                      disabled={!allowedActions.force_conversion}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Conversion Goal</div>
                      <div className="text-sm text-gray-600">
                        Track this action as a conversion in your analytics
                      </div>
                      {!allowedActions.force_conversion && (
                        <div className="text-xs text-blue-600 mt-1">Requires Scale plan</div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-700">Enabled</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formData.enabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.enabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Error in modal */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingRule ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
