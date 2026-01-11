/**
 * REDIS CACHE LAYER
 * =================
 * Upstash Redis caching for Turso queries.
 * Reduces database reads by caching frequently accessed data.
 */

const UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Cache TTLs in seconds
const TTL = {
  STATS: 300,        // 5 minutes - dashboard stats
  REALTIME: 30,      // 30 seconds - realtime data
  DAILY: 3600,       // 1 hour - daily rollups (rarely change)
  PAGES: 600,        // 10 minutes - page stats
  DIMENSIONS: 600,   // 10 minutes - device/browser/country stats
};

/**
 * Check if Redis is configured
 */
function isRedisConfigured() {
  return UPSTASH_REDIS_URL && UPSTASH_REDIS_TOKEN;
}

/**
 * Execute Redis command via REST API
 */
async function redisCommand(command, ...args) {
  if (!isRedisConfigured()) {
    return null;
  }

  try {
    const response = await fetch(`${UPSTASH_REDIS_URL}/${command}/${args.join('/')}`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error('[cache] Redis error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (err) {
    console.error('[cache] Redis error:', err.message);
    return null;
  }
}

/**
 * Get cached value
 */
async function get(key) {
  const result = await redisCommand('GET', key);
  if (result) {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return null;
}

/**
 * Set cached value with TTL
 */
async function set(key, value, ttlSeconds = TTL.STATS) {
  const serialized = JSON.stringify(value);
  return redisCommand('SET', key, encodeURIComponent(serialized), 'EX', ttlSeconds);
}

/**
 * Delete cached value
 */
async function del(key) {
  return redisCommand('DEL', key);
}

/**
 * Delete all keys matching pattern (for cache invalidation)
 */
async function invalidatePattern(pattern) {
  if (!isRedisConfigured()) return;

  try {
    // Get all keys matching pattern
    const keys = await redisCommand('KEYS', pattern);
    if (keys && keys.length > 0) {
      // Delete each key
      for (const key of keys) {
        await del(key);
      }
      console.log(`[cache] Invalidated ${keys.length} keys matching ${pattern}`);
    }
  } catch (err) {
    console.error('[cache] Invalidation error:', err.message);
  }
}

/**
 * Generate cache key for stats
 */
function statsKey(siteId, startDate, endDate) {
  return `stats:${siteId}:${startDate}:${endDate}`;
}

/**
 * Generate cache key for realtime
 */
function realtimeKey(siteId) {
  return `realtime:${siteId}`;
}

/**
 * Invalidate all caches for a site (call after new pageview)
 */
async function invalidateSite(siteId) {
  await invalidatePattern(`stats:${siteId}:*`);
  await invalidatePattern(`realtime:${siteId}`);
}

/**
 * Cache wrapper - get from cache or execute function
 */
async function cached(key, ttl, fn) {
  // Try cache first
  const cachedResult = await get(key);
  if (cachedResult !== null) {
    console.log(`[cache] HIT: ${key}`);
    return cachedResult;
  }

  // Cache miss - execute function
  console.log(`[cache] MISS: ${key}`);
  const result = await fn();

  // Store in cache (don't await - fire and forget)
  set(key, result, ttl).catch(() => {});

  return result;
}

/**
 * Cached getStats wrapper
 */
function cachedGetStats(getStatsFn) {
  return async function(siteId, startDate, endDate) {
    if (!isRedisConfigured()) {
      return getStatsFn(siteId, startDate, endDate);
    }

    const key = statsKey(siteId, startDate, endDate);
    return cached(key, TTL.STATS, () => getStatsFn(siteId, startDate, endDate));
  };
}

/**
 * Cached getRealtime wrapper
 */
function cachedGetRealtime(getRealtimeFn) {
  return async function(siteId) {
    if (!isRedisConfigured()) {
      return getRealtimeFn(siteId);
    }

    const key = realtimeKey(siteId);
    return cached(key, TTL.REALTIME, () => getRealtimeFn(siteId));
  };
}

export {
  TTL,
  isRedisConfigured,
  get,
  set,
  del,
  invalidatePattern,
  invalidateSite,
  statsKey,
  realtimeKey,
  cached,
  cachedGetStats,
  cachedGetRealtime,
};
