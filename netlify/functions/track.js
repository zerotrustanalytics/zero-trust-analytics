import { createZTRecord, createSessionHash, scrubPII, originMatchesDomain, validateNoPII } from './lib/zero-trust-core.js';
import { ingestEvents, checkUsageLimit, incrementUsageBatch, findActiveSession } from './lib/turso.js';
import { getSite, getUserById, matchConversionRule } from './lib/storage.js';
import { hashIP } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { Config, effectivePlan } from './lib/config.js';
import { incrementDailyUsageBatch } from './lib/usage-metrics.js';

// ============================================
// IN-MEMORY CACHES (survive within function instance)
// ============================================

// Site cache: 60 second TTL - sites rarely change
const siteCache = new Map();
const SITE_CACHE_TTL = 60000;

// User/plan cache: 5 minute TTL - plans change even less often
const userPlanCache = new Map();
const USER_PLAN_CACHE_TTL = 300000;

// Usage limit cache: 30 second TTL - avoids DB query per request
const usageLimitCache = new Map();
const USAGE_LIMIT_CACHE_TTL = 30000;

// Fast rate limiter for track endpoint (in-memory, no Blob I/O).
// Per client IP — an abuse brake, not the volume control (that's the monthly
// plan quota). Kept generous because a whole office can share one NAT address.
const trackRateLimits = new Map();
const TRACK_RATE_LIMIT = 600;
const TRACK_RATE_WINDOW = 60000;

// Ingest limits. The tracker flushes at 25 events; anything beyond 50 in one
// request is not from our script and is dropped.
const MAX_BATCH_EVENTS = 50;
const MAX_LEN = { path: 500, eventName: 100, category: 100, label: 200, utm: 200, domain: 253 };

// Event types the dashboard understands. Custom events are stored under their
// own name, so these names are reserved — a custom event called "pageview"
// must not be counted as one.
const RESERVED_EVENT_TYPES = new Set(['pageview', 'engagement', 'heartbeat']);

/**
 * Get site with caching
 */
async function getCachedSite(siteId) {
  const now = Date.now();
  const cached = siteCache.get(siteId);

  if (cached && now - cached.timestamp < SITE_CACHE_TTL) {
    return cached.data;
  }

  const site = await getSite(siteId);
  if (site) {
    siteCache.set(siteId, { data: site, timestamp: now });
  }
  return site;
}

/**
 * Get user plan with caching
 */
async function getCachedUserPlan(userId) {
  if (!userId) return 'free';

  const now = Date.now();
  const cached = userPlanCache.get(userId);

  if (cached && now - cached.timestamp < USER_PLAN_CACHE_TTL) {
    return cached.plan;
  }

  const user = await getUserById(userId);
  const plan = effectivePlan(user);
  userPlanCache.set(userId, { plan, timestamp: now });
  return plan;
}

/**
 * Check usage limit with caching (avoids DB query per request)
 */
async function getCachedUsageCheck(ownerId, limit) {
  const now = Date.now();
  const cacheKey = `${ownerId}:${limit}`;
  const cached = usageLimitCache.get(cacheKey);

  if (cached && now - cached.timestamp < USAGE_LIMIT_CACHE_TTL) {
    return cached.result;
  }

  const result = await checkUsageLimit(ownerId, limit);
  usageLimitCache.set(cacheKey, { result, timestamp: now });
  return result;
}

/**
 * Fast in-memory rate limiting for track endpoint
 * Avoids Netlify Blob I/O on every request
 */
function checkTrackRateLimit(identifier) {
  const now = Date.now();
  let entry = trackRateLimits.get(identifier);

  // Clean up expired entries periodically (1 in 100 requests)
  if (Math.random() < 0.01) {
    for (const [key, val] of trackRateLimits) {
      if (now > val.resetTime) trackRateLimits.delete(key);
    }
  }

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + TRACK_RATE_WINDOW };
  }

  entry.count++;
  trackRateLimits.set(identifier, entry);

  return {
    allowed: entry.count <= TRACK_RATE_LIMIT,
    remaining: Math.max(0, TRACK_RATE_LIMIT - entry.count),
    resetTime: entry.resetTime,
    retryAfter: entry.count > TRACK_RATE_LIMIT ? Math.ceil((entry.resetTime - now) / 1000) : 0
  };
}

// Get required hash secret - cached after first call
let cachedHashSecret = null;
function getRequiredHashSecret() {
  if (cachedHashSecret) return cachedHashSecret;
  const secret = process.env.HASH_SECRET;
  if (!secret) {
    throw new Error('HASH_SECRET environment variable is required');
  }
  cachedHashSecret = secret;
  return secret;
}

// Basic bot detection - filters common bots/crawlers
function isBot(userAgent) {
  if (!userAgent) return false;

  const botPatterns = [
    'bot', 'crawl', 'spider', 'slurp', 'mediapartners',
    'facebookexternalhit', 'linkedinbot', 'twitterbot',
    'whatsapp', 'telegrambot', 'discordbot', 'applebot',
    'bingpreview', 'googlebot', 'yandexbot', 'baiduspider',
    'duckduckbot', 'sogou', 'exabot', 'facebot', 'ia_archiver',
    'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
    'bytespider', 'gptbot', 'claudebot', 'ccbot', 'anthropic',
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
    'lighthouse', 'pagespeed', 'pingdom', 'uptimerobot'
  ];

  const ua = userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
}

// Get allowed origin for CORS header
function getAllowedOrigin(origin, siteDomain) {
  if (originMatchesDomain(origin, siteDomain)) {
    return origin;
  }
  return null;
}

// Extract referrer domain from full referrer URL
function extractReferrerDomain(referrer) {
  if (!referrer) return '';
  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch {
    return '';
  }
}

// Get plan limit for a user
function getPlanPageviewLimit(plan) {
  const tier = Config.pricing.tiers[plan] || Config.pricing.tiers.free;
  return tier.monthlyPageviews;
}

// Check if site owner is within usage limits (fully cached)
async function checkSiteOwnerUsage(site, logger) {
  try {
    const ownerId = site.userId;
    if (!ownerId) {
      return { allowed: true, ownerId: null };
    }

    // Use cached plan lookup instead of full user fetch
    const plan = await getCachedUserPlan(ownerId);
    const limit = getPlanPageviewLimit(plan);
    // Use cached usage check (30s TTL) to avoid DB query per request
    const usageCheck = await getCachedUsageCheck(ownerId, limit);

    if (!usageCheck.isWithinLimit) {
      logger.info('Usage limit exceeded', { siteId: site.id, ownerId, plan });
    }

    return {
      allowed: usageCheck.isWithinLimit,
      ownerId,
      plan,
      usage: usageCheck
    };
  } catch (err) {
    logger.error('Usage check failed, allowing tracking', err);
    return { allowed: true, ownerId: site.userId };
  }
}

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('track', req, context);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fast in-memory rate limiting (avoids Blob I/O)
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = hashIP(clientIP);
  const rateLimit = checkTrackRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for tracking', {
      remainingTime: rateLimit.retryAfter
    });
    return new Response(JSON.stringify({ error: 'Too many requests', retryAfter: rateLimit.retryAfter }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(rateLimit.retryAfter) }
    });
  }

  try {
    const data = await req.json();
    const { siteId, batch, events } = data;

    // Handle batch requests
    if (batch && Array.isArray(events)) {
      logger.debug('Processing batch tracking request', {
        siteId,
        eventCount: events.length
      });
      return await handleBatch(req, context, origin, siteId, events, logger, data.sampleRate);
    }

    // Handle single event (legacy support)
    logger.debug('Processing single event (legacy)', { siteId });
    return await handleSingleEvent(req, context, origin, data, logger);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

// Handle batch of events (single database write)
async function handleBatch(req, context, origin, siteId, events, logger, clientSampleRate) {
  if (!siteId) {
    logger.warn('Batch request missing site ID');
    return new Response(JSON.stringify({ error: 'Site ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify site exists (cached - avoids repeated Blob fetches)
  const site = await getCachedSite(siteId);
  if (!site) {
    logger.warn('Invalid site ID in batch request', { siteId });
    return new Response(JSON.stringify({ error: 'Invalid site ID' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // CORS origin validation
  const allowedOrigin = getAllowedOrigin(origin, site.domain);
  if (!allowedOrigin && origin) {
    logger.warn('CORS origin not allowed', {
      siteId,
      siteDomain: site.domain,
      requestOrigin: origin
    });
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' }
    });
  }

  // Get client info
  const ip = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Filter bots
  if (isBot(userAgent)) {
    logger.debug('Bot detected, silently accepting', { siteId });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin || '*' }
    });
  }

  // Build headers for geo extraction (country, region, city from Netlify Edge)
  // Note: Removed external ip-api.com lookup to reduce latency
  const headers = {
    'x-country': context.geo?.country?.code || '',
    'x-nf-client-connection-region': context.geo?.subdivision?.code || '',
    'x-city': context.geo?.city || ''
  };

  // Use conversion rules from cached site (no duplicate fetch)
  const conversionRules = site.conversionRules || [];

  if (events.length > MAX_BATCH_EVENTS) {
    logger.warn('Oversized batch truncated', { siteId, eventCount: events.length });
    events = events.slice(0, MAX_BATCH_EVENTS);
  }

  // Unknown types and heartbeats are dropped here (parseEvent -> null).
  const parsed = events
    .filter(event => event && typeof event === 'object')
    .map(event => ({ event, ...parseEvent(event) }))
    .filter(p => p.eventType !== null);

  // Process all events into records
  let records = parsed.map(({ event, eventType, payload, meta }) => {

    // Apply conversion rules to engagement events
    if (eventType === 'engagement' && meta.isBounce && conversionRules.length > 0) {
      const eventData = {
        event_type: eventType,
        page: payload.page_path,
        payload: event
      };
      const matchedRule = matchConversionRule(conversionRules, eventData);
      if (matchedRule) {
        logger.debug('Conversion rule matched', {
          siteId,
          ruleId: matchedRule.id,
          ruleName: matchedRule.name,
          action: matchedRule.action,
          page: payload.page_path
        });

        if (matchedRule.action === 'exclude_bounce') {
          // Don't count this as a bounce
          meta.isBounce = false;
          meta.ruleApplied = matchedRule.id;
        } else if (matchedRule.action === 'force_conversion') {
          // Mark as conversion, not bounce
          meta.isBounce = false;
          meta.isConversion = true;
          meta.ruleApplied = matchedRule.id;
        }
      }
    }

    return createZTRecord({
      siteId,
      ip,
      userAgent,
      headers,
      secret: getRequiredHashSecret(),
      eventType,
      payload,
      meta
    });
  }).filter(record => validateNoPII(record)); // last-resort guard; fields are scrubbed in parseEvent

  if (records.length > 0) {
    // Every record in a request shares one visitor (same IP + user agent).
    const identityHash = records[0].identity_hash;

    // Sampling, decided server-side so the tracker needs no device storage.
    // Bucketing by the daily visitor hash keeps a visitor consistently in or
    // out for the day. The stricter of the site's and the snippet's rate wins.
    const sampleRate = Math.min(normalizeRate(site.sampleRate), normalizeRate(clientSampleRate));
    if (sampleRate < 1 && parseInt(identityHash.slice(0, 8), 16) / 0x100000000 >= sampleRate) {
      return new Response(JSON.stringify({ success: true, count: 0, sampled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin || '*' }
      });
    }

    // Sessions, decided server-side: continue this visitor's session if they
    // were active on the site within 30 minutes, else start a new one.
    const sessionHash = (await findActiveSession(siteId, identityHash)) || createSessionHash();
    records = records.map(record => ({ ...record, session_hash: sessionHash }));
  }

  // Check usage limits before ingesting
  const usageCheck = await checkSiteOwnerUsage(site, logger);

  // If over limit, return success but don't actually store (graceful degradation)
  if (!usageCheck.allowed) {
    logger.info('Usage limit exceeded, not storing events', {
      siteId,
      ownerId: usageCheck.ownerId,
      eventCount: events.length
    });
    return new Response(JSON.stringify({ success: true, count: 0, limited: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin || '*' }
    });
  }

  // Send all records to database in ONE request
  if (records.length > 0) {
    logger.info('Ingesting batch events', {
      siteId,
      recordCount: records.length,
      originalEventCount: events.length
    });
    await ingestEvents('pageviews', records);

    // Increment usage for the site owner (batched for performance)
    if (usageCheck.ownerId) {
      const pageviewCount = records.filter(r => r.event_type === 'pageview').length;
      const eventCount = records.filter(r => r.event_type !== 'pageview').length;

      // Fire and forget - don't block tracking response
      if (pageviewCount > 0) {
        incrementUsageBatch(usageCheck.ownerId, siteId, 'pageview', pageviewCount).catch(() => {});
        incrementDailyUsageBatch(siteId, usageCheck.ownerId, 'pageview', pageviewCount).catch(() => {});
      }
      if (eventCount > 0) {
        // Metered against the monthly quota too (checkUsageLimit counts both).
        incrementUsageBatch(usageCheck.ownerId, siteId, 'event', eventCount).catch(() => {});
        incrementDailyUsageBatch(siteId, usageCheck.ownerId, 'event', eventCount).catch(() => {});
      }
    }
  } else {
    logger.debug('No valid records to ingest after filtering', {
      siteId,
      originalEventCount: events.length
    });
  }

  return new Response(JSON.stringify({ success: true, count: records.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin || '*' }
  });
}

// Client-supplied text: stringified, PII-scrubbed, length-capped.
function cleanText(value, max) {
  if (value === null || value === undefined) return '';
  return scrubPII(value).slice(0, max);
}

// URL path only — query strings and fragments routinely carry tokens/emails.
function cleanPath(value) {
  const path = String(value || '/').split(/[?#]/)[0];
  return cleanText(path.startsWith('/') ? path : `/${path}`, MAX_LEN.path);
}

function cleanNumber(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

function normalizeRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : 1;
}

/**
 * Parse one client event into { eventType, payload, meta }, keeping only the
 * fields the dashboard uses, each sanitized. Returns eventType null for events
 * that must not be stored: unknown types, and heartbeats (realtime reads
 * pageviews only, so stored heartbeats were never read). A missing type is a
 * pageview, for legacy single-event API callers.
 */
function parseEvent(data) {
  const type = data.type === undefined ? 'pageview' : data.type;

  switch (type) {
    case 'pageview':
      return {
        eventType: 'pageview',
        payload: {
          page_path: cleanPath(data.path),
          referrer_domain: cleanText(extractReferrerDomain(data.referrer), MAX_LEN.domain),
          utm_source: cleanText(data.utm?.source, MAX_LEN.utm),
          utm_medium: cleanText(data.utm?.medium, MAX_LEN.utm),
          utm_campaign: cleanText(data.utm?.campaign, MAX_LEN.utm),
          utm_content: cleanText(data.utm?.content, MAX_LEN.utm),
          utm_term: cleanText(data.utm?.term, MAX_LEN.utm)
        },
        meta: {}
      };

    case 'engagement':
      return {
        eventType: 'engagement',
        payload: { page_path: cleanPath(data.path) },
        meta: {
          isBounce: data.isBounce === true,
          duration: Math.round(cleanNumber(data.timeOnPage, 0, 86400) || 0)
        }
      };

    case 'event': {
      const name = cleanText(data.action, MAX_LEN.eventName) || 'custom_event';
      return {
        eventType: RESERVED_EVENT_TYPES.has(name) ? `custom_${name}` : name,
        payload: {
          page_path: cleanPath(data.path),
          event_name: name,
          event_data: JSON.stringify({
            category: cleanText(data.category, MAX_LEN.category),
            label: cleanText(data.label, MAX_LEN.label),
            value: cleanNumber(data.value, -1e12, 1e12)
          })
        },
        meta: {}
      };
    }

    default: // 'heartbeat' and anything unrecognized
      return { eventType: null, payload: {}, meta: {} };
  }
}

// Handle single event (legacy/fallback) - delegates to batch handler
async function handleSingleEvent(req, context, origin, data, logger) {
  // Convert single event to batch format and reuse batch handler
  return handleBatch(req, context, origin, data.siteId, [data], logger, data.sampleRate);
}

export const config = {
  path: '/api/track'
};
