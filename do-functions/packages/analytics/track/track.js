/**
 * TRACK FUNCTION - DIGITALOCEAN VERSION
 * Uses Turso HTTP API pipeline for batched writes.
 * Matches Netlify ingestEvents behavior: denormalized columns + all rollup tables.
 */

const crypto = require('crypto');

const TURSO_URL = process.env.TURSO_DATABASE_URL?.replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const HASH_SECRET = process.env.HASH_SECRET;

const PLAN_LIMITS = {
  free: 5000, starter: 50000, growth: 200000,
  business: 1000000, scale: 5000000, enterprise: Infinity
};

// Caches (survive within warm container)
const siteCache = new Map();
const userPlanCache = new Map();
const usageLimitCache = new Map();

// ============================================
// TURSO HTTP CLIENT
// ============================================

function tursoArg(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'number') return { type: 'integer', value: String(value) };
  return { type: 'text', value: String(value) };
}

async function tursoQuery(sql, args = []) {
  const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(tursoArg) } },
        { type: 'close' }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Turso error: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results?.[0]?.response?.result;
  if (!result) return { rows: [] };

  const cols = result.cols?.map(c => c.name) || [];
  const rows = (result.rows || []).map(row => {
    const obj = {};
    row.forEach((cell, i) => { obj[cols[i]] = cell.value; });
    return obj;
  });

  return { rows };
}

/**
 * Execute multiple statements in a single Turso HTTP request.
 * This is the key optimization - turns N HTTP calls into 1.
 */
async function tursoPipeline(statements) {
  if (statements.length === 0) return;

  const requests = statements.map(stmt => ({
    type: 'execute',
    stmt: { sql: stmt.sql, args: stmt.args.map(tursoArg) }
  }));
  requests.push({ type: 'close' });

  const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Turso pipeline error: ${response.status} ${text}`);
  }

  return response.json();
}

// ============================================
// HELPERS
// ============================================

function getDailySalt(secret) {
  const today = new Date().toISOString().split('T')[0];
  return crypto.createHmac('sha256', secret).update(today).digest('hex');
}

function createIdentityHash(ip, userAgent, secret) {
  const salt = getDailySalt(secret);
  return crypto.createHash('sha256').update(`${ip}|${userAgent}|${salt}`).digest('hex');
}

function createSessionHash() {
  return crypto.randomBytes(16).toString('hex');
}

function parseContext(userAgent) {
  const ua = userAgent || '';
  let device = 'desktop';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) device = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
  let browser = 'other';
  if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Edg/i.test(ua)) browser = 'edge';
  else if (/Chrome/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua)) browser = 'safari';
  let os = 'other';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac OS/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua)) os = 'linux';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iOS|iPhone|iPad/i.test(ua)) os = 'ios';
  return { device, browser, os };
}

function isBot(userAgent) {
  if (!userAgent) return false;
  const bots = [
    'bot', 'crawl', 'spider', 'slurp', 'googlebot', 'bingpreview',
    'facebookexternalhit', 'linkedinbot', 'twitterbot', 'whatsapp',
    'telegrambot', 'discordbot', 'applebot', 'yandexbot', 'baiduspider',
    'duckduckbot', 'semrushbot', 'ahrefsbot', 'mj12bot', 'petalbot',
    'bytespider', 'gptbot', 'claudebot', 'headlesschrome', 'phantomjs',
    'selenium', 'puppeteer', 'lighthouse', 'pagespeed', 'uptimerobot'
  ];
  const ua = userAgent.toLowerCase();
  return bots.some(b => ua.includes(b));
}

function extractReferrerDomain(referrer) {
  if (!referrer) return '';
  try { return new URL(referrer).hostname; } catch { return ''; }
}

/**
 * Parse client event into eventType, payload, and meta.
 * Ported from Netlify track.js parseEvent().
 */
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

// ============================================
// DATABASE LOOKUPS
// ============================================

async function getSiteFromTurso(siteId) {
  const result = await tursoQuery(
    'SELECT id, domain, user_id, conversion_rules FROM sites_config WHERE id = ?',
    [siteId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    domain: row.domain,
    userId: row.user_id,
    conversionRules: row.conversion_rules ? JSON.parse(row.conversion_rules) : []
  };
}

async function getUserPlanFromTurso(userId) {
  if (!userId) return 'free';
  const result = await tursoQuery('SELECT plan FROM teams WHERE owner_id = ? LIMIT 1', [userId]);
  return result.rows[0]?.plan || 'free';
}

async function checkUsageLimitFromTurso(ownerId, limit) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const result = await tursoQuery(
    'SELECT SUM(pageviews) as total FROM monthly_usage WHERE team_id = ? AND month = ?',
    [ownerId, month]
  );
  const current = Number(result.rows[0]?.total || 0);
  return { isWithinLimit: current < limit, currentUsage: current, limit };
}

// ============================================
// CACHED LOOKUPS
// ============================================

async function getCachedSite(siteId) {
  const cached = siteCache.get(siteId);
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  const site = await getSiteFromTurso(siteId);
  if (site) siteCache.set(siteId, { data: site, ts: Date.now() });
  return site;
}

async function getCachedUserPlan(userId) {
  if (!userId) return 'free';
  const cached = userPlanCache.get(userId);
  if (cached && Date.now() - cached.ts < 300000) return cached.plan;
  const plan = await getUserPlanFromTurso(userId);
  userPlanCache.set(userId, { plan, ts: Date.now() });
  return plan;
}

async function getCachedUsageCheck(ownerId, limit) {
  const cacheKey = `${ownerId}:${limit}`;
  const cached = usageLimitCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30000) return cached.result;
  const result = await checkUsageLimitFromTurso(ownerId, limit);
  usageLimitCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

// ============================================
// RATE LIMITING (in-memory, per warm container)
// ============================================

const MAX_BATCH_SIZE = 50;
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 200; // max requests per IP per minute

function checkRateLimit(ip) {
  if (!ip) return true;
  const now = Date.now();
  const key = ip.substring(0, 45); // truncate for safety
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, start: now });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Cleanup stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(key);
  }
}, 120000);

// ============================================
// ORIGIN VALIDATION
// ============================================

function validateOrigin(origin, siteDomain) {
  if (!origin || !siteDomain) return true; // allow server-side/curl requests
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const siteDomainClean = siteDomain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
    if (originHost === siteDomainClean || originHost === 'www.' + siteDomainClean) return true;
    if (originHost === 'localhost' || originHost === '127.0.0.1') return true;
    return false;
  } catch (e) {
    return false;
  }
}

// ============================================
// MAIN HANDLER
// ============================================

async function main(args) {
  try {
    const method = (args.__ow_method || 'GET').toUpperCase();
    const headers = args.__ow_headers || {};
    const origin = headers.origin || '';
    const clientIp = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || '';

    // CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      };
    }

    if (method !== 'POST') {
      return { statusCode: 405, body: { error: 'Method not allowed' } };
    }

    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: { error: 'Too many requests' } };
    }

    // Parse body
    let body = {};
    if (args.__ow_body) {
      body = JSON.parse(Buffer.from(args.__ow_body, 'base64').toString('utf-8'));
    } else {
      const { __ow_method, __ow_headers, __ow_body, __ow_path, ...rest } = args;
      body = rest;
    }

    // Handle both batch and single event formats
    const isBatch = body.batch === true;
    const siteId = body.siteId;
    let events = isBatch ? (body.events || []) : [body];

    // Enforce batch size limit (MBK-007)
    if (events.length > MAX_BATCH_SIZE) {
      events = events.slice(0, MAX_BATCH_SIZE);
    }

    if (!siteId) {
      return { statusCode: 400, body: { error: 'Site ID required' } };
    }

    // Get site (cached)
    const site = await getCachedSite(siteId);
    if (!site) {
      return { statusCode: 404, body: { error: 'Invalid site ID' } };
    }

    // Origin validation (MBK-006)
    if (origin && !validateOrigin(origin, site.domain)) {
      return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: { error: 'Origin not allowed' } };
    }

    const allowedOrigin = origin || '*';
    const responseHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'X-Content-Type-Options': 'nosniff'
    };

    // Bot check
    const userAgent = headers['user-agent'] || '';
    if (isBot(userAgent)) {
      return { statusCode: 200, headers: responseHeaders, body: { success: true } };
    }

    // Check usage (cached - 30s TTL avoids DB hit per request)
    const ownerId = site.userId;
    if (ownerId) {
      const plan = await getCachedUserPlan(ownerId);
      const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
      const usage = await getCachedUsageCheck(ownerId, limit);
      if (!usage.isWithinLimit) {
        return { statusCode: 200, headers: responseHeaders, body: { success: true, limited: true } };
      }
    }

    // Build all SQL statements for the entire batch
    const clientIP = headers['x-forwarded-for'] || 'unknown';
    const serverContext = parseContext(userAgent);
    const identityHash = createIdentityHash(clientIP, userAgent, HASH_SECRET);
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
    const eventDate = now.toISOString().split('T')[0];
    const nowISO = now.toISOString();

    const statements = [];
    let pageviewCount = 0;

    for (const evt of events) {
      const { eventType, payload, meta } = parseEvent(evt);
      const sessionHash = evt.sessionId || createSessionHash();

      const enrichedPayload = { ...payload, city: '' };

      // INSERT into pageviews with denormalized columns
      statements.push({
        sql: `INSERT INTO pageviews (
          timestamp, site_id, identity_hash, session_hash, event_type,
          page_path, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, city,
          context_device, context_browser, context_os, context_country, context_region,
          meta_is_bounce, meta_duration, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          timestamp, siteId, identityHash, sessionHash, eventType,
          payload.page_path || null,
          payload.referrer_domain || null,
          payload.utm_source || null,
          payload.utm_medium || null,
          payload.utm_campaign || null,
          null, null, // utm_content, utm_term
          null, // city (DO doesn't have edge geo)
          evt.device?.type || serverContext.device,
          evt.device?.browser || serverContext.browser,
          evt.device?.os || serverContext.os,
          headers['x-country'] || headers['cf-ipcountry'] || 'unknown',
          headers['x-region'] || '',
          meta.isBounce ? 1 : 0,
          meta.duration || 0,
          JSON.stringify(enrichedPayload)
        ]
      });

      // Rollup updates for pageview events
      if (eventType === 'pageview') {
        pageviewCount++;

        // Daily rollup
        statements.push({
          sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions, updated_at)
                VALUES (?, ?, 1, 1, 1, ?)
                ON CONFLICT(site_id, date) DO UPDATE SET
                  pageviews = pageviews + 1,
                  updated_at = ?`,
          args: [siteId, eventDate, nowISO, nowISO]
        });

        // Page rollup
        if (payload.page_path) {
          statements.push({
            sql: `INSERT INTO page_rollups (site_id, date, page_path, views, visitors)
                  VALUES (?, ?, ?, 1, 1)
                  ON CONFLICT(site_id, date, page_path) DO UPDATE SET
                    views = views + 1`,
            args: [siteId, eventDate, payload.page_path]
          });
        }

        // Dimension rollups
        const dimensions = [
          ['device', evt.device?.type || serverContext.device],
          ['browser', evt.device?.browser || serverContext.browser],
          ['os', evt.device?.os || serverContext.os],
          ['country', headers['x-country'] || headers['cf-ipcountry'] || 'unknown'],
          ['region', headers['x-region'] || ''],
          ['referrer', payload.referrer_domain]
        ];

        for (const [dimType, dimValue] of dimensions) {
          if (dimValue && dimValue !== '' && dimValue !== 'unknown') {
            statements.push({
              sql: `INSERT INTO dimension_rollups (site_id, date, dimension_type, dimension_value, views, visitors)
                    VALUES (?, ?, ?, ?, 1, 1)
                    ON CONFLICT(site_id, date, dimension_type, dimension_value) DO UPDATE SET
                      views = views + 1`,
              args: [siteId, eventDate, dimType, dimValue]
            });
          }
        }

        // UTM rollups
        const utms = [
          ['source', payload.utm_source],
          ['medium', payload.utm_medium],
          ['campaign', payload.utm_campaign]
        ];

        for (const [utmType, utmValue] of utms) {
          if (utmValue) {
            statements.push({
              sql: `INSERT INTO utm_rollups (site_id, date, utm_type, utm_value, views, visitors)
                    VALUES (?, ?, ?, ?, 1, 1)
                    ON CONFLICT(site_id, date, utm_type, utm_value) DO UPDATE SET
                      views = views + 1`,
              args: [siteId, eventDate, utmType, utmValue]
            });
          }
        }
      }

      // Update engagement data (duration + bounce) on daily rollups
      if (eventType === 'engagement') {
        if (meta.duration > 0) {
          statements.push({
            sql: `UPDATE daily_rollups SET
                    total_duration = total_duration + ?,
                    bounces = bounces + ?,
                    updated_at = ?
                  WHERE site_id = ? AND date = ?`,
            args: [meta.duration, meta.isBounce ? 1 : 0, nowISO, siteId, eventDate]
          });
        }

        // Update page rollup with duration
        if (payload.page_path && meta.duration > 0) {
          statements.push({
            sql: `UPDATE page_rollups SET
                    total_duration = total_duration + ?,
                    exits = exits + 1
                  WHERE site_id = ? AND date = ? AND page_path = ?`,
            args: [meta.duration, siteId, eventDate, payload.page_path]
          });
        }
      }
    }

    // Execute ALL statements in ONE pipeline request
    if (statements.length > 0) {
      await tursoPipeline(statements);
    }

    // Update usage (fire and forget - don't block response)
    if (ownerId && pageviewCount > 0) {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      tursoPipeline([{
        sql: `INSERT INTO monthly_usage (team_id, site_id, month, pageviews, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(team_id, site_id, month) DO UPDATE SET
                pageviews = pageviews + ?,
                updated_at = ?`,
        args: [ownerId, siteId, month, pageviewCount, nowISO, pageviewCount, nowISO]
      }]).catch(() => {});
    }

    return { statusCode: 200, headers: responseHeaders, body: { success: true, count: events.length } };

  } catch (err) {
    console.error('[track] Error:', err.message, err.stack);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
      body: { error: 'Internal server error' }
    };
  }
}

exports.main = main;
