'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button, Card } from '@/components/ui'

interface UsageData {
  plan: {
    name: string
    tier: string
    limits: {
      monthlyPageviews: number
      sites: number
      teamMembers: number
      dataRetentionDays: number
    }
    features: string[]
  }
  usage: {
    current: {
      month: string
      pageviews: number
      visitors: number
      events: number
    }
    limit: number
    percentUsed: number
    remaining: number
    isWithinLimit: boolean
  }
  counts: {
    sites: number
    teamMembers: number
  }
  billingPeriod: {
    start: string
    end: string
    daysRemaining: number
  }
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    pageviews: '5,000',
    features: ['1 website', '5,000 pageviews/mo', '30-day data retention', 'Basic analytics'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 9,
    pageviews: '50,000',
    features: ['3 websites', '50,000 pageviews/mo', '6-month data retention', 'Full analytics', 'Email reports'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 19,
    popular: true,
    pageviews: '200,000',
    features: ['10 websites', '200,000 pageviews/mo', '1-year data retention', 'Full analytics', 'API access', '3 team members'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 49,
    pageviews: '1,000,000',
    features: ['Unlimited websites', '1M pageviews/mo', '2-year data retention', '5 team members', 'Priority support'],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 99,
    pageviews: '5,000,000',
    features: ['Unlimited websites', '5M pageviews/mo', 'Unlimited retention', '20 team members', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    pageviews: 'Unlimited',
    features: ['Unlimited everything', 'Dedicated support', 'SLA guarantee', 'Custom integrations'],
  },
]

export default function BillingPage() {
  const { getToken } = useAuth()
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUsage() {
      try {
        const token = await getToken()
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
        const res = await fetch(`${apiUrl}/api/usage`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (res.ok) {
          const data = await res.json()
          setUsageData(data)
        } else {
          setError('Failed to load usage data')
        }
      } catch (err) {
        console.error('Usage fetch error:', err)
        setError('Failed to load usage data')
      }
    }

    fetchUsage()
  }, [getToken])

  const handleUpgrade = async (planId: string) => {
    setLoading(planId)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
    } finally {
      setLoading(null)
    }
  }

  const handleManageBilling = async () => {
    setLoading('portal')
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/stripe/portal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Portal error:', error)
    } finally {
      setLoading(null)
    }
  }

  const currentPlan = usageData?.plan.tier || 'free'
  const formatNumber = (num: number) => num.toLocaleString()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Billing & Usage</h1>
          <p className="text-muted-foreground">Manage your subscription and track usage</p>
        </div>
        <Button variant="outline" onClick={handleManageBilling} disabled={loading === 'portal'}>
          {loading === 'portal' ? 'Loading...' : 'Manage Billing'}
        </Button>
      </div>

      {/* Current Plan */}
      <Card className="p-6 mb-8 bg-primary/5 border-primary">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <h2 className="text-2xl font-bold text-primary">{usageData?.plan.name || 'Free'}</h2>
            {usageData?.billingPeriod && (
              <p className="text-sm text-muted-foreground mt-1">
                Billing period ends <strong>{new Date(usageData.billingPeriod.end).toLocaleDateString()}</strong>
                <span className="ml-2">({usageData.billingPeriod.daysRemaining} days remaining)</span>
              </p>
            )}
          </div>
          <div className="text-right">
            {plans.find(p => p.id === currentPlan)?.price !== null ? (
              <p className="text-3xl font-bold">
                ${plans.find(p => p.id === currentPlan)?.price || 0}
                <span className="text-lg font-normal text-muted-foreground">/mo</span>
              </p>
            ) : (
              <p className="text-xl font-bold">Custom</p>
            )}
          </div>
        </div>
      </Card>

      {/* Usage */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Usage This Month</h2>
        {error ? (
          <p className="text-red-500">{error}</p>
        ) : !usageData ? (
          <p className="text-muted-foreground">Loading usage data...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Pageviews</p>
              <p className="text-2xl font-bold">{formatNumber(usageData.usage.current.pageviews)}</p>
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    usageData.usage.percentUsed >= 90
                      ? 'bg-red-500'
                      : usageData.usage.percentUsed >= 75
                        ? 'bg-yellow-500'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(usageData.usage.percentUsed, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(usageData.usage.current.pageviews)} / {usageData.usage.limit === Infinity ? 'Unlimited' : formatNumber(usageData.usage.limit)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Websites</p>
              <p className="text-2xl font-bold">{usageData.counts?.sites || 0}</p>
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    usageData.plan.limits.sites !== Infinity && (usageData.counts?.sites || 0) > usageData.plan.limits.sites
                      ? 'bg-red-500'
                      : usageData.plan.limits.sites !== Infinity && (usageData.counts?.sites || 0) >= usageData.plan.limits.sites
                        ? 'bg-yellow-500'
                        : 'bg-primary'
                  }`}
                  style={{
                    width: usageData.plan.limits.sites === Infinity
                      ? '10%'
                      : `${Math.min(((usageData.counts?.sites || 0) / usageData.plan.limits.sites) * 100, 100)}%`
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {usageData.counts?.sites || 0} / {usageData.plan.limits.sites === Infinity ? 'Unlimited' : usageData.plan.limits.sites}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Team Members</p>
              <p className="text-2xl font-bold">{usageData.counts?.teamMembers || 0}</p>
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: usageData.plan.limits.teamMembers === Infinity
                      ? '10%'
                      : `${Math.min(((usageData.counts?.teamMembers || 0) / usageData.plan.limits.teamMembers) * 100, 100)}%`
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {usageData.counts?.teamMembers || 0} / {usageData.plan.limits.teamMembers === Infinity ? 'Unlimited' : usageData.plan.limits.teamMembers}
              </p>
            </div>
          </div>
        )}

        {/* Usage warning */}
        {usageData && !usageData.usage.isWithinLimit && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium">Usage limit exceeded</span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              You&apos;ve exceeded your monthly pageview limit. New pageviews are not being tracked.
              Upgrade your plan to continue tracking.
            </p>
          </div>
        )}
      </Card>

      {/* Plans */}
      <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`p-6 relative ${plan.popular ? 'border-primary ring-2 ring-primary' : ''} ${plan.id === currentPlan ? 'bg-primary/5' : ''}`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <div className="mt-2 mb-4">
              {plan.price !== null ? (
                <p className="text-3xl font-bold">
                  ${plan.price}<span className="text-lg font-normal text-muted-foreground">/mo</span>
                </p>
              ) : (
                <p className="text-xl font-bold">Contact Us</p>
              )}
              <p className="text-sm text-muted-foreground">{plan.pageviews} pageviews/mo</p>
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              variant={plan.id === currentPlan ? 'outline' : 'default'}
              fullWidth
              disabled={plan.id === currentPlan || loading === plan.id}
              onClick={() => handleUpgrade(plan.id)}
            >
              {plan.id === currentPlan
                ? 'Current Plan'
                : loading === plan.id
                  ? 'Loading...'
                  : plan.price === null
                    ? 'Contact Sales'
                    : 'Upgrade'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
