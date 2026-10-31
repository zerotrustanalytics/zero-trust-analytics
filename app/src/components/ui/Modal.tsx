'use client'

import { HTMLAttributes, useEffect, useId, useRef } from 'react'
import { clsx } from 'clsx'

// Modal Component
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  /** Clicking the dimmed backdrop closes the dialog (default true). */
  closeOnOverlayClick?: boolean
}

export function Modal({ isOpen, onClose, title, description, children, closeOnOverlayClick = true }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  // Callers pass onClose inline, so it changes every render. Read it through a
  // ref; depending on it directly would re-run the effect below on every
  // keystroke and pull focus out of the field being typed in.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // While open: Escape closes, focus moves into the dialog (unless a field in it
  // already took it), and returns to whatever opened it afterwards.
  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
        data-testid="modal-overlay"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl overflow-visible focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {title && (
          <h2 id={titleId} className="text-xl font-bold mb-2 pr-8">
            {title}
          </h2>
        )}
        {description && (
          <p id={descriptionId} className="text-muted-foreground mb-4">{description}</p>
        )}
        {children}
      </div>
    </div>
  )
}

// ModalFooter Component
type ModalFooterProps = HTMLAttributes<HTMLDivElement>

export function ModalFooter({ className, ...props }: ModalFooterProps) {
  return (
    <div
      className={clsx('flex justify-end gap-3 mt-6', className)}
      {...props}
    />
  )
}
