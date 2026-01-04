import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Spinner, LoadingOverlay } from '@/components/ui/Spinner'

describe('Spinner', () => {
  describe('rendering', () => {
    it('renders SVG element', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('has aria-label for accessibility', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Loading')
    })

    it('applies animation class', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('svg')).toHaveClass('animate-spin')
    })
  })

  describe('sizes', () => {
    it('renders small size', () => {
      const { container } = render(<Spinner size="sm" />)
      expect(container.querySelector('svg')).toHaveClass('w-4', 'h-4')
    })

    it('renders medium size (default)', () => {
      const { container } = render(<Spinner size="md" />)
      expect(container.querySelector('svg')).toHaveClass('w-6', 'h-6')
    })

    it('renders large size', () => {
      const { container } = render(<Spinner size="lg" />)
      expect(container.querySelector('svg')).toHaveClass('w-8', 'h-8')
    })
  })

  describe('styling', () => {
    it('has primary color', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('svg')).toHaveClass('text-primary')
    })

    it('accepts custom className', () => {
      const { container } = render(<Spinner className="custom-spinner" />)
      expect(container.querySelector('svg')).toHaveClass('custom-spinner')
    })
  })

  describe('structure', () => {
    it('contains circle element', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('circle')).toBeInTheDocument()
    })

    it('contains path element', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('path')).toBeInTheDocument()
    })

    it('circle has reduced opacity', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('circle')).toHaveClass('opacity-25')
    })

    it('path has higher opacity', () => {
      const { container } = render(<Spinner />)
      expect(container.querySelector('path')).toHaveClass('opacity-75')
    })
  })
})

describe('LoadingOverlay', () => {
  describe('rendering', () => {
    it('renders with default message', () => {
      render(<LoadingOverlay />)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('renders with custom message', () => {
      render(<LoadingOverlay message="Please wait..." />)
      expect(screen.getByText('Please wait...')).toBeInTheDocument()
    })

    it('includes Spinner component', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('uses large spinner', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.querySelector('svg')).toHaveClass('w-8', 'h-8')
    })
  })

  describe('styling', () => {
    it('is fixed position', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.firstChild).toHaveClass('fixed', 'inset-0')
    })

    it('has high z-index', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.firstChild).toHaveClass('z-50')
    })

    it('has backdrop blur', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.firstChild).toHaveClass('backdrop-blur-sm')
    })

    it('centers content', () => {
      const { container } = render(<LoadingOverlay />)
      expect(container.firstChild).toHaveClass('flex', 'items-center', 'justify-center')
    })
  })
})
