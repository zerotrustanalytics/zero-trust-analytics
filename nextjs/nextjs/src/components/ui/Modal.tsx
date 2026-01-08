'use client'

import { HTMLAttributes } from 'react'
import { clsx } from 'clsx'

// Modal Component
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, description, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {title && (
          <h2 id="modal-title" className="text-xl font-bold mb-2">
            {title}
          </h2>
        )}
        {description && (
          <p className="text-muted-foreground mb-4">{description}</p>
        )}
        {children}
      </div>
    </div>
  )
}

// ModalFooter Component
interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function ModalFooter({ className, ...props }: ModalFooterProps) {
  return (
    <div
      className={clsx('flex justify-end gap-3 mt-6', className)}
      {...props}
    />
  )
}
