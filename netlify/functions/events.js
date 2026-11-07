import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites, getUserById } from './lib/storage.js';
import { getCustomEvents } from './lib/turso.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { validateRequest, statsQuerySchema } from './lib/schemas.js';
import { Config, effectivePlan } from './lib/config.js';

const PERIOD_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

/** Custom events grouped for reporting. Powers the Events and Chat widget dashboard pages. */
export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('events', req, context);

  if (req.method === 'OPTIONS') return corsPreflightResponse(origin, 'GET, OPTIONS');
  if (req.method !== 'GET') return Errors.methodNotAllowed();

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

    const userSites = await getUserSites(auth.user.id);
    if (!userSites.includes(siteId)) return Errors.forbidden('Access denied');

    const plan = effectivePlan(await getUserById(auth.user.id));
    const features = Config.pricing.features[plan] || Config.pricing.features.free;
    if (!features.customEvents) return Errors.forbidden('Custom events need a paid plan');

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (PERIOD_DAYS[period] || 7));
    const format = (d) => d.toISOString().replace('T', ' ').split('.')[0];

    return successResponse(await getCustomEvents(siteId, format(startDate), format(endDate)), 200, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/events'
};
