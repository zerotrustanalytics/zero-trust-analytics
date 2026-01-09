/**
 * UsageBanner Component Tests
 *
 * Tests for the usage banner that displays at 80% and 100% usage thresholds
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the UsageContext
const mockUseUsage = vi.fn()
vi.mock('@/components/dashboard/UsageContext', () => ({
  useUsage: () => mockUseUsage()
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}))

// Import after mocking
import { UsageBanner } from '@/components/dashboard/UsageBanner'

describe('UsageBanner', () => {
  const defaultUsageData = {
    usage: {
      current: { pageviews: 8000, visitors: 2000, events: 1000 },
      limit: 10000,
      percentUsed: 80,
      remaining: 2000,
      isWithinLimit: true
    },
    plan: {
      name: 'Pro',
      tier: 'pro'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================
  // LOADING AND DATA STATES
  // ==========================================
  describe('Loading and Data States', () => {
    it('returns null when loading', () => {
      mockUseUsage.mockReturnValue({
        usageData: null,
        loading: true,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      const { container } = render(<UsageBanner />)
      expect(container.firstChild).toBeNull()
    })

    it('returns null when no usage data', () => {
      mockUseUsage.mockReturnValue({
        usageData: null,
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      const { container } = render(<UsageBanner />)
      expect(container.firstChild).toBeNull()
    })

    it('returns null when usage below 80%', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 50, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      const { container } = render(<UsageBanner />)
      expect(container.firstChild).toBeNull()
    })
  })

  // ==========================================
  // WARNING BANNER (80-99%)
  // ==========================================
  describe('Warning Banner (80-99%)', () => {
    beforeEach(() => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })
    })

    it('renders warning banner at 80%+ usage', () => {
      render(<UsageBanner />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/You've used 85% of your monthly pageviews/)).toBeInTheDocument()
    })

    it('shows plan name in message', () => {
      render(<UsageBanner />)

      expect(screen.getByText(/Your Pro plan is approaching its limit/)).toBeInTheDocument()
    })

    it('shows Upgrade Plan button', () => {
      render(<UsageBanner />)

      const upgradeLink = screen.getByRole('link', { name: /Upgrade Plan/i })
      expect(upgradeLink).toBeInTheDocument()
      expect(upgradeLink).toHaveAttribute('href', '/dashboard/billing')
    })

    it('shows dismiss button', () => {
      render(<UsageBanner />)

      expect(screen.getByRole('button', { name: /Dismiss banner/i })).toBeInTheDocument()
    })

    it('calls dismissBanner when dismiss clicked', () => {
      const dismissBanner = vi.fn()
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner
      })

      render(<UsageBanner />)

      fireEvent.click(screen.getByRole('button', { name: /Dismiss banner/i }))
      expect(dismissBanner).toHaveBeenCalledTimes(1)
    })

    it('returns null when warning banner dismissed', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: true,
        dismissBanner: vi.fn()
      })

      const { container } = render(<UsageBanner />)
      expect(container.firstChild).toBeNull()
    })

    it('renders with yellow styling', () => {
      render(<UsageBanner />)

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('yellow')
    })

    it('rounds percentage in display', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85.7, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/You've used 86% of your monthly pageviews/)).toBeInTheDocument()
    })
  })

  // ==========================================
  // LIMIT BANNER (100%+)
  // ==========================================
  describe('Limit Banner (100%+)', () => {
    beforeEach(() => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 105, isWithinLimit: false },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })
    })

    it('renders limit banner at 100%+ usage', () => {
      render(<UsageBanner />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Monthly pageview limit exceeded/)).toBeInTheDocument()
    })

    it('shows data collection message', () => {
      render(<UsageBanner />)

      expect(screen.getByText(/Data is being collected but hidden until you upgrade/)).toBeInTheDocument()
    })

    it('shows Upgrade Now button', () => {
      render(<UsageBanner />)

      const upgradeLink = screen.getByRole('link', { name: /Upgrade Now/i })
      expect(upgradeLink).toBeInTheDocument()
      expect(upgradeLink).toHaveAttribute('href', '/dashboard/billing')
    })

    it('does NOT show dismiss button for limit banner', () => {
      render(<UsageBanner />)

      expect(screen.queryByRole('button', { name: /Dismiss banner/i })).not.toBeInTheDocument()
    })

    it('cannot be dismissed', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 105, isWithinLimit: false },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: true, // Even if set to true
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      // Should still render
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('renders with red styling', () => {
      render(<UsageBanner />)

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('red')
    })
  })

  // ==========================================
  // EDGE CASES
  // ==========================================
  describe('Edge Cases', () => {
    it('shows warning at exactly 80%', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 80, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/You've used 80% of your monthly pageviews/)).toBeInTheDocument()
    })

    it('shows limit banner at exactly 100%', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 100, isWithinLimit: false },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/Monthly pageview limit exceeded/)).toBeInTheDocument()
    })

    it('shows limit banner when isWithinLimit is false even under 100%', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 95, isWithinLimit: false },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/Monthly pageview limit exceeded/)).toBeInTheDocument()
    })

    it('handles Free plan name', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: { name: 'Free', tier: 'free' }
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/Your Free plan is approaching its limit/)).toBeInTheDocument()
    })

    it('handles Enterprise plan name', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 105, isWithinLimit: false },
          plan: { name: 'Enterprise', tier: 'enterprise' }
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByText(/Your Enterprise plan limit has been reached/)).toBeInTheDocument()
    })
  })

  // ==========================================
  // ACCESSIBILITY
  // ==========================================
  describe('Accessibility', () => {
    it('has role="alert"', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('has aria-live="polite"', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
    })

    it('dismiss button has aria-label', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      const dismissButton = screen.getByRole('button', { name: /Dismiss banner/i })
      expect(dismissButton).toHaveAttribute('aria-label', 'Dismiss banner')
    })

    it('upgrade link is keyboard accessible', () => {
      mockUseUsage.mockReturnValue({
        usageData: {
          usage: { ...defaultUsageData.usage, percentUsed: 85, isWithinLimit: true },
          plan: defaultUsageData.plan
        },
        loading: false,
        bannerDismissed: false,
        dismissBanner: vi.fn()
      })

      render(<UsageBanner />)

      const upgradeLink = screen.getByRole('link', { name: /Upgrade Plan/i })
      expect(upgradeLink).not.toHaveAttribute('tabindex', '-1')
    })
  })
})
