/**
 * Tests for Google Search Console Integration
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing the handler
jest.unstable_mockModule('@netlify/blobs', () => ({
  getStore: jest.fn(() => ({
    get: jest.fn(),
    setJSON: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(() => ({ blobs: [] }))
  }))
}));

jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  authenticateRequest: jest.fn((headers) => {
    const auth = headers.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return { error: 'Unauthorized', status: 401 };
    }
    const token = auth.replace('Bearer ', '');
    if (token === 'invalid') {
      return { error: 'Invalid token', status: 401 };
    }
    return { user: { id: 'user_123', email: 'test@example.com' } };
  })
}));

jest.unstable_mockModule('../../netlify/functions/lib/rate-limit.js', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 100, resetTime: Date.now() + 60000, retryAfter: 0 })),
  rateLimitResponse: jest.fn(),
  hashIP: jest.fn((ip) => `hashed_${ip}`)
}));

// Mock fetch for Google API calls
global.fetch = jest.fn();

const { getStore } = await import('@netlify/blobs');

describe('GSC Endpoint', () => {
  let handler;
  let mockGscStore;
  let mockStateStore;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGscStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
      delete: jest.fn()
    };

    mockStateStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
      delete: jest.fn()
    };

    getStore.mockImplementation(({ name }) => {
      if (name === 'gsc-connections') return mockGscStore;
      if (name === 'oauth-states') return mockStateStore;
      return mockGscStore;
    });

    // Set up environment
    process.env.GOOGLE_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';

    // Re-import handler to get fresh instance
    const module = await import('../../netlify/functions/gsc.js');
    handler = module.default;
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  describe('OPTIONS request', () => {
    it('should handle CORS preflight', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=status', {
        method: 'OPTIONS'
      });

      const response = await handler(req, {});
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('GET ?action=status', () => {
    it('should return not connected when no connection exists', async () => {
      mockGscStore.get.mockResolvedValue(null);

      const req = new Request('http://localhost/.netlify/functions/gsc?action=status', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connected).toBe(false);
    });

    it('should return connected when connection exists', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'token123',
        connectedAt: '2024-12-01T00:00:00Z',
        expiresAt: Date.now() + 3600000
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=status', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connected).toBe(true);
      expect(data.connectedAt).toBe('2024-12-01T00:00:00Z');
    });

    it('should require authentication', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=status', {
        method: 'GET'
      });

      const response = await handler(req, {});
      expect(response.status).toBe(401);
    });
  });

  describe('GET ?action=connect', () => {
    it('should return OAuth URL', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=connect', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.authUrl).toContain('accounts.google.com');
      expect(data.authUrl).toContain('test_client_id');
      expect(data.authUrl).toContain('webmasters.readonly');
    });

    it('should error when Google OAuth not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      const req = new Request('http://localhost/.netlify/functions/gsc?action=connect', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('not configured');
    });
  });

  describe('GET ?action=callback', () => {
    it('should exchange code for tokens', async () => {
      const stateData = { userId: 'user_123', createdAt: new Date().toISOString() };
      mockStateStore.get.mockResolvedValue(stateData);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/webmasters.readonly'
        })
      });

      const state = Buffer.from(JSON.stringify({ userId: 'user_123', timestamp: Date.now() })).toString('base64');
      const req = new Request(`http://localhost/.netlify/functions/gsc?action=callback&code=auth_code&state=${state}`, {
        method: 'GET'
      });

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('gsc_connected=true');
      expect(mockGscStore.setJSON).toHaveBeenCalled();
    });

    it('should handle error from Google', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=callback&error=access_denied', {
        method: 'GET'
      });

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('gsc_error=access_denied');
    });

    it('should reject invalid state', async () => {
      mockStateStore.get.mockResolvedValue(null);

      const req = new Request('http://localhost/.netlify/functions/gsc?action=callback&code=auth_code&state=invalid_state', {
        method: 'GET'
      });

      const response = await handler(req, {});

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('gsc_error=invalid_state');
    });
  });

  describe('GET ?action=sites', () => {
    it('should return list of sites', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'valid_token',
        expiresAt: Date.now() + 3600000
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          siteEntry: [
            { siteUrl: 'https://example.com', permissionLevel: 'siteOwner' },
            { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteFullUser' }
          ]
        })
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=sites', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sites).toHaveLength(2);
      expect(data.sites[0].url).toBe('https://example.com');
    });

    it('should return error when not connected', async () => {
      mockGscStore.get.mockResolvedValue(null);

      const req = new Request('http://localhost/.netlify/functions/gsc?action=sites', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not connected');
    });
  });

  describe('GET ?action=performance', () => {
    it('should return performance data', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'valid_token',
        expiresAt: Date.now() + 3600000
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { keys: ['2024-12-01'], clicks: 100, impressions: 1000, ctr: 0.1, position: 5.5 },
            { keys: ['2024-12-02'], clicks: 120, impressions: 1100, ctr: 0.109, position: 5.2 }
          ]
        })
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=performance&siteUrl=https://example.com', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.rows).toHaveLength(2);
      expect(data.totals.clicks).toBe(220);
      expect(data.totals.impressions).toBe(2100);
    });

    it('should require siteUrl', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'valid_token',
        expiresAt: Date.now() + 3600000
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=performance', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('siteUrl is required');
    });
  });

  describe('GET ?action=queries', () => {
    it('should return top search queries', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'valid_token',
        expiresAt: Date.now() + 3600000
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { keys: ['analytics tools'], clicks: 50, impressions: 500, ctr: 0.1, position: 3.2 },
            { keys: ['privacy analytics'], clicks: 30, impressions: 400, ctr: 0.075, position: 4.5 }
          ]
        })
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=queries&siteUrl=https://example.com', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.queries).toHaveLength(2);
      expect(data.queries[0].query).toBe('analytics tools');
      expect(data.queries[0].clicks).toBe(50);
    });
  });

  describe('GET ?action=pages', () => {
    it('should return top pages', async () => {
      mockGscStore.get.mockResolvedValue({
        accessToken: 'valid_token',
        expiresAt: Date.now() + 3600000
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          rows: [
            { keys: ['https://example.com/'], clicks: 100, impressions: 1000, ctr: 0.1, position: 2.5 },
            { keys: ['https://example.com/docs'], clicks: 80, impressions: 900, ctr: 0.089, position: 3.1 }
          ]
        })
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=pages&siteUrl=https://example.com', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pages).toHaveLength(2);
      expect(data.pages[0].page).toBe('https://example.com/');
      expect(data.pages[0].clicks).toBe(100);
    });
  });

  describe('GET ?action=disconnect', () => {
    it('should disconnect GSC', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=disconnect', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockGscStore.delete).toHaveBeenCalledWith('user_user_123');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh expired tokens', async () => {
      // First call returns expired token
      mockGscStore.get.mockResolvedValueOnce({
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 1000 // Expired
      });

      // Mock the refresh token call
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          expires_in: 3600
        })
      });

      // Mock the sites API call
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          siteEntry: [{ siteUrl: 'https://example.com', permissionLevel: 'siteOwner' }]
        })
      });

      const req = new Request('http://localhost/.netlify/functions/gsc?action=sites', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockGscStore.setJSON).toHaveBeenCalled();
    });
  });

  describe('Invalid Action', () => {
    it('should return error for invalid action', async () => {
      const req = new Request('http://localhost/.netlify/functions/gsc?action=invalid', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' }
      });

      const response = await handler(req, {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid action');
      expect(data.validActions).toContain('connect');
      expect(data.validActions).toContain('sites');
    });
  });
});
