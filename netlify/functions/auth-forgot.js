import crypto from 'crypto';
import { getUser, createPasswordResetToken } from './lib/storage.js';
import { sendPasswordResetEmail } from './lib/email.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';
import { corsPreflightResponse, Errors, getSecurityHeaders } from './lib/auth.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed();
  }

  // Rate limit by IP - strict limit for password reset (3 per minute)
  const ip = context?.ip || req.headers.get?.('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimitKey = hashIP(ip);
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 3, windowMs: 60000 });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return Errors.validationError('Email is required');
    }

    // Always return success to prevent email enumeration
    const safeResponse = () => new Response(JSON.stringify({
      success: true,
      message: 'If an account with that email exists, we sent a password reset link.'
    }), {
      status: 200,
      headers: getSecurityHeaders(origin)
    });

    // Check if user exists (silently)
    const user = await getUser(email);
    if (!user) {
      // Return success even if user doesn't exist (security)
      return safeResponse();
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token
    await createPasswordResetToken(email, token);

    // Build reset URL - points to Next.js reset-password page
    const baseUrl = process.env.URL || 'https://ztas.io';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send email
    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Still return success to prevent enumeration
    }

    return safeResponse();
  } catch (err) {
    console.error('Forgot password error:', err);
    return Errors.internalError('An error occurred');
  }
}

export const config = {
  path: '/api/auth/forgot'
};
