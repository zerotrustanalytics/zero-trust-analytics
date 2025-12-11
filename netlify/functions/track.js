import { createZTRecord, validateNoPII } from './lib/zero-trust-core.js';
import { ingestEvents } from './lib/tinybird.js';
import { getSite } from './lib/storage.js';

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await req.json();
    const { type, siteId } = data;

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify site exists (still using Netlify Blobs for site config)
    const site = await getSite(siteId);
    if (!site) {
      return new Response(JSON.stringify({ error: 'Invalid site ID' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // CORS origin validation
    const allowedOrigin = getAllowedOrigin(origin, site.domain);
    console.log(`CORS check: origin=${origin}, siteDomain=${site.domain}, allowed=${allowedOrigin}`);
    if (!allowedOrigin && origin) {
      console.log(`CORS blocked: origin=${origin}, expected domain=${site.domain}`);
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

    // Determine event type for ZT record
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

    // Create ZT record using core library (reusable across products)
    const record = createZTRecord({
      siteId,
      ip,
      userAgent,
      headers,
      secret: process.env.HASH_SECRET || 'default-secret-change-me',
      eventType,
      payload,
      meta
    });

    // Safety check - ensure no PII leaked into record
    if (!validateNoPII(record)) {
      console.error('PII detected in record, blocking storage');
      return new Response(JSON.stringify({ error: 'Data validation failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send to Tinybird
    await ingestEvents('pageviews', record);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || '*'
      }
    });
  } catch (err) {
    console.error('Track error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Internal error', debug: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/track'
};
