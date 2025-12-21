import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser, getUserStatus } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('user-status', req, context);
  const origin = req.headers.get('origin');

  logger.info('User status request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate request
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const user = await getUser(auth.user.email);
    if (!user) {
      logger.warn('User not found', { userId: auth.user.id });
      return Errors.notFound('User');
    }

    const status = getUserStatus(user);

    logger.info('User status retrieved successfully', { userId: user.id, plan: status.plan, status: status.status });
    return successResponse({
      id: user.id,
      email: user.email,
      plan: status.plan,
      status: status.status,
      canAccess: status.canAccess,
      trialEndsAt: status.trialEndsAt,
      daysLeft: status.daysLeft,
      subscription: status.subscription ? {
        status: status.subscription.status,
        currentPeriodEnd: status.subscription.currentPeriodEnd
      } : null
    }, 200, origin);
  } catch (err) {
    logger.error('Failed to get user status', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/user/status'
};
