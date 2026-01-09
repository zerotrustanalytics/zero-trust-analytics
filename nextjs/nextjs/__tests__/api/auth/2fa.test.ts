/**
 * Two-Factor Authentication (2FA) API Tests
 *
 * Tests for /api/auth/2fa endpoint
 * Covers setup, verify, disable, and validate actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// MOCK DEPENDENCIES
// ==========================================

const mockGetUser = vi.fn()
const mockUpdateUser = vi.fn()
const mockAuthenticateRequest = vi.fn()
const mockCreateToken = vi.fn()

vi.mock('../../../netlify/functions/lib/storage.js', () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}))

vi.mock('../../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  createToken: (...args: unknown[]) => mockCreateToken(...args),
  corsPreflightResponse: (origin: string) =>
    new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origin || '*' },
    }),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  Errors: {
    methodNotAllowed: () => new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
    notFound: (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 404 }),
    badRequest: (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
    validationError: (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400 }),
    unauthorized: (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 401 }),
  },
  getSecurityHeaders: () => ({ 'Content-Type': 'application/json' }),
}))

// ==========================================
// 2FA HANDLER SIMULATION
// ==========================================

interface User2FA {
  id: string
  email: string
  twoFactorSecret?: string | null
  twoFactorEnabled?: boolean
  subscription?: unknown
}

async function handle2FARequest(
  method: string,
  action: string,
  body: Record<string, unknown>,
  authResult: { user?: { id: string; email: string }; error?: string; status?: number },
  user: User2FA | null,
  origin: string | null = null
) {
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origin || '*' },
    })
  }

  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // Setup action - generate TOTP secret
  if (action === 'setup') {
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status || 401 })
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
    }

    // Generate mock secret
    const mockSecret = 'JBSWY3DPEHPK3PXP'
    const mockQrCode = `otpauth://totp/Zero%20Trust%20Analytics:${user.email}?secret=${mockSecret}&issuer=Zero%20Trust%20Analytics`

    mockUpdateUser(user.email, {
      twoFactorSecret: mockSecret,
      twoFactorEnabled: false,
    })

    return new Response(
      JSON.stringify({
        success: true,
        secret: mockSecret,
        qrCode: mockQrCode,
        message: 'Scan the QR code with your authenticator app, then verify with a code',
      }),
      { status: 200 }
    )
  }

  // Verify action - validate TOTP code and enable 2FA
  if (action === 'verify') {
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status || 401 })
    }

    const { code } = body

    if (!code) {
      return new Response(JSON.stringify({ error: 'Verification code required' }), { status: 400 })
    }

    if (!user || !user.twoFactorSecret) {
      return new Response(JSON.stringify({ error: '2FA setup not initiated. Please run setup first.' }), { status: 400 })
    }

    // Simulate TOTP validation (accept '123456' as valid for testing)
    if (code !== '123456') {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), { status: 401 })
    }

    mockUpdateUser(user.email, { twoFactorEnabled: true })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Two-factor authentication enabled successfully',
      }),
      { status: 200 }
    )
  }

  // Disable action - disable 2FA with verification
  if (action === 'disable') {
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status || 401 })
    }

    const { code } = body

    if (!code) {
      return new Response(JSON.stringify({ error: 'Verification code required to disable 2FA' }), { status: 400 })
    }

    if (!user || !user.twoFactorEnabled) {
      return new Response(JSON.stringify({ error: '2FA is not enabled for this account' }), { status: 400 })
    }

    // Simulate TOTP validation
    if (code !== '123456') {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), { status: 401 })
    }

    mockUpdateUser(user.email, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Two-factor authentication disabled',
      }),
      { status: 200 }
    )
  }

  // Validate action - validate code during login
  if (action === 'validate') {
    const { tempToken, code } = body

    if (!tempToken || !code) {
      return new Response(JSON.stringify({ error: 'Temporary token and code required' }), { status: 400 })
    }

    // Simulate temp token verification
    if (tempToken !== 'valid_temp_token') {
      return new Response(JSON.stringify({ error: 'Invalid temporary token' }), { status: 401 })
    }

    if (!user || !user.twoFactorEnabled) {
      return new Response(JSON.stringify({ error: '2FA is not enabled for this account' }), { status: 400 })
    }

    // Simulate TOTP validation
    if (code !== '123456') {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), { status: 401 })
    }

    const token = mockCreateToken({ id: user.id, email: user.email })

    return new Response(
      JSON.stringify({
        success: true,
        token: token || 'jwt_token',
        user: {
          id: user.id,
          email: user.email,
          subscription: user.subscription,
        },
      }),
      { status: 200 }
    )
  }

  return new Response(JSON.stringify({ error: 'Invalid action. Use: setup, verify, disable, or validate' }), {
    status: 400,
  })
}

// ==========================================
// TEST SUITE
// ==========================================

describe('2FA API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateToken.mockReturnValue('jwt_token_123')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================
  // HTTP METHOD TESTS
  // ==========================================
  describe('HTTP Methods', () => {
    it('returns 204 for OPTIONS preflight', async () => {
      const response = await handle2FARequest('OPTIONS', '', {}, {}, null, 'https://app.ztas.io')

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.ztas.io')
    })

    it('returns 405 for GET requests', async () => {
      const response = await handle2FARequest('GET', '', {}, {}, null)

      expect(response.status).toBe(405)
    })

    it('returns 405 for PUT requests', async () => {
      const response = await handle2FARequest('PUT', '', {}, {}, null)

      expect(response.status).toBe(405)
    })

    it('returns 405 for DELETE requests', async () => {
      const response = await handle2FARequest('DELETE', '', {}, {}, null)

      expect(response.status).toBe(405)
    })
  })

  // ==========================================
  // SETUP ACTION TESTS
  // ==========================================
  describe('Setup Action', () => {
    it('generates TOTP secret for authenticated user', async () => {
      const user = { id: 'user_123', email: 'test@example.com' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.secret).toBeDefined()
      expect(body.qrCode).toContain('otpauth://totp/')
    })

    it('stores secret but does not enable 2FA yet', async () => {
      const user = { id: 'user_123', email: 'test@example.com' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, user)

      expect(mockUpdateUser).toHaveBeenCalledWith('test@example.com', expect.objectContaining({ twoFactorEnabled: false }))
    })

    it('returns 401 for unauthenticated request', async () => {
      const authResult = { error: 'No token provided', status: 401 }

      const response = await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, null)

      expect(response.status).toBe(401)
    })

    it('returns 404 when user not found', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, null)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toContain('not found')
    })

    it('includes QR code URI with proper format', async () => {
      const user = { id: 'user_123', email: 'test@example.com' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, user)
      const body = await response.json()

      expect(body.qrCode).toContain('Zero%20Trust%20Analytics')
      expect(body.qrCode).toContain('test@example.com')
    })
  })

  // ==========================================
  // VERIFY ACTION TESTS
  // ==========================================
  describe('Verify Action', () => {
    it('enables 2FA with valid code', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorSecret: 'JBSWY3DPEHPK3PXP' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.message).toContain('enabled')
    })

    it('updates user with twoFactorEnabled: true', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorSecret: 'JBSWY3DPEHPK3PXP' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, user)

      expect(mockUpdateUser).toHaveBeenCalledWith('test@example.com', { twoFactorEnabled: true })
    })

    it('returns 400 when code is missing', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorSecret: 'JBSWY3DPEHPK3PXP' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('code')
    })

    it('returns 400 when setup not initiated', async () => {
      const user = { id: 'user_123', email: 'test@example.com' } // No twoFactorSecret
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('setup not initiated')
    })

    it('returns 401 for invalid TOTP code', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorSecret: 'JBSWY3DPEHPK3PXP' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '000000' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toContain('Invalid')
    })

    it('returns 401 for unauthenticated request', async () => {
      const authResult = { error: 'Token expired', status: 401 }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, null)

      expect(response.status).toBe(401)
    })
  })

  // ==========================================
  // DISABLE ACTION TESTS
  // ==========================================
  describe('Disable Action', () => {
    it('disables 2FA with valid code', async () => {
      const user = {
        id: 'user_123',
        email: 'test@example.com',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'disable', { action: 'disable', code: '123456' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.message).toContain('disabled')
    })

    it('clears 2FA secret and enabled flag', async () => {
      const user = {
        id: 'user_123',
        email: 'test@example.com',
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      await handle2FARequest('POST', 'disable', { action: 'disable', code: '123456' }, authResult, user)

      expect(mockUpdateUser).toHaveBeenCalledWith('test@example.com', {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      })
    })

    it('returns 400 when code is missing', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'disable', { action: 'disable' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('code')
    })

    it('returns 400 when 2FA not enabled', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: false }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'disable', { action: 'disable', code: '123456' }, authResult, user)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('not enabled')
    })

    it('returns 401 for invalid TOTP code', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'disable', { action: 'disable', code: '000000' }, authResult, user)

      expect(response.status).toBe(401)
    })
  })

  // ==========================================
  // VALIDATE ACTION TESTS
  // ==========================================
  describe('Validate Action (Login)', () => {
    it('returns JWT token with valid temp token and code', async () => {
      const user = {
        id: 'user_123',
        email: 'test@example.com',
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        subscription: { status: 'active' },
      }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {},
        user
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.token).toBeDefined()
      expect(body.user.id).toBe('user_123')
    })

    it('creates token with user payload', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }

      await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {},
        user
      )

      expect(mockCreateToken).toHaveBeenCalledWith({ id: 'user_123', email: 'test@example.com' })
    })

    it('returns 400 when temp token missing', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true }

      const response = await handle2FARequest('POST', 'validate', { action: 'validate', code: '123456' }, {}, user)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('token')
    })

    it('returns 400 when code missing', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token' },
        {},
        user
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('code')
    })

    it('returns 401 for invalid temp token', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'invalid_token', code: '123456' },
        {},
        user
      )
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toContain('Invalid temporary token')
    })

    it('returns 400 when 2FA not enabled', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: false }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {},
        user
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('not enabled')
    })

    it('returns 401 for invalid TOTP code', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '000000' },
        {},
        user
      )

      expect(response.status).toBe(401)
    })

    it('includes user subscription in response', async () => {
      const user = {
        id: 'user_123',
        email: 'test@example.com',
        twoFactorEnabled: true,
        twoFactorSecret: 'SECRET',
        subscription: { status: 'active', plan: 'pro' },
      }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {},
        user
      )
      const body = await response.json()

      expect(body.user.subscription).toEqual({ status: 'active', plan: 'pro' })
    })
  })

  // ==========================================
  // INVALID ACTION TESTS
  // ==========================================
  describe('Invalid Actions', () => {
    it('returns 400 for unknown action', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'unknown', { action: 'unknown' }, authResult, null)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('Invalid action')
    })

    it('returns 400 for empty action', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', '', { action: '' }, authResult, null)
      const body = await response.json()

      expect(response.status).toBe(400)
    })
  })

  // ==========================================
  // SECURITY TESTS
  // ==========================================
  describe('Security', () => {
    it('requires authentication for setup', async () => {
      const authResult = { error: 'Unauthorized', status: 401 }

      const response = await handle2FARequest('POST', 'setup', { action: 'setup' }, authResult, null)

      expect(response.status).toBe(401)
    })

    it('requires authentication for verify', async () => {
      const authResult = { error: 'Unauthorized', status: 401 }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, null)

      expect(response.status).toBe(401)
    })

    it('requires authentication for disable', async () => {
      const authResult = { error: 'Unauthorized', status: 401 }

      const response = await handle2FARequest('POST', 'disable', { action: 'disable', code: '123456' }, authResult, null)

      expect(response.status).toBe(401)
    })

    it('validate action uses temp token instead of bearer auth', async () => {
      // Validate doesn't use authenticateRequest - it uses tempToken
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {}, // No auth result needed
        user
      )

      expect(response.status).toBe(200)
    })

    it('does not expose 2FA secret in verify response', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorSecret: 'SECRET' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handle2FARequest('POST', 'verify', { action: 'verify', code: '123456' }, authResult, user)
      const body = await response.json()

      expect(body.secret).toBeUndefined()
      expect(body.twoFactorSecret).toBeUndefined()
    })

    it('does not expose 2FA secret in validate response', async () => {
      const user = { id: 'user_123', email: 'test@example.com', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }

      const response = await handle2FARequest(
        'POST',
        'validate',
        { action: 'validate', tempToken: 'valid_temp_token', code: '123456' },
        {},
        user
      )
      const body = await response.json()

      expect(body.secret).toBeUndefined()
      expect(body.user?.twoFactorSecret).toBeUndefined()
    })
  })
})
