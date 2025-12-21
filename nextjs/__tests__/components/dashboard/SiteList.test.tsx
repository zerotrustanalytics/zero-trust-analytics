/**
 * SiteList Component Tests
 * Tests for the site list container component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@/test/utils/test-utils'
import { SiteList } from '@/components/dashboard/SiteList'
import { createMockSite } from '@/test/utils/test-utils'
import userEvent from '@testing-library/user-event'

describe('SiteList', () => {
  const mockSites = [
    createMockSite({ id: 'site_1', name: 'Site 1', domain: 'site1.com' }),
    createMockSite({ id: 'site_2', name: 'Site 2', domain: 'site2.com' }),
    createMockSite({ id: 'site_3', name: 'Site 3', domain: 'site3.com' })
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render empty state when no sites', () => {
      render(<SiteList sites={[]} />)

      expect(screen.getByText(/no sites yet/i)).toBeInTheDocument()
    })

    it('should render all sites', () => {
      render(<SiteList sites={mockSites} />)

      expect(screen.getAllByTestId('site-card')).toHaveLength(3)
    })

    it('should render site names', () => {
      render(<SiteList sites={mockSites} />)

      expect(screen.getByText('Site 1')).toBeInTheDocument()
      expect(screen.getByText('Site 2')).toBeInTheDocument()
      expect(screen.getByText('Site 3')).toBeInTheDocument()
    })

    it('should render loading state', () => {
      render(<SiteList sites={[]} loading={true} />)

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('should render error state', () => {
      const error = 'Failed to load sites'
      render(<SiteList sites={[]} error={error} />)

      expect(screen.getByText(error)).toBeInTheDocument()
    })

    it('should render empty state message', () => {
      render(<SiteList sites={[]} />)

      expect(screen.getByText(/get started by adding your first site/i)).toBeInTheDocument()
    })

    it('should render add site button in empty state', () => {
      render(<SiteList sites={[]} />)

      expect(screen.getByRole('button', { name: /add your first site/i })).toBeInTheDocument()
    })

    it('should display grid layout for multiple sites', () => {
      render(<SiteList sites={mockSites} />)

      const container = screen.getByTestId('site-list-grid')
      expect(container).toHaveClass('grid')
    })
  })

  describe('Interactions', () => {
    it('should handle site selection', async () => {
      const user = userEvent.setup()
      const onSiteSelect = vi.fn()

      render(<SiteList sites={mockSites} onSiteSelect={onSiteSelect} />)

      const firstCard = screen.getAllByTestId('site-card')[0]
      await user.click(firstCard)

      expect(onSiteSelect).toHaveBeenCalledWith('site_1')
    })

    it('should handle add site button click in empty state', async () => {
      const user = userEvent.setup()
      const onAddSite = vi.fn()

      render(<SiteList sites={[]} onAddSite={onAddSite} />)

      const addButton = screen.getByRole('button', { name: /add your first site/i })
      await user.click(addButton)

      expect(onAddSite).toHaveBeenCalled()
    })

    it('should handle refresh action', async () => {
      const user = userEvent.setup()
      const onRefresh = vi.fn()

      render(<SiteList sites={mockSites} onRefresh={onRefresh} />)

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      await user.click(refreshButton)

      expect(onRefresh).toHaveBeenCalled()
    })

    it('should handle sorting by name', async () => {
      const user = userEvent.setup()

      render(<SiteList sites={mockSites} sortable={true} />)

      const sortButton = screen.getByRole('button', { name: /sort by name/i })
      await user.click(sortButton)

      const cards = screen.getAllByTestId('site-card')
      const firstCard = within(cards[0])

      expect(firstCard.getByText('Site 1')).toBeInTheDocument()
    })

    it('should handle sorting by pageviews', async () => {
      const user = userEvent.setup()
      const sitesWithViews = [
        createMockSite({ id: 'site_1', name: 'Site 1', pageviews: 100 }),
        createMockSite({ id: 'site_2', name: 'Site 2', pageviews: 500 }),
        createMockSite({ id: 'site_3', name: 'Site 3', pageviews: 200 })
      ]

      render(<SiteList sites={sitesWithViews} sortable={true} />)

      const sortButton = screen.getByRole('button', { name: /sort by pageviews/i })
      await user.click(sortButton)

      const cards = screen.getAllByTestId('site-card')
      const firstCard = within(cards[0])

      expect(firstCard.getByText('Site 2')).toBeInTheDocument()
    })
  })

  describe('Filtering', () => {
    it('should filter sites by search query', async () => {
      const user = userEvent.setup()

      render(<SiteList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Site 1')

      await waitFor(() => {
        expect(screen.getAllByTestId('site-card')).toHaveLength(1)
      })
    })

    it('should show no results message when no matches', async () => {
      const user = userEvent.setup()

      render(<SiteList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Nonexistent Site')

      await waitFor(() => {
        expect(screen.getByText(/no sites found/i)).toBeInTheDocument()
      })
    })

    it('should filter by active status', async () => {
      const user = userEvent.setup()
      const mixedSites = [
        createMockSite({ id: 'site_1', isActive: true }),
        createMockSite({ id: 'site_2', isActive: false }),
        createMockSite({ id: 'site_3', isActive: true })
      ]

      render(<SiteList sites={mixedSites} filterable={true} />)

      const activeFilter = screen.getByRole('button', { name: /active only/i })
      await user.click(activeFilter)

      await waitFor(() => {
        expect(screen.getAllByTestId('site-card')).toHaveLength(2)
      })
    })

    it('should clear search when clear button is clicked', async () => {
      const user = userEvent.setup()

      render(<SiteList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Site 1')

      const clearButton = screen.getByRole('button', { name: /clear/i })
      await user.click(clearButton)

      expect(searchInput).toHaveValue('')
      expect(screen.getAllByTestId('site-card')).toHaveLength(3)
    })
  })

  describe('Pagination', () => {
    it('should paginate sites', () => {
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SiteList sites={manySites} itemsPerPage={10} />)

      expect(screen.getAllByTestId('site-card')).toHaveLength(10)
    })

    it('should navigate to next page', async () => {
      const user = userEvent.setup()
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SiteList sites={manySites} itemsPerPage={10} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      await waitFor(() => {
        expect(screen.getByText('Site 10')).toBeInTheDocument()
      })
    })

    it('should navigate to previous page', async () => {
      const user = userEvent.setup()
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SiteList sites={manySites} itemsPerPage={10} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      const prevButton = screen.getByRole('button', { name: /previous/i })
      await user.click(prevButton)

      await waitFor(() => {
        expect(screen.getByText('Site 0')).toBeInTheDocument()
      })
    })

    it('should disable previous button on first page', () => {
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SiteList sites={manySites} itemsPerPage={10} />)

      const prevButton = screen.getByRole('button', { name: /previous/i })
      expect(prevButton).toBeDisabled()
    })

    it('should disable next button on last page', () => {
      const sites = Array.from({ length: 5 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SiteList sites={sites} itemsPerPage={10} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SiteList sites={mockSites} />)

      expect(screen.getByRole('list', { name: /sites/i })).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()

      render(<SiteList sites={mockSites} />)

      const firstCard = screen.getAllByTestId('site-card')[0]
      firstCard.focus()

      await user.keyboard('{Tab}')

      const secondCard = screen.getAllByTestId('site-card')[1]
      expect(secondCard).toHaveFocus()
    })
  })
})
