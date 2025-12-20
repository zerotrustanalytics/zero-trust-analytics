/**
 * Simple rate limiter for serverless functions
 * Uses in-memory storage with IP-based limits
 * Note: In production, consider using Upstash Redis for distributed rate limiting
 */

import { Config } from './config.js';

// In-memory store (will reset on cold starts, but provides basic protection)
const rateLimitStore = new Map();

// Clean up old entries every 60 seconds
const CLEANUP_INTERVAL = 60000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check if request should be rate limited
 *
 * @param {string} identifier - Usually IP address or hashed identifier
 * @param {object} options - Rate limit options
 * @param {number} options.limit - Max requests per window (default from config)
 * @param {number} options.windowMs - Window size in ms (default from config)
 * @returns {object} { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(identifier, options = {}) {
  const { limit = Config.rateLimit.max, windowMs = Config.rateLimit.window } = options;
  const now = Date.now();

  // Run cleanup occasionally
  cleanup();

  // Get or create rate limit data for this identifier
  let data = rateLimitStore.get(identifier);

  if (!data || now > data.resetTime) {
    // Create new window
    data = {
      count: 0,
      resetTime: now + windowMs
    };
  }

  // Increment count
  data.count++;
  rateLimitStore.set(identifier, data);

  const allowed = data.count <= limit;
  const remaining = Math.max(0, limit - data.count);

  return {
    allowed,
    remaining,
    resetTime: data.resetTime,
    retryAfter: allowed ? 0 : Math.ceil((data.resetTime - now) / 1000)
  };
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result, limit) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000))
  };
}

/**
 * Rate limit response
 */
export function rateLimitResponse(result) {
  return new Response(JSON.stringify({
    error: 'Too many requests',
    retryAfter: result.retryAfter
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfter),
      ...rateLimitHeaders(result, 100)
    }
  });
}

/**
 * Hash IP for privacy-conscious rate limiting
 */
export function hashIP(ip) {
  // Simple hash for rate limiting purposes
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `rl_${Math.abs(hash).toString(36)}`;
}
