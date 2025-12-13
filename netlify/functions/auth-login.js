import { verifyPassword, createToken, Errors } from './lib/auth.js';
import { getUser } from './lib/storage.js';
import { checkRateLimit, rateLimitResponse, hashIP } from './lib/rate-limit.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed();
  }

  // Strict rate limiting for login: 10 attempts per minute per IP
  const clientIP = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `login_${hashIP(clientIP)}`;
  const rateLimit = checkRateLimit(rateLimitKey, { limit: 10, windowMs: 60000 });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Errors.validationError('Email and password required');
    }

    // Get user
    const user = await getUser(email);
    if (!user) {
      return Errors.unauthorized('Invalid credentials');
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Errors.unauthorized('Invalid credentials');
    }

    // Check if user has 2FA enabled
    if (user.twoFactorEnabled) {
      // Create a temporary token (short-lived, 5 minutes)
      const jwt = (await import('jsonwebtoken')).default;
      const tempToken = jwt.sign(
        { email: user.email, temp: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      return new Response(JSON.stringify({
        success: true,
        requires_2fa: true,
        tempToken
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create JWT token (no 2FA required)
    const token = createToken({ id: user.id, email: user.email });

    return new Response(JSON.stringify({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        subscription: user.subscription
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return Errors.internalError('Login failed');
  }
}

export const config = {
  path: '/api/auth/login'
};
