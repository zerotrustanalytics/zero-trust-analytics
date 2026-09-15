/**
 * Sidebar Component Tests
 *
 * Tests for the dashboard navigation sidebar
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactNode } from 'react'

// Mock next/navigation
const mockUsePathname = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname()
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}))

// Mock Clerk UserButton
vi.mock('@clerk/nextjs', () => ({
  UserButton: ({ afterSignOutUrl }: { afterSignOutUrl: string }) => (
    <button data-testid="user-button" data-signout-url={afterSignOutUrl}>
      User
    </button>
  )
}))

// Mock SidebarContext
const mockToggle = vi.fn()
const mockUseSidebar = vi.fn()
vi.mock('@/components/dashboard/SidebarContext', () => ({
  useSidebar: () => mockUseSidebar()
}))

// Import after mocking
import { Sidebar } from '@/components/dashboard/Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSidebar.mockReturnValue({
      collapsed: false,
      toggle: mockToggle
    })
  })

  // ==========================================
  // BASIC RENDERING
  // ==========================================
  describe('Basic Rendering', () => {
    it('renders sidebar element', () => {
      render(<Sidebar />)

      expect(screen.getByRole('complementary')).toBeInTheDocument()
    })

    it('renders logo link', () => {
      render(<Sidebar />)

      const logoLink = screen.getByRole('link', { name: /Zero Trust Analytics/i })
      expect(logoLink).toBeInTheDocument()
      expect(logoLink).toHaveAttribute('href', '/dashboard')
    })

    it('shows ZTA when expanded', () => {
      render(<Sidebar />)

      expect(screen.getByText('ZTA')).toBeInTheDocument()
    })

    it('shows Z when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        collapsed: true,
        toggle: mockToggle
      })

      render(<Sidebar />)

      expect(screen.getByText('Z')).toBeInTheDocument()
    })

    it('renders toggle button', () => {
      render(<Sidebar />)

      const toggleButton = screen.getByRole('button', { name: /Collapse sidebar/i })
      expect(toggleButton).toBeInTheDocument()
    })
  })

  // ==========================================
  // NAVIGATION SECTIONS
  // ==========================================
  describe('Navigation Sections', () => {
    it('renders Analytics section', () => {
      render(<Sidebar />)

      expect(screen.getByText('Analytics')).toBeInTheDocument()
    })

    it('renders Data section', () => {
      render(<Sidebar />)

      expect(screen.getByText('Data')).toBeInTheDocument()
    })

    it('renders Settings section', () => {
      render(<Sidebar />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('hides section titles when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        collapsed: true,
        toggle: mockToggle
      })

      render(<Sidebar />)

      // Section titles should be sr-only when collapsed
      const analyticsTitle = screen.getByText('Analytics')
      expect(analyticsTitle).toHaveClass('sr-only')
    })
  })

  // ==========================================
  // NAVIGATION ITEMS
  // ==========================================
  describe('Navigation Items', () => {
    it('renders Dashboard link', () => {
      render(<Sidebar />)

      // Get the nav link, not the logo link
      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      const navLink = dashboardLinks.find(link => link.textContent?.includes('Dashboard'))
      expect(navLink).toHaveAttribute('href', '/dashboard')
    })

    it('renders Sites link', () => {
      render(<Sidebar />)

      const sitesLink = screen.getByRole('link', { name: /Sites/i })
      expect(sitesLink).toHaveAttribute('href', '/dashboard/sites')
    })

    it('renders Real-time link', () => {
      render(<Sidebar />)

      const realtimeLink = screen.getByRole('link', { name: /Real-time/i })
      expect(realtimeLink).toHaveAttribute('href', '/dashboard/realtime')
    })

    it('renders Reports link', () => {
      render(<Sidebar />)

      const reportsLink = screen.getByRole('link', { name: /Reports/i })
      expect(reportsLink).toHaveAttribute('href', '/dashboard/reports')
    })

    it('renders Annotations link', () => {
      render(<Sidebar />)

      const annotationsLink = screen.getByRole('link', { name: /Annotations/i })
      expect(annotationsLink).toHaveAttribute('href', '/dashboard/annotations')
    })

    it('renders Import Data link', () => {
      render(<Sidebar />)

      const importLink = screen.getByRole('link', { name: /Import Data/i })
      expect(importLink).toHaveAttribute('href', '/dashboard/import')
    })

    it('renders API Keys link', () => {
      render(<Sidebar />)

      const apiKeysLink = screen.getByRole('link', { name: /API Keys/i })
      expect(apiKeysLink).toHaveAttribute('href', '/dashboard/api-keys')
    })

    it('renders Account link', () => {
      render(<Sidebar />)

      const accountLink = screen.getByRole('link', { name: /Account/i })
      expect(accountLink).toHaveAttribute('href', '/dashboard/settings')
    })

    it('renders Billing link', () => {
      render(<Sidebar />)

      const billingLink = screen.getByRole('link', { name: /Billing/i })
      expect(billingLink).toHaveAttribute('href', '/dashboard/billing')
    })

    it('renders Team link', () => {
      render(<Sidebar />)

      const teamLink = screen.getByRole('link', { name: /Team/i })
      expect(teamLink).toHaveAttribute('href', '/dashboard/team')
    })
  })

  // ==========================================
  // ACTIVE STATE
  // ==========================================
  describe('Active State', () => {
    it('marks Dashboard as active on /dashboard', () => {
      mockUsePathname.mockReturnValue('/dashboard')

      render(<Sidebar />)

      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      const navLink = dashboardLinks.find(link => link.textContent?.includes('Dashboard'))
      expect(navLink).toHaveAttribute('aria-current', 'page')
    })

    it('marks Sites as active on /dashboard/sites', () => {
      mockUsePathname.mockReturnValue('/dashboard/sites')

      render(<Sidebar />)

      const sitesLink = screen.getByRole('link', { name: /Sites/i })
      expect(sitesLink).toHaveAttribute('aria-current', 'page')
    })

    it('marks Sites as active on nested site route', () => {
      mockUsePathname.mockReturnValue('/dashboard/sites/abc123')

      render(<Sidebar />)

      const sitesLink = screen.getByRole('link', { name: /Sites/i })
      expect(sitesLink).toHaveAttribute('aria-current', 'page')
    })

    it('marks Billing as active on /dashboard/billing', () => {
      mockUsePathname.mockReturnValue('/dashboard/billing')

      render(<Sidebar />)

      const billingLink = screen.getByRole('link', { name: /Billing/i })
      expect(billingLink).toHaveAttribute('aria-current', 'page')
    })

    it('applies active styling to current route', () => {
      mockUsePathname.mockReturnValue('/dashboard')

      render(<Sidebar />)

      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      const navLink = dashboardLinks.find(link => link.textContent?.includes('Dashboard'))
      expect(navLink?.className).toContain('primary')
    })
  })

  // ==========================================
  // TOGGLE FUNCTIONALITY
  // ==========================================
  describe('Toggle Functionality', () => {
    it('calls toggle when toggle button clicked', () => {
      render(<Sidebar />)

      fireEvent.click(screen.getByRole('button', { name: /Collapse sidebar/i }))

      expect(mockToggle).toHaveBeenCalledTimes(1)
    })

    it('shows Expand sidebar when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        collapsed: true,
        toggle: mockToggle
      })

      render(<Sidebar />)

      expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
    })

    it('has aria-expanded attribute', () => {
      render(<Sidebar />)

      const toggleButton = screen.getByRole('button', { name: /Collapse sidebar/i })
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    })

    it('sets aria-expanded to false when collapsed', () => {
      mockUseSidebar.mockReturnValue({
        collapsed: true,
        toggle: mockToggle
      })

      render(<Sidebar />)

      const toggleButton = screen.getByRole('button', { name: /Expand sidebar/i })
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    })
  })

  // ==========================================
  // COLLAPSED STATE
  // ==========================================
  describe('Collapsed State', () => {
    beforeEach(() => {
      mockUseSidebar.mockReturnValue({
        collapsed: true,
        toggle: mockToggle
      })
    })

    it('has narrower width when collapsed', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('w-16')
    })

    it('hides nav item labels when collapsed', () => {
      render(<Sidebar />)

      // Labels should not be visible text (might be in title/aria-label)
      const dashboardLinks = screen.getAllByRole('link', { name: /Dashboard/i })
      const navLink = dashboardLinks.find(link => link.getAttribute('title') === 'Dashboard')
      expect(navLink).toHaveAttribute('title', 'Dashboard')
    })

    it('shows tooltips on collapsed items', () => {
      render(<Sidebar />)

      const links = screen.getAllByRole('link')
      const navLinks = links.filter(l => l.getAttribute('title'))
      expect(navLinks.length).toBeGreaterThan(0)
    })
  })

  // ==========================================
  // USER BUTTON
  // ==========================================
  describe('User Button', () => {
    it('renders Clerk UserButton', () => {
      render(<Sidebar />)

      expect(screen.getByTestId('user-button')).toBeInTheDocument()
    })

    it('configures correct sign out URL', () => {
      render(<Sidebar />)

      const userButton = screen.getByTestId('user-button')
      expect(userButton).toHaveAttribute('data-signout-url', 'https://ztas.io')
    })

    it('shows Account label when expanded', () => {
      render(<Sidebar />)

      expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    })
  })

  // ==========================================
  // ACCESSIBILITY
  // ==========================================
  describe('Accessibility', () => {
    it('has role="complementary"', () => {
      render(<Sidebar />)

      expect(screen.getByRole('complementary')).toBeInTheDocument()
    })

    it('has aria-label on sidebar', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar).toHaveAttribute('aria-label', 'Site navigation sidebar')
    })

    it('has main navigation landmark', () => {
      render(<Sidebar />)

      const nav = screen.getByRole('navigation', { name: /Main navigation/i })
      expect(nav).toBeInTheDocument()
    })

    it('nav sections have proper grouping', () => {
      render(<Sidebar />)

      const groups = screen.getAllByRole('group')
      expect(groups.length).toBe(3) // Analytics, Data, Settings
    })

    it('nav sections have proper labeling', () => {
      render(<Sidebar />)

      const analyticsGroup = screen.getByRole('group', { name: /Analytics/i })
      expect(analyticsGroup).toBeInTheDocument()
    })

    it('icons have aria-hidden', () => {
      render(<Sidebar />)

      const svgs = document.querySelectorAll('svg[aria-hidden="true"]')
      expect(svgs.length).toBeGreaterThan(0)
    })

    it('active link has aria-current="page"', () => {
      mockUsePathname.mockReturnValue('/dashboard')

      render(<Sidebar />)

      const currentPage = screen.getByRole('link', { current: 'page' })
      expect(currentPage).toBeInTheDocument()
    })

    it('logo link has accessible name', () => {
      render(<Sidebar />)

      const logoLink = screen.getByRole('link', { name: /Zero Trust Analytics/i })
      expect(logoLink).toHaveAttribute('aria-label')
    })

    it('toggle button has minimum touch target', () => {
      render(<Sidebar />)

      const toggleButton = screen.getByRole('button', { name: /Collapse sidebar/i })
      expect(toggleButton.className).toContain('min-w-[44px]')
      expect(toggleButton.className).toContain('min-h-[44px]')
    })

    it('links have visible focus indicators', () => {
      render(<Sidebar />)

      const links = screen.getAllByRole('link')
      links.forEach(link => {
        expect(link.className).toContain('focus:')
      })
    })
  })

  // ==========================================
  // STYLING
  // ==========================================
  describe('Styling', () => {
    it('is fixed positioned', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('fixed')
    })

    it('spans full height', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('h-screen')
    })

    it('has border right', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('border-r')
    })

    it('has proper z-index', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('z-40')
    })

    it('has transition for collapse animation', () => {
      render(<Sidebar />)

      const sidebar = screen.getByRole('complementary')
      expect(sidebar.className).toContain('transition')
    })
  })
})
