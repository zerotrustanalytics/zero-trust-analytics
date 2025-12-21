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

  describe('sizes', () => {
    it('renders small size', () => {
      render(<Modal {...defaultProps} size="sm" />)
      expect(screen.getByRole('dialog').querySelector('.max-w-sm')).toBeInTheDocument()
    })

    it('renders medium size (default)', () => {
      render(<Modal {...defaultProps} size="md" />)
      expect(screen.getByRole('dialog').querySelector('.max-w-md')).toBeInTheDocument()
    })

    it('renders large size', () => {
      render(<Modal {...defaultProps} size="lg" />)
      expect(screen.getByRole('dialog').querySelector('.max-w-lg')).toBeInTheDocument()
    })

    it('renders extra large size', () => {
      render(<Modal {...defaultProps} size="xl" />)
      expect(screen.getByRole('dialog').querySelector('.max-w-xl')).toBeInTheDocument()
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
      // Click on the overlay container, not the modal content
      const overlay = screen.getByRole('dialog')
      fireEvent.click(overlay)
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
      const overlay = screen.getByRole('dialog')
      fireEvent.click(overlay)
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
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
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'modal-title')
    })

    it('sets aria-describedby when description provided', () => {
      render(<Modal {...defaultProps} description="Modal description" />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'modal-description')
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
    expect(container.firstChild).toHaveClass('px-6', 'py-4', 'border-t', 'flex', 'justify-end', 'gap-3')
  })

  it('accepts custom className', () => {
    const { container } = render(<ModalFooter className="custom-footer">Content</ModalFooter>)
    expect(container.firstChild).toHaveClass('custom-footer')
  })
})
