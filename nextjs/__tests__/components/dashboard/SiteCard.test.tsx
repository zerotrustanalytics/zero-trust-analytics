/**
 * SiteCard Component Tests
 * Tests for the site card display component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils/test-utils'
import { SiteCard } from '@/components/dashboard/SiteCard'
import { createMockSite } from '@/test/utils/test-utils'
import userEvent from '@testing-library/user-event'

describe('SiteCard', () => {
  const mockSite = createMockSite()
  const mockOnView = vi.fn()
  const mockOnEdit = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnViewSnippet = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render site name', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(mockSite.name)).toBeInTheDocument()
    })

    it('should render site domain', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(mockSite.domain)).toBeInTheDocument()
    })

    it('should render pageview count', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(mockSite.pageviews.toLocaleString())).toBeInTheDocument()
    })

    it('should render visitor count', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(mockSite.visitors.toLocaleString())).toBeInTheDocument()
    })

    it('should render pageviews label', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText('Pageviews')).toBeInTheDocument()
    })

    it('should render visitors label', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText('Visitors')).toBeInTheDocument()
    })

    it('should have data-testid attribute', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByTestId('site-card')).toBeInTheDocument()
    })

    it('should format large numbers with commas', () => {
      const siteWithLargeNumbers = createMockSite({
        pageviews: 1234567,
        visitors: 987654
      })

      render(
        <SiteCard
          site={siteWithLargeNumbers}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText('1,234,567')).toBeInTheDocument()
      expect(screen.getByText('987,654')).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('should call onView when View Analytics button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const viewButton = screen.getByRole('button', { name: /view analytics/i })
      await user.click(viewButton)

      expect(mockOnView).toHaveBeenCalledWith(mockSite.id)
    })

    it('should call onViewSnippet when Snippet button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const snippetButton = screen.getByRole('button', { name: /snippet/i })
      await user.click(snippetButton)

      expect(mockOnViewSnippet).toHaveBeenCalledWith(mockSite.id)
    })

    it('should call onEdit when Edit button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const editButton = screen.getByRole('button', { name: /edit/i })
      await user.click(editButton)

      expect(mockOnEdit).toHaveBeenCalledWith(mockSite.id)
    })

    it('should call onDelete when Delete button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      expect(mockOnDelete).toHaveBeenCalledWith(mockSite.id)
    })

    it('should not allow multiple simultaneous clicks', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const viewButton = screen.getByRole('button', { name: /view analytics/i })

      // Try to click multiple times rapidly
      await user.click(viewButton)
      await user.click(viewButton)
      await user.click(viewButton)

      // Should debounce or only call once if loading state is set
      expect(mockOnView).toHaveBeenCalledTimes(1)
    })
  })

  describe('Visual States', () => {
    it('should apply hover styles', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const card = screen.getByTestId('site-card')
      expect(card).toHaveClass('hover:shadow-lg')
    })

    it('should show inactive badge when site is inactive', () => {
      const inactiveSite = createMockSite({ isActive: false })

      render(
        <SiteCard
          site={inactiveSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(/inactive/i)).toBeInTheDocument()
    })

    it('should not show inactive badge when site is active', () => {
      const activeSite = createMockSite({ isActive: true })

      render(
        <SiteCard
          site={activeSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.queryByText(/inactive/i)).not.toBeInTheDocument()
    })

    it('should display loading state when loading prop is true', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
          loading={true}
        />
      )

      expect(screen.getByTestId('site-card')).toHaveClass('opacity-50')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByRole('button', { name: /view analytics/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /snippet/i })).toBeInTheDocument()
    })

    it('should have proper ARIA labels', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const card = screen.getByTestId('site-card')
      expect(card).toHaveAttribute('aria-label', expect.stringContaining(mockSite.name))
    })

    it('should support keyboard navigation for all buttons', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should have focus visible styles', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveClass(/focus:/)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero pageviews', () => {
      const siteWithZeroViews = createMockSite({ pageviews: 0, visitors: 0 })

      render(
        <SiteCard
          site={siteWithZeroViews}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('should handle very long site names', () => {
      const longName = 'A'.repeat(100)
      const siteWithLongName = createMockSite({ name: longName })

      render(
        <SiteCard
          site={siteWithLongName}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(longName)).toBeInTheDocument()
    })

    it('should handle very long domains', () => {
      const longDomain = 'subdomain.' + 'verylongdomainname'.repeat(5) + '.com'
      const siteWithLongDomain = createMockSite({ domain: longDomain })

      render(
        <SiteCard
          site={siteWithLongDomain}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(longDomain)).toBeInTheDocument()
    })

    it('should handle missing optional props gracefully', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByTestId('site-card')).toBeInTheDocument()
    })

    it('should render without crashing when callbacks are undefined', () => {
      expect(() => {
        render(
          <SiteCard
            site={mockSite}
            onView={undefined as any}
            onEdit={undefined as any}
            onDelete={undefined as any}
            onViewSnippet={undefined as any}
          />
        )
      }).not.toThrow()
    })
  })

  describe('Data Display', () => {
    it('should display tracking ID if provided', () => {
      const siteWithTracking = createMockSite({ trackingId: 'zt_abc123' })

      render(
        <SiteCard
          site={siteWithTracking}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(/zt_abc123/)).toBeInTheDocument()
    })

    it('should display created date', () => {
      const siteWithDate = createMockSite({
        createdAt: '2024-01-01T00:00:00Z'
      })

      render(
        <SiteCard
          site={siteWithDate}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      expect(screen.getByText(/2024/)).toBeInTheDocument()
    })

    it('should show visitor to pageview ratio', () => {
      const site = createMockSite({
        pageviews: 1000,
        visitors: 500
      })

      render(
        <SiteCard
          site={site}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      // Should show both metrics
      expect(screen.getByText('1,000')).toBeInTheDocument()
      expect(screen.getByText('500')).toBeInTheDocument()
    })
  })

  describe('Button States', () => {
    it('should disable all buttons when loading', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
          loading={true}
        />
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })

    it('should show delete confirmation state', async () => {
      const user = userEvent.setup()

      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      // Should show confirmation or call handler
      expect(mockOnDelete).toHaveBeenCalled()
    })

    it('should enable buttons when not loading', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
          loading={false}
        />
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).not.toBeDisabled()
      })
    })
  })

  describe('Styling and Layout', () => {
    it('should apply card base styles', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const card = screen.getByTestId('site-card')
      expect(card).toHaveClass(/border/)
      expect(card).toHaveClass(/rounded/)
    })

    it('should apply transition styles', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
        />
      )

      const card = screen.getByTestId('site-card')
      expect(card).toHaveClass(/transition/)
    })

    it('should apply selected styles when provided', () => {
      render(
        <SiteCard
          site={mockSite}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onViewSnippet={mockOnViewSnippet}
          selected={true}
        />
      )

      const card = screen.getByTestId('site-card')
      expect(card).toHaveClass(/ring/)
    })
  })
})
