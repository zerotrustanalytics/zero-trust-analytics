import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites, getUserById } from './lib/storage.js';
import { getCustomEvents } from './lib/turso.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { validateRequest, statsQuerySchema } from './lib/schemas.js';
import { Config, effectivePlan } from './lib/config.js';

// These reports read raw events rather than rollups, so the range is capped and
// results are briefly cached to keep repeat views from rescanning.
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const CACHE_TTL = 60000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map();

// The only report that filters by name; anything else gets every event.
const ALLOWED_PREFIXES = new Set(['chat_']);

/** Custom events grouped for reporting. Powers the Events and Chat widget dashboard pages. */
export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('events', req, context);

  if (req.method === 'OPTIONS') return corsPreflightResponse(origin, 'GET, OPTIONS');
  if (req.method !== 'GET') return Errors.methodNotAllowed(origin);

  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const url = new URL(req.url);
    const { siteId, period } = validateRequest(statsQuerySchema, {
      siteId: url.searchParams.get('siteId'),
      period: url.searchParams.get('period')
    }, logger);
    const requested = url.searchParams.get('prefix');
    const prefix = ALLOWED_PREFIXES.has(requested) ? requested : '';

    const userSites = await getUserSites(auth.user.id);
    if (!userSites.includes(siteId)) return Errors.forbidden('Access denied', origin);

    const plan = effectivePlan(await getUserById(auth.user.id));
    const features = Config.pricing.features[plan] || Config.pricing.features.free;
    if (!features.customEvents) {
      return new Response(JSON.stringify({ error: 'Custom events need a paid plan', code: 'PLAN_REQUIRED' }), {
        status: 403,
        headers: getSecurityHeaders(origin)
      });
    }

    const days = PERIOD_DAYS[period] || PERIOD_DAYS['7d'];
    const key = `${siteId}|${days}|${prefix}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return successResponse(cached.data, 200, origin);

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    const format = (d) => d.toISOString().replace('T', ' ').split('.')[0];

    const data = await getCustomEvents(siteId, format(startDate), format(endDate), prefix);
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return successResponse(data, 200, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/events'
};
