import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  fullPage?: boolean
  message?: string
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

/**
 * LoadingSpinner - Reusable loading indicator
 *
 * @example
 * // Inline spinner
 * <LoadingSpinner size="sm" />
 *
 * // Full page spinner
 * <LoadingSpinner fullPage message="Loading sites..." />
 *
 * // In conditional render
 * if (loading) return <LoadingSpinner fullPage />
 */
export function LoadingSpinner({
  size = 'md',
  className,
  fullPage = false,
  message,
}: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        'animate-spin rounded-full border-b-2 border-primary',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )

  if (fullPage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        {spinner}
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    )
  }

  return spinner
}

/**
 * PageLoader - Full page loading state with spinner
 * Convenience wrapper for common loading pattern
 */
export function PageLoader({ message }: { message?: string }) {
  return <LoadingSpinner fullPage size="md" message={message} />
}
