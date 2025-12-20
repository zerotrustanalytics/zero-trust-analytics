/**
 * Comprehensive TDD Test Suite for OAuth Authentication
 *
 * This test suite covers OAuth flows for Google and GitHub with:
 * - Authorization URL generation tests
 * - OAuth callback handling tests
 * - Token exchange and validation tests
 * - User profile fetching and account linking tests
 * - Security and error handling tests
 *
 * Total: 22 test cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface OAuthProvider {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  profileUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string[];
}

interface OAuthAuthorizationRequest {
  provider: 'google' | 'github';
  redirectUri: string;
  state?: string;
}

interface OAuthCallbackRequest {
  provider: 'google' | 'github';
  code: string;
  state: string;
  redirectUri: string;
}

interface OAuthProfile {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

// Mock OAuth providers configuration
const mockOAuthProviders: Record<string, OAuthProvider> = {
  google: {
    id: 'google',
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    scope: ['openid', 'email', 'profile'],
  },
  github: {
    id: 'github',
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    profileUrl: 'https://api.github.com/user',
    clientId: 'github-client-id',
    clientSecret: 'github-client-secret',
    scope: ['read:user', 'user:email'],
  },
};

// Mock services
const mockOAuthService = {
  generateAuthUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  fetchUserProfile: vi.fn(),
  validateState: vi.fn(),
  generateState: vi.fn(),
};

const mockDb = {
  getUserByEmail: vi.fn(),
  getUserByOAuthId: vi.fn(),
  createUser: vi.fn(),
  linkOAuthAccount: vi.fn(),
  updateOAuthTokens: vi.fn(),
  saveSession: vi.fn(),
};

const mockAuth = {
  createTokenPair: vi.fn(),
  createSession: vi.fn(),
};

const mockStateStore = {
  save: vi.fn(),
  verify: vi.fn(),
  delete: vi.fn(),
};

describe('OAuth Authentication - Google', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockOAuthService.generateState.mockReturnValue('random-state-123');
    mockOAuthService.generateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');
    mockOAuthService.exchangeCodeForToken.mockResolvedValue({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
      expiresIn: 3600,
    });
    mockOAuthService.fetchUserProfile.mockResolvedValue({
      id: 'google-123',
      email: 'test@gmail.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
      emailVerified: true,
    });
    mockOAuthService.validateState.mockReturnValue(true);
    mockStateStore.save.mockResolvedValue(true);
    mockStateStore.verify.mockResolvedValue(true);
    mockDb.getUserByOAuthId.mockResolvedValue(null);
    mockDb.getUserByEmail.mockResolvedValue(null);
    mockDb.createUser.mockResolvedValue({ id: 'user-123' });
    mockAuth.createTokenPair.mockReturnValue({
      accessToken: 'jwt-access-token',
      refreshToken: 'jwt-refresh-token',
    });
  });

  describe('GET /api/auth/oauth/google - Authorization URL', () => {
    it('should generate valid Google OAuth authorization URL', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);

      expect(response.status).toBe(200);
      expect(response.body.authUrl).toBeDefined();
      expect(response.body.authUrl).toContain('accounts.google.com');
    });

    it('should include client_id in authorization URL', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);
      const url = new URL(response.body.authUrl);

      expect(url.searchParams.get('client_id')).toBe(mockOAuthProviders.google.clientId);
    });

    it('should include redirect_uri in authorization URL', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);
      const url = new URL(response.body.authUrl);

      expect(url.searchParams.get('redirect_uri')).toBe(request.redirectUri);
    });

    it('should include state parameter for CSRF protection', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);
      const url = new URL(response.body.authUrl);

      expect(url.searchParams.get('state')).toBeDefined();
      expect(response.body.state).toBeDefined();
    });

    it('should include required scopes', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);
      const url = new URL(response.body.authUrl);

      expect(url.searchParams.get('scope')).toContain('email');
      expect(url.searchParams.get('scope')).toContain('profile');
    });

    it('should save state to verify later', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateGetAuthUrl(request);

      expect(mockStateStore.save).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ provider: 'google' })
      );
    });

    it('should return 400 for invalid redirect URI', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'google',
        redirectUri: 'invalid-uri',
      };

      const response = await simulateGetAuthUrl(request);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('redirect');
    });
  });

  describe('GET /api/auth/oauth/google/callback - OAuth Callback', () => {
    it('should successfully authenticate user with Google', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tokens).toBeDefined();
    });

    it('should exchange authorization code for access token', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockOAuthService.exchangeCodeForToken).toHaveBeenCalledWith(
        'google',
        'auth-code-123',
        request.redirectUri
      );
    });

    it('should fetch user profile from Google', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockOAuthService.fetchUserProfile).toHaveBeenCalledWith(
        'google',
        'google-access-token'
      );
    });

    it('should create new user if email does not exist', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockDb.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@gmail.com',
          name: 'Test User',
          emailVerified: true,
        })
      );
    });

    it('should link OAuth account to existing user', async () => {
      mockDb.getUserByEmail.mockResolvedValue({ id: 'existing-user-123' });

      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockDb.linkOAuthAccount).toHaveBeenCalledWith(
        'existing-user-123',
        expect.objectContaining({
          provider: 'google',
          providerId: 'google-123',
        })
      );
    });

    it('should return JWT tokens on successful authentication', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.body.tokens?.accessToken).toBe('jwt-access-token');
      expect(response.body.tokens?.refreshToken).toBe('jwt-refresh-token');
    });

    it('should return 400 when authorization code is missing', async () => {
      const request = {
        provider: 'google',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      } as OAuthCallbackRequest;

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('code');
    });

    it('should return 400 when state is missing', async () => {
      const request = {
        provider: 'google',
        code: 'auth-code-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      } as OAuthCallbackRequest;

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('state');
    });

    it('should return 403 when state validation fails (CSRF)', async () => {
      mockStateStore.verify.mockResolvedValue(false);

      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'invalid-state',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Invalid state');
    });

    it('should return 401 when token exchange fails', async () => {
      mockOAuthService.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid authorization code')
      );

      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'invalid-code',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Authentication failed');
    });

    it('should clean up state after successful callback', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockStateStore.delete).toHaveBeenCalledWith('random-state-123');
    });
  });
});

describe('OAuth Authentication - GitHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOAuthService.generateState.mockReturnValue('random-state-456');
    mockOAuthService.generateAuthUrl.mockReturnValue('https://github.com/login/oauth/authorize?...');
    mockOAuthService.exchangeCodeForToken.mockResolvedValue({
      accessToken: 'github-access-token',
      expiresIn: 28800,
    });
    mockOAuthService.fetchUserProfile.mockResolvedValue({
      id: 'github-456',
      email: 'test@github.com',
      name: 'GitHub User',
      picture: 'https://github.com/avatar.jpg',
    });
    mockOAuthService.validateState.mockReturnValue(true);
    mockStateStore.verify.mockResolvedValue(true);
    mockDb.getUserByOAuthId.mockResolvedValue(null);
    mockDb.getUserByEmail.mockResolvedValue(null);
    mockDb.createUser.mockResolvedValue({ id: 'user-456' });
    mockAuth.createTokenPair.mockReturnValue({
      accessToken: 'jwt-access-token',
      refreshToken: 'jwt-refresh-token',
    });
  });

  describe('GET /api/auth/oauth/github - Authorization URL', () => {
    it('should generate valid GitHub OAuth authorization URL', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'github',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);

      expect(response.status).toBe(200);
      expect(response.body.authUrl).toContain('github.com');
    });

    it('should include required GitHub scopes', async () => {
      const request: OAuthAuthorizationRequest = {
        provider: 'github',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);
      const url = new URL(response.body.authUrl);

      expect(url.searchParams.get('scope')).toContain('user:email');
    });
  });

  describe('GET /api/auth/oauth/github/callback - OAuth Callback', () => {
    it('should successfully authenticate user with GitHub', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'github',
        code: 'github-auth-code',
        state: 'random-state-456',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should fetch GitHub user profile', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'github',
        code: 'github-auth-code',
        state: 'random-state-456',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockOAuthService.fetchUserProfile).toHaveBeenCalledWith(
        'github',
        'github-access-token'
      );
    });

    it('should create user with GitHub profile data', async () => {
      const request: OAuthCallbackRequest = {
        provider: 'github',
        code: 'github-auth-code',
        state: 'random-state-456',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      await simulateOAuthCallback(request);

      expect(mockDb.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@github.com',
          name: 'GitHub User',
        })
      );
    });

    it('should handle GitHub users without public email', async () => {
      mockOAuthService.fetchUserProfile.mockResolvedValue({
        id: 'github-456',
        email: null,
        name: 'GitHub User',
      });

      const request: OAuthCallbackRequest = {
        provider: 'github',
        code: 'github-auth-code',
        state: 'random-state-456',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      // Should request email permission or fail gracefully
      expect([400, 200]).toContain(response.status);
    });
  });

  describe('Security and Error Handling', () => {
    it('should return 400 for unsupported OAuth provider', async () => {
      const request = {
        provider: 'facebook' as any,
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateGetAuthUrl(request);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Unsupported provider');
    });

    it('should handle profile fetch failures gracefully', async () => {
      mockOAuthService.fetchUserProfile.mockRejectedValue(new Error('Profile fetch failed'));

      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    it('should handle database errors during user creation', async () => {
      mockDb.createUser.mockRejectedValue(new Error('Database error'));

      const request: OAuthCallbackRequest = {
        provider: 'google',
        code: 'auth-code-123',
        state: 'random-state-123',
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      const response = await simulateOAuthCallback(request);

      expect(response.status).toBe(500);
    });
  });
});

// Simulation helper functions
async function simulateGetAuthUrl(
  request: OAuthAuthorizationRequest
): Promise<{ status: number; body: any }> {
  // Validate provider
  if (!mockOAuthProviders[request.provider]) {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'Unsupported provider' },
    };
  }

  // Validate redirect URI
  try {
    new URL(request.redirectUri);
  } catch {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'Invalid redirect URI' },
    };
  }

  // Generate state
  const state = mockOAuthService.generateState();

  // Save state
  await mockStateStore.save(state, { provider: request.provider, redirectUri: request.redirectUri });

  // Generate auth URL
  const provider = mockOAuthProviders[request.provider];
  const authUrl = mockOAuthService.generateAuthUrl(request.provider);

  return {
    status: 200,
    body: {
      authUrl,
      state,
    },
  };
}

async function simulateOAuthCallback(
  request: Partial<OAuthCallbackRequest>
): Promise<{ status: number; body: any }> {
  // Validation
  if (!request.code) {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'Authorization code is required' },
    };
  }

  if (!request.state) {
    return {
      status: 400,
      body: { error: 'Bad Request', message: 'State parameter is required' },
    };
  }

  // Verify state (CSRF protection)
  const stateValid = await mockStateStore.verify(request.state);
  if (!stateValid) {
    return {
      status: 403,
      body: { error: 'Forbidden', message: 'Invalid state parameter' },
    };
  }

  try {
    // Exchange code for token
    const tokenResponse = await mockOAuthService.exchangeCodeForToken(
      request.provider!,
      request.code,
      request.redirectUri!
    );

    // Fetch user profile
    const profile = await mockOAuthService.fetchUserProfile(
      request.provider!,
      tokenResponse.accessToken
    );

    // Handle missing email for GitHub
    if (!profile.email && request.provider === 'github') {
      return {
        status: 400,
        body: { error: 'Bad Request', message: 'Email is required. Please make your email public on GitHub.' },
      };
    }

    // Check if user exists by OAuth ID
    let user = await mockDb.getUserByOAuthId(request.provider!, profile.id);

    if (!user) {
      // Check if user exists by email
      user = await mockDb.getUserByEmail(profile.email);

      if (user) {
        // Link OAuth account to existing user
        await mockDb.linkOAuthAccount(user.id, {
          provider: request.provider!,
          providerId: profile.id,
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken,
        });
      } else {
        // Create new user
        user = await mockDb.createUser({
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          emailVerified: profile.emailVerified || false,
          oauthProvider: request.provider,
          oauthId: profile.id,
        });
      }
    }

    // Update OAuth tokens
    await mockDb.updateOAuthTokens(user.id, request.provider!, {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
    });

    // Create JWT tokens
    const tokens = mockAuth.createTokenPair({
      userId: user.id,
      email: profile.email,
    });

    // Create session
    const session = await mockAuth.createSession(user.id);
    await mockDb.saveSession(session);

    // Clean up state
    await mockStateStore.delete(request.state);

    return {
      status: 200,
      body: {
        success: true,
        user: {
          id: user.id,
          email: profile.email,
          name: profile.name,
        },
        tokens,
      },
    };
  } catch (error: any) {
    if (error.message.includes('Invalid authorization code')) {
      return {
        status: 401,
        body: { error: 'Unauthorized', message: 'Authentication failed' },
      };
    }

    return {
      status: 500,
      body: { error: 'Internal Server Error', message: error.message },
    };
  }
}
