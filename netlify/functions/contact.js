/**
 * CONTACT FORM ENDPOINT
 * =====================
 * POST /api/contact — receives the ztas.io contact form and emails it to
 * CONTACT_EMAIL (lib/email.js sendContactEmail). Public, so it is guarded by:
 * an origin allowlist (ztas.io), a honeypot field, field-length limits and a
 * per-IP rate limit (in memory: 5 messages / hour).
 *
 * Body (JSON): { name, email, message, website }  — `website` is the honeypot.
 */
import { sendContactEmail } from './lib/email.js';
import { hashIP } from './lib/rate-limit.js';
import { createFunctionLogger } from './lib/logger.js';

const ALLOWED_ORIGINS = ['https://ztas.io', 'https://www.ztas.io', 'http://localhost:1313'];
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const sent = new Map(); // hashed IP -> timestamps

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Vary': 'Origin'
    }
  });
}

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('contact', req, context);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Origin not allowed' }, origin);

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request' }, origin);
  }

  // Honeypot: bots fill every field. Pretend success so they don't retry.
  if (body.website) return json(200, { success: true }, origin);

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  if (!name || name.length > 100) return json(400, { error: 'Please enter your name.' }, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return json(400, { error: 'Please enter a valid email address.' }, origin);
  }
  if (message.length < 5 || message.length > 5000) {
    return json(400, { error: 'Please write a message (up to 5,000 characters).' }, origin);
  }

  const key = hashIP(context.ip || 'unknown');
  const now = Date.now();
  const recent = (sent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    return json(429, { error: 'Too many messages. Please try again later.' }, origin);
  }

  try {
    await sendContactEmail({ name, email, message });
  } catch (err) {
    logger.error('Contact email failed', err);
    return json(503, { error: "We couldn't send your message right now. Please try again later." }, origin);
  }
  recent.push(now);
  sent.set(key, recent);
  return json(200, { success: true }, origin);
}

export const config = {
  path: '/api/contact'
};
