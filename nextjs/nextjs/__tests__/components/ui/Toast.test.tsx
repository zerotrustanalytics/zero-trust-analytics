/**
 * Toast Component Tests
 *
 * Tests for the Toast notification system
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { ReactNode } from 'react'

// Test component that uses the toast
function ToastTrigger({ type = 'info', message = 'Test message', title, action }: {
  type?: 'info' | 'warning' | 'error' | 'success'
  message?: string
  title?: string
  action?: { label: string; href: string }
}) {
  const { addToast } = useToast()

  return (
    <button onClick={() => addToast({ type, message, title, action })}>
      Show Toast
    </button>
  )
}

// Component to access toast state
function ToastStateReader({ onRead }: { onRead: (toasts: Array<{ id: string }>) => void }) {
  const { toasts } = useToast()
  onRead(toasts)
  return null
}

describe('Toast', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================
  // BASIC RENDERING
  // ==========================================
  describe('Basic Rendering', () => {
    it('renders children within provider', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      )

      expect(screen.getByText('Test content')).toBeInTheDocument()
    })

    it('does not render toast container when no toasts', () => {
      render(
        <ToastProvider>
          <div>Test content</div>
        </ToastProvider>
      )

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  // ==========================================
  // ADDING TOASTS
  // ==========================================
  describe('Adding Toasts', () => {
    it('shows toast when addToast is called', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Test message')).toBeInTheDocument()
    })

    it('shows toast with title', () => {
      render(<ToastTrigger title="Test Title" />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('shows toast with action button', () => {
      render(
        <ToastTrigger action={{ label: 'Go to page', href: '/test' }} />,
        { wrapper }
      )

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      const link = screen.getByRole('link', { name: /Go to page/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/test')
    })

    it('can show multiple toasts', () => {
      render(<ToastTrigger />, { wrapper })

      const button = screen.getByRole('button', { name: 'Show Toast' })

      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      expect(screen.getAllByRole('alert')).toHaveLength(3)
    })
  })

  // ==========================================
  // TOAST TYPES
  // ==========================================
  describe('Toast Types', () => {
    it('renders info toast with blue styling', () => {
      render(<ToastTrigger type="info" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('blue')
    })

    it('renders warning toast with yellow styling', () => {
      render(<ToastTrigger type="warning" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('yellow')
    })

    it('renders error toast with red styling', () => {
      render(<ToastTrigger type="error" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('red')
    })

    it('renders success toast with green styling', () => {
      render(<ToastTrigger type="success" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('green')
    })
  })

  // ==========================================
  // TOAST DISMISSAL
  // ==========================================
  describe('Toast Dismissal', () => {
    it('has close button', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      expect(screen.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument()
    })

    it('removes toast when close button clicked', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  // ==========================================
  // TOAST IDS
  // ==========================================
  describe('Toast IDs', () => {
    it('generates unique IDs for each toast', () => {
      let capturedToasts: Array<{ id: string }> = []

      render(
        <ToastProvider>
          <ToastTrigger />
          <ToastStateReader onRead={(toasts) => { capturedToasts = toasts }} />
        </ToastProvider>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      const uniqueIds = new Set(capturedToasts.map(t => t.id))
      expect(uniqueIds.size).toBe(3)
    })
  })

  // ==========================================
  // ACCESSIBILITY
  // ==========================================
  describe('Accessibility', () => {
    it('toasts have role="alert"', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('close button has aria-label', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      const closeButton = screen.getByRole('button', { name: /Dismiss/i })
      expect(closeButton).toHaveAttribute('aria-label', 'Dismiss')
    })

    it('toast container is positioned fixed', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }))

      const container = screen.getByRole('alert').parentElement
      expect(container?.className).toContain('fixed')
    })
  })

  // ==========================================
  // CONTEXT HOOK
  // ==========================================
  describe('useToast Hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress error output for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<ToastTrigger />)
      }).toThrow('useToast must be used within a ToastProvider')

      consoleSpy.mockRestore()
    })

    it('provides addToast function', () => {
      function TestComponent() {
        const { addToast } = useToast()
        return <div>{typeof addToast}</div>
      }

      render(<TestComponent />, { wrapper })

      expect(screen.getByText('function')).toBeInTheDocument()
    })

    it('provides removeToast function', () => {
      function TestComponent() {
        const { removeToast } = useToast()
        return <div>{typeof removeToast}</div>
      }

      render(<TestComponent />, { wrapper })

      expect(screen.getByText('function')).toBeInTheDocument()
    })

    it('provides toasts array', () => {
      function TestComponent() {
        const { toasts } = useToast()
        return <div>toasts: {Array.isArray(toasts) ? 'array' : 'not array'}</div>
      }

      render(<TestComponent />, { wrapper })

      expect(screen.getByText('toasts: array')).toBeInTheDocument()
    })
  })

  // ==========================================
  // STYLING
  // ==========================================
  describe('Styling', () => {
    it('has proper positioning', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const container = screen.getByRole('alert').parentElement
      expect(container?.className).toContain('bottom-4')
      expect(container?.className).toContain('right-4')
    })

    it('has proper z-index', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const container = screen.getByRole('alert').parentElement
      expect(container?.className).toContain('z-50')
    })

    it('has animation classes', () => {
      render(<ToastTrigger />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('animate')
    })
  })

  // ==========================================
  // EDGE CASES
  // ==========================================
  describe('Edge Cases', () => {
    it('handles empty message', () => {
      render(<ToastTrigger message="" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('handles very long message', () => {
      const longMessage = 'A'.repeat(500)
      render(<ToastTrigger message={longMessage} />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      expect(screen.getByText(longMessage)).toBeInTheDocument()
    })

    it('handles special characters in message', () => {
      render(<ToastTrigger message="<script>alert('xss')</script>" />, { wrapper })

      fireEvent.click(screen.getByRole('button'))

      // Should be escaped/rendered as text, not executed
      expect(screen.getByText("<script>alert('xss')</script>")).toBeInTheDocument()
    })
  })
})
