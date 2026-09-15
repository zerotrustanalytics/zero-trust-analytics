'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

interface UsageData {
  usage: {
    current: { pageviews: number; visitors: number; events: number; month?: string }
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
  showUsageToast: (type: 'warning' | 'limit', percentUsed: number) => void
}

const UsageContext = createContext<UsageContextType | undefined>(undefined)

// Storage keys for tracking shown notifications
const STORAGE_KEY_80 = 'usage_toast_80_shown'
const STORAGE_KEY_100 = 'usage_toast_100_shown'

function getNotificationKey(key: string, month: string) {
  return `${key}_${month}`
}

function hasShownNotification(key: string, month: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(getNotificationKey(key, month)) === 'true'
}

function markNotificationShown(key: string, month: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getNotificationKey(key, month), 'true')
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [toastQueue, setToastQueue] = useState<Array<{ type: 'warning' | 'limit'; percent: number }>>([])
  const prevPercentRef = useRef<number | null>(null)

  // Toast display function - will be connected to Toast provider
  const showUsageToast = useCallback((type: 'warning' | 'limit', percentUsed: number) => {
    setToastQueue(prev => [...prev, { type, percent: percentUsed }])
  }, [])

  // Trigger email notification (backend call - works when email is configured)
  const triggerEmailNotification = useCallback(async (threshold: '80' | '100') => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      await fetch(`${apiUrl}/api/usage-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threshold })
      }).catch(() => {
        // Silently fail if endpoint doesn't exist yet
      })
    } catch {
      // Email not configured yet - that's ok
    }
  }, [getToken])

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
        const newPercent = data.usage?.percentUsed ?? 0
        const month = data.usage?.current?.month || new Date().toISOString().slice(0, 7)
        const prevPercent = prevPercentRef.current

        // Check for threshold crossings (one-time per month)
        if (prevPercent !== null) {
          // Crossed 80% threshold
          if (prevPercent < 80 && newPercent >= 80 && newPercent < 100) {
            if (!hasShownNotification(STORAGE_KEY_80, month)) {
              showUsageToast('warning', newPercent)
              markNotificationShown(STORAGE_KEY_80, month)
              triggerEmailNotification('80')
            }
          }

          // Crossed 100% threshold
          if (prevPercent < 100 && newPercent >= 100) {
            if (!hasShownNotification(STORAGE_KEY_100, month)) {
              showUsageToast('limit', newPercent)
              markNotificationShown(STORAGE_KEY_100, month)
              triggerEmailNotification('100')
            }
          }
        } else {
          // First load - check if we should show notification
          if (newPercent >= 100 && !hasShownNotification(STORAGE_KEY_100, month)) {
            showUsageToast('limit', newPercent)
            markNotificationShown(STORAGE_KEY_100, month)
          } else if (newPercent >= 80 && newPercent < 100 && !hasShownNotification(STORAGE_KEY_80, month)) {
            showUsageToast('warning', newPercent)
            markNotificationShown(STORAGE_KEY_80, month)
          }
        }

        prevPercentRef.current = newPercent
        setUsageData(data)
        setError(null)
      } else {
        console.error('Usage API failed:', res.status, await res.text())
        setError('Failed to load usage data')
      }
    } catch {
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [getToken, showUsageToast, triggerEmailNotification])

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
      bannerDismissed,
      showUsageToast
    }}>
      {children}
      {/* Render queued toasts */}
      <UsageToastRenderer toasts={toastQueue} onClear={() => setToastQueue([])} />
    </UsageContext.Provider>
  )
}

// Component to render usage toasts
function UsageToastRenderer({ toasts, onClear }: { toasts: Array<{ type: 'warning' | 'limit'; percent: number }>; onClear: () => void }) {
  useEffect(() => {
    if (toasts.length === 0) return

    // Import and use toast dynamically to avoid circular deps
    const showToasts = async () => {
      for (const toast of toasts) {
        // Create toast element directly since we may not have ToastProvider here
        const toastEl = document.createElement('div')
        toastEl.className = `fixed bottom-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg border animate-in slide-in-from-right-5 ${
          toast.type === 'limit'
            ? 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800'
            : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800'
        }`

        const title = toast.type === 'limit' ? 'Usage Limit Reached' : 'Usage Warning'
        const message = toast.type === 'limit'
          ? `You've used ${toast.percent}% of your monthly pageviews. Data is being collected but hidden until you upgrade.`
          : `You've used ${toast.percent}% of your monthly pageviews. Consider upgrading to avoid interruption.`
        const textColor = toast.type === 'limit' ? 'text-red-800 dark:text-red-200' : 'text-yellow-800 dark:text-yellow-200'

        toastEl.innerHTML = `
          <div class="flex gap-3">
            <div class="flex-1">
              <p class="font-semibold text-sm ${textColor}">${title}</p>
              <p class="text-sm mt-1 ${textColor} opacity-80">${message}</p>
              <a href="/dashboard/billing" class="inline-block mt-2 text-sm font-medium ${textColor} hover:underline">
                Upgrade Plan &rarr;
              </a>
            </div>
            <button class="flex-shrink-0 ${textColor} hover:opacity-70" onclick="this.parentElement.parentElement.remove()">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        `

        document.body.appendChild(toastEl)

        // Auto-remove after 10 seconds
        setTimeout(() => {
          toastEl.remove()
        }, 10000)
      }
      onClear()
    }

    showToasts()
  }, [toasts, onClear])

  return null
}

export function useUsage() {
  const context = useContext(UsageContext)
  if (context === undefined) {
    throw new Error('useUsage must be used within a UsageProvider')
  }
  return context
}
