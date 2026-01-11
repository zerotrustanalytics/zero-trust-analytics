import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getSite, getUserById, getConversionRules, addConversionRule, updateConversionRule, deleteConversionRule } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// Plan requirements for each action type
const ACTION_PLAN_REQUIREMENTS = {
  exclude_bounce: ['business', 'scale', 'enterprise'],
  force_conversion: ['scale', 'enterprise']
};

function canUseAction(plan, action) {
  const allowedPlans = ACTION_PLAN_REQUIREMENTS[action];
  if (!allowedPlans) return false;
  return allowedPlans.includes(plan?.toLowerCase());
}

export default async function handler(req, context) {
  const logger = createFunctionLogger('conversion-rules', req, context);
  const origin = req.headers.get('origin');

  logger.info('Conversion rules request received', { method: req.method });

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
        // GET - List all conversion rules for a site
        const rules = await getConversionRules(siteId);
        logger.info('Retrieved conversion rules', { siteId, count: rules.length });
        return successResponse({
          rules,
          plan,
          allowedActions: {
            exclude_bounce: canUseAction(plan, 'exclude_bounce'),
            force_conversion: canUseAction(plan, 'force_conversion')
          }
        }, 200, origin);
      }

      case 'POST': {
        // POST - Create a new conversion rule
        // CSRF validation for state-changing operations
        const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
        if (!csrfValidation.valid) {
          logger.warn('CSRF validation failed');
          return Errors.csrfInvalid();
        }

        const body = await req.json();
        const { name, conditions, action, enabled = true } = body;

        if (!name || !conditions || !action) {
          logger.warn('Missing required fields', { name: !!name, conditions: !!conditions, action: !!action });
          return Errors.validationError('Name, conditions, and action are required');
        }

        // Check plan allows this action
        if (!canUseAction(plan, action)) {
          const requiredPlan = action === 'force_conversion' ? 'Scale' : 'Business';
          logger.warn('Plan does not support action', { plan, action, requiredPlan });
          return new Response(JSON.stringify({
            error: 'Plan upgrade required',
            message: `The "${action}" action requires a ${requiredPlan} plan or higher.`,
            currentPlan: plan,
            requiredPlan: requiredPlan.toLowerCase()
          }), {
            status: 403,
            headers: getSecurityHeaders(origin)
          });
        }

        const rule = await addConversionRule(siteId, { name, conditions, action, enabled });
        logger.info('Created conversion rule', { siteId, ruleId: rule.id, action });
        return successResponse({ rule }, 201, origin);
      }

      case 'PATCH': {
        // PATCH - Update an existing rule
        if (!ruleId) {
          logger.warn('No ruleId provided for update');
          return Errors.validationError('Rule ID required for update');
        }

        const csrfValidation = validateCSRFFromRequest(req.headers, auth.user.id);
        if (!csrfValidation.valid) {
          logger.warn('CSRF validation failed');
          return Errors.csrfInvalid();
        }

        const updates = await req.json();

        // If changing action, check plan allows it
        if (updates.action && !canUseAction(plan, updates.action)) {
          const requiredPlan = updates.action === 'force_conversion' ? 'Scale' : 'Business';
          logger.warn('Plan does not support new action', { plan, action: updates.action });
          return new Response(JSON.stringify({
            error: 'Plan upgrade required',
            message: `The "${updates.action}" action requires a ${requiredPlan} plan or higher.`,
            currentPlan: plan,
            requiredPlan: requiredPlan.toLowerCase()
          }), {
            status: 403,
            headers: getSecurityHeaders(origin)
          });
        }

        const updated = await updateConversionRule(siteId, ruleId, updates);
        if (!updated) {
          logger.warn('Rule not found for update', { siteId, ruleId });
          return Errors.notFound('Rule');
        }

        logger.info('Updated conversion rule', { siteId, ruleId });
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

        const deleted = await deleteConversionRule(siteId, ruleId);
        if (!deleted) {
          logger.warn('Rule not found for delete', { siteId, ruleId });
          return Errors.notFound('Rule');
        }

        logger.info('Deleted conversion rule', { siteId, ruleId });
        return successResponse({ success: true }, 200, origin);
      }

      default:
        return Errors.methodNotAllowed();
    }
  } catch (err) {
    logger.error('Conversion rules operation failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/conversion-rules'
};
