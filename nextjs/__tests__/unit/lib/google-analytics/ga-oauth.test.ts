import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * TDD Tests for Google Analytics OAuth Flow
 * These tests define the expected behavior BEFORE implementation
 *
 * OAuth Flow Overview:
 * 1. Generate authorization URL with correct scopes
 * 2. User authorizes and receives code
 * 3. Exchange code for access/refresh tokens
 * 4. Use access token to make API calls
 * 5. Refresh token when expired
 * 6. Revoke tokens when needed
 */

// Types we expect to exist
interface OAuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
  expires_at: number
}

interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface TokenValidationResult {
  valid: boolean
  expiresAt?: number
  scope?: string
  error?: string
}

interface OAuthError {
  error: string
  error_description?: string
  error_uri?: string
}

// Mock implementation for TDD - will be replaced with real implementation
class GoogleAnalyticsOAuth {
  private config: OAuthConfig
  private readonly ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
  private readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token'
  private readonly REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
  private readonly TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'

  constructor(config: OAuthConfig) {
    this.config = config
  }

  generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.ANALYTICS_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state })
    })
    return `${this.AUTH_URL}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    if (!code) {
      throw new Error('Authorization code is required')
    }

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!response.ok) {
      const error = await response.json() as OAuthError
      throw new Error(error.error_description || error.error || 'Token exchange failed')
    }

    const data = await response.json()
    return {
      ...data,
      expires_at: Date.now() + data.expires_in * 1000
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    if (!refreshToken) {
      throw new Error('Refresh token is required')
    }

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      const error = await response.json() as OAuthError
      throw new Error(error.error_description || error.error || 'Token refresh failed')
    }

    const data = await response.json()
    return {
      ...data,
      refresh_token: refreshToken, // Google doesn't always return new refresh token
      expires_at: Date.now() + data.expires_in * 1000
    }
  }

  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    if (!accessToken) {
      return { valid: false, error: 'Access token is required' }
    }

    try {
      const response = await fetch(`${this.TOKENINFO_URL}?access_token=${accessToken}`)

      if (!response.ok) {
        return { valid: false, error: 'Invalid or expired token' }
      }

      const data = await response.json()
      return {
        valid: true,
        expiresAt: data.exp ? parseInt(data.exp) * 1000 : undefined,
        scope: data.scope
      }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' }
    }
  }

  async revokeToken(token: string): Promise<boolean> {
    if (!token) {
      throw new Error('Token is required')
    }

    const response = await fetch(this.REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token })
    })

    return response.ok
  }

  isTokenExpired(expiresAt: number): boolean {
    // Consider token expired 5 minutes before actual expiry
    const bufferTime = 5 * 60 * 1000
    return Date.now() >= (expiresAt - bufferTime)
  }

  validateScope(scope: string): boolean {
    return scope.includes(this.ANALYTICS_SCOPE)
  }
}

// Mock token storage
class TokenStorage {
  private storage = new Map<string, OAuthTokens>()

  async save(userId: string, tokens: OAuthTokens): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Invalid tokens')
    }
    this.storage.set(userId, tokens)
  }

  async get(userId: string): Promise<OAuthTokens | null> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    return this.storage.get(userId) || null
  }

  async delete(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    this.storage.delete(userId)
  }

  async exists(userId: string): Promise<boolean> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    return this.storage.has(userId)
  }
}

describe('Google Analytics OAuth Flow', () => {
  let oauth: GoogleAnalyticsOAuth
  let tokenStorage: TokenStorage
  const mockConfig: OAuthConfig = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/api/auth/callback'
  }

  beforeEach(() => {
    oauth = new GoogleAnalyticsOAuth(mockConfig)
    tokenStorage = new TokenStorage()
    vi.clearAllMocks()
  })

  describe('OAuth URL Generation', () => {
    it('should generate valid OAuth URL with all required parameters', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toBeTruthy()
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    })

    it('should include correct client_id in authorization URL', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toContain(`client_id=${mockConfig.clientId}`)
    })

    it('should include correct redirect_uri in authorization URL', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toContain(`redirect_uri=${encodeURIComponent(mockConfig.redirectUri)}`)
    })

    it('should include analytics.readonly scope in authorization URL', () => {
      const url = oauth.generateAuthUrl()
      const expectedScope = 'https://www.googleapis.com/auth/analytics.readonly'
      expect(url).toContain(`scope=${encodeURIComponent(expectedScope)}`)
    })

    it('should request offline access for refresh token', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toContain('access_type=offline')
    })

    it('should include prompt=consent to ensure refresh token is returned', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toContain('prompt=consent')
    })

    it('should include response_type=code for authorization code flow', () => {
      const url = oauth.generateAuthUrl()
      expect(url).toContain('response_type=code')
    })

    it('should include state parameter when provided for CSRF protection', () => {
      const state = 'random-state-string-123'
      const url = oauth.generateAuthUrl(state)
      expect(url).toContain(`state=${state}`)
    })

    it('should not include state parameter when not provided', () => {
      const url = oauth.generateAuthUrl()
      expect(url).not.toContain('state=')
    })

    it('should generate different URLs with different state values', () => {
      const url1 = oauth.generateAuthUrl('state1')
      const url2 = oauth.generateAuthUrl('state2')
      expect(url1).not.toEqual(url2)
    })
  })

  describe('Token Exchange', () => {
    it('should exchange authorization code for tokens', async () => {
      // Mock successful token exchange
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ya29.a0AfH6SMBx...',
          refresh_token: '1//0gw...',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.exchangeCodeForTokens('auth-code-123')

      expect(tokens).toBeDefined()
      expect(tokens.access_token).toBe('ya29.a0AfH6SMBx...')
      expect(tokens.refresh_token).toBe('1//0gw...')
    })

    it('should include expires_at timestamp in token response', async () => {
      const now = Date.now()
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.exchangeCodeForTokens('code')

      expect(tokens.expires_at).toBeDefined()
      expect(tokens.expires_at).toBeGreaterThan(now)
      expect(tokens.expires_at).toBeLessThanOrEqual(now + 3600 * 1000)
    })

    it('should throw error when authorization code is empty', async () => {
      await expect(oauth.exchangeCodeForTokens('')).rejects.toThrow('Authorization code is required')
    })

    it('should throw error when authorization code is invalid', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        })
      })

      await expect(oauth.exchangeCodeForTokens('invalid-code')).rejects.toThrow('Invalid authorization code')
    })

    it('should throw error when authorization code has been used', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Code was already redeemed'
        })
      })

      await expect(oauth.exchangeCodeForTokens('used-code')).rejects.toThrow('Code was already redeemed')
    })

    it('should send correct parameters in token exchange request', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      await oauth.exchangeCodeForTokens('code-123')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      )
    })

    it('should return token with correct token_type', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.exchangeCodeForTokens('code')
      expect(tokens.token_type).toBe('Bearer')
    })
  })

  describe('Token Refresh', () => {
    it('should refresh access token using refresh token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.refreshAccessToken('refresh-token-123')

      expect(tokens.access_token).toBe('new-access-token')
      expect(tokens.refresh_token).toBe('refresh-token-123')
    })

    it('should preserve refresh token when Google does not return new one', async () => {
      const originalRefreshToken = 'original-refresh-token'
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.refreshAccessToken(originalRefreshToken)
      expect(tokens.refresh_token).toBe(originalRefreshToken)
    })

    it('should throw error when refresh token is empty', async () => {
      await expect(oauth.refreshAccessToken('')).rejects.toThrow('Refresh token is required')
    })

    it('should throw error when refresh token is invalid', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked'
        })
      })

      await expect(oauth.refreshAccessToken('invalid-token')).rejects.toThrow('Token has been expired or revoked')
    })

    it('should include updated expires_at timestamp after refresh', async () => {
      const now = Date.now()
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.refreshAccessToken('refresh-token')

      expect(tokens.expires_at).toBeDefined()
      expect(tokens.expires_at).toBeGreaterThan(now)
    })

    it('should send correct grant_type for token refresh', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      await oauth.refreshAccessToken('refresh-token')

      const call = (global.fetch as any).mock.calls[0]
      const body = call[1].body.toString()
      expect(body).toContain('grant_type=refresh_token')
    })

    it('should handle network errors during token refresh', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

      await expect(oauth.refreshAccessToken('refresh-token')).rejects.toThrow('Network error')
    })
  })

  describe('Token Validation', () => {
    it('should validate active access token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          azp: mockConfig.clientId,
          aud: mockConfig.clientId,
          scope: 'https://www.googleapis.com/auth/analytics.readonly',
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      })

      const result = await oauth.validateToken('valid-token')

      expect(result.valid).toBe(true)
      expect(result.scope).toBeDefined()
      expect(result.expiresAt).toBeDefined()
    })

    it('should return invalid for expired token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_token',
          error_description: 'Token expired'
        })
      })

      const result = await oauth.validateToken('expired-token')
      expect(result.valid).toBe(false)
    })

    it('should return invalid for empty token', async () => {
      const result = await oauth.validateToken('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Access token is required')
    })

    it('should return invalid for malformed token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_token'
        })
      })

      const result = await oauth.validateToken('malformed-token')
      expect(result.valid).toBe(false)
    })

    it('should handle network errors during validation', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network timeout'))

      const result = await oauth.validateToken('token')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Network timeout')
    })

    it('should return scope information for valid token', async () => {
      const expectedScope = 'https://www.googleapis.com/auth/analytics.readonly'
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scope: expectedScope,
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      })

      const result = await oauth.validateToken('token')
      expect(result.scope).toBe(expectedScope)
    })

    it('should return expiration time for valid token', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scope: 'https://www.googleapis.com/auth/analytics.readonly',
          exp
        })
      })

      const result = await oauth.validateToken('token')
      expect(result.expiresAt).toBe(exp * 1000)
    })
  })

  describe('Token Revocation', () => {
    it('should revoke access token successfully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const result = await oauth.revokeToken('access-token')
      expect(result).toBe(true)
    })

    it('should revoke refresh token successfully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const result = await oauth.revokeToken('refresh-token')
      expect(result).toBe(true)
    })

    it('should throw error when token is empty', async () => {
      await expect(oauth.revokeToken('')).rejects.toThrow('Token is required')
    })

    it('should return false for already revoked token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_token'
        })
      })

      const result = await oauth.revokeToken('revoked-token')
      expect(result).toBe(false)
    })

    it('should send token to correct revocation endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      await oauth.revokeToken('token-to-revoke')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })
  })

  describe('Token Expiration Check', () => {
    it('should detect expired token', () => {
      const expiredTime = Date.now() - 1000
      expect(oauth.isTokenExpired(expiredTime)).toBe(true)
    })

    it('should detect valid token', () => {
      const futureTime = Date.now() + 3600 * 1000
      expect(oauth.isTokenExpired(futureTime)).toBe(false)
    })

    it('should consider token expired 5 minutes before actual expiry (buffer time)', () => {
      const almostExpired = Date.now() + 4 * 60 * 1000 // 4 minutes from now
      expect(oauth.isTokenExpired(almostExpired)).toBe(true)
    })

    it('should not consider token expired when more than 5 minutes remain', () => {
      const notExpired = Date.now() + 6 * 60 * 1000 // 6 minutes from now
      expect(oauth.isTokenExpired(notExpired)).toBe(false)
    })

    it('should handle token expiring exactly at buffer boundary', () => {
      const exactBoundary = Date.now() + 5 * 60 * 1000
      // Should be expired due to >= comparison
      expect(oauth.isTokenExpired(exactBoundary)).toBe(true)
    })
  })

  describe('Scope Validation', () => {
    it('should validate correct analytics.readonly scope', () => {
      const scope = 'https://www.googleapis.com/auth/analytics.readonly'
      expect(oauth.validateScope(scope)).toBe(true)
    })

    it('should validate scope with multiple scopes including analytics', () => {
      const scope = 'https://www.googleapis.com/auth/analytics.readonly openid email'
      expect(oauth.validateScope(scope)).toBe(true)
    })

    it('should reject scope without analytics permission', () => {
      const scope = 'openid email profile'
      expect(oauth.validateScope(scope)).toBe(false)
    })

    it('should reject empty scope', () => {
      expect(oauth.validateScope('')).toBe(false)
    })

    it('should reject incorrect analytics scope (edit instead of readonly)', () => {
      const scope = 'https://www.googleapis.com/auth/analytics.edit'
      expect(oauth.validateScope(scope)).toBe(false)
    })

    it('should be case-sensitive for scope validation', () => {
      const scope = 'https://www.googleapis.com/auth/Analytics.Readonly'
      expect(oauth.validateScope(scope)).toBe(false)
    })
  })

  describe('Token Storage', () => {
    it('should save tokens for a user', async () => {
      const userId = 'user_123'
      const tokens: OAuthTokens = {
        access_token: 'access',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      await tokenStorage.save(userId, tokens)
      const retrieved = await tokenStorage.get(userId)

      expect(retrieved).toEqual(tokens)
    })

    it('should retrieve tokens for existing user', async () => {
      const userId = 'user_456'
      const tokens: OAuthTokens = {
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      await tokenStorage.save(userId, tokens)
      const retrieved = await tokenStorage.get(userId)

      expect(retrieved?.access_token).toBe('token')
    })

    it('should return null for non-existent user', async () => {
      const retrieved = await tokenStorage.get('non-existent-user')
      expect(retrieved).toBeNull()
    })

    it('should delete tokens for a user', async () => {
      const userId = 'user_789'
      const tokens: OAuthTokens = {
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      await tokenStorage.save(userId, tokens)
      await tokenStorage.delete(userId)
      const retrieved = await tokenStorage.get(userId)

      expect(retrieved).toBeNull()
    })

    it('should check if tokens exist for a user', async () => {
      const userId = 'user_check'
      const tokens: OAuthTokens = {
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      expect(await tokenStorage.exists(userId)).toBe(false)
      await tokenStorage.save(userId, tokens)
      expect(await tokenStorage.exists(userId)).toBe(true)
    })

    it('should throw error when saving with empty userId', async () => {
      const tokens: OAuthTokens = {
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      await expect(tokenStorage.save('', tokens)).rejects.toThrow('User ID is required')
    })

    it('should throw error when saving tokens without access_token', async () => {
      const invalidTokens = {
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      } as OAuthTokens

      await expect(tokenStorage.save('user_123', invalidTokens)).rejects.toThrow('Invalid tokens')
    })

    it('should throw error when saving tokens without refresh_token', async () => {
      const invalidTokens = {
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      } as OAuthTokens

      await expect(tokenStorage.save('user_123', invalidTokens)).rejects.toThrow('Invalid tokens')
    })

    it('should throw error when retrieving with empty userId', async () => {
      await expect(tokenStorage.get('')).rejects.toThrow('User ID is required')
    })

    it('should throw error when deleting with empty userId', async () => {
      await expect(tokenStorage.delete('')).rejects.toThrow('User ID is required')
    })

    it('should overwrite existing tokens when saving again', async () => {
      const userId = 'user_overwrite'
      const tokens1: OAuthTokens = {
        access_token: 'token1',
        refresh_token: 'refresh1',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }
      const tokens2: OAuthTokens = {
        access_token: 'token2',
        refresh_token: 'refresh2',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      await tokenStorage.save(userId, tokens1)
      await tokenStorage.save(userId, tokens2)
      const retrieved = await tokenStorage.get(userId)

      expect(retrieved?.access_token).toBe('token2')
      expect(retrieved?.refresh_token).toBe('refresh2')
    })
  })

  describe('Error Handling', () => {
    it('should handle network timeout during token exchange', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('ETIMEDOUT'))

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('ETIMEDOUT')
    })

    it('should handle DNS resolution errors', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('ENOTFOUND'))

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('ENOTFOUND')
    })

    it('should handle rate limiting errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'rate_limit_exceeded',
          error_description: 'Too many requests'
        })
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('Too many requests')
    })

    it('should handle server errors (500)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'server_error',
          error_description: 'Internal server error'
        })
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('Internal server error')
    })

    it('should handle malformed JSON responses', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Unexpected token in JSON')
        }
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow()
    })

    it('should handle missing error_description gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant'
        })
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('invalid_grant')
    })

    it('should handle redirect URI mismatch error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'redirect_uri_mismatch',
          error_description: 'The redirect URI in the request does not match'
        })
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('redirect URI')
    })

    it('should handle unauthorized client error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'unauthorized_client',
          error_description: 'Client is not authorized'
        })
      })

      await expect(oauth.exchangeCodeForTokens('code')).rejects.toThrow('not authorized')
    })
  })

  describe('Integration Scenarios', () => {
    it('should complete full OAuth flow: authorize -> exchange -> validate', async () => {
      // Step 1: Generate auth URL
      const authUrl = oauth.generateAuthUrl('state-123')
      expect(authUrl).toContain('client_id')
      expect(authUrl).toContain('state=state-123')

      // Step 2: Exchange code for tokens
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.exchangeCodeForTokens('auth-code')
      expect(tokens.access_token).toBeDefined()

      // Step 3: Validate token
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scope: 'https://www.googleapis.com/auth/analytics.readonly',
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      })

      const validation = await oauth.validateToken(tokens.access_token)
      expect(validation.valid).toBe(true)
    })

    it('should handle token refresh when expired', async () => {
      const expiredTokens: OAuthTokens = {
        access_token: 'expired-token',
        refresh_token: 'valid-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() - 1000 // Already expired
      }

      // Check if expired
      expect(oauth.isTokenExpired(expiredTokens.expires_at)).toBe(true)

      // Refresh token
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-fresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const newTokens = await oauth.refreshAccessToken(expiredTokens.refresh_token)
      expect(oauth.isTokenExpired(newTokens.expires_at)).toBe(false)
    })

    it('should store and retrieve tokens through complete flow', async () => {
      const userId = 'user_complete_flow'

      // Exchange code
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'flow-token',
          refresh_token: 'flow-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly'
        })
      })

      const tokens = await oauth.exchangeCodeForTokens('code')

      // Store tokens
      await tokenStorage.save(userId, tokens)

      // Retrieve and verify
      const stored = await tokenStorage.get(userId)
      expect(stored?.access_token).toBe('flow-token')

      // Validate scope
      expect(oauth.validateScope(stored!.scope)).toBe(true)
    })

    it('should revoke and delete tokens on logout', async () => {
      const userId = 'user_logout'
      const tokens: OAuthTokens = {
        access_token: 'logout-token',
        refresh_token: 'logout-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        expires_at: Date.now() + 3600 * 1000
      }

      // Store tokens
      await tokenStorage.save(userId, tokens)

      // Revoke access token
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      await oauth.revokeToken(tokens.access_token)

      // Revoke refresh token
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      await oauth.revokeToken(tokens.refresh_token)

      // Delete from storage
      await tokenStorage.delete(userId)

      // Verify deletion
      expect(await tokenStorage.exists(userId)).toBe(false)
    })
  })
})
