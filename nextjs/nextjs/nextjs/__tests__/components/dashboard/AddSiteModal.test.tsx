/**
 * AddSiteModal Component Tests
 * Tests for the add/edit site modal component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils/test-utils'
import { AddSiteModal } from '@/components/dashboard/AddSiteModal'
import userEvent from '@testing-library/user-event'

describe('AddSiteModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render modal when open', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should not render modal when closed', () => {
      render(<AddSiteModal isOpen={false} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should render modal title for new site', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/add new site/i)).toBeInTheDocument()
    })

    it('should render modal title for editing site', () => {
      const site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site'
      }

      render(
        <AddSiteModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          site={site}
        />
      )

      expect(screen.getByText(/edit site/i)).toBeInTheDocument()
    })

    it('should render domain input field', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByLabelText(/domain/i)).toBeInTheDocument()
    })

    it('should render name input field', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByLabelText(/site name/i)).toBeInTheDocument()
    })

    it('should render submit button', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /add site/i })).toBeInTheDocument()
    })

    it('should render cancel button', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('should pre-fill form when editing', () => {
      const site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site'
      }

      render(
        <AddSiteModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          site={site}
        />
      )

      expect(screen.getByDisplayValue('example.com')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Example Site')).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should show error when domain is empty', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'My Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/domain is required/i)).toBeInTheDocument()
      })
    })

    it('should show error when name is empty', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/site name is required/i)).toBeInTheDocument()
      })
    })

    it('should show error for invalid domain format', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'invalid domain')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'My Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid domain/i)).toBeInTheDocument()
      })
    })

    it('should clear errors when input is corrected', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/domain is required/i)).toBeInTheDocument()
      })

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      await waitFor(() => {
        expect(screen.queryByText(/domain is required/i)).not.toBeInTheDocument()
      })
    })

    it('should sanitize domain input', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'https://www.example.com/')

      await waitFor(() => {
        expect(screen.getByDisplayValue('example.com')).toBeInTheDocument()
      })
    })

    it('should trim whitespace from inputs', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, '  example.com  ')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, '  My Site  ')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            domain: 'example.com',
            name: 'My Site'
          })
        )
      })
    })
  })

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'Example Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          domain: 'example.com',
          name: 'Example Site'
        })
      })
    })

    it('should show loading state during submission', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'Example Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      expect(screen.getByText(/adding/i)).toBeInTheDocument()
      expect(submitButton).toBeDisabled()
    })

    it('should disable inputs during submission', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'Example Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      expect(domainInput).toBeDisabled()
      expect(nameInput).toBeDisabled()
    })

    it('should handle submission error', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockRejectedValue(new Error('Failed to create site'))

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'Example Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to create site/i)).toBeInTheDocument()
      })
    })

    it('should close modal on successful submission', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockResolvedValue({ success: true })

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      const nameInput = screen.getByLabelText(/site name/i)
      await user.type(nameInput, 'Example Site')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })
  })

  describe('Modal Interactions', () => {
    it('should close modal when cancel button is clicked', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close modal when overlay is clicked', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const overlay = screen.getByTestId('modal-overlay')
      await user.click(overlay)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should close modal when Escape key is pressed', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      await user.keyboard('{Escape}')

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should reset form when closed', async () => {
      const user = userEvent.setup()

      const { rerender } = render(
        <AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />
      )

      const domainInput = screen.getByLabelText(/domain/i)
      await user.type(domainInput, 'example.com')

      rerender(<AddSiteModal isOpen={false} onClose={mockOnClose} onSubmit={mockOnSubmit} />)
      rerender(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByLabelText(/domain/i)).toHaveValue('')
    })
  })

  describe('Accessibility', () => {
    it('should trap focus within modal', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      cancelButton.focus()

      await user.keyboard('{Tab}')

      const submitButton = screen.getByRole('button', { name: /add site/i })
      expect(submitButton).toHaveFocus()
    })

    it('should have proper ARIA labels', () => {
      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby')
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup()

      render(<AddSiteModal isOpen={true} onClose={mockOnClose} onSubmit={mockOnSubmit} />)

      const submitButton = screen.getByRole('button', { name: /add site/i })
      await user.click(submitButton)

      await waitFor(() => {
        const errorMessage = screen.getByText(/domain is required/i)
        expect(errorMessage).toHaveAttribute('role', 'alert')
      })
    })
  })
})
