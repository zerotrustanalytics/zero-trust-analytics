'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useSiteContext } from '@/components/dashboard/SiteContext'

interface PageValueRule {
  id: string
  name: string
  enabled: boolean
  conditions: {
    page: string
    match: 'exact' | 'contains' | 'starts_with' | 'regex'
  }
  value: number
  currency: string
  createdAt: string
  updatedAt?: string
}

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
]

const MATCH_TYPES = [
  { value: 'exact', label: 'Exact match', description: 'URL must match exactly' },
  { value: 'contains', label: 'Contains', description: 'URL contains this text' },
  { value: 'starts_with', label: 'Starts with', description: 'URL starts with this path' },
  { value: 'regex', label: 'Regex', description: 'Regular expression pattern' },
]

function formatCurrency(value: number, currency: string): string {
  const curr = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]
  return `${curr.symbol}${value.toLocaleString()}`
}

export default function PageValuesPage() {
  const params = useParams()
  const { getToken } = useAuth()
  const { setActiveSite } = useSiteContext()
  const siteId = params.siteId as string

  const [rules, setRules] = useState<PageValueRule[]>([])
  const [canUsePageValues, setCanUsePageValues] = useState(false)
  const [plan, setPlan] = useState('free')
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
  const [editingRule, setEditingRule] = useState<PageValueRule | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    page: '',
    match: 'exact' as 'exact' | 'contains' | 'starts_with' | 'regex',
    value: '',
    currency: 'USD',
    enabled: true
  })

  const fetchRules = useCallback(async () => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/page-value-rules?siteId=${siteId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!res.ok) {
        throw new Error('Failed to fetch page value rules')
      }

      const data = await res.json()
      setRules(data.rules || [])
      setCanUsePageValues(data.canUsePageValues || false)
      setPlan(data.plan || 'free')
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
      match: 'exact',
      value: '',
      currency: 'USD',
      enabled: true
    })
    setShowModal(true)
  }

  const openEditModal = (rule: PageValueRule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      page: rule.conditions.page || '',
      match: rule.conditions.match || 'exact',
      value: rule.value.toString(),
      currency: rule.currency || 'USD',
      enabled: rule.enabled
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const token = await getToken()
      const valueNum = parseFloat(formData.value)

      if (isNaN(valueNum) || valueNum < 0) {
        throw new Error('Value must be a positive number')
      }

      if (!formData.page) {
        throw new Error('Page pattern is required')
      }

      const body = {
        name: formData.name,
        conditions: {
          page: formData.page,
          match: formData.match
        },
        value: valueNum,
        currency: formData.currency,
        enabled: formData.enabled
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const url = editingRule
        ? `${apiUrl}/api/page-value-rules?siteId=${siteId}&ruleId=${editingRule.id}`
        : `${apiUrl}/api/page-value-rules?siteId=${siteId}`

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
      const res = await fetch(`${apiUrl}/api/page-value-rules?siteId=${siteId}&ruleId=${ruleId}`, {
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

  const handleToggle = async (rule: PageValueRule) => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/page-value-rules?siteId=${siteId}&ruleId=${rule.id}`, {
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

  // Calculate total value
  const totalValue = rules
    .filter(r => r.enabled)
    .reduce((sum, r) => sum + r.value, 0)
  const primaryCurrency = rules[0]?.currency || 'USD'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

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
              &larr; Back to Site Analytics
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Page Value Rules</h1>
            <p className="text-gray-600 mt-1">
              Assign monetary values to pages to track ROI without ecommerce
            </p>
          </div>
          {canUsePageValues && (
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
        {!canUsePageValues && (
          <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Unlock Page Values</h3>
            <p className="text-gray-600 mb-4">
              Page Value Rules are available on Business plans and above. Track ROI from your traffic sources without needing ecommerce integration.
            </p>
            <ul className="text-sm text-gray-600 mb-4 space-y-1">
              <li>&#8226; Assign dollar values to key pages (thank-you pages, lead forms, etc.)</li>
              <li>&#8226; See which traffic sources generate the most value</li>
              <li>&#8226; Calculate ROI on your marketing spend</li>
            </ul>
            <Link
              href="/dashboard/billing"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Upgrade to Business
            </Link>
          </div>
        )}

        {/* Total Value Summary */}
        {canUsePageValues && rules.length > 0 && (
          <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Page Value (per conversion)</p>
                <p className="text-3xl font-bold text-green-700">
                  {formatCurrency(totalValue, primaryCurrency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-1">Active Rules</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {rules.filter(r => r.enabled).length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feature explanation */}
        {canUsePageValues && rules.length === 0 && (
          <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">How Page Values Work</h3>
            <p className="text-gray-600 mb-4">
              Assign monetary values to important pages to track ROI without ecommerce:
            </p>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>&#8226; <strong>Thank-you pages:</strong> Assign $500 to <code className="bg-white px-1 rounded">/thank-you</code> for lead form submissions</li>
              <li>&#8226; <strong>Demo requests:</strong> Assign $1000 to <code className="bg-white px-1 rounded">/demo-scheduled</code></li>
              <li>&#8226; <strong>Downloads:</strong> Assign $50 to <code className="bg-white px-1 rounded">/download-complete</code></li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              Then see which traffic sources (Google, LinkedIn, Direct) generate the most value!
            </p>
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
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                        {formatCurrency(rule.value, rule.currency)}
                      </span>
                      {!rule.enabled && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                          Disabled
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        <span className="text-gray-500">Page:</span>{' '}
                        <code className="bg-gray-100 px-1 rounded">{rule.conditions.page}</code>
                        <span className="text-gray-400 ml-2">
                          ({MATCH_TYPES.find(m => m.value === rule.conditions.match)?.label || 'Exact'})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`relative w-10 h-6 rounded-full transition-colors ${
                        rule.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          rule.enabled ? 'translate-x-4' : ''
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
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

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-semibold">
                  {editingRule ? 'Edit Page Value Rule' : 'Add Page Value Rule'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Lead Form Submission"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Page Pattern */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Page Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.page}
                    onChange={(e) => setFormData({ ...formData, page: e.target.value })}
                    placeholder="e.g., /thank-you"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Match Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Match Type
                  </label>
                  <select
                    value={formData.match}
                    onChange={(e) => setFormData({ ...formData, match: e.target.value as typeof formData.match })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {MATCH_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Value
                    </label>
                    <input
                      type="number"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      placeholder="500"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {CURRENCIES.map(curr => (
                        <option key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">Enabled</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      formData.enabled ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        formData.enabled ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name || !formData.page || !formData.value}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : (editingRule ? 'Update' : 'Create')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
