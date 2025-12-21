import { jest } from '@jest/globals';

// Mock @netlify/blobs
jest.unstable_mockModule('@netlify/blobs', () => {
  const stores = new Map();

  function createMockStore(name) {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const data = stores.get(name);

    return {
      async get(key, options = {}) {
        const value = data.get(key);
        if (value === undefined) return null;
        if (options.type === 'json') {
          return JSON.parse(value);
        }
        return value;
      },
      async setJSON(key, value) {
        data.set(key, JSON.stringify(value));
      },
      async delete(key) {
        data.delete(key);
      }
    };
  }

  return {
    getStore: ({ name }) => createMockStore(name),
    __clearAllStores: () => stores.clear(),
    __getStore: (name) => stores.get(name)
  };
});

// Mock auth library
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  createToken: jest.fn(() => 'mock_jwt_token_123')
}));

// Mock fetch for OAuth provider APIs
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { __clearAllStores, getStore } = await import('@netlify/blobs');

describe('Auth OAuth Callback Endpoint', () => {
  beforeEach(async () => {
    __clearAllStores();
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Set up environment variables
    process.env.GITHUB_CLIENT_ID = 'test_github_client_id';
    process.env.GITHUB_CLIENT_SECRET = 'test_github_client_secret';
    process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
    process.env.URL = 'https://zta.io';
    process.env.GOOGLE_REDIRECT_URI = 'https://zta.io/api/auth/callback/google';

    // Create existing user for linking tests
    const usersStore = getStore({ name: 'users' });
    await usersStore.setJSON('existing@example.com', {
      id: 'user_existing',
      email: 'existing@example.com',
      passwordHash: '$2b$10$mockhashedpassword',
      createdAt: new Date().toISOString()
    });
  });

  // Helper to create a valid state token
  function createState(plan = 'pro') {
    return Buffer.from(JSON.stringify({ plan, nonce: 'test_nonce' })).toString('base64');
  }

  describe('GitHub OAuth', () => {
    it('should exchange code for token and create new user', async () => {
      const state = createState('pro');

      // Mock GitHub token exchange
      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 12345,
              email: 'githubuser@example.com',
              name: 'GitHub User',
              login: 'githubuser'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/dashboard/');
      expect(response.headers.get('Location')).toContain('auth_token=');
    });

    it('should link OAuth to existing user', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 12345,
              email: 'existing@example.com',
              name: 'Existing User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/dashboard/');
    });

    it('should fetch primary email when user email is private', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user/emails')) {
          return Promise.resolve({
            json: () => Promise.resolve([
              { email: 'secondary@example.com', primary: false, verified: true },
              { email: 'primary@example.com', primary: true, verified: true }
            ])
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 12345,
              email: null, // Private email
              name: 'Private User',
              login: 'privateuser'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com/user/emails'),
        expect.any(Object)
      );
    });

    it('should handle GitHub token exchange error', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              error: 'bad_verification_code',
              error_description: 'The code passed is incorrect or expired.'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=invalid_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
    });
  });

  describe('Google OAuth', () => {
    it('should exchange code for token and create new user', async () => {
      const state = createState('business');

      mockFetch.mockImplementation((url) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'google_token_123' })
          });
        }
        if (url.includes('googleapis.com/oauth2/v2/userinfo')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 'google_12345',
              email: 'googleuser@example.com',
              name: 'Google User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/google?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/dashboard/');
    });

    it('should handle Google token exchange error', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              error: 'invalid_grant',
              error_description: 'Code was already redeemed.'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/google?code=used_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
    });
  });

  describe('Common OAuth Errors', () => {
    it('should redirect with error when OAuth error is present', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?error=access_denied&error_description=User%20denied%20access',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
      expect(response.headers.get('Location')).toContain('access_denied');
    });

    it('should redirect with error when code is missing', async () => {
      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github',
        headers: {
          get: (name) => null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
      expect(response.headers.get('Location')).toContain('No%20authorization%20code');
    });

    it('should reject invalid state parameter (CSRF protection)', async () => {
      const state = createState();

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? 'oauth_state=different_state' : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
      expect(response.headers.get('Location')).toContain('Invalid%20state');
    });

    it('should reject request when state cookie is missing', async () => {
      const state = createState();

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => null // No cookies
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
    });

    it('should redirect with error for unknown provider', async () => {
      const state = createState();

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/unknown?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
      expect(response.headers.get('Location')).toContain('Unknown%20OAuth%20provider');
    });

    it('should redirect with error when email cannot be retrieved', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user/emails')) {
          return Promise.resolve({
            json: () => Promise.resolve([]) // No verified primary email
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 12345,
              email: null,
              name: 'No Email User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/login/?error=');
      expect(response.headers.get('Location')).toContain('email');
    });

    it('should clear oauth_state cookie on successful auth', async () => {
      const state = createState();

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 12345,
              email: 'newuser@example.com',
              name: 'New User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.headers.get('Set-Cookie')).toContain('oauth_state=');
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('Plan Selection', () => {
    it('should use plan from state when creating new user', async () => {
      const state = createState('business');

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 99999,
              email: 'businessuser@example.com',
              name: 'Business User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + state,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${state}` : null
        }
      };

      const response = await handler(req, {});

      expect(response.status).toBe(302);

      // Verify user was created with correct plan
      const usersStore = getStore({ name: 'users' });
      const user = await usersStore.get('businessuser@example.com', { type: 'json' });
      expect(user.plan).toBe('business');
    });

    it('should default to pro plan when state is invalid', async () => {
      const invalidState = 'not_valid_base64!@#$';

      mockFetch.mockImplementation((url) => {
        if (url.includes('github.com/login/oauth/access_token')) {
          return Promise.resolve({
            json: () => Promise.resolve({ access_token: 'github_token_123' })
          });
        }
        if (url.includes('api.github.com/user')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              id: 88888,
              email: 'defaultplan@example.com',
              name: 'Default Plan User'
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const { default: handler } = await import('../../netlify/functions/auth-oauth-callback.js');

      const req = {
        url: 'https://zta.io/api/auth/callback/github?code=test_code&state=' + invalidState,
        headers: {
          get: (name) => name === 'cookie' ? `oauth_state=${invalidState}` : null
        }
      };

      const response = await handler(req, {});

      // Should still succeed, just with default plan
      expect(response.status).toBe(302);
    });
  });
});
