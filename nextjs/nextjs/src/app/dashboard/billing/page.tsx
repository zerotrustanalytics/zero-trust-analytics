'use client'

import { useState } from 'react'
import { Button, Card } from '@/components/ui'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['1 website', '10,000 pageviews/mo', '30-day data retention', 'Basic analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    popular: true,
    features: ['10 websites', '100,000 pageviews/mo', '1-year data retention', 'Advanced analytics', 'Custom events', 'API access'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 29,
    features: ['Unlimited websites', '1M pageviews/mo', '2-year data retention', 'Team members', 'Priority support', 'Custom reports'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    features: ['Unlimited everything', 'Dedicated support', 'SLA guarantee', 'Custom integrations', 'On-premise option'],
  },
]

export default function BillingPage() {
  const [currentPlan] = useState('pro')
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async (planId: string) => {
    setLoading(planId)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/stripe/portal`, {
        method: 'POST',
        credentials: 'include',
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground">Manage your subscription and billing</p>
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
            <h2 className="text-2xl font-bold text-primary">Pro</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your next billing date is <strong>February 3, 2026</strong>
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">$9<span className="text-lg font-normal text-muted-foreground">/mo</span></p>
          </div>
        </div>
      </Card>

      {/* Usage */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Usage This Month</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Pageviews</p>
            <p className="text-2xl font-bold">12,456</p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '12%' }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">12,456 / 100,000</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Websites</p>
            <p className="text-2xl font-bold">3</p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '30%' }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">3 / 10</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Team Members</p>
            <p className="text-2xl font-bold">1</p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '20%' }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">1 / 5</p>
          </div>
        </div>
      </Card>

      {/* Plans */}
      <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`p-6 relative ${plan.popular ? 'border-primary ring-2 ring-primary' : ''}`}
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
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
