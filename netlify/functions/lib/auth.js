/**
 * Authentication and Security Library
 *
 * Who is calling (authenticateRequest), by AUTH_MODE:
 * - oidc: a gatekeep id_token as `Authorization: Bearer`, verified against the
 *   issuer's JWKS; the ZTA account is found (or created) by verified email.
 * - password: the shared AUTH_PASSWORD in the X-Auth-Password header.
 * - none: single-user self-host, no credentials.
 *
 * CSRF: requests that authenticate with a header (Bearer or X-Auth-Password)
 * can't be forged cross-site, so validateCSRFFromRequest lets them through.
 * Anything else must present a valid X-CSRF-Token (an HMAC of the user id
 * under JWT_SECRET), which nothing issues today, so such requests are refused.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Config } from './config.js';
import { getUser, createOAuthUser } from './storage.js';
import { extractBearerToken, timingSafeStringEqual } from './http.js';

// Endpoints import the HTTP helpers from here as well as sign-in.
export * from './http.js';

// --- OIDC (gatekeep) verification -------------------------------------------

// Lazily-built remote JWKS resolver (caches keys, refetches on rotation).
let _gatekeepJWKS = null;
function gatekeepJWKS() {
  if (!_gatekeepJWKS) {
    if (!Config.oidc.jwksUri) {
      throw new Error('AUTH_MODE=oidc but GATEKEEP_ISSUER is not set');
    }
    _gatekeepJWKS = createRemoteJWKSet(new URL(Config.oidc.jwksUri));
  }
  return _gatekeepJWKS;
}

/**
 * Verify a gatekeep OIDC token (EdDSA) against the published JWKS.
 * Enforces issuer + audience. Returns the verified claims, or throws
 * (jose sets `err.code`, e.g. ERR_JWT_EXPIRED / ERR_JWS_SIGNATURE_VERIFICATION_FAILED).
 * `keyResolver` is injectable so this can be unit-tested with a local key set.
 */
export async function verifyOidcToken(token, keyResolver = null) {
  const resolver = keyResolver || gatekeepJWKS();
  const { payload } = await jwtVerify(token, resolver, {
    issuer: Config.oidc.issuer,
    audience: Config.oidc.clientId,
  });
  return payload;
}

// Middleware helper - verify auth and return user
// Supports auth modes: oidc (gatekeep), password, none
export async function authenticateRequest(headers, user = null) {
  const authMode = Config.auth.mode;

  // AUTH_MODE=none: No authentication required (self-hosted single user)
  if (authMode === 'none') {
    return {
      user: {
        id: 'self-hosted-user',
        email: 'admin@localhost',
        plan: 'enterprise', // Self-hosted gets all features
        isSelfHosted: true
      }
    };
  }

  // AUTH_MODE=password: Simple shared password authentication
  if (authMode === 'password') {
    const providedPassword = headers.get?.('x-auth-password') || headers.get?.('X-Auth-Password');
    const expectedPassword = Config.auth.password;

    if (!expectedPassword) {
      console.error('AUTH_MODE=password but AUTH_PASSWORD not set');
      return { error: 'Server misconfigured', status: 500 };
    }

    if (!providedPassword) {
      return { error: 'Password required', status: 401, needsPassword: true };
    }

    if (!timingSafeStringEqual(providedPassword, expectedPassword)) {
      return { error: 'Invalid password', status: 401 };
    }

    return {
      user: {
        id: 'self-hosted-user',
        email: 'admin@localhost',
        plan: 'enterprise',
        isSelfHosted: true
      }
    };
  }

  // AUTH_MODE=oidc: gatekeep (OpenID Connect) — verify an EdDSA JWT against the
  // published JWKS, then JIT-provision/resolve the ZTA user by the email claim.
  if (authMode === 'oidc') {
    const oidcToken = extractBearerToken(headers);
    if (!oidcToken) {
      return { error: 'No token provided', status: 401 };
    }

    let claims;
    try {
      claims = await verifyOidcToken(oidcToken);
    } catch (err) {
      if (err.code === 'ERR_JWT_EXPIRED') {
        return { error: 'Token expired. Please log in again.', status: 401, expired: true };
      }
      console.log('OIDC token verification failed:', err.code || err.message);
      return { error: 'Invalid token', status: 401 };
    }

    const email = claims.email;
    if (!email) {
      // gatekeep id_tokens carry email; access_tokens do not. The dashboard must
      // present a token with the email claim (the id_token).
      return { error: 'Token missing email claim', status: 401 };
    }

    // Accounts are keyed by email, so an unverified email must never resolve
    // to (or pre-create) the account of whoever really owns that address.
    // gatekeep's sign-up verifies email by link, so real users always pass.
    if (claims.email_verified !== true) {
      return { error: 'Email address not verified', status: 403 };
    }

    // Resolve or just-in-time provision the ZTA account for this identity.
    let ztaUser = await getUser(email);
    if (!ztaUser) {
      ztaUser = await createOAuthUser(email, 'gatekeep', claims.sub, claims.name || null, 'free');
    }

    return {
      user: {
        ...ztaUser,
        // ownerId: the id that owns this account's sites/keys/teams when it
        // differs from the record id (Clerk-era accounts; set during migration
        // by scripts/link-owner-ids.mjs).
        id: ztaUser.ownerId || ztaUser.id,
        email,
        gatekeepSub: claims.sub,
        emailVerified: true,
      },
    };
  }

  // Any other mode is a misconfiguration (config.js validates AUTH_MODE at startup).
  return { error: `Unsupported AUTH_MODE: ${authMode}`, status: 500 };
}

// Helper to check if auth is required for current mode
export function isAuthRequired() {
  return Config.auth.requiresAuth;
}

// Helper to get auth mode info for frontend
export function getAuthModeInfo() {
  return {
    mode: Config.auth.mode,
    requiresAuth: Config.auth.requiresAuth,
    isSelfHosted: Config.selfHosted.enabled,
  };
}
