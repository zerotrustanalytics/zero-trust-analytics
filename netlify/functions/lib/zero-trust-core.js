/**
 * ZERO TRUST CORE
 * ================
 * Reusable zero-trust primitives for any ZT product.
 *
 * Products using this:
 * - ZT Analytics (visitor tracking)
 * - ZT Voting (ballot verification)
 * - ZT Forms (anonymous submissions)
 * - ZT Surveys (anonymous feedback)
 */

const crypto = require('crypto');

// Daily salt rotates at midnight UTC
function getDailySalt(secret) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return crypto.createHmac('sha256', secret).update(today).digest('hex');
}

/**
 * Generate an unlinkable identity hash
 * - Same person = same hash within a day
 * - Different day = different hash (unlinkable)
 * - No way to reverse to original IP/UA
 *
 * @param {string} ip - IP address (never stored)
 * @param {string} userAgent - User agent (never stored)
 * @param {string} secret - Server-side secret
 * @returns {string} - 64-char hex hash
 */
function createIdentityHash(ip, userAgent, secret) {
  const salt = getDailySalt(secret);
  const input = `${ip}|${userAgent}|${salt}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a session hash
 * - Unique per session
 * - Not linkable to identity
 *
 * @returns {string} - 32-char hex hash
 */
function createSessionHash() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Parse device info from User-Agent
 * Returns only categorical data, not fingerprinting details
 *
 * @param {string} userAgent
 * @returns {object} - { device, browser, os }
 */
function parseContext(userAgent) {
  const ua = userAgent || '';

  // Device type (categorical only)
  let device = 'desktop';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    device = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
  }

  // Browser (name only, no version fingerprinting)
  let browser = 'other';
  if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Edg/i.test(ua)) browser = 'edge';
  else if (/Chrome/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua)) browser = 'safari';
  else if (/Opera|OPR/i.test(ua)) browser = 'opera';

  // OS (name only)
  let os = 'other';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac OS/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua)) os = 'linux';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iOS|iPhone|iPad/i.test(ua)) os = 'ios';

  return { device, browser, os };
}

/**
 * Extract geo data from request headers (Netlify/Cloudflare)
 * Uses edge-provided geo, never does IP lookup
 *
 * @param {object} headers - Request headers
 * @returns {object} - { country, region }
 */
function parseGeo(headers) {
  return {
    country: headers['x-country'] || headers['cf-ipcountry'] || 'unknown',
    region: headers['x-nf-client-connection-region'] || headers['cf-region'] || 'unknown'
  };
}

/**
 * Create a ZT event record ready for storage
 * This is the canonical format for all ZT products
 *
 * @param {object} params
 * @returns {object} - Record ready for storage
 */
function createZTRecord({
  siteId,
  ip,
  userAgent,
  headers,
  secret,
  eventType = 'pageview',
  payload = {},
  meta = {}
}) {
  const context = parseContext(userAgent);
  const geo = parseGeo(headers);

  return {
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    site_id: siteId,
    identity_hash: createIdentityHash(ip, userAgent, secret),
    session_hash: payload.sessionId || createSessionHash(),
    event_type: eventType,
    payload: JSON.stringify(payload),
    context_device: context.device,
    context_browser: context.browser,
    context_os: context.os,
    context_country: geo.country,
    context_region: geo.region,
    meta_is_bounce: meta.isBounce ? 1 : 0,
    meta_duration: meta.duration || 0
  };
}

/**
 * Validate that a record contains no PII
 * Use this before storage as a safety check
 *
 * @param {object} record
 * @returns {boolean}
 */
function validateNoPII(record) {
  const piiPatterns = [
    { name: 'IPv4', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
    { name: 'IPv6', pattern: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/ }, // Full IPv6 only
    { name: 'Email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ },
    { name: 'Phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ },
  ];

  const recordStr = JSON.stringify(record);
  for (const { name, pattern } of piiPatterns) {
    if (pattern.test(recordStr)) {
      console.error(`PII pattern matched: ${name}`);
      return false;
    }
  }
  return true;
}

export {
  createIdentityHash,
  createSessionHash,
  parseContext,
  parseGeo,
  createZTRecord,
  validateNoPII,
  getDailySalt
};
