import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getSite, getUserById, getPageValueRules, addPageValueRule, updatePageValueRule, deletePageValueRule } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// Plans that can use page value rules
const ALLOWED_PLANS = ['business', 'scale', 'enterprise'];

function canUsePageValues(plan) {
  return ALLOWED_PLANS.includes(plan?.toLowerCase());
}

export default async function handler(req, context) {
  const logger = createFunctionLogger('page-value-rules', req, context);
  const origin = req.headers.get('origin');

  logger.info('Page value rules request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, POST, PATCH, DELETE, OPTIONS');
  }

  // Authenticate request
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  // Get user's plan
  const user = await getUserById(auth.user.id);
  const plan = user?.plan || 'free';

  try {
    const url = new URL(req.url);
    const siteId = url.searchParams.get('siteId');
    const ruleId = url.searchParams.get('ruleId');

    if (!siteId) {
      logger.warn('No siteId provided');
      return Errors.validationError('Site ID required');
    }

    // Verify site ownership
    const site = await getSite(siteId);
    if (!site) {
      logger.warn('Site not found', { siteId });
      return Errors.notFound('Site');
    }

    if (site.userId !== auth.user.id) {
      logger.warn('Unauthorized access attempt', { userId: auth.user.id, siteId, siteUserId: site.userId });
      return Errors.forbidden('Not authorized to access this site');
    }

    // Handle different methods
    switch (req.method) {
      case 'GET': {
        // GET - List all page value rules for a site
        const rules = await getPageValueRules(siteId);
        logger.info('Retrieved page value rules', { siteId, count: rules.length });
        return successResponse({
          rules,
          plan,
          canUsePageValues: canUsePageValues(plan)
        }, 200, origin);
      }

      case 'POST': {
        // POST - Create a new page value rule
        // Check plan allows page values
        if (!canUsePageValues(plan)) {
          logger.warn('Plan does not support page values', { plan });
          return new Response(JSON.stringify({
            error: 'Plan upgrade required',
            message: 'Page Value Rules require a Business plan or higher. Assign monetary values to pages and track ROI by traffic source.',
            currentPlan: plan,
            requiredPlan: 'business'
          }), {
            status: 403,
            headers: getSecurityHeaders(origin)
          });
        }

        // CSRF validation for state-changing operations
        const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
        if (!csrfValidation.valid) {
          logger.warn('CSRF validation failed');
          return Errors.csrfInvalid();
        }

        const body = await req.json();
        const { name, conditions, value, currency = 'USD', enabled = true } = body;

        if (!name || !conditions || value === undefined) {
          logger.warn('Missing required fields', { name: !!name, conditions: !!conditions, value: value !== undefined });
          return Errors.validationError('Name, conditions, and value are required');
        }

        if (!conditions.page) {
          return Errors.validationError('Page condition is required');
        }

        if (typeof value !== 'number' || value < 0) {
          return Errors.validationError('Value must be a positive number');
        }

        const rule = await addPageValueRule(siteId, {
          name,
          conditions,
          value,
          currency,
          enabled
        });

        logger.info('Created page value rule', { siteId, ruleId: rule.id, value });
        return successResponse({ rule }, 201, origin);
      }

      case 'PATCH': {
        // PATCH - Update an existing rule
        if (!ruleId) {
          logger.warn('No ruleId provided for update');
          return Errors.validationError('Rule ID required for update');
        }

        if (!canUsePageValues(plan)) {
          logger.warn('Plan does not support page values', { plan });
          return new Response(JSON.stringify({
            error: 'Plan upgrade required',
            message: 'Page Value Rules require a Business plan or higher.',
            currentPlan: plan,
            requiredPlan: 'business'
          }), {
            status: 403,
            headers: getSecurityHeaders(origin)
          });
        }

        const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
        if (!csrfValidation.valid) {
          logger.warn('CSRF validation failed');
          return Errors.csrfInvalid();
        }

        const updates = await req.json();

        // Validate value if provided
        if (updates.value !== undefined && (typeof updates.value !== 'number' || updates.value < 0)) {
          return Errors.validationError('Value must be a positive number');
        }

        const updated = await updatePageValueRule(siteId, ruleId, updates);
        if (!updated) {
          logger.warn('Rule not found for update', { siteId, ruleId });
          return Errors.notFound('Rule');
        }

        logger.info('Updated page value rule', { siteId, ruleId });
        return successResponse({ rule: updated }, 200, origin);
      }

      case 'DELETE': {
        // DELETE - Remove a rule
        if (!ruleId) {
          logger.warn('No ruleId provided for delete');
          return Errors.validationError('Rule ID required for delete');
        }

        const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
        if (!csrfValidation.valid) {
          logger.warn('CSRF validation failed');
          return Errors.csrfInvalid();
        }

        const deleted = await deletePageValueRule(siteId, ruleId);
        if (!deleted) {
          logger.warn('Rule not found for delete', { siteId, ruleId });
          return Errors.notFound('Rule');
        }

        logger.info('Deleted page value rule', { siteId, ruleId });
        return successResponse({ success: true }, 200, origin);
      }

      default:
        return Errors.methodNotAllowed();
    }
  } catch (err) {
    logger.error('Page value rules operation failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/page-value-rules'
};
