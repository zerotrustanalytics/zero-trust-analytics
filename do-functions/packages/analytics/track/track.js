/**
 * TRACK FUNCTION - DIGITALOCEAN VERSION
 * Uses Turso HTTP API directly (no native bindings)
 */

const crypto = require('crypto');

const TURSO_URL = process.env.TURSO_DATABASE_URL?.replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const HASH_SECRET = process.env.HASH_SECRET;

const PLAN_LIMITS = {
  free: 5000, starter: 50000, growth: 200000,
  business: 1000000, scale: 5000000, enterprise: Infinity
};

// Caches
const siteCache = new Map();
const userPlanCache = new Map();

// ============================================
// TURSO HTTP CLIENT
// ============================================

async function tursoQuery(sql, args = []) {
  const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(a => ({ type: 'text', value: String(a) })) } },
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

  // Convert Turso response to rows
  const cols = result.cols?.map(c => c.name) || [];
  const rows = (result.rows || []).map(row => {
    const obj = {};
    row.forEach((cell, i) => {
      obj[cols[i]] = cell.value;
    });
    return obj;
  });

  return { rows };
}

async function tursoExecute(sql, args = []) {
  return tursoQuery(sql, args);
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
  const bots = ['bot', 'crawl', 'spider', 'slurp', 'googlebot', 'bingpreview'];
  return bots.some(b => userAgent.toLowerCase().includes(b));
}

function extractReferrerDomain(referrer) {
  if (!referrer) return '';
  try { return new URL(referrer).hostname; } catch { return ''; }
}

// ============================================
// DATABASE FUNCTIONS
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

async function ingestEvent(event) {
  const now = new Date().toISOString();
  const eventDate = event.timestamp.split(' ')[0];

  await tursoExecute(
    `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type,
     page_path, referrer_domain, context_device, context_browser, context_os,
     context_country, context_region, meta_is_bounce, meta_duration, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.timestamp, event.site_id, event.identity_hash, event.session_hash, event.event_type,
     event.page_path, event.referrer_domain, event.context_device, event.context_browser,
     event.context_os, event.context_country, event.context_region, event.meta_is_bounce,
     event.meta_duration, JSON.stringify(event.payload)]
  );

  await tursoExecute(
    `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions, updated_at)
     VALUES (?, ?, 1, 1, 1, ?) ON CONFLICT(site_id, date) DO UPDATE SET pageviews = pageviews + 1, updated_at = ?`,
    [event.site_id, eventDate, now, now]
  );

  return { success: true };
}

async function incrementUsage(teamId, siteId) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await tursoExecute(
    `INSERT INTO monthly_usage (team_id, site_id, month, pageviews, updated_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(team_id, site_id, month) DO UPDATE SET pageviews = pageviews + 1, updated_at = ?`,
    [teamId, siteId, month, now.toISOString(), now.toISOString()]
  );
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

// ============================================
// MAIN HANDLER
// ============================================

async function main(args) {
  try {
    const method = (args.__ow_method || 'GET').toUpperCase();
    const headers = args.__ow_headers || {};
    const origin = headers.origin || '';

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
    const events = isBatch ? (body.events || []) : [body];

    if (!siteId) {
      return { statusCode: 400, body: { error: 'Site ID required' } };
    }

    // Get site
    const site = await getCachedSite(siteId);
    if (!site) {
      return { statusCode: 404, body: { error: 'Invalid site ID' } };
    }

    const responseHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '*'
    };

    // Bot check
    const userAgent = headers['user-agent'] || '';
    if (isBot(userAgent)) {
      return { statusCode: 200, headers: responseHeaders, body: { success: true } };
    }

    // Check usage
    const ownerId = site.userId;
    if (ownerId) {
      const plan = await getCachedUserPlan(ownerId);
      const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
      const usage = await checkUsageLimitFromTurso(ownerId, limit);
      if (!usage.isWithinLimit) {
        return { statusCode: 200, headers: responseHeaders, body: { success: true, limited: true } };
      }
    }

    // Process each event
    const clientIP = headers['x-forwarded-for'] || 'unknown';
    const serverContext = parseContext(userAgent);
    let count = 0;

    for (const evt of events) {
      const event = {
        timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
        site_id: siteId,
        identity_hash: createIdentityHash(clientIP, userAgent, HASH_SECRET),
        session_hash: evt.sessionId || createSessionHash(),
        event_type: evt.type || 'pageview',
        page_path: evt.path || evt.url || '/',
        referrer_domain: extractReferrerDomain(evt.referrer),
        context_device: evt.device?.type || serverContext.device,
        context_browser: evt.device?.browser || serverContext.browser,
        context_os: evt.device?.os || serverContext.os,
        context_country: headers['x-country'] || headers['cf-ipcountry'] || 'unknown',
        context_region: headers['x-region'] || '',
        meta_is_bounce: 0,
        meta_duration: 0,
        payload: evt
      };

      await ingestEvent(event);
      count++;
    }

    // Update usage (fire and forget)
    if (ownerId && count > 0) {
      // Increment by batch count (simplified - could be more accurate)
      incrementUsage(ownerId, siteId).catch(() => {});
    }

    return { statusCode: 200, headers: responseHeaders, body: { success: true, count } };

  } catch (err) {
    console.error('[track] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Internal server error', details: err.message }
    };
  }
}

exports.main = main;
