import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders, validateCSRFFromRequest } from './lib/auth.js';
import { getUserById, getBranding, updateBranding } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

// Plans that can use white-label branding
const ALLOWED_PLANS = ['business', 'scale', 'enterprise'];

function canUseBranding(plan) {
  return ALLOWED_PLANS.includes(plan?.toLowerCase());
}

export default async function handler(req, context) {
  const logger = createFunctionLogger('branding', req, context);
  const origin = req.headers.get('origin');

  logger.info('Branding request received', { method: req.method });

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, POST, OPTIONS');
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
    switch (req.method) {
      case 'GET': {
        // GET - Return current branding settings
        const branding = await getBranding(auth.user.id);

        logger.info('Retrieved branding settings', { userId: auth.user.id });
        return successResponse({
          branding,
          plan,
          canUseBranding: canUseBranding(plan)
        }, 200, origin);
      }

      case 'POST': {
        // POST - Update branding settings (Business+ only)

        // Check plan allows branding
        if (!canUseBranding(plan)) {
          logger.warn('Plan does not support branding', { plan });
          return new Response(JSON.stringify({
            error: 'Plan upgrade required',
            message: 'White-label branding requires a Business plan or higher.',
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
        const { companyName, logoUrl, primaryColor, enabled } = body;

        // Validate inputs
        if (companyName && companyName.length > 100) {
          return Errors.validationError('Company name must be 100 characters or less');
        }
        if (logoUrl && !isValidUrl(logoUrl)) {
          return Errors.validationError('Invalid logo URL');
        }
        if (primaryColor && !isValidHexColor(primaryColor)) {
          return Errors.validationError('Invalid color format (use hex like #3B82F6)');
        }

        const updates = {};
        if (companyName !== undefined) updates.companyName = companyName.trim();
        if (logoUrl !== undefined) updates.logoUrl = logoUrl;
        if (primaryColor !== undefined) updates.primaryColor = primaryColor;
        if (enabled !== undefined) updates.enabled = Boolean(enabled);

        const updatedBranding = await updateBranding(auth.user.id, updates);

        logger.info('Updated branding settings', { userId: auth.user.id, enabled: updates.enabled });
        return successResponse({ branding: updatedBranding }, 200, origin);
      }

      default:
        return Errors.methodNotAllowed();
    }
  } catch (err) {
    logger.error('Branding operation failed', err, { userId: auth.user.id });
    return handleError(err, logger, origin);
  }
}

// Helper to validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper to validate hex color
function isValidHexColor(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

export const config = {
  path: '/api/branding'
};
