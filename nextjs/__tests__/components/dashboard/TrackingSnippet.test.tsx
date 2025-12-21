/**
 * TrackingSnippet Component Tests
 * Tests for the tracking snippet display component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils/test-utils'
import { TrackingSnippet } from '@/components/dashboard/TrackingSnippet'
import userEvent from '@testing-library/user-event'

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn()
  }
})

describe('TrackingSnippet', () => {
  const mockSiteId = 'zt_abc123'
  const mockSnippet = `<script async defer src="/api/script/${mockSiteId}" data-site-id="${mockSiteId}"></script>`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render snippet code', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      expect(screen.getByText(mockSnippet, { exact: false })).toBeInTheDocument()
    })

    it('should render copy button', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    })

    it('should render installation instructions', () => {
      render(<TrackingSnippet siteId={mockSiteId} showInstructions={true} />)

      expect(screen.getByText(/installation instructions/i)).toBeInTheDocument()
    })

    it('should highlight syntax', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      const codeBlock = screen.getByTestId('code-snippet')
      expect(codeBlock).toHaveClass('syntax-highlight')
    })

    it('should render framework tabs', () => {
      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      expect(screen.getByRole('tab', { name: /html/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /react/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /next\.js/i })).toBeInTheDocument()
    })

    it('should render snippet title', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      expect(screen.getByText(/tracking snippet/i)).toBeInTheDocument()
    })

    it('should display site ID', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      expect(screen.getByText(mockSiteId)).toBeInTheDocument()
    })
  })

  describe('Copy Functionality', () => {
    it('should copy snippet to clipboard', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockResolvedValue()

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(mockSiteId)
      )
    })

    it('should show success message after copying', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockResolvedValue()

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })

    it('should reset success message after delay', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockResolvedValue()

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })

      await waitFor(
        () => {
          expect(screen.queryByText(/copied/i)).not.toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })

    it('should handle copy error gracefully', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Copy failed'))

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to copy/i)).toBeInTheDocument()
      })
    })

    it('should disable copy button while copying', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      expect(copyButton).toBeDisabled()
    })
  })

  describe('Framework Tabs', () => {
    it('should switch to React tab', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      const reactTab = screen.getByRole('tab', { name: /react/i })
      await user.click(reactTab)

      await waitFor(() => {
        expect(screen.getByText(/useEffect/i)).toBeInTheDocument()
      })
    })

    it('should switch to Next.js tab', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      const nextTab = screen.getByRole('tab', { name: /next\.js/i })
      await user.click(nextTab)

      await waitFor(() => {
        expect(screen.getByText(/_app/i)).toBeInTheDocument()
      })
    })

    it('should highlight active tab', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      const reactTab = screen.getByRole('tab', { name: /react/i })
      await user.click(reactTab)

      expect(reactTab).toHaveAttribute('aria-selected', 'true')
    })

    it('should show different snippet for each framework', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      const htmlSnippet = screen.getByTestId('code-snippet').textContent

      const reactTab = screen.getByRole('tab', { name: /react/i })
      await user.click(reactTab)

      await waitFor(() => {
        const reactSnippet = screen.getByTestId('code-snippet').textContent
        expect(reactSnippet).not.toBe(htmlSnippet)
      })
    })
  })

  describe('Installation Instructions', () => {
    it('should show HTML installation steps', () => {
      render(<TrackingSnippet siteId={mockSiteId} showInstructions={true} />)

      expect(screen.getByText(/paste.*before.*<\/head>/i)).toBeInTheDocument()
    })

    it('should toggle instructions visibility', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} />)

      const toggleButton = screen.getByRole('button', { name: /show instructions/i })
      await user.click(toggleButton)

      expect(screen.getByText(/installation instructions/i)).toBeInTheDocument()

      await user.click(toggleButton)

      expect(screen.queryByText(/installation instructions/i)).not.toBeInTheDocument()
    })

    it('should show framework-specific instructions', async () => {
      const user = userEvent.setup()

      render(
        <TrackingSnippet siteId={mockSiteId} showInstructions={true} showFrameworks={true} />
      )

      const reactTab = screen.getByRole('tab', { name: /react/i })
      await user.click(reactTab)

      await waitFor(() => {
        expect(screen.getByText(/import.*useEffect/i)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have accessible code block', () => {
      render(<TrackingSnippet siteId={mockSiteId} />)

      const codeBlock = screen.getByRole('code')
      expect(codeBlock).toHaveAttribute('aria-label', 'Tracking snippet code')
    })

    it('should announce copy success to screen readers', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockResolvedValue()

      render(<TrackingSnippet siteId={mockSiteId} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      await user.click(copyButton)

      await waitFor(() => {
        const message = screen.getByText(/copied/i)
        expect(message).toHaveAttribute('role', 'status')
      })
    })

    it('should support keyboard navigation for tabs', async () => {
      const user = userEvent.setup()

      render(<TrackingSnippet siteId={mockSiteId} showFrameworks={true} />)

      const htmlTab = screen.getByRole('tab', { name: /html/i })
      htmlTab.focus()

      await user.keyboard('{ArrowRight}')

      const reactTab = screen.getByRole('tab', { name: /react/i })
      expect(reactTab).toHaveFocus()
    })
  })
})
