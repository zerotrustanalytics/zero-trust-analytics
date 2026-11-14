/**
 * Shared HTTP bits for the billing functions: BillingError -> response, and the "billing is off" answer.
 */
import { BillingError } from '../../../vendor/launchkit/billing.js';
import { getSecurityHeaders } from './http.js';
import { handleError } from './error-handler.js';

export const notConfigured = (origin = null) =>
  new Response(JSON.stringify({ error: 'Billing is not configured' }), {
    status: 503,
    headers: getSecurityHeaders(origin)
  });

/** A BillingError answers with its own status and message; anything else goes through the app's error handler. */
export function billingErrorResponse(err, logger, origin = null) {
  if (err instanceof BillingError) {
    const status = err.status || 400;
    return new Response(JSON.stringify({ error: status >= 500 ? 'Billing is unavailable, try again' : err.message, code: err.code }), {
      status,
      headers: getSecurityHeaders(origin)
    });
  }
  return handleError(err, logger, origin);
}
