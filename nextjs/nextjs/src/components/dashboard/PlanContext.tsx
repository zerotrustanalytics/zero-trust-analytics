'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'

interface PlanLimits {
  sites: {
    current: number
    max: number
    canAdd: boolean
  }
  teamMembers: {
    max: number
    canInvite: boolean
  }
  pageviews: {
    max: number
  }
  dataRetentionDays: number
}

interface PlanFeatures {
  realtime: boolean
  basicStats: boolean
  topPages: boolean
  referrers: boolean
  devices: boolean
  countries: boolean
  entryExitPages: boolean
  utmTracking: boolean
  customEvents: boolean
  goals: boolean
  funnels: boolean
  apiAccess: boolean
  emailReports: boolean
  exportData: boolean
  annotations: boolean
}

interface UpgradePath {
  plan: string
  name: string
  price: number | null
  benefits: string[]
}

interface PlanData {
  plan: {
    id: string
    name: string
    price: number | null
  }
  limits: PlanLimits
  features: PlanFeatures
  upgradePath: UpgradePath | null
}

interface PlanContextType {
  planData: PlanData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  canUseFeature: (feature: keyof PlanFeatures) => boolean
  canAddSite: () => boolean
  canInviteTeamMember: () => boolean
  isPaidPlan: () => boolean
}

const PlanContext = createContext<PlanContextType | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlanLimits = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getToken()
      if (!token) {
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/plan-limits`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        const data = await res.json()
        setPlanData(data)
      } else {
        setError('Failed to load plan data')
      }
    } catch (err) {
      console.error('Plan limits fetch error:', err)
      setError('Failed to load plan data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlanLimits()
  }, [getToken])

  const canUseFeature = (feature: keyof PlanFeatures): boolean => {
    if (!planData) return false
    return planData.features[feature] ?? false
  }

  const canAddSite = (): boolean => {
    if (!planData) return false
    return planData.limits.sites.canAdd
  }

  const canInviteTeamMember = (): boolean => {
    if (!planData) return false
    return planData.limits.teamMembers.canInvite
  }

  const isPaidPlan = (): boolean => {
    if (!planData) return false
    return planData.plan.id !== 'free'
  }

  return (
    <PlanContext.Provider
      value={{
        planData,
        loading,
        error,
        refetch: fetchPlanLimits,
        canUseFeature,
        canAddSite,
        canInviteTeamMember,
        isPaidPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  const context = useContext(PlanContext)
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider')
  }
  return context
}

// Helper component for gated features
interface FeatureGateProps {
  feature: keyof PlanFeatures
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { canUseFeature, loading } = usePlan()

  if (loading) return null
  if (!canUseFeature(feature)) {
    return fallback ? <>{fallback}</> : null
  }
  return <>{children}</>
}

// Upgrade prompt component
interface UpgradePromptProps {
  feature: string
  className?: string
}

export function UpgradePrompt({ feature, className = '' }: UpgradePromptProps) {
  const { planData } = usePlan()

  if (!planData?.upgradePath) return null

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Upgrade to {planData.upgradePath.name} to unlock {feature}
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            Starting at ${planData.upgradePath.price}/month
          </p>
        </div>
        <a
          href="/dashboard/billing"
          className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          Upgrade
        </a>
      </div>
    </div>
  )
}
