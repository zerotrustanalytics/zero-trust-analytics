import { clsx, type ClassValue } from 'clsx'

/**
 * Combines class names using clsx (tailwind-merge would be added for production)
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/**
 * Formats a number with appropriate suffix (K, M, B)
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

/**
 * Formats a percentage value
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Formats a duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Formats a date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  if (seconds < 2592000) {
    const weeks = Math.floor(seconds / 604800)
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }
  if (seconds < 31536000) {
    const months = Math.floor(seconds / 2592000)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  const years = Math.floor(seconds / 31536000)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

/**
 * Formats a date to a readable string
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  })
}

/**
 * Generates a random ID
 */
export function generateId(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Debounces a function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Throttles a function
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Safely parse JSON with a fallback value
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Converts a string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * Checks if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Gets a value from localStorage with a fallback
 */
export function getStorageValue<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : fallback
  } catch {
    return fallback
  }
}

/**
 * Sets a value in localStorage
 */
export function setStorageValue<T>(key: string, value: T): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or disabled
  }
}
