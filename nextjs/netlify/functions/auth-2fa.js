import { TOTP, Secret } from 'otpauth';
import { authenticateRequest, createToken, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUser, updateUser } from './lib/storage.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('auth-2fa', req, context);
  const origin = req.headers.get('origin');

  logger.info('2FA request received', { action: new URL(req.url).pathname });

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return Errors.methodNotAllowed();
  }

  try {
    const body = await req.json();
    const { action } = body;
    const url = new URL(req.url);

    // POST /api/auth/2fa/setup - Generate TOTP secret + QR code
    if (action === 'setup' || url.pathname.includes('/setup')) {
      logger.info('2FA setup initiated');
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        logger.warn('2FA setup failed - authentication error', { error: auth.error });
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: getSecurityHeaders(origin)
        });
      }

      const userId = auth.user.id;
      const user = await getUser(auth.user.email);

      if (!user) {
        logger.warn('2FA setup failed - user not found', { userId });
        return Errors.notFound('User not found');
      }

      // Generate a new secret
      const secret = new Secret({ size: 20 });
      const totp = new TOTP({
        issuer: 'Zero Trust Analytics',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret
      });

      // Generate QR code URI
      const qrCodeUri = totp.toString();

      // Store the secret temporarily (not enabled yet)
      await updateUser(user.email, {
        twoFactorSecret: secret.base32,
        twoFactorEnabled: false
      });

      logger.info('2FA setup completed - secret generated', { userId });
      return successResponse({
        success: true,
        secret: secret.base32,
        qrCode: qrCodeUri,
        message: 'Scan the QR code with your authenticator app, then verify with a code'
      }, 200, origin);
    }

    // POST /api/auth/2fa/verify - Verify TOTP code and enable 2FA
    if (action === 'verify' || url.pathname.includes('/verify')) {
      logger.info('2FA verification initiated');
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        logger.warn('2FA verify failed - authentication error', { error: auth.error });
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: getSecurityHeaders(origin)
        });
      }

      const userId = auth.user.id;
      const { code } = body;

      if (!code) {
        logger.warn('2FA verify failed - no code provided', { userId });
        return Errors.validationError('Verification code required');
      }

      const user = await getUser(auth.user.email);

      if (!user || !user.twoFactorSecret) {
        logger.warn('2FA verify failed - setup not initiated', { userId });
        return Errors.badRequest('2FA setup not initiated. Please run setup first.');
      }

      // Verify the TOTP code
      const totp = new TOTP({
        issuer: 'Zero Trust Analytics',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(user.twoFactorSecret)
      });

      const delta = totp.validate({ token: code, window: 1 });

      if (delta === null) {
        logger.warn('2FA verify failed - invalid code', { userId });
        return Errors.unauthorized('Invalid verification code');
      }

      // Enable 2FA for the user
      await updateUser(user.email, {
        twoFactorEnabled: true
      });

      logger.info('2FA enabled successfully', { userId });
      return successResponse({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      }, 200, origin);
    }

    // POST /api/auth/2fa/disable - Disable 2FA (requires code)
    if (action === 'disable' || url.pathname.includes('/disable')) {
      logger.info('2FA disable initiated');
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        logger.warn('2FA disable failed - authentication error', { error: auth.error });
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: getSecurityHeaders(origin)
        });
      }

      const userId = auth.user.id;
      const { code } = body;

      if (!code) {
        logger.warn('2FA disable failed - no code provided', { userId });
        return Errors.validationError('Verification code required to disable 2FA');
      }

      const user = await getUser(auth.user.email);

      if (!user || !user.twoFactorEnabled) {
        logger.warn('2FA disable failed - not enabled', { userId });
        return Errors.badRequest('2FA is not enabled for this account');
      }

      // Verify the TOTP code
      const totp = new TOTP({
        issuer: 'Zero Trust Analytics',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(user.twoFactorSecret)
      });

      const delta = totp.validate({ token: code, window: 1 });

      if (delta === null) {
        logger.warn('2FA disable failed - invalid code', { userId });
        return Errors.unauthorized('Invalid verification code');
      }

      // Disable 2FA
      await updateUser(user.email, {
        twoFactorEnabled: false,
        twoFactorSecret: null
      });

      logger.info('2FA disabled successfully', { userId });
      return successResponse({
        success: true,
        message: 'Two-factor authentication disabled'
      }, 200, origin);
    }

    // POST /api/auth/2fa/validate - Validate code during login
    if (action === 'validate' || url.pathname.includes('/validate')) {
      logger.info('2FA validation initiated');
      const { tempToken, code } = body;

      if (!tempToken || !code) {
        logger.warn('2FA validate failed - missing token or code');
        return Errors.validationError('Temporary token and code required');
      }

      // Verify the temp token (should contain email)
      let email;
      try {
        const jwt = (await import('jsonwebtoken')).default;
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        email = decoded.email;
      } catch (err) {
        logger.warn('2FA validate failed - invalid temp token');
        return Errors.unauthorized('Invalid temporary token');
      }

      const user = await getUser(email);

      if (!user || !user.twoFactorEnabled) {
        logger.warn('2FA validate failed - 2FA not enabled');
        return Errors.badRequest('2FA is not enabled for this account');
      }

      // Verify the TOTP code
      const totp = new TOTP({
        issuer: 'Zero Trust Analytics',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(user.twoFactorSecret)
      });

      const delta = totp.validate({ token: code, window: 1 });

      if (delta === null) {
        logger.warn('2FA validate failed - invalid code', { userId: user.id });
        return Errors.unauthorized('Invalid verification code');
      }

      // Create full JWT token
      const token = createToken({ id: user.id, email: user.email });

      logger.info('2FA validation successful', { userId: user.id });
      return successResponse({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          subscription: user.subscription
        }
      }, 200, origin);
    }

    logger.warn('Invalid 2FA action requested', { action });
    return Errors.badRequest('Invalid action. Use: setup, verify, disable, or validate');

  } catch (err) {
    logger.error('2FA operation failed', err);
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/auth/2fa'
};
