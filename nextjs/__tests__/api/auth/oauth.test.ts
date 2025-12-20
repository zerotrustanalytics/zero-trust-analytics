/**
 * Comprehensive TDD Test Suite for OAuth API Routes
 *
 * This test suite covers OAuth authentication flows:
 * - Google OAuth flow
 * - GitHub OAuth flow
 * - OAuth state validation (CSRF protection)
 * - Token exchange and user creation
 * - Account linking and error handling
 *
 * Total: 25 test cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Next.js Request/Response types
interface MockRequest {
  method?: string;
  query?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

interface MockResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
  cookies?: Array<{ name: string; value: string; options: any }>;
}

// Mock OAuth provider types
type OAuthProvider = 'google' | 'github';

interface OAuthState {
  state: string;
  provider: OAuthProvider;
  createdAt: number;
  redirectUrl?: string;
}

interface OAuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  emailVerified: boolean;
}

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  oauthProviders: Array<{
    provider: OAuthProvider;
    providerId: string;
  }>;
}

// Mock databases
let mockUsers: User[] = [];
const mockOAuthStates: Map<string, OAuthState> = new Map();
const mockOAuthTokens: Map<string, { accessToken: string; refreshToken?: string }> = new Map();

const OAUTH_STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Mock OAuth API handlers
const mockOAuthAPI = {
  // Initiate OAuth flow
  initiateOAuth: async (provider: OAuthProvider, req: MockRequest): Promise<MockResponse> => {
    if (req.method !== 'GET') {
      return {
        status: 405,
        body: { error: 'Method not allowed' },
        headers: { 'Allow': 'GET' },
      };
    }

    if (!['google', 'github'].includes(provider)) {
      return {
        status: 400,
        body: { error: 'Invalid OAuth provider' },
        headers: {},
      };
    }

    // Generate state for CSRF protection
    const state = `oauth_state_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const redirectUrl = req.query?.redirect || '/dashboard';

    mockOAuthStates.set(state, {
      state,
      provider,
      createdAt: Date.now(),
      redirectUrl,
    });

    // Build OAuth provider URLs
    const oauthUrls = {
      google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=mock_client_id&redirect_uri=http://localhost:3000/api/auth/oauth/callback&response_type=code&scope=openid%20email%20profile&state=${state}`,
      github: `https://github.com/login/oauth/authorize?client_id=mock_client_id&redirect_uri=http://localhost:3000/api/auth/oauth/callback&scope=user:email&state=${state}`,
    };

    return {
      status: 302,
      body: {},
      headers: {
        'Location': oauthUrls[provider],
      },
      cookies: [
        {
          name: 'oauth_state',
          value: state,
          options: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 },
        },
      ],
    };
  },

  // OAuth callback handler
  handleCallback: async (req: MockRequest): Promise<MockResponse> => {
    if (req.method !== 'GET') {
      return {
        status: 405,
        body: { error: 'Method not allowed' },
        headers: { 'Allow': 'GET' },
      };
    }

    const { code, state, error, error_description } = req.query || {};

    // Handle OAuth provider errors
    if (error) {
      return {
        status: 400,
        body: {
          error: 'OAuth authentication failed',
          message: error_description || error,
        },
        headers: {},
      };
    }

    // Validate required parameters
    if (!code || !state) {
      return {
        status: 400,
        body: { error: 'Missing required OAuth parameters' },
        headers: {},
      };
    }

    // Validate state (CSRF protection)
    const stateCookie = req.cookies?.oauth_state;
    if (!stateCookie || stateCookie !== state) {
      return {
        status: 400,
        body: { error: 'Invalid OAuth state parameter' },
        headers: {},
      };
    }

    const oauthState = mockOAuthStates.get(state);
    if (!oauthState) {
      return {
        status: 400,
        body: { error: 'OAuth state not found or expired' },
        headers: {},
      };
    }

    // Check state expiry
    if (Date.now() - oauthState.createdAt > OAUTH_STATE_EXPIRY) {
      mockOAuthStates.delete(state);
      return {
        status: 400,
        body: { error: 'OAuth state expired' },
        headers: {},
      };
    }

    // Exchange code for tokens (mock implementation)
    const tokens = await mockOAuthAPI.exchangeCodeForTokens(code, oauthState.provider);
    if (!tokens) {
      return {
        status: 500,
        body: { error: 'Failed to exchange authorization code' },
        headers: {},
      };
    }

    // Get user info from provider
    const oauthUser = await mockOAuthAPI.getUserInfo(tokens.accessToken, oauthState.provider);
    if (!oauthUser) {
      return {
        status: 500,
        body: { error: 'Failed to retrieve user information' },
        headers: {},
      };
    }

    // Find or create user
    let user = mockUsers.find((u) =>
      u.oauthProviders.some((p) => p.provider === oauthState.provider && p.providerId === oauthUser.id)
    );

    if (!user) {
      // Check if user exists with same email
      user = mockUsers.find((u) => u.email.toLowerCase() === oauthUser.email.toLowerCase());

      if (user) {
        // Link OAuth account to existing user
        user.oauthProviders.push({
          provider: oauthState.provider,
          providerId: oauthUser.id,
        });
        user.emailVerified = user.emailVerified || oauthUser.emailVerified;
      } else {
        // Create new user
        user = {
          id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          email: oauthUser.email,
          name: oauthUser.name,
          avatar: oauthUser.avatar,
          role: 'user',
          isActive: true,
          emailVerified: oauthUser.emailVerified,
          oauthProviders: [
            {
              provider: oauthState.provider,
              providerId: oauthUser.id,
            },
          ],
        };
        mockUsers.push(user);
      }
    }

    // Generate session tokens
    const accessToken = `access_token_${user.id}_${Date.now()}`;
    const refreshToken = `refresh_token_${user.id}_${Date.now()}`;
    const sessionId = `session_${user.id}_${Date.now()}`;

    // Clean up state
    mockOAuthStates.delete(state);

    return {
      status: 302,
      body: {},
      headers: {
        'Location': oauthState.redirectUrl || '/dashboard',
      },
      cookies: [
        {
          name: 'sessionId',
          value: sessionId,
          options: { httpOnly: true, secure: true, sameSite: 'strict', path: '/' },
        },
        {
          name: 'oauth_state',
          value: '',
          options: { maxAge: 0 }, // Clear state cookie
        },
      ],
    };
  },

  // Exchange authorization code for tokens (mock)
  exchangeCodeForTokens: async (
    code: string,
    provider: OAuthProvider
  ): Promise<{ accessToken: string; refreshToken?: string } | null> => {
    if (!code) {
      return null;
    }

    // Mock token exchange
    const tokens = {
      accessToken: `${provider}_access_${code}`,
      refreshToken: `${provider}_refresh_${code}`,
    };

    mockOAuthTokens.set(code, tokens);
    return tokens;
  },

  // Get user info from OAuth provider (mock)
  getUserInfo: async (accessToken: string, provider: OAuthProvider): Promise<OAuthUser | null> => {
    if (!accessToken) {
      return null;
    }

    // Mock user data based on provider
    const mockUserData: Record<OAuthProvider, OAuthUser> = {
      google: {
        id: 'google-123456',
        email: 'user@gmail.com',
        name: 'Google User',
        avatar: 'https://lh3.googleusercontent.com/avatar',
        emailVerified: true,
      },
      github: {
        id: 'github-789012',
        email: 'user@github.com',
        name: 'GitHub User',
        avatar: 'https://avatars.githubusercontent.com/u/123456',
        emailVerified: true,
      },
    };

    return mockUserData[provider];
  },

  // Unlink OAuth provider
  unlinkProvider: async (userId: string, provider: OAuthProvider): Promise<MockResponse> => {
    const user = mockUsers.find((u) => u.id === userId);

    if (!user) {
      return {
        status: 404,
        body: { error: 'User not found' },
        headers: {},
      };
    }

    const providerIndex = user.oauthProviders.findIndex((p) => p.provider === provider);

    if (providerIndex === -1) {
      return {
        status: 400,
        body: { error: 'OAuth provider not linked to this account' },
        headers: {},
      };
    }

    // Don't allow unlinking if it's the only authentication method
    if (user.oauthProviders.length === 1) {
      return {
        status: 400,
        body: {
          error: 'Cannot unlink last authentication method',
          message: 'Please set a password before unlinking your last OAuth provider',
        },
        headers: {},
      };
    }

    user.oauthProviders.splice(providerIndex, 1);

    return {
      status: 200,
      body: {
        success: true,
        message: `${provider} account unlinked successfully`,
      },
      headers: {},
    };
  },

  // Clean up expired states
  cleanupExpiredStates: (): number => {
    const now = Date.now();
    let count = 0;

    for (const [state, data] of mockOAuthStates.entries()) {
      if (now - data.createdAt > OAUTH_STATE_EXPIRY) {
        mockOAuthStates.delete(state);
        count++;
      }
    }

    return count;
  },
};

describe('OAuth API - Initiate Flow', () => {
  beforeEach(() => {
    mockUsers = [];
    mockOAuthStates.clear();
    mockOAuthTokens.clear();
  });

  it('should initiate Google OAuth flow', async () => {
    const response = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });

    expect(response.status).toBe(302);
    expect(response.headers['Location']).toContain('accounts.google.com');
    expect(response.headers['Location']).toContain('state=');
  });

  it('should initiate GitHub OAuth flow', async () => {
    const response = await mockOAuthAPI.initiateOAuth('github', { method: 'GET' });

    expect(response.status).toBe(302);
    expect(response.headers['Location']).toContain('github.com/login/oauth');
    expect(response.headers['Location']).toContain('state=');
  });

  it('should reject invalid OAuth provider', async () => {
    const response = await mockOAuthAPI.initiateOAuth('invalid' as OAuthProvider, { method: 'GET' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid OAuth provider');
  });

  it('should generate unique state parameter', async () => {
    const response1 = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const response2 = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });

    const state1 = new URL(response1.headers['Location']).searchParams.get('state');
    const state2 = new URL(response2.headers['Location']).searchParams.get('state');

    expect(state1).not.toBe(state2);
  });

  it('should set state cookie with secure options', async () => {
    const response = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });

    const stateCookie = response.cookies?.find((c) => c.name === 'oauth_state');
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.options.httpOnly).toBe(true);
    expect(stateCookie?.options.secure).toBe(true);
    expect(stateCookie?.options.sameSite).toBe('lax');
  });

  it('should accept custom redirect URL', async () => {
    const response = await mockOAuthAPI.initiateOAuth('google', {
      method: 'GET',
      query: { redirect: '/custom-page' },
    });

    const state = new URL(response.headers['Location']).searchParams.get('state');
    const stateData = mockOAuthStates.get(state!);

    expect(stateData?.redirectUrl).toBe('/custom-page');
  });

  it('should reject non-GET requests', async () => {
    const response = await mockOAuthAPI.initiateOAuth('google', { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.body.error).toBe('Method not allowed');
  });
});

describe('OAuth API - Callback Handling', () => {
  beforeEach(() => {
    mockUsers = [];
    mockOAuthStates.clear();
    mockOAuthTokens.clear();
  });

  it('should handle successful OAuth callback', async () => {
    // Initiate OAuth
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    // Simulate callback
    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    expect(response.status).toBe(302);
    expect(response.headers['Location']).toBeDefined();
  });

  it('should create new user on first OAuth login', async () => {
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    expect(mockUsers).toHaveLength(1);
    expect(mockUsers[0].email).toBeDefined();
    expect(mockUsers[0].oauthProviders).toHaveLength(1);
  });

  it('should link OAuth account to existing user with same email', async () => {
    // Create existing user
    const existingUser: User = {
      id: 'existing-user',
      email: 'user@gmail.com',
      role: 'user',
      isActive: true,
      emailVerified: false,
      oauthProviders: [],
    };
    mockUsers.push(existingUser);

    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    expect(mockUsers).toHaveLength(1);
    expect(mockUsers[0].oauthProviders).toHaveLength(1);
    expect(mockUsers[0].oauthProviders[0].provider).toBe('google');
  });

  it('should reject callback without authorization code', async () => {
    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { state: 'some-state' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing required OAuth parameters');
  });

  it('should reject callback without state parameter', async () => {
    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing required OAuth parameters');
  });

  it('should reject callback with mismatched state cookie', async () => {
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;

    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: 'wrong-state' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid OAuth state parameter');
  });

  it('should reject callback with expired state', async () => {
    const state = 'expired-state';
    mockOAuthStates.set(state, {
      state,
      provider: 'google',
      createdAt: Date.now() - OAUTH_STATE_EXPIRY - 1000, // Expired
    });

    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: state },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('OAuth state expired');
  });

  it('should handle OAuth provider errors', async () => {
    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: {
        error: 'access_denied',
        error_description: 'User denied access',
        state: 'some-state',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('OAuth authentication failed');
    expect(response.body.message).toContain('denied');
  });

  it('should set session cookie on successful authentication', async () => {
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    const sessionCookie = response.cookies?.find((c) => c.name === 'sessionId');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.options.httpOnly).toBe(true);
    expect(sessionCookie?.options.secure).toBe(true);
  });

  it('should clear OAuth state cookie after successful callback', async () => {
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    const clearedCookie = response.cookies?.find((c) => c.name === 'oauth_state');
    expect(clearedCookie?.options.maxAge).toBe(0);
  });

  it('should redirect to custom URL after successful OAuth', async () => {
    const customRedirect = '/custom-dashboard';
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', {
      method: 'GET',
      query: { redirect: customRedirect },
    });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    const response = await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    expect(response.headers['Location']).toBe(customRedirect);
  });
});

describe('OAuth API - Provider Management', () => {
  beforeEach(() => {
    mockUsers = [];
    mockOAuthStates.clear();
    mockOAuthTokens.clear();
  });

  it('should unlink OAuth provider from account', async () => {
    const user: User = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
      emailVerified: true,
      oauthProviders: [
        { provider: 'google', providerId: 'google-123' },
        { provider: 'github', providerId: 'github-456' },
      ],
    };
    mockUsers.push(user);

    const response = await mockOAuthAPI.unlinkProvider('user-123', 'google');

    expect(response.status).toBe(200);
    expect(user.oauthProviders).toHaveLength(1);
    expect(user.oauthProviders[0].provider).toBe('github');
  });

  it('should reject unlinking non-existent provider', async () => {
    const user: User = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
      emailVerified: true,
      oauthProviders: [{ provider: 'google', providerId: 'google-123' }],
    };
    mockUsers.push(user);

    const response = await mockOAuthAPI.unlinkProvider('user-123', 'github');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('OAuth provider not linked to this account');
  });

  it('should reject unlinking last authentication method', async () => {
    const user: User = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
      emailVerified: true,
      oauthProviders: [{ provider: 'google', providerId: 'google-123' }],
    };
    mockUsers.push(user);

    const response = await mockOAuthAPI.unlinkProvider('user-123', 'google');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Cannot unlink last authentication method');
  });

  it('should handle unlinking for non-existent user', async () => {
    const response = await mockOAuthAPI.unlinkProvider('non-existent-user', 'google');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('User not found');
  });
});

describe('OAuth API - Security & Cleanup', () => {
  beforeEach(() => {
    mockUsers = [];
    mockOAuthStates.clear();
    mockOAuthTokens.clear();
  });

  it('should clean up expired OAuth states', () => {
    // Add expired state
    mockOAuthStates.set('expired-1', {
      state: 'expired-1',
      provider: 'google',
      createdAt: Date.now() - OAUTH_STATE_EXPIRY - 1000,
    });

    // Add valid state
    mockOAuthStates.set('valid-1', {
      state: 'valid-1',
      provider: 'google',
      createdAt: Date.now(),
    });

    const cleaned = mockOAuthAPI.cleanupExpiredStates();

    expect(cleaned).toBe(1);
    expect(mockOAuthStates.has('expired-1')).toBe(false);
    expect(mockOAuthStates.has('valid-1')).toBe(true);
  });

  it('should use different provider IDs for different providers', async () => {
    const googleResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const githubResponse = await mockOAuthAPI.initiateOAuth('github', { method: 'GET' });

    const googleState = new URL(googleResponse.headers['Location']).searchParams.get('state')!;
    const githubState = new URL(githubResponse.headers['Location']).searchParams.get('state')!;

    const googleStateData = mockOAuthStates.get(googleState);
    const githubStateData = mockOAuthStates.get(githubState);

    expect(googleStateData?.provider).toBe('google');
    expect(githubStateData?.provider).toBe('github');
  });

  it('should mark email as verified for OAuth users', async () => {
    const initiateResponse = await mockOAuthAPI.initiateOAuth('google', { method: 'GET' });
    const state = new URL(initiateResponse.headers['Location']).searchParams.get('state')!;
    const stateCookie = initiateResponse.cookies?.find((c) => c.name === 'oauth_state')?.value!;

    await mockOAuthAPI.handleCallback({
      method: 'GET',
      query: { code: 'auth_code_123', state },
      cookies: { oauth_state: stateCookie },
    });

    expect(mockUsers[0].emailVerified).toBe(true);
  });
});
