'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface UsageData {
  usage: {
    current: { pageviews: number; visitors: number; events: number }
    limit: number
    percentUsed: number
    remaining: number
    isWithinLimit: boolean
  }
  plan: {
    name: string
    tier: string
  }
}

interface UsageContextType {
  usageData: UsageData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  dismissBanner: () => void
  bannerDismissed: boolean
}

const UsageContext = createContext<UsageContextType | undefined>(undefined)

export function UsageProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const fetchUsage = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        setUsageData(data)
        setError(null)
      } else {
        setError('Failed to load usage data')
      }
    } catch {
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchUsage()
    // Refresh every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchUsage])

  const dismissBanner = () => setBannerDismissed(true)

  return (
    <UsageContext.Provider value={{
      usageData,
      loading,
      error,
      refetch: fetchUsage,
      dismissBanner,
      bannerDismissed
    }}>
      {children}
    </UsageContext.Provider>
  )
}

export function useUsage() {
  const context = useContext(UsageContext)
  if (context === undefined) {
    throw new Error('useUsage must be used within a UsageProvider')
  }
  return context
}
