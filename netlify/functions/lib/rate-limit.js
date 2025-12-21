/**
 * Production-ready rate limiter with persistent storage
 *
 * Uses Netlify Blobs for distributed, persistent rate limiting that survives:
 * - Cold starts
 * - Multiple function instances
 * - Deployments
 *
 * Falls back to in-memory storage for local development
 */

import { getStore } from '@netlify/blobs';
import { Config } from './config.js';

// In-memory fallback for local development (when Blobs unavailable)
const memoryStore = new Map();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000; // 60 seconds

// Netlify Blobs store (lazy initialized)
let blobStore = null;
let useBlobStorage = true;

/**
 * Initialize blob storage
 * Returns null if Blobs unavailable (local dev)
 */
function getBlobStore() {
  if (blobStore === null && useBlobStorage) {
    try {
      blobStore = getStore('rate-limit');
    } catch (err) {
      console.warn('Netlify Blobs unavailable, using in-memory fallback:', err.message);
      useBlobStorage = false;
      blobStore = false; // Mark as unavailable
    }
  }
  return blobStore || null;
}

/**
 * Clean up expired entries from in-memory store
 */
function cleanupMemoryStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetTime) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Get rate limit data from storage
 *
 * @param {string} key - Rate limit key
 * @returns {Promise<object|null>} Rate limit data or null
 */
async function getRateLimitData(key) {
  const store = getBlobStore();

  if (store) {
    // Use Netlify Blobs (production)
    try {
      const data = await store.get(key, { type: 'json' });
      if (data && Date.now() < data.resetTime) {
        return data;
      }
      // Data expired, delete it
      if (data) {
        await store.delete(key);
      }
      return null;
    } catch (err) {
      console.error('Error reading from Blob storage:', err);
      // Fall through to memory store
    }
  }

  // Use in-memory store (local dev or fallback)
  cleanupMemoryStore();
  const data = memoryStore.get(key);
  if (data && Date.now() < data.resetTime) {
    return data;
  }
  return null;
}

/**
 * Set rate limit data in storage
 *
 * @param {string} key - Rate limit key
 * @param {object} data - Rate limit data
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<void>}
 */
async function setRateLimitData(key, data, ttlSeconds) {
  const store = getBlobStore();

  if (store) {
    // Use Netlify Blobs (production)
    try {
      // Netlify Blobs supports metadata with TTL
      await store.setJSON(key, data, {
        metadata: {
          ttl: ttlSeconds
        }
      });
      return;
    } catch (err) {
      console.error('Error writing to Blob storage:', err);
      // Fall through to memory store
    }
  }

  // Use in-memory store (local dev or fallback)
  memoryStore.set(key, data);
}

/**
 * Delete rate limit data from storage
 *
 * @param {string} key - Rate limit key
 * @returns {Promise<void>}
 */
async function deleteRateLimitData(key) {
  const store = getBlobStore();

  if (store) {
    try {
      await store.delete(key);
    } catch (err) {
      console.error('Error deleting from Blob storage:', err);
    }
  }

  memoryStore.delete(key);
}

/**
 * Check if request should be rate limited
 *
 * This function is now async and persists across cold starts and function instances
 *
 * @param {string} identifier - Usually IP address or hashed identifier
 * @param {object} options - Rate limit options
 * @param {number} options.limit - Max requests per window (default from config)
 * @param {number} options.windowMs - Window size in ms (default from config)
 * @returns {Promise<object>} { allowed: boolean, remaining: number, resetTime: number, retryAfter: number }
 */
export async function checkRateLimit(identifier, options = {}) {
  const { limit = Config.rateLimit.max, windowMs = Config.rateLimit.window } = options;
  const now = Date.now();

  // Get existing rate limit data
  let data = await getRateLimitData(identifier);

  if (!data || now > data.resetTime) {
    // Create new window
    data = {
      count: 0,
      resetTime: now + windowMs
    };
  }

  // Increment count
  data.count++;

  // Save updated data with TTL
  const ttlSeconds = Math.ceil(windowMs / 1000) + 60; // Add 60s buffer
  await setRateLimitData(identifier, data, ttlSeconds);

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
 * Clean up expired rate limit entries
 *
 * In production with Blobs, TTL handles cleanup automatically.
 * In local dev with memory store, this provides manual cleanup.
 *
 * @returns {Promise<number>} Number of entries cleaned up
 */
export async function cleanupExpiredEntries() {
  const store = getBlobStore();

  if (store) {
    // Blobs have automatic TTL, but we can list and clean if needed
    try {
      const { blobs } = await store.list();
      let cleaned = 0;
      const now = Date.now();

      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: 'json' });
        if (data && now > data.resetTime) {
          await store.delete(blob.key);
          cleaned++;
        }
      }

      return cleaned;
    } catch (err) {
      console.error('Error during cleanup:', err);
      return 0;
    }
  }

  // Memory store cleanup
  const now = Date.now();
  let cleaned = 0;
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetTime) {
      memoryStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Create rate limit headers for response
 *
 * @param {object} result - Result from checkRateLimit
 * @param {number} limit - Rate limit max
 * @returns {object} Headers object
 */
export function rateLimitHeaders(result, limit) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000))
  };
}

/**
 * Create rate limit response (429 Too Many Requests)
 *
 * @param {object} result - Result from checkRateLimit
 * @param {number} limit - Rate limit max (for headers)
 * @returns {Response} HTTP response
 */
export function rateLimitResponse(result, limit = 100) {
  return new Response(JSON.stringify({
    error: 'Too many requests',
    retryAfter: result.retryAfter
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfter),
      ...rateLimitHeaders(result, limit)
    }
  });
}

/**
 * Hash IP for privacy-conscious rate limiting
 *
 * @param {string} ip - IP address
 * @returns {string} Hashed IP identifier
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

/**
 * Get rate limit configuration for a specific endpoint
 *
 * @param {string} endpoint - Endpoint name (login, register, track, api)
 * @returns {object} { limit, windowMs }
 */
export function getEndpointConfig(endpoint) {
  const endpointConfig = Config.rateLimit.endpoints?.[endpoint];

  if (endpointConfig) {
    return {
      limit: endpointConfig.max,
      windowMs: endpointConfig.window
    };
  }

  // Default to global config
  return {
    limit: Config.rateLimit.max,
    windowMs: Config.rateLimit.window
  };
}

/**
 * Check if blob storage is available
 * Useful for debugging and monitoring
 *
 * @returns {boolean} True if using blob storage
 */
export function isBlobStorageAvailable() {
  return getBlobStore() !== null;
}
