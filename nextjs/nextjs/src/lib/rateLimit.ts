/**
 * Rate Limiting Utility
 * SOC2 CC6.1 - Logical access security controls
 * Prevents brute force attacks on authentication endpoints
 */

interface RateLimitConfig {
  /** Time window in milliseconds */
  interval: number
  /** Maximum requests per interval */
  limit: number
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  reset: number
  retryAfter?: number
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map()
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
    // Clean up expired entries every minute
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000)
    }
  }

  /**
   * Check if request should be allowed
   * @param identifier - Unique identifier (IP, user ID, etc.)
   */
  check(identifier: string): RateLimitResult {
    const now = Date.now()
    const entry = this.requests.get(identifier)

    // No existing entry or expired entry
    if (!entry || now >= entry.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.config.interval,
      })
      return {
        success: true,
        remaining: this.config.limit - 1,
        reset: now + this.config.interval,
      }
    }

    // Under the limit
    if (entry.count < this.config.limit) {
      entry.count++
      return {
        success: true,
        remaining: this.config.limit - entry.count,
        reset: entry.resetTime,
      }
    }

    // Over the limit
    return {
      success: false,
      remaining: 0,
      reset: entry.resetTime,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  reset(identifier: string): void {
    this.requests.delete(identifier)
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetTime) {
        this.requests.delete(key)
      }
    }
  }
}

// Pre-configured rate limiters for common use cases

/** Auth endpoints: 5 attempts per 15 minutes */
export const authRateLimiter = new RateLimiter({
  interval: 15 * 60 * 1000, // 15 minutes
  limit: 5,
})

/** API endpoints: 100 requests per minute */
export const apiRateLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  limit: 100,
})

/** Password reset: 3 attempts per hour */
export const passwordResetLimiter = new RateLimiter({
  interval: 60 * 60 * 1000, // 1 hour
  limit: 3,
})

/** Data export: 5 exports per day */
export const dataExportLimiter = new RateLimiter({
  interval: 24 * 60 * 60 * 1000, // 24 hours
  limit: 5,
})

export { RateLimiter }
export type { RateLimitConfig, RateLimitResult }
