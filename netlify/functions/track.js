import { createZTRecord, validateNoPII } from './lib/zero-trust-core.js';
import { ingestEvents } from './lib/turso.js';
import { getSite } from './lib/storage.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, NotFoundError } from './lib/error-handler.js';

// Get required hash secret - throws if not configured
function getRequiredHashSecret() {
  const secret = process.env.HASH_SECRET;
  if (!secret) {
    throw new Error('HASH_SECRET environment variable is required');
  }
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

// Validate origin against registered site domain
function validateOrigin(origin, siteDomain) {
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.hostname.toLowerCase();
    const siteHost = siteDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Exact match or www variant
    return originHost === siteHost ||
           originHost === `www.${siteHost}` ||
           `www.${originHost}` === siteHost;
  } catch {
    return false;
  }
}

// Get allowed origin for CORS header
function getAllowedOrigin(origin, siteDomain) {
  if (validateOrigin(origin, siteDomain)) {
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

  // Rate limiting: 1000 requests per minute per IP (generous for tracking)
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = hashIP(clientIP);
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 1000, windowMs: 60000 });

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for tracking', {
      remainingTime: rateLimit.resetIn
    });
    return rateLimitResponse(rateLimit);
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
      return await handleBatch(req, context, origin, siteId, events, logger);
    }

    // Handle single event (legacy support)
    logger.debug('Processing single event (legacy)', { siteId });
    return await handleSingleEvent(req, context, origin, data, logger);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

// Handle batch of events (single database write)
async function handleBatch(req, context, origin, siteId, events, logger) {
  if (!siteId) {
    logger.warn('Batch request missing site ID');
    return new Response(JSON.stringify({ error: 'Site ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify site exists
  const site = await getSite(siteId);
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

  // Build headers for geo extraction
  const headers = {
    'x-country': context.geo?.country?.code || '',
    'x-nf-client-connection-region': context.geo?.subdivision?.code || ''
  };

  // Process all events into records
  const records = events.map(event => {
    const { eventType, payload, meta } = parseEvent(event);
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
  }).filter(record => validateNoPII(record));

  // Send all records to database in ONE request
  if (records.length > 0) {
    logger.info('Ingesting batch events', {
      siteId,
      recordCount: records.length,
      originalEventCount: events.length
    });
    await ingestEvents('pageviews', records);
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

// Parse event data into eventType, payload, meta
function parseEvent(data) {
  const type = data.type;
  let eventType = 'pageview';
  let payload = {};
  let meta = {};

  switch (type) {
    case 'pageview':
      eventType = 'pageview';
      payload = {
        page_path: data.path || '/',
        referrer_domain: extractReferrerDomain(data.referrer),
        utm_source: data.utm?.source || '',
        utm_medium: data.utm?.medium || '',
        utm_campaign: data.utm?.campaign || '',
        sessionId: data.sessionId,
        landingPage: data.landingPage,
        isNewVisitor: data.isNewVisitor,
        trafficSource: data.trafficSource
      };
      break;

    case 'engagement':
      eventType = 'engagement';
      payload = {
        page_path: data.path || '/',
        sessionId: data.sessionId
      };
      meta = {
        isBounce: data.isBounce || false,
        duration: data.timeOnPage || 0
      };
      break;

    case 'event':
      eventType = data.action || 'custom_event';
      payload = {
        page_path: data.path || '/',
        event_name: data.action,
        event_data: JSON.stringify({
          category: data.category,
          label: data.label,
          value: data.value
        }),
        sessionId: data.sessionId
      };
      break;

    case 'heartbeat':
      eventType = 'heartbeat';
      payload = {
        page_path: data.path || '/',
        sessionId: data.sessionId
      };
      break;

    default:
      eventType = 'pageview';
      payload = {
        page_path: data.path || '/',
        referrer_domain: extractReferrerDomain(data.referrer)
      };
  }

  return { eventType, payload, meta };
}

// Handle single event (legacy/fallback)
async function handleSingleEvent(req, context, origin, data, logger) {
  const { type, siteId } = data;

  if (!siteId) {
    logger.warn('Single event missing site ID');
    return new Response(JSON.stringify({ error: 'Site ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify site exists (still using Netlify Blobs for site config)
  const site = await getSite(siteId);
  if (!site) {
    logger.warn('Invalid site ID in single event', { siteId });
    return new Response(JSON.stringify({ error: 'Invalid site ID' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // CORS origin validation
  const allowedOrigin = getAllowedOrigin(origin, site.domain);
  if (!allowedOrigin && origin) {
    logger.warn('CORS origin not allowed for single event', {
      siteId,
      siteDomain: site.domain,
      requestOrigin: origin
    });
    return new Response(JSON.stringify({ error: 'Origin not allowed', debug: { origin, expected: site.domain } }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'null'
      }
    });
  }

  // Get client info (will be hashed, never stored raw)
  const ip = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Filter bots silently
  if (isBot(userAgent)) {
    logger.debug('Bot detected in single event, silently accepting', { siteId });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || '*'
      }
    });
  }

  // Build headers object for geo extraction
  const headers = {
    'x-country': context.geo?.country?.code || '',
    'x-nf-client-connection-region': context.geo?.subdivision?.code || ''
  };

  // Parse event
  const { eventType, payload, meta } = parseEvent(data);

  // Create ZT record using core library (reusable across products)
  const record = createZTRecord({
    siteId,
    ip,
    userAgent,
    headers,
    secret: getRequiredHashSecret(),
    eventType,
    payload,
    meta
  });

  // Safety check - ensure no PII leaked into record
  if (!validateNoPII(record)) {
    logger.error('PII detected in record, blocking storage', null, {
      siteId,
      eventType
    });
    return new Response(JSON.stringify({ error: 'Data validation failed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Send to database
  logger.info('Ingesting single event', {
    siteId,
    eventType
  });
  await ingestEvents('pageviews', record);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin || '*'
    }
  });
}

export const config = {
  path: '/api/track'
};
