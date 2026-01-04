'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface SubscriptionStatus {
  plan: 'free' | 'pro' | 'trial'
  status: 'active' | 'trial' | 'expired' | 'canceled'
  canAccess: boolean
  trialEndsAt?: string
  daysLeft?: number
  subscription?: {
    status: string
    currentPeriodEnd?: string
  }
}

export default function BillingPage() {
  const { getToken } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [managingBilling, setManagingBilling] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/user/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch subscription status')
        return
      }

      setStatus(data)
    } catch {
      setError('Failed to load subscription status')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to start checkout')
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch {
      alert('Failed to start checkout')
    } finally {
      setUpgrading(false)
    }
  }

  const handleManageBilling = async () => {
    setManagingBilling(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/stripe/portal`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to open billing portal')
        return
      }

      // Redirect to Stripe Customer Portal
      window.location.href = data.url
    } catch {
      alert('Failed to open billing portal')
    } finally {
      setManagingBilling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const isPro = status?.plan === 'pro' && status?.subscription?.status === 'active'
  const isTrial = status?.status === 'trial'
  const isExpired = status?.status === 'expired'

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Billing</h1>
      <p className="text-muted-foreground mb-8">Manage your subscription and payment methods</p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Current Plan Card */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Current Plan</h2>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-2xl font-bold ${isPro ? 'text-green-600 dark:text-green-400' : ''}`}>
                {isPro ? 'Pro' : isTrial ? 'Trial' : 'Free'}
              </span>
              {isPro && (
                <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                  Active
                </span>
              )}
              {isTrial && (
                <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
                  {status?.daysLeft} days left
                </span>
              )}
              {isExpired && (
                <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
                  Expired
                </span>
              )}
            </div>
            {isTrial && status?.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                Trial expires on {new Date(status.trialEndsAt).toLocaleDateString()}
              </p>
            )}
            {isPro && status?.subscription?.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Next billing date: {new Date(status.subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>

          {isPro ? (
            <button
              onClick={handleManageBilling}
              disabled={managingBilling}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {managingBilling ? 'Opening...' : 'Manage Billing'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {upgrading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
          )}
        </div>
      </section>

      {/* Plan Comparison */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Plan Features</h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
          {/* Free Plan */}
          <div className="p-6">
            <h3 className="font-semibold text-lg mb-4">Free</h3>
            <p className="text-2xl font-bold mb-4">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                1 website
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                10,000 pageviews/mo
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                7-day data retention
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                No API access
              </li>
            </ul>
          </div>

          {/* Pro Plan */}
          <div className={`p-6 ${isPro ? 'bg-primary/5' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-semibold text-lg">Pro</h3>
              {isPro && (
                <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">Current</span>
              )}
            </div>
            <p className="text-2xl font-bold mb-4">$9<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Unlimited websites
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                1M pageviews/mo
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Forever data retention
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Full API access
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Team collaboration
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Priority support
              </li>
            </ul>
            {!isPro && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="mt-6 w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {upgrading ? 'Redirecting...' : 'Upgrade Now'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Payment History */}
      {isPro && (
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4">Payment History</h2>
          <p className="text-sm text-muted-foreground">
            View your invoices and payment history in the{' '}
            <button
              onClick={handleManageBilling}
              className="text-primary hover:underline"
            >
              Stripe Customer Portal
            </button>
            .
          </p>
        </section>
      )}

      {/* FAQ */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <details className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <summary className="font-medium cursor-pointer">Can I cancel my subscription?</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Yes, you can cancel anytime from the billing portal. You&apos;ll continue to have access until the end of your billing period.
            </p>
          </details>
          <details className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <summary className="font-medium cursor-pointer">What payment methods do you accept?</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              We accept all major credit cards including Visa, Mastercard, American Express, and Discover through our secure Stripe integration.
            </p>
          </details>
          <details className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <summary className="font-medium cursor-pointer">What happens when I reach my pageview limit?</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;ll notify you when you&apos;re approaching your limit. If you exceed it, we&apos;ll continue tracking but recommend upgrading for uninterrupted service.
            </p>
          </details>
        </div>
      </section>
    </div>
  )
}
