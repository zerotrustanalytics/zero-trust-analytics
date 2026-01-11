import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './index'

interface ErrorMessageProps {
  message: string
  onDismiss?: () => void
  onRetry?: () => void
  className?: string
  variant?: 'inline' | 'banner' | 'page'
}

/**
 * ErrorMessage - Reusable error display component
 *
 * @example
 * // Inline error (for forms)
 * <ErrorMessage message={error} variant="inline" />
 *
 * // Banner error (dismissible)
 * <ErrorMessage message={error} onDismiss={() => setError('')} />
 *
 * // Page error (with retry)
 * <ErrorMessage message={error} variant="page" onRetry={refetch} />
 */
export function ErrorMessage({
  message,
  onDismiss,
  onRetry,
  className,
  variant = 'banner',
}: ErrorMessageProps) {
  if (!message) return null

  if (variant === 'inline') {
    return (
      <p className={cn('text-sm text-red-600 dark:text-red-400', className)}>
        {message}
      </p>
    )
  }

  if (variant === 'page') {
    return (
      <div className={cn('text-center py-12', className)}>
        <svg
          className="mx-auto h-12 w-12 text-red-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-red-500 mb-4">{message}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            Try Again
          </Button>
        )}
      </div>
    )
  }

  // Banner variant (default)
  return (
    <div
      className={cn(
        'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center justify-between',
        className
      )}
      role="alert"
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-sm underline hover:no-underline"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}

/**
 * PageError - Full page error state
 * Convenience wrapper for common error pattern
 */
export function PageError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return <ErrorMessage message={message} variant="page" onRetry={onRetry} />
}
