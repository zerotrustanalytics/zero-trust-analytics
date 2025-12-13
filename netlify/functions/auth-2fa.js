import { TOTP, Secret } from 'otpauth';
import { authenticateRequest, createToken, Errors } from './lib/auth.js';
import { getUser, updateUser } from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
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
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const userId = auth.user.id;
      const user = await getUser(auth.user.email);

      if (!user) {
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

      return new Response(JSON.stringify({
        success: true,
        secret: secret.base32,
        qrCode: qrCodeUri,
        message: 'Scan the QR code with your authenticator app, then verify with a code'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // POST /api/auth/2fa/verify - Verify TOTP code and enable 2FA
    if (action === 'verify' || url.pathname.includes('/verify')) {
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const userId = auth.user.id;
      const { code } = body;

      if (!code) {
        return Errors.validationError('Verification code required');
      }

      const user = await getUser(auth.user.email);

      if (!user || !user.twoFactorSecret) {
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
        return Errors.unauthorized('Invalid verification code');
      }

      // Enable 2FA for the user
      await updateUser(user.email, {
        twoFactorEnabled: true
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // POST /api/auth/2fa/disable - Disable 2FA (requires code)
    if (action === 'disable' || url.pathname.includes('/disable')) {
      const auth = authenticateRequest(req.headers);
      if (auth.error) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const userId = auth.user.id;
      const { code } = body;

      if (!code) {
        return Errors.validationError('Verification code required to disable 2FA');
      }

      const user = await getUser(auth.user.email);

      if (!user || !user.twoFactorEnabled) {
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
        return Errors.unauthorized('Invalid verification code');
      }

      // Disable 2FA
      await updateUser(user.email, {
        twoFactorEnabled: false,
        twoFactorSecret: null
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Two-factor authentication disabled'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // POST /api/auth/2fa/validate - Validate code during login
    if (action === 'validate' || url.pathname.includes('/validate')) {
      const { tempToken, code } = body;

      if (!tempToken || !code) {
        return Errors.validationError('Temporary token and code required');
      }

      // Verify the temp token (should contain email)
      let email;
      try {
        const jwt = (await import('jsonwebtoken')).default;
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        email = decoded.email;
      } catch (err) {
        return Errors.unauthorized('Invalid temporary token');
      }

      const user = await getUser(email);

      if (!user || !user.twoFactorEnabled) {
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
        return Errors.unauthorized('Invalid verification code');
      }

      // Create full JWT token
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
    }

    return Errors.badRequest('Invalid action. Use: setup, verify, disable, or validate');

  } catch (err) {
    console.error('2FA error:', err);
    return Errors.internalError('2FA operation failed');
  }
}

export const config = {
  path: '/api/auth/2fa'
};
