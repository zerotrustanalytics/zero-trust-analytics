'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

interface UseSessionTimeoutOptions {
  /**
   * Idle timeout in milliseconds (default: 30 minutes)
   */
  timeout?: number
  /**
   * Warning time before logout in milliseconds (default: 5 minutes)
   */
  warningTime?: number
  /**
   * Callback when session is about to expire
   */
  onWarning?: (remainingTime: number) => void
  /**
   * Callback when session expires
   */
  onTimeout?: () => void
  /**
   * Whether to enable the timeout (default: true)
   */
  enabled?: boolean
}

interface UseSessionTimeoutReturn {
  /**
   * Whether the warning modal should be shown
   */
  showWarning: boolean
  /**
   * Remaining time in seconds before logout
   */
  remainingSeconds: number
  /**
   * Reset the idle timer (call this to extend session)
   */
  resetTimer: () => void
  /**
   * Manually trigger logout
   */
  forceLogout: () => void
}

const THIRTY_MINUTES = 30 * 60 * 1000
const FIVE_MINUTES = 5 * 60 * 1000

// Events that indicate user activity
const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const

export function useSessionTimeout(
  options: UseSessionTimeoutOptions = {}
): UseSessionTimeoutReturn {
  const {
    timeout = THIRTY_MINUTES,
    warningTime = FIVE_MINUTES,
    onWarning,
    onTimeout,
    enabled = true,
  } = options

  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current)
      warningRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const handleLogout = useCallback(async () => {
    clearTimers()
    setShowWarning(false)

    if (onTimeout) {
      onTimeout()
    }

    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    }

    router.push('/login?reason=session_expired')
  }, [clearTimers, onTimeout, router])

  const startWarningCountdown = useCallback(() => {
    setShowWarning(true)
    setRemainingSeconds(Math.ceil(warningTime / 1000))

    if (onWarning) {
      onWarning(warningTime)
    }

    // Start countdown
    countdownRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          handleLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Set final logout timer
    timeoutRef.current = setTimeout(handleLogout, warningTime)
  }, [handleLogout, onWarning, warningTime])

  const resetTimer = useCallback(() => {
    if (!enabled) return

    clearTimers()
    setShowWarning(false)
    setRemainingSeconds(0)
    lastActivityRef.current = Date.now()

    // Set warning timer
    const warningDelay = timeout - warningTime
    warningRef.current = setTimeout(startWarningCountdown, warningDelay)
  }, [clearTimers, enabled, startWarningCountdown, timeout, warningTime])

  const forceLogout = useCallback(() => {
    handleLogout()
  }, [handleLogout])

  // Set up activity listeners
  useEffect(() => {
    if (!enabled) return

    // Throttled activity handler
    let lastHandled = 0
    const throttleMs = 1000 // Only handle once per second

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastHandled < throttleMs) return
      lastHandled = now

      // Only reset if warning is not showing (user must click to extend)
      if (!showWarning) {
        resetTimer()
      }
    }

    // Add event listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Initial timer start
    resetTimer()

    // Cleanup
    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      clearTimers()
    }
  }, [enabled, resetTimer, showWarning, clearTimers])

  // Handle visibility change (user switching tabs)
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if session should have expired while away
        const idleTime = Date.now() - lastActivityRef.current
        if (idleTime >= timeout) {
          handleLogout()
        } else if (idleTime >= timeout - warningTime) {
          // Show warning with remaining time
          const remaining = timeout - idleTime
          setShowWarning(true)
          setRemainingSeconds(Math.ceil(remaining / 1000))
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, handleLogout, timeout, warningTime])

  return {
    showWarning,
    remainingSeconds,
    resetTimer,
    forceLogout,
  }
}
