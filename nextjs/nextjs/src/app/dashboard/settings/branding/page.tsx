'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'

interface Branding {
  enabled: boolean
  companyName: string
  logoUrl: string | null
  primaryColor: string
  updatedAt?: string
}

export default function BrandingSettingsPage() {
  const { getToken } = useAuth()

  const [branding, setBranding] = useState<Branding>({
    enabled: false,
    companyName: 'Zero Trust Analytics',
    logoUrl: null,
    primaryColor: '#3B82F6'
  })
  const [canUseBranding, setCanUseBranding] = useState(false)
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchBranding = useCallback(async () => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/branding`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!res.ok) {
        throw new Error('Failed to fetch branding settings')
      }

      const data = await res.json()
      setBranding(data.branding)
      setCanUseBranding(data.canUseBranding)
      setPlan(data.plan)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchBranding()
  }, [fetchBranding])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/branding`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(branding)
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || data.error || 'Failed to save')
      }

      const data = await res.json()
      setBranding(data.branding)
      setSuccess('Branding settings saved successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/settings"
            className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block"
          >
            &larr; Back to Settings
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">White-Label Branding</h1>
          <p className="text-gray-600 mt-1">
            Customize reports and shared dashboards with your own branding
          </p>
        </div>

        {/* Error/Success display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Plan restriction notice */}
        {!canUseBranding && (
          <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Unlock</h3>
            <p className="text-gray-600 mb-4">
              White-label branding is available on Business plans and above. Remove our branding from reports and shared dashboards, and replace it with your own.
            </p>
            <ul className="text-sm text-gray-600 mb-4 space-y-1">
              <li>&#8226; Custom company name on all reports</li>
              <li>&#8226; Your logo on email reports and dashboards</li>
              <li>&#8226; Custom primary color for buttons and accents</li>
            </ul>
            <Link
              href="/dashboard/billing"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Upgrade to Business
            </Link>
          </div>
        )}

        {/* Branding Settings Form */}
        {canUseBranding && (
          <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <div className="font-medium text-gray-900">Enable Custom Branding</div>
                <div className="text-sm text-gray-500">
                  Replace Zero Trust Analytics branding with your own
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBranding({ ...branding, enabled: !branding.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  branding.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    branding.enabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={branding.companyName}
                onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                placeholder="Your Company Name"
                maxLength={100}
                disabled={!branding.enabled}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Shown in email report headers and shared dashboard footers
              </p>
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Logo URL
              </label>
              <input
                type="url"
                value={branding.logoUrl || ''}
                onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value || null })}
                placeholder="https://yoursite.com/logo.png"
                disabled={!branding.enabled}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Recommended: 200x50px PNG or SVG with transparent background
              </p>
              {branding.logoUrl && branding.enabled && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-2">Preview:</p>
                  <img
                    src={branding.logoUrl}
                    alt="Logo preview"
                    className="h-10 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Color
              </label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  disabled={!branding.enabled}
                  className="w-12 h-10 border rounded cursor-pointer disabled:opacity-50"
                />
                <input
                  type="text"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  placeholder="#3B82F6"
                  disabled={!branding.enabled}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Used for buttons, links, and accent colors in reports
              </p>
            </div>

            {/* Preview */}
            {branding.enabled && (
              <div className="border-t pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Email Report Preview</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div
                    className="p-4 text-white text-center"
                    style={{ backgroundColor: branding.primaryColor }}
                  >
                    {branding.logoUrl ? (
                      <img
                        src={branding.logoUrl}
                        alt={branding.companyName}
                        className="h-8 mx-auto object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <span className="font-semibold">{branding.companyName}</span>
                    )}
                  </div>
                  <div className="p-4 bg-white">
                    <p className="text-sm text-gray-600">Weekly Analytics Report</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">1,234 visitors</p>
                  </div>
                  <div className="p-3 bg-gray-50 text-center text-xs text-gray-500">
                    Powered by {branding.companyName}
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="pt-4 border-t">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Branding Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
