import { hashPassword, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getPasswordResetToken, deletePasswordResetToken, updateUser } from './lib/storage.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';

// SECURITY: Strong password validation (same as register)
function validatePassword(password) {
  const errors = [];
  if (password.length < 12) errors.push('Password must be at least 12 characters');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Password must contain at least one special character');
  return errors;
}

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed();
  }

  // Rate limit by IP - strict limit for password reset (5 per minute)
  const ip = context?.ip || req.headers.get?.('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimitKey = hashIP(ip);
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 5, windowMs: 60000 });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return Errors.validationError('Token and password are required');
    }

    // SECURITY: Strong password validation
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return Errors.validationError('Password does not meet requirements', passwordErrors);
    }

    // Validate token
    const tokenData = await getPasswordResetToken(token);
    if (!tokenData) {
      return Errors.badRequest('Invalid or expired reset link');
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // SECURITY: Invalidate all existing sessions when password is changed
    // This prevents old JWT tokens from being used after a password reset
    const tokenInvalidatedAt = new Date().toISOString();

    // Update user's password and invalidation timestamp
    const updated = await updateUser(tokenData.email, {
      passwordHash,
      tokenInvalidatedAt
    });
    if (!updated) {
      return Errors.internalError('Failed to update password');
    }

    // Delete the used token (one-time use)
    await deletePasswordResetToken(token);

    return successResponse({
      success: true,
      message: 'Password has been reset successfully'
    }, 200, origin);
  } catch (err) {
    console.error('Reset password error:', err);
    return Errors.internalError('An error occurred');
  }
}

export const config = {
  path: '/api/auth/reset'
};
