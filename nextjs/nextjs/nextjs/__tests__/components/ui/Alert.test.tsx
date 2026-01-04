import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Alert } from '@/components/ui/Alert'

describe('Alert', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(<Alert>Alert message</Alert>)
      expect(screen.getByText('Alert message')).toBeInTheDocument()
    })

    it('has role="alert"', () => {
      render(<Alert>Message</Alert>)
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('renders title when provided', () => {
      render(<Alert title="Alert Title">Content</Alert>)
      expect(screen.getByText('Alert Title')).toBeInTheDocument()
    })
  })

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Alert variant="default">Default</Alert>)
      expect(screen.getByRole('alert')).toHaveClass('bg-secondary')
    })

    it('renders success variant with icon', () => {
      render(<Alert variant="success">Success</Alert>)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-green-50')
      expect(alert.querySelector('svg')).toBeInTheDocument()
    })

    it('renders warning variant with icon', () => {
      render(<Alert variant="warning">Warning</Alert>)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-yellow-50')
      expect(alert.querySelector('svg')).toBeInTheDocument()
    })

    it('renders error variant with icon', () => {
      render(<Alert variant="error">Error</Alert>)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-red-50')
      expect(alert.querySelector('svg')).toBeInTheDocument()
    })

    it('renders info variant with icon', () => {
      render(<Alert variant="info">Info</Alert>)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-blue-50')
      expect(alert.querySelector('svg')).toBeInTheDocument()
    })

    it('default variant has no icon', () => {
      render(<Alert variant="default">Default</Alert>)
      const svgs = screen.getByRole('alert').querySelectorAll('svg')
      expect(svgs).toHaveLength(0)
    })
  })

  describe('dismissible', () => {
    it('shows dismiss button when dismissible', () => {
      const onDismiss = vi.fn()
      render(<Alert dismissible onDismiss={onDismiss}>Dismissible</Alert>)
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    })

    it('does not show dismiss button when not dismissible', () => {
      render(<Alert>Not dismissible</Alert>)
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    })

    it('calls onDismiss when dismiss button clicked', () => {
      const onDismiss = vi.fn()
      render(<Alert dismissible onDismiss={onDismiss}>Dismissible</Alert>)
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('does not show dismiss button without onDismiss handler', () => {
      render(<Alert dismissible>No handler</Alert>)
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('dismiss button has aria-label', () => {
      const onDismiss = vi.fn()
      render(<Alert dismissible onDismiss={onDismiss}>Content</Alert>)
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Dismiss')
    })

    it('accepts custom className', () => {
      render(<Alert className="custom-alert">Custom</Alert>)
      expect(screen.getByRole('alert')).toHaveClass('custom-alert')
    })
  })

  describe('structure', () => {
    it('renders with title and content', () => {
      render(<Alert title="Title">Content message</Alert>)
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Content message')).toBeInTheDocument()
    })

    it('title is h4 element', () => {
      render(<Alert title="Heading">Content</Alert>)
      const heading = screen.getByText('Heading')
      expect(heading.tagName).toBe('H4')
    })
  })
})
