import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Modal, ModalFooter } from '@/components/ui/Modal'

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Modal content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders when isOpen is true', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Modal content')).toBeInTheDocument()
    })

    it('does not render when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders title when provided', () => {
      render(<Modal {...defaultProps} title="Test Title" />)
      expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('renders description when provided', () => {
      render(<Modal {...defaultProps} description="Test description" />)
      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('renders close button', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument()
    })
  })


  describe('interactions', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)
      fireEvent.click(screen.getByRole('button', { name: 'Close modal' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Escape key pressed', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when overlay clicked', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)
      fireEvent.click(screen.getByTestId('modal-overlay'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when clicking modal content', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)
      fireEvent.click(screen.getByText('Modal content'))
      expect(onClose).not.toHaveBeenCalled()
    })

    it('respects closeOnOverlayClick=false', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} closeOnOverlayClick={false} />)
      fireEvent.click(screen.getByTestId('modal-overlay'))
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('keeps focus in a field when the parent re-renders with a new onClose', () => {
      // Callers pass onClose inline; re-rendering must not pull focus back to the dialog.
      const { rerender } = render(<Modal {...defaultProps} onClose={() => {}}><input aria-label="Name" /></Modal>)
      const field = screen.getByRole('textbox', { name: 'Name' })
      field.focus()
      rerender(<Modal {...defaultProps} onClose={() => {}}><input aria-label="Name" /></Modal>)
      expect(field).toHaveFocus()
    })

    it('moves focus into the dialog and returns it when closed', () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      opener.focus()
      const { rerender } = render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveFocus()
      rerender(<Modal {...defaultProps} isOpen={false} />)
      expect(opener).toHaveFocus()
      opener.remove()
    })

    it('has role="dialog"', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has aria-modal="true"', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('sets aria-labelledby when title provided', () => {
      render(<Modal {...defaultProps} title="Modal Title" />)
      // The id is generated; the dialog's accessible name comes from the title.
      expect(screen.getByRole('dialog', { name: 'Modal Title' })).toBeInTheDocument()
    })

    it('sets aria-describedby when description provided', () => {
      render(<Modal {...defaultProps} description="Modal description" />)
      // The id is generated; what matters is that it points at the description.
      const id = screen.getByRole('dialog').getAttribute('aria-describedby')
      expect(id).toBeTruthy()
      expect(document.getElementById(id!)).toHaveTextContent(/./)
    })

    it('does not set aria-labelledby without title', () => {
      render(<Modal {...defaultProps} />)
      expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby')
    })

    it('has accessible close button', () => {
      render(<Modal {...defaultProps} />)
      const closeButton = screen.getByRole('button', { name: 'Close modal' })
      expect(closeButton).toHaveAttribute('aria-label', 'Close modal')
    })

    it('backdrop has aria-hidden', () => {
      render(<Modal {...defaultProps} />)
      const backdrop = document.querySelector('[aria-hidden="true"]')
      expect(backdrop).toBeInTheDocument()
    })
  })

  describe('header', () => {
    it('shows header when title provided', () => {
      render(<Modal {...defaultProps} title="Title" />)
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    })

    it('shows header when description provided', () => {
      render(<Modal {...defaultProps} description="Desc" />)
      expect(screen.getByText('Desc')).toBeInTheDocument()
    })

    it('shows both title and description', () => {
      render(<Modal {...defaultProps} title="Title" description="Description" />)
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Description')).toBeInTheDocument()
    })
  })
})

describe('ModalFooter', () => {
  it('renders children', () => {
    render(
      <ModalFooter>
        <button>Cancel</button>
        <button>Confirm</button>
      </ModalFooter>
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('applies default styles', () => {
    const { container } = render(<ModalFooter>Content</ModalFooter>)
    expect(container.firstChild).toHaveClass('flex', 'justify-end', 'gap-3')
  })

  it('accepts custom className', () => {
    const { container } = render(<ModalFooter className="custom-footer">Content</ModalFooter>)
    expect(container.firstChild).toHaveClass('custom-footer')
  })
})
