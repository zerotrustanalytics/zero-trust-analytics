/**
 * Comprehensive TDD Test Suite for WordPress Plugin API Client
 *
 * This test suite covers WordPress plugin API integration with:
 * - REST API communication
 * - Authentication handling
 * - Data synchronization
 * - Error handling and retries
 * - Rate limiting
 * - Cache management
 *
 * Total: 20+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock types for WordPress API
interface WordPressCredentials {
  siteUrl: string;
  apiKey: string;
  apiSecret?: string;
}

interface WordPressPost {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  date: string;
  modified: string;
  author: number;
  categories: number[];
  tags: number[];
  meta?: Record<string, any>;
}

interface WordPressAnalytics {
  postId: number;
  views: number;
  uniqueVisitors: number;
  avgTimeOnPage: number;
  bounceRate: number;
  topReferrers: Array<{ source: string; count: number }>;
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

// Mock WordPress API client
class WordPressPluginAPI {
  private credentials: WordPressCredentials;

  constructor(credentials: WordPressCredentials) {
    this.credentials = credentials;
    throw new Error('Not implemented - TDD approach');
  }

  async verifyConnection(): Promise<boolean> {
    throw new Error('Not implemented - TDD approach');
  }

  async getPosts(page: number, perPage: number): Promise<WordPressPost[]> {
    throw new Error('Not implemented - TDD approach');
  }

  async getPost(postId: number): Promise<WordPressPost> {
    throw new Error('Not implemented - TDD approach');
  }

  async sendAnalytics(data: WordPressAnalytics): Promise<boolean> {
    throw new Error('Not implemented - TDD approach');
  }

  async syncAnalytics(postIds: number[]): Promise<SyncResult> {
    throw new Error('Not implemented - TDD approach');
  }

  async getSiteInfo(): Promise<{ name: string; url: string; version: string }> {
    throw new Error('Not implemented - TDD approach');
  }
}

// Mock fetch
global.fetch = vi.fn();

describe('WordPress Plugin API Client', () => {
  const validCredentials: WordPressCredentials = {
    siteUrl: 'https://example.com',
    apiKey: 'test-api-key-123',
    apiSecret: 'test-secret-456',
  };

  let apiClient: WordPressPluginAPI;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor and Initialization Tests
  // ============================================================================
  describe('Constructor', () => {
    it('should create client with valid credentials', () => {
      expect(() => {
        apiClient = new WordPressPluginAPI(validCredentials);
      }).not.toThrow();
    });

    it('should throw error when siteUrl is missing', () => {
      const invalidCredentials = {
        apiKey: 'test-key',
      } as WordPressCredentials;

      expect(() => {
        new WordPressPluginAPI(invalidCredentials);
      }).toThrow('siteUrl is required');
    });

    it('should throw error when apiKey is missing', () => {
      const invalidCredentials = {
        siteUrl: 'https://example.com',
      } as WordPressCredentials;

      expect(() => {
        new WordPressPluginAPI(invalidCredentials);
      }).toThrow('apiKey is required');
    });

    it('should validate siteUrl format', () => {
      const invalidCredentials = {
        siteUrl: 'not-a-valid-url',
        apiKey: 'test-key',
      };

      expect(() => {
        new WordPressPluginAPI(invalidCredentials);
      }).toThrow('Invalid siteUrl format');
    });

    it('should normalize siteUrl by removing trailing slash', () => {
      const credentials = {
        siteUrl: 'https://example.com/',
        apiKey: 'test-key',
      };

      apiClient = new WordPressPluginAPI(credentials);

      expect(apiClient['credentials'].siteUrl).toBe('https://example.com');
    });
  });

  // ============================================================================
  // Connection Verification Tests
  // ============================================================================
  describe('verifyConnection', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should return true for successful connection', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', version: '1.0.0' }),
      });

      const result = await apiClient.verifyConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/wp-json/zta/v1/verify'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': validCredentials.apiKey,
          }),
        })
      );
    });

    it('should return false when API returns error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const result = await apiClient.verifyConnection();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await apiClient.verifyConnection();

      expect(result).toBe(false);
    });

    it('should include API secret in headers when provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await apiClient.verifyConnection();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': validCredentials.apiKey,
            'X-API-Secret': validCredentials.apiSecret,
          }),
        })
      );
    });

    it('should timeout after specified duration', async () => {
      (global.fetch as any).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      const startTime = Date.now();
      const result = await apiClient.verifyConnection();
      const endTime = Date.now();

      expect(result).toBe(false);
      expect(endTime - startTime).toBeLessThan(6000); // Default 5s timeout
    });
  });

  // ============================================================================
  // Get Posts Tests
  // ============================================================================
  describe('getPosts', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should fetch posts with pagination', async () => {
      const mockPosts: WordPressPost[] = [
        {
          id: 1,
          title: 'Test Post 1',
          slug: 'test-post-1',
          content: 'Content 1',
          excerpt: 'Excerpt 1',
          date: '2024-01-01T00:00:00Z',
          modified: '2024-01-01T00:00:00Z',
          author: 1,
          categories: [1],
          tags: [1, 2],
        },
        {
          id: 2,
          title: 'Test Post 2',
          slug: 'test-post-2',
          content: 'Content 2',
          excerpt: 'Excerpt 2',
          date: '2024-01-02T00:00:00Z',
          modified: '2024-01-02T00:00:00Z',
          author: 1,
          categories: [2],
          tags: [3],
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPosts,
      });

      const posts = await apiClient.getPosts(1, 10);

      expect(posts).toHaveLength(2);
      expect(posts[0].title).toBe('Test Post 1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=10'),
        expect.any(Object)
      );
    });

    it('should return empty array when no posts found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const posts = await apiClient.getPosts(1, 10);

      expect(posts).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      });

      await expect(apiClient.getPosts(1, 10)).rejects.toThrow('Failed to fetch posts');
    });

    it('should validate pagination parameters', async () => {
      await expect(apiClient.getPosts(0, 10)).rejects.toThrow('Invalid page number');
      await expect(apiClient.getPosts(1, 0)).rejects.toThrow('Invalid perPage value');
      await expect(apiClient.getPosts(1, 101)).rejects.toThrow('perPage cannot exceed 100');
    });

    it('should handle rate limiting with retry', async () => {
      let attemptCount = 0;

      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: new Map([['Retry-After', '1']]),
            json: async () => ({ error: 'Too Many Requests' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      });

      const posts = await apiClient.getPosts(1, 10);

      expect(posts).toEqual([]);
      expect(attemptCount).toBe(2);
    });
  });

  // ============================================================================
  // Get Single Post Tests
  // ============================================================================
  describe('getPost', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should fetch single post by ID', async () => {
      const mockPost: WordPressPost = {
        id: 1,
        title: 'Test Post',
        slug: 'test-post',
        content: 'Test content',
        excerpt: 'Test excerpt',
        date: '2024-01-01T00:00:00Z',
        modified: '2024-01-01T00:00:00Z',
        author: 1,
        categories: [1],
        tags: [1],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPost,
      });

      const post = await apiClient.getPost(1);

      expect(post.id).toBe(1);
      expect(post.title).toBe('Test Post');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/posts/1'),
        expect.any(Object)
      );
    });

    it('should throw error when post not found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Post not found' }),
      });

      await expect(apiClient.getPost(999)).rejects.toThrow('Post not found');
    });

    it('should validate post ID', async () => {
      await expect(apiClient.getPost(0)).rejects.toThrow('Invalid post ID');
      await expect(apiClient.getPost(-1)).rejects.toThrow('Invalid post ID');
    });

    it('should include meta fields when available', async () => {
      const mockPost: WordPressPost = {
        id: 1,
        title: 'Test Post',
        slug: 'test-post',
        content: 'Test content',
        excerpt: 'Test excerpt',
        date: '2024-01-01T00:00:00Z',
        modified: '2024-01-01T00:00:00Z',
        author: 1,
        categories: [1],
        tags: [1],
        meta: {
          custom_field: 'value',
          analytics_enabled: true,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPost,
      });

      const post = await apiClient.getPost(1);

      expect(post.meta).toBeDefined();
      expect(post.meta?.custom_field).toBe('value');
    });
  });

  // ============================================================================
  // Send Analytics Tests
  // ============================================================================
  describe('sendAnalytics', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should successfully send analytics data', async () => {
      const analyticsData: WordPressAnalytics = {
        postId: 1,
        views: 100,
        uniqueVisitors: 75,
        avgTimeOnPage: 120,
        bounceRate: 0.45,
        topReferrers: [
          { source: 'google.com', count: 50 },
          { source: 'facebook.com', count: 25 },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await apiClient.sendAnalytics(analyticsData);

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(analyticsData),
        })
      );
    });

    it('should validate analytics data before sending', async () => {
      const invalidData = {
        postId: 0,
        views: -1,
      } as WordPressAnalytics;

      await expect(apiClient.sendAnalytics(invalidData)).rejects.toThrow('Invalid analytics data');
    });

    it('should handle API errors gracefully', async () => {
      const analyticsData: WordPressAnalytics = {
        postId: 1,
        views: 100,
        uniqueVisitors: 75,
        avgTimeOnPage: 120,
        bounceRate: 0.45,
        topReferrers: [],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      const result = await apiClient.sendAnalytics(analyticsData);

      expect(result).toBe(false);
    });

    it('should retry on transient failures', async () => {
      let attemptCount = 0;
      const analyticsData: WordPressAnalytics = {
        postId: 1,
        views: 100,
        uniqueVisitors: 75,
        avgTimeOnPage: 120,
        bounceRate: 0.45,
        topReferrers: [],
      };

      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      });

      const result = await apiClient.sendAnalytics(analyticsData);

      expect(result).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });

  // ============================================================================
  // Sync Analytics Tests
  // ============================================================================
  describe('syncAnalytics', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should sync analytics for multiple posts', async () => {
      const postIds = [1, 2, 3];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          synced: 3,
          failed: 0,
          errors: [],
        }),
      });

      const result = await apiClient.syncAnalytics(postIds);

      expect(result.success).toBe(true);
      expect(result.synced).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should report partial failures', async () => {
      const postIds = [1, 2, 3];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          synced: 2,
          failed: 1,
          errors: ['Failed to sync post 3: not found'],
        }),
      });

      const result = await apiClient.syncAnalytics(postIds);

      expect(result.success).toBe(true);
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle empty post ID array', async () => {
      const postIds: number[] = [];

      await expect(apiClient.syncAnalytics(postIds)).rejects.toThrow('No post IDs provided');
    });

    it('should batch large sync requests', async () => {
      const postIds = Array.from({ length: 150 }, (_, i) => i + 1);
      let callCount = 0;

      (global.fetch as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            synced: 50,
            failed: 0,
            errors: [],
          }),
        });
      });

      await apiClient.syncAnalytics(postIds);

      // Should be split into batches of 50
      expect(callCount).toBeGreaterThan(1);
    });
  });

  // ============================================================================
  // Get Site Info Tests
  // ============================================================================
  describe('getSiteInfo', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should fetch WordPress site information', async () => {
      const mockSiteInfo = {
        name: 'Test Site',
        url: 'https://example.com',
        version: '6.4.0',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSiteInfo,
      });

      const siteInfo = await apiClient.getSiteInfo();

      expect(siteInfo.name).toBe('Test Site');
      expect(siteInfo.url).toBe('https://example.com');
      expect(siteInfo.version).toBe('6.4.0');
    });

    it('should throw error when site info unavailable', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      await expect(apiClient.getSiteInfo()).rejects.toThrow('Failed to fetch site info');
    });

    it('should cache site info to reduce API calls', async () => {
      const mockSiteInfo = {
        name: 'Test Site',
        url: 'https://example.com',
        version: '6.4.0',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSiteInfo,
      });

      await apiClient.getSiteInfo();
      await apiClient.getSiteInfo();

      // Should only call API once, second call uses cache
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Error Handling and Edge Cases
  // ============================================================================
  describe('Error Handling', () => {
    beforeEach(() => {
      apiClient = new WordPressPluginAPI(validCredentials);
    });

    it('should handle malformed JSON responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(apiClient.getPosts(1, 10)).rejects.toThrow();
    });

    it('should handle network timeouts', async () => {
      (global.fetch as any).mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      await expect(apiClient.verifyConnection()).resolves.toBe(false);
    });

    it('should sanitize error messages from API', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Database error: password=secret123',
        }),
      });

      await expect(apiClient.getPosts(1, 10)).rejects.toThrow();
      // Should not expose sensitive info in error message
    });

    it('should handle SSL certificate errors', async () => {
      (global.fetch as any).mockRejectedValueOnce({
        message: 'SSL certificate problem',
      });

      const result = await apiClient.verifyConnection();

      expect(result).toBe(false);
    });
  });
});
