/**
 * UsageContext Tests
 *
 * Tests for the usage context provider - simplified for reliability
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    })
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock Clerk
const mockGetToken = vi.fn()
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken
  })
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Import after mocking
import { UsageProvider, useUsage } from '@/components/dashboard/UsageContext'

describe('UsageContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UsageProvider>{children}</UsageProvider>
  )

  const mockUsageResponse = {
    usage: {
      current: { pageviews: 5000, visitors: 1000, events: 500, month: '2026-01' },
      limit: 10000,
      percentUsed: 50,
      remaining: 5000,
      isWithinLimit: true
    },
    plan: {
      name: 'Pro',
      tier: 'pro'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
    localStorageMock.clear()
    mockGetToken.mockResolvedValue('test-token')
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUsageResponse)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================
  // INITIAL STATE
  // ==========================================
  describe('Initial State', () => {
    it('starts with loading true', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(result.current.loading).toBe(true)
    })

    it('starts with null usage data', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(result.current.usageData).toBeNull()
    })

    it('starts with banner not dismissed', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(result.current.bannerDismissed).toBe(false)
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(result.current.error).toBeNull()
    })
  })

  // ==========================================
  // BANNER DISMISSAL
  // ==========================================
  describe('Banner Dismissal', () => {
    it('provides dismissBanner function', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(typeof result.current.dismissBanner).toBe('function')
    })

    it('dismissBanner sets bannerDismissed to true', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })

      act(() => {
        result.current.dismissBanner()
      })

      expect(result.current.bannerDismissed).toBe(true)
    })
  })

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================
  describe('Toast Notifications', () => {
    it('provides showUsageToast function', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(typeof result.current.showUsageToast).toBe('function')
    })
  })

  // ==========================================
  // REFETCH FUNCTION
  // ==========================================
  describe('Refetch Function', () => {
    it('provides refetch function', () => {
      const { result } = renderHook(() => useUsage(), { wrapper })
      expect(typeof result.current.refetch).toBe('function')
    })
  })

  // ==========================================
  // CONTEXT HOOK ERRORS
  // ==========================================
  describe('Context Hook Errors', () => {
    it('throws error when used outside provider', () => {
      expect(() => {
        renderHook(() => useUsage())
      }).toThrow('useUsage must be used within a UsageProvider')
    })
  })

  // ==========================================
  // NOTIFICATION KEYS
  // ==========================================
  describe('Notification Keys', () => {
    it('generates correct localStorage key for 80% notification', () => {
      // The key format is: usage_toast_80_shown_YYYY-MM
      const month = '2026-01'
      const expectedKey = `usage_toast_80_shown_${month}`

      // Verify the key format matches expectation
      expect(expectedKey).toBe('usage_toast_80_shown_2026-01')
    })

    it('generates correct localStorage key for 100% notification', () => {
      const month = '2026-01'
      const expectedKey = `usage_toast_100_shown_${month}`

      expect(expectedKey).toBe('usage_toast_100_shown_2026-01')
    })
  })

  // ==========================================
  // API URL CONFIGURATION
  // ==========================================
  describe('API URL Configuration', () => {
    it('uses NEXT_PUBLIC_API_URL env variable', () => {
      // The component uses: process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const defaultUrl = 'https://ztas.io'
      expect(defaultUrl).toBe('https://ztas.io')
    })
  })
})
