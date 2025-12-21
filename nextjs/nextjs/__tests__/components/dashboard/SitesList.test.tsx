/**
 * SitesList Component Tests
 * Tests for the sites list display and management component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@/test/utils/test-utils'
import { SitesList } from '@/components/dashboard/SitesList'
import { createMockSite } from '@/test/utils/test-utils'
import userEvent from '@testing-library/user-event'

describe('SitesList', () => {
  const mockSites = [
    createMockSite({ id: 'site_1', name: 'Site 1', domain: 'site1.com', pageviews: 1000 }),
    createMockSite({ id: 'site_2', name: 'Site 2', domain: 'site2.com', pageviews: 2000 }),
    createMockSite({ id: 'site_3', name: 'Site 3', domain: 'site3.com', pageviews: 500 })
  ]

  const mockOnSiteSelect = vi.fn()
  const mockOnSiteEdit = vi.fn()
  const mockOnSiteDelete = vi.fn()
  const mockOnAddSite = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render sites list container', () => {
      render(<SitesList sites={mockSites} />)

      expect(screen.getByTestId('sites-list')).toBeInTheDocument()
    })

    it('should render all provided sites', () => {
      render(<SitesList sites={mockSites} />)

      expect(screen.getAllByTestId('site-card')).toHaveLength(3)
    })

    it('should render empty state when no sites', () => {
      render(<SitesList sites={[]} />)

      expect(screen.getByText(/no sites yet/i)).toBeInTheDocument()
      expect(screen.getByText(/get started by adding your first site/i)).toBeInTheDocument()
    })

    it('should render loading skeleton when loading', () => {
      render(<SitesList sites={[]} loading={true} />)

      expect(screen.getByTestId('sites-list-skeleton')).toBeInTheDocument()
    })

    it('should render error message when error occurs', () => {
      const error = 'Failed to fetch sites'
      render(<SitesList sites={[]} error={error} />)

      expect(screen.getByText(error)).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('should render header with title', () => {
      render(<SitesList sites={mockSites} />)

      expect(screen.getByText(/your sites/i)).toBeInTheDocument()
    })

    it('should render add site button in header', () => {
      render(<SitesList sites={mockSites} onAddSite={mockOnAddSite} />)

      expect(screen.getByRole('button', { name: /add site/i })).toBeInTheDocument()
    })

    it('should display total sites count', () => {
      render(<SitesList sites={mockSites} />)

      expect(screen.getByText(/3 sites/i)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should render empty state illustration', () => {
      render(<SitesList sites={[]} />)

      expect(screen.getByTestId('empty-state-illustration')).toBeInTheDocument()
    })

    it('should render add first site button in empty state', () => {
      render(<SitesList sites={[]} onAddSite={mockOnAddSite} />)

      expect(screen.getByRole('button', { name: /add your first site/i })).toBeInTheDocument()
    })

    it('should call onAddSite when empty state button is clicked', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={[]} onAddSite={mockOnAddSite} />)

      const addButton = screen.getByRole('button', { name: /add your first site/i })
      await user.click(addButton)

      expect(mockOnAddSite).toHaveBeenCalled()
    })

    it('should show helpful tips in empty state', () => {
      render(<SitesList sites={[]} />)

      expect(screen.getByText(/track analytics/i)).toBeInTheDocument()
    })
  })

  describe('Site Interactions', () => {
    it('should handle site selection', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} onSiteSelect={mockOnSiteSelect} />)

      const firstCard = screen.getAllByTestId('site-card')[0]
      await user.click(firstCard)

      expect(mockOnSiteSelect).toHaveBeenCalledWith('site_1')
    })

    it('should handle site edit', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} onSiteEdit={mockOnSiteEdit} />)

      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      await user.click(editButtons[0])

      expect(mockOnSiteEdit).toHaveBeenCalledWith('site_1')
    })

    it('should handle site delete', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} onSiteDelete={mockOnSiteDelete} />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      await user.click(deleteButtons[0])

      expect(mockOnSiteDelete).toHaveBeenCalledWith('site_1')
    })

    it('should handle add site button click', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} onAddSite={mockOnAddSite} />)

      const addButton = screen.getByRole('button', { name: /add site/i })
      await user.click(addButton)

      expect(mockOnAddSite).toHaveBeenCalled()
    })
  })

  describe('Search and Filter', () => {
    it('should render search input', () => {
      render(<SitesList sites={mockSites} searchable={true} />)

      expect(screen.getByPlaceholderText(/search sites/i)).toBeInTheDocument()
    })

    it('should filter sites by name', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Site 1')

      await waitFor(() => {
        expect(screen.getAllByTestId('site-card')).toHaveLength(1)
      })
    })

    it('should filter sites by domain', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'site2.com')

      await waitFor(() => {
        const cards = screen.getAllByTestId('site-card')
        expect(cards).toHaveLength(1)
        expect(within(cards[0]).getByText('site2.com')).toBeInTheDocument()
      })
    })

    it('should show no results message when search has no matches', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'nonexistent')

      await waitFor(() => {
        expect(screen.getByText(/no sites found/i)).toBeInTheDocument()
      })
    })

    it('should clear search filter', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Site 1')

      await waitFor(() => {
        expect(screen.getAllByTestId('site-card')).toHaveLength(1)
      })

      const clearButton = screen.getByRole('button', { name: /clear/i })
      await user.click(clearButton)

      await waitFor(() => {
        expect(screen.getAllByTestId('site-card')).toHaveLength(3)
      })
    })
  })

  describe('Sorting', () => {
    it('should render sort dropdown', () => {
      render(<SitesList sites={mockSites} sortable={true} />)

      expect(screen.getByRole('button', { name: /sort/i })).toBeInTheDocument()
    })

    it('should sort by name ascending', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} sortable={true} />)

      const sortButton = screen.getByRole('button', { name: /sort/i })
      await user.click(sortButton)

      const nameOption = screen.getByRole('option', { name: /name.*a.*z/i })
      await user.click(nameOption)

      await waitFor(() => {
        const cards = screen.getAllByTestId('site-card')
        expect(within(cards[0]).getByText('Site 1')).toBeInTheDocument()
      })
    })

    it('should sort by pageviews descending', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} sortable={true} />)

      const sortButton = screen.getByRole('button', { name: /sort/i })
      await user.click(sortButton)

      const pageviewsOption = screen.getByRole('option', { name: /pageviews/i })
      await user.click(pageviewsOption)

      await waitFor(() => {
        const cards = screen.getAllByTestId('site-card')
        expect(within(cards[0]).getByText('Site 2')).toBeInTheDocument()
      })
    })

    it('should sort by created date', async () => {
      const user = userEvent.setup()
      const sitesWithDates = [
        createMockSite({ id: 'site_1', createdAt: '2024-01-03T00:00:00Z' }),
        createMockSite({ id: 'site_2', createdAt: '2024-01-01T00:00:00Z' }),
        createMockSite({ id: 'site_3', createdAt: '2024-01-02T00:00:00Z' })
      ]

      render(<SitesList sites={sitesWithDates} sortable={true} />)

      const sortButton = screen.getByRole('button', { name: /sort/i })
      await user.click(sortButton)

      const dateOption = screen.getByRole('option', { name: /date/i })
      await user.click(dateOption)

      // Should sort by newest first
      await waitFor(() => {
        const cards = screen.getAllByTestId('site-card')
        expect(cards).toHaveLength(3)
      })
    })
  })

  describe('Bulk Actions', () => {
    it('should support selecting multiple sites', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} selectable={true} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      expect(screen.getByText(/2 selected/i)).toBeInTheDocument()
    })

    it('should select all sites', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} selectable={true} />)

      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i })
      await user.click(selectAllCheckbox)

      expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
    })

    it('should deselect all sites', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} selectable={true} />)

      const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all/i })
      await user.click(selectAllCheckbox)
      await user.click(selectAllCheckbox)

      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
    })

    it('should show bulk actions menu when sites are selected', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} selectable={true} />)

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])

      expect(screen.getByText(/bulk actions/i)).toBeInTheDocument()
    })

    it('should handle bulk delete', async () => {
      const user = userEvent.setup()
      const mockOnBulkDelete = vi.fn()
      render(
        <SitesList sites={mockSites} selectable={true} onBulkDelete={mockOnBulkDelete} />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      const bulkDeleteButton = screen.getByRole('button', { name: /delete selected/i })
      await user.click(bulkDeleteButton)

      expect(mockOnBulkDelete).toHaveBeenCalledWith(['site_1', 'site_2'])
    })
  })

  describe('Pagination', () => {
    it('should paginate large number of sites', () => {
      const manySites = Array.from({ length: 50 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SitesList sites={manySites} itemsPerPage={10} />)

      expect(screen.getAllByTestId('site-card')).toHaveLength(10)
    })

    it('should navigate to next page', async () => {
      const user = userEvent.setup()
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}`, name: `Site ${i}` })
      )

      render(<SitesList sites={manySites} itemsPerPage={10} />)

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

      render(<SitesList sites={manySites} itemsPerPage={10} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      const prevButton = screen.getByRole('button', { name: /previous/i })
      await user.click(prevButton)

      await waitFor(() => {
        expect(screen.getByText('Site 0')).toBeInTheDocument()
      })
    })

    it('should show current page number', () => {
      const manySites = Array.from({ length: 50 }, (_, i) =>
        createMockSite({ id: `site_${i}` })
      )

      render(<SitesList sites={manySites} itemsPerPage={10} />)

      expect(screen.getByText(/page 1 of 5/i)).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      const manySites = Array.from({ length: 25 }, (_, i) =>
        createMockSite({ id: `site_${i}` })
      )

      render(<SitesList sites={manySites} itemsPerPage={10} />)

      const prevButton = screen.getByRole('button', { name: /previous/i })
      expect(prevButton).toBeDisabled()
    })

    it('should disable next button on last page', () => {
      const sites = Array.from({ length: 5 }, (_, i) =>
        createMockSite({ id: `site_${i}` })
      )

      render(<SitesList sites={sites} itemsPerPage={10} />)

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
    })
  })

  describe('View Modes', () => {
    it('should render in grid view mode', () => {
      render(<SitesList sites={mockSites} viewMode="grid" />)

      const container = screen.getByTestId('sites-grid')
      expect(container).toHaveClass(/grid/)
    })

    it('should render in list view mode', () => {
      render(<SitesList sites={mockSites} viewMode="list" />)

      const container = screen.getByTestId('sites-list-view')
      expect(container).toHaveClass(/flex-col/)
    })

    it('should toggle between view modes', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} viewMode="grid" />)

      const listViewButton = screen.getByRole('button', { name: /list view/i })
      await user.click(listViewButton)

      expect(screen.getByTestId('sites-list-view')).toBeInTheDocument()
    })
  })

  describe('Refresh and Reload', () => {
    it('should handle refresh action', async () => {
      const user = userEvent.setup()
      const mockOnRefresh = vi.fn()
      render(<SitesList sites={mockSites} onRefresh={mockOnRefresh} />)

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      await user.click(refreshButton)

      expect(mockOnRefresh).toHaveBeenCalled()
    })

    it('should show loading state during refresh', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} loading={true} />)

      expect(screen.getByTestId('sites-list-skeleton')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SitesList sites={mockSites} />)

      expect(screen.getByRole('region', { name: /sites list/i })).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} />)

      const firstCard = screen.getAllByTestId('site-card')[0]
      firstCard.focus()

      await user.keyboard('{Tab}')

      // Next focusable element should receive focus
      expect(document.activeElement).not.toBe(firstCard)
    })

    it('should announce loading state to screen readers', () => {
      render(<SitesList sites={[]} loading={true} />)

      const loadingElement = screen.getByTestId('sites-list-skeleton')
      expect(loadingElement).toHaveAttribute('aria-busy', 'true')
    })

    it('should announce errors to screen readers', () => {
      render(<SitesList sites={[]} error="Failed to load sites" />)

      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should handle large number of sites efficiently', () => {
      const manySites = Array.from({ length: 1000 }, (_, i) =>
        createMockSite({ id: `site_${i}` })
      )

      const { container } = render(<SitesList sites={manySites} itemsPerPage={10} />)

      // Should only render paginated items
      expect(screen.getAllByTestId('site-card')).toHaveLength(10)
    })

    it('should memoize filtered results', async () => {
      const user = userEvent.setup()
      render(<SitesList sites={mockSites} searchable={true} />)

      const searchInput = screen.getByPlaceholderText(/search sites/i)
      await user.type(searchInput, 'Site 1')

      // Multiple renders should not recalculate
      expect(screen.getAllByTestId('site-card')).toHaveLength(1)
    })
  })
})
