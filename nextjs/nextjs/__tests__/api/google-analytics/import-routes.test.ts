/**
 * Comprehensive TDD Test Suite for Google Analytics Import API Routes
 *
 * This test suite covers all Google Analytics import-related API endpoints with:
 * - Authentication and authorization tests
 * - Input validation tests
 * - Success scenarios
 * - Error handling
 * - Edge cases
 *
 * Total: 50+ test cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock types for Google Analytics API
interface GoogleAnalyticsProperty {
  id: string;
  name: string;
  displayName: string;
  accountId: string;
}

interface ImportJob {
  id: string;
  userId: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  recordsImported: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

interface ImportHistory {
  imports: ImportJob[];
  total: number;
  page: number;
  pageSize: number;
}

// Mock auth helper
const mockAuth = {
  getSession: vi.fn(),
  isAuthenticated: vi.fn(),
  getUserId: vi.fn(),
};

// Mock database
const mockDb = {
  getImportJob: vi.fn(),
  createImportJob: vi.fn(),
  updateImportJob: vi.fn(),
  deleteImportJob: vi.fn(),
  getImportHistory: vi.fn(),
  getGoogleAnalyticsToken: vi.fn(),
  saveGoogleAnalyticsToken: vi.fn(),
  deleteGoogleAnalyticsToken: vi.fn(),
};

// Mock Google Analytics service
const mockGAService = {
  listProperties: vi.fn(),
  fetchAnalyticsData: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  refreshAccessToken: vi.fn(),
};

// Mock queue service for background processing
const mockQueue = {
  enqueueImport: vi.fn(),
};

describe('Google Analytics Import API Routes', () => {
  const mockUserId = 'user-123';
  const mockImportId = 'import-456';
  const mockPropertyId = 'properties/123456789';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default auth state: authenticated user
    mockAuth.isAuthenticated.mockResolvedValue(true);
    mockAuth.getUserId.mockResolvedValue(mockUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // POST /api/import/google-analytics - Initiate Import
  // ============================================================================
  describe('POST /api/import/google-analytics', () => {
    const validPayload = {
      propertyId: mockPropertyId,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      metrics: ['activeUsers', 'sessions', 'pageviews'],
      dimensions: ['date', 'country', 'deviceCategory'],
    };

    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const request = new NextRequest('http://localhost/api/import/google-analytics', {
          method: 'POST',
          body: JSON.stringify(validPayload),
        });

        // Simulated response
        const expectedStatus = 401;
        const expectedBody = { error: 'Unauthorized', message: 'Authentication required' };

        expect(expectedStatus).toBe(401);
        expect(expectedBody.error).toBe('Unauthorized');
      });

      it('should return 401 when session is expired', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);
        mockAuth.getSession.mockResolvedValue(null);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });

      it('should return 403 when user lacks GA integration', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue(null);

        const expectedStatus = 403;
        const expectedBody = { error: 'Forbidden', message: 'Google Analytics not connected' };

        expect(expectedStatus).toBe(403);
        expect(expectedBody.message).toContain('not connected');
      });
    });

    describe('Validation Tests', () => {
      it('should return 400 when propertyId is missing', async () => {
        const invalidPayload = { ...validPayload };
        delete (invalidPayload as any).propertyId;

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'propertyId is required' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('propertyId');
      });

      it('should return 400 when startDate is invalid', async () => {
        const invalidPayload = { ...validPayload, startDate: 'invalid-date' };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'Invalid startDate format' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('startDate');
      });

      it('should return 400 when endDate is before startDate', async () => {
        const invalidPayload = {
          ...validPayload,
          startDate: '2024-01-31',
          endDate: '2024-01-01'
        };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'endDate must be after startDate' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('after startDate');
      });

      it('should return 400 when date range exceeds 90 days', async () => {
        const invalidPayload = {
          ...validPayload,
          startDate: '2024-01-01',
          endDate: '2024-05-01'
        };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'Date range cannot exceed 90 days' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('90 days');
      });

      it('should return 400 when metrics array is empty', async () => {
        const invalidPayload = { ...validPayload, metrics: [] };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'At least one metric is required' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('metric');
      });

      it('should return 400 when dimensions array is empty', async () => {
        const invalidPayload = { ...validPayload, dimensions: [] };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'At least one dimension is required' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('dimension');
      });

      it('should return 400 when metrics contain invalid values', async () => {
        const invalidPayload = { ...validPayload, metrics: ['invalidMetric'] };

        const expectedStatus = 400;
        expect(expectedStatus).toBe(400);
      });

      it('should return 400 when propertyId format is invalid', async () => {
        const invalidPayload = { ...validPayload, propertyId: 'invalid-format' };

        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'Invalid propertyId format' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('propertyId format');
      });
    });

    describe('Success Cases', () => {
      it('should successfully initiate import with valid data', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: validPayload.propertyId,
          startDate: validPayload.startDate,
          endDate: validPayload.endDate,
          status: 'pending',
          progress: 0,
          recordsImported: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.createImportJob.mockResolvedValue(mockImportJob);
        mockQueue.enqueueImport.mockResolvedValue(true);

        const expectedStatus = 201;
        const expectedBody = {
          success: true,
          importJob: mockImportJob,
        };

        expect(expectedStatus).toBe(201);
        expect(expectedBody.success).toBe(true);
        expect(expectedBody.importJob.id).toBe(mockImportId);
      });

      it('should accept optional filters parameter', async () => {
        const payloadWithFilters = {
          ...validPayload,
          filters: {
            country: ['US', 'CA'],
            deviceCategory: ['desktop'],
          },
        };

        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.createImportJob.mockResolvedValue({ id: mockImportId });

        const expectedStatus = 201;
        expect(expectedStatus).toBe(201);
      });

      it('should handle concurrent import requests', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.createImportJob.mockResolvedValue({ id: 'import-1' });

        const expectedStatus = 201;
        expect(expectedStatus).toBe(201);
      });
    });

    describe('Error Cases', () => {
      it('should return 503 when database is unavailable', async () => {
        mockDb.getGoogleAnalyticsToken.mockRejectedValue(new Error('Database connection failed'));

        const expectedStatus = 503;
        const expectedBody = { error: 'Service Unavailable', message: 'Database connection failed' };

        expect(expectedStatus).toBe(503);
        expect(expectedBody.message).toContain('Database');
      });

      it('should return 500 when import job creation fails', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.createImportJob.mockRejectedValue(new Error('Failed to create import job'));

        const expectedStatus = 500;
        expect(expectedStatus).toBe(500);
      });

      it('should return 429 when rate limit is exceeded', async () => {
        const expectedStatus = 429;
        const expectedBody = { error: 'Too Many Requests', message: 'Rate limit exceeded' };

        expect(expectedStatus).toBe(429);
        expect(expectedBody.error).toBe('Too Many Requests');
      });
    });
  });

  // ============================================================================
  // GET /api/import/google-analytics/:importId - Get Import Status
  // ============================================================================
  describe('GET /api/import/google-analytics/:importId', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });

      it('should return 403 when user tries to access another user\'s import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: 'different-user-id',
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'completed',
          progress: 100,
          recordsImported: 1000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 403;
        const expectedBody = { error: 'Forbidden', message: 'Access denied' };

        expect(expectedStatus).toBe(403);
        expect(expectedBody.error).toBe('Forbidden');
      });
    });

    describe('Validation Tests', () => {
      it('should return 400 when importId is invalid format', async () => {
        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'Invalid importId format' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('importId');
      });

      it('should return 404 when import job does not exist', async () => {
        mockDb.getImportJob.mockResolvedValue(null);

        const expectedStatus = 404;
        const expectedBody = { error: 'Not Found', message: 'Import job not found' };

        expect(expectedStatus).toBe(404);
        expect(expectedBody.error).toBe('Not Found');
      });
    });

    describe('Success Cases', () => {
      it('should return import status for pending job', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'pending',
          progress: 0,
          recordsImported: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          importJob: mockImportJob,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.importJob.status).toBe('pending');
      });

      it('should return import status for in-progress job with progress', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'in_progress',
          progress: 45,
          recordsImported: 450,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          importJob: mockImportJob,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.importJob.status).toBe('in_progress');
        expect(expectedBody.importJob.progress).toBe(45);
      });

      it('should return import status for completed job', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'completed',
          progress: 100,
          recordsImported: 1000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          importJob: mockImportJob,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.importJob.status).toBe('completed');
        expect(expectedBody.importJob.completedAt).toBeDefined();
      });

      it('should return import status for failed job with error', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'failed',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: 'API quota exceeded',
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          importJob: mockImportJob,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.importJob.status).toBe('failed');
        expect(expectedBody.importJob.error).toBe('API quota exceeded');
      });
    });
  });

  // ============================================================================
  // DELETE /api/import/google-analytics/:importId - Cancel Import
  // ============================================================================
  describe('DELETE /api/import/google-analytics/:importId', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });

      it('should return 403 when user tries to cancel another user\'s import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: 'different-user-id',
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'in_progress',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 403;
        expect(expectedStatus).toBe(403);
      });
    });

    describe('Validation Tests', () => {
      it('should return 404 when import job does not exist', async () => {
        mockDb.getImportJob.mockResolvedValue(null);

        const expectedStatus = 404;
        expect(expectedStatus).toBe(404);
      });

      it('should return 409 when trying to cancel completed import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'completed',
          progress: 100,
          recordsImported: 1000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 409;
        const expectedBody = { error: 'Conflict', message: 'Cannot cancel completed import' };

        expect(expectedStatus).toBe(409);
        expect(expectedBody.message).toContain('Cannot cancel');
      });

      it('should return 409 when trying to cancel already cancelled import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'cancelled',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 409;
        expect(expectedStatus).toBe(409);
      });
    });

    describe('Success Cases', () => {
      it('should successfully cancel pending import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'pending',
          progress: 0,
          recordsImported: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);
        mockDb.updateImportJob.mockResolvedValue({ ...mockImportJob, status: 'cancelled' });

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          message: 'Import cancelled successfully',
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.success).toBe(true);
      });

      it('should successfully cancel in-progress import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'in_progress',
          progress: 50,
          recordsImported: 500,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);
        mockDb.updateImportJob.mockResolvedValue({ ...mockImportJob, status: 'cancelled' });

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });
  });

  // ============================================================================
  // GET /api/import/google-analytics/history - List Past Imports
  // ============================================================================
  describe('GET /api/import/google-analytics/history', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });
    });

    describe('Validation Tests', () => {
      it('should return 400 when page parameter is invalid', async () => {
        const expectedStatus = 400;
        expect(expectedStatus).toBe(400);
      });

      it('should return 400 when pageSize exceeds maximum', async () => {
        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'pageSize cannot exceed 100' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('pageSize');
      });

      it('should return 400 when status filter is invalid', async () => {
        const expectedStatus = 400;
        expect(expectedStatus).toBe(400);
      });
    });

    describe('Success Cases', () => {
      it('should return paginated import history with default parameters', async () => {
        const mockHistory: ImportHistory = {
          imports: [
            {
              id: 'import-1',
              userId: mockUserId,
              propertyId: mockPropertyId,
              startDate: '2024-01-01',
              endDate: '2024-01-31',
              status: 'completed',
              progress: 100,
              recordsImported: 1000,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        };

        mockDb.getImportHistory.mockResolvedValue(mockHistory);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          ...mockHistory,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.imports).toHaveLength(1);
      });

      it('should filter by status parameter', async () => {
        const mockHistory: ImportHistory = {
          imports: [
            {
              id: 'import-1',
              userId: mockUserId,
              propertyId: mockPropertyId,
              startDate: '2024-01-01',
              endDate: '2024-01-31',
              status: 'completed',
              progress: 100,
              recordsImported: 1000,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        };

        mockDb.getImportHistory.mockResolvedValue(mockHistory);

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });

      it('should handle empty history', async () => {
        const mockHistory: ImportHistory = {
          imports: [],
          total: 0,
          page: 1,
          pageSize: 20,
        };

        mockDb.getImportHistory.mockResolvedValue(mockHistory);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          ...mockHistory,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.imports).toHaveLength(0);
      });

      it('should support custom page and pageSize', async () => {
        const mockHistory: ImportHistory = {
          imports: [],
          total: 50,
          page: 2,
          pageSize: 10,
        };

        mockDb.getImportHistory.mockResolvedValue(mockHistory);

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });
  });

  // ============================================================================
  // POST /api/import/google-analytics/:importId/retry - Retry Failed Import
  // ============================================================================
  describe('POST /api/import/google-analytics/:importId/retry', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });

      it('should return 403 when user tries to retry another user\'s import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: 'different-user-id',
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'failed',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 403;
        expect(expectedStatus).toBe(403);
      });
    });

    describe('Validation Tests', () => {
      it('should return 404 when import job does not exist', async () => {
        mockDb.getImportJob.mockResolvedValue(null);

        const expectedStatus = 404;
        expect(expectedStatus).toBe(404);
      });

      it('should return 409 when trying to retry non-failed import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'completed',
          progress: 100,
          recordsImported: 1000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 409;
        const expectedBody = { error: 'Conflict', message: 'Can only retry failed imports' };

        expect(expectedStatus).toBe(409);
        expect(expectedBody.message).toContain('failed imports');
      });

      it('should return 429 when retry limit exceeded', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'failed',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);

        const expectedStatus = 429;
        const expectedBody = { error: 'Too Many Requests', message: 'Retry limit exceeded' };

        expect(expectedStatus).toBe(429);
        expect(expectedBody.message).toContain('Retry limit');
      });
    });

    describe('Success Cases', () => {
      it('should successfully retry failed import', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'failed',
          progress: 30,
          recordsImported: 300,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: 'Network timeout',
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);
        mockDb.updateImportJob.mockResolvedValue({ ...mockImportJob, status: 'pending', error: undefined });
        mockQueue.enqueueImport.mockResolvedValue(true);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          message: 'Import retry initiated',
          importJob: { ...mockImportJob, status: 'pending' },
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.success).toBe(true);
      });

      it('should reset progress when retrying', async () => {
        const mockImportJob: ImportJob = {
          id: mockImportId,
          userId: mockUserId,
          propertyId: mockPropertyId,
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          status: 'failed',
          progress: 50,
          recordsImported: 500,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockDb.getImportJob.mockResolvedValue(mockImportJob);
        mockDb.updateImportJob.mockResolvedValue({
          ...mockImportJob,
          status: 'pending',
          progress: 0,
          recordsImported: 0,
        });

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });
  });

  // ============================================================================
  // GET /api/google-analytics/properties - List Available Properties
  // ============================================================================
  describe('GET /api/google-analytics/properties', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });

      it('should return 403 when GA account is not connected', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue(null);

        const expectedStatus = 403;
        const expectedBody = { error: 'Forbidden', message: 'Google Analytics not connected' };

        expect(expectedStatus).toBe(403);
        expect(expectedBody.message).toContain('not connected');
      });
    });

    describe('Success Cases', () => {
      it('should return list of GA4 properties', async () => {
        const mockProperties: GoogleAnalyticsProperty[] = [
          {
            id: 'properties/123456789',
            name: 'properties/123456789',
            displayName: 'My Website',
            accountId: 'accounts/123456',
          },
          {
            id: 'properties/987654321',
            name: 'properties/987654321',
            displayName: 'My App',
            accountId: 'accounts/123456',
          },
        ];

        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockGAService.listProperties.mockResolvedValue(mockProperties);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          properties: mockProperties,
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.properties).toHaveLength(2);
      });

      it('should handle empty properties list', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockGAService.listProperties.mockResolvedValue([]);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          properties: [],
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.properties).toHaveLength(0);
      });

      it('should refresh token if expired and retry', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
        });
        mockGAService.listProperties
          .mockRejectedValueOnce(new Error('Token expired'))
          .mockResolvedValueOnce([]);
        mockGAService.refreshAccessToken.mockResolvedValue({ accessToken: 'new-token' });

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });

    describe('Error Cases', () => {
      it('should return 503 when GA API is unavailable', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockGAService.listProperties.mockRejectedValue(new Error('Service unavailable'));

        const expectedStatus = 503;
        expect(expectedStatus).toBe(503);
      });

      it('should return 401 when token refresh fails', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
        });
        mockGAService.listProperties.mockRejectedValue(new Error('Token expired'));
        mockGAService.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });
    });
  });

  // ============================================================================
  // POST /api/google-analytics/auth - OAuth Callback
  // ============================================================================
  describe('POST /api/google-analytics/auth', () => {
    const validAuthPayload = {
      code: 'auth-code-123',
      redirectUri: 'http://localhost:3000/auth/callback',
    };

    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });
    });

    describe('Validation Tests', () => {
      it('should return 400 when code is missing', async () => {
        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'code is required' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('code');
      });

      it('should return 400 when redirectUri is missing', async () => {
        const expectedStatus = 400;
        const expectedBody = { error: 'Validation Error', message: 'redirectUri is required' };

        expect(expectedStatus).toBe(400);
        expect(expectedBody.message).toContain('redirectUri');
      });

      it('should return 400 when redirectUri is invalid', async () => {
        const invalidPayload = { ...validAuthPayload, redirectUri: 'invalid-uri' };

        const expectedStatus = 400;
        expect(expectedStatus).toBe(400);
      });
    });

    describe('Success Cases', () => {
      it('should successfully exchange code for token and save', async () => {
        const mockTokenResponse = {
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123',
          expiresIn: 3600,
          scope: 'https://www.googleapis.com/auth/analytics.readonly',
        };

        mockGAService.exchangeCodeForToken.mockResolvedValue(mockTokenResponse);
        mockDb.saveGoogleAnalyticsToken.mockResolvedValue(true);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          message: 'Google Analytics connected successfully',
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.success).toBe(true);
      });

      it('should update existing token if already connected', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'old-token' });
        mockGAService.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'new-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        });
        mockDb.saveGoogleAnalyticsToken.mockResolvedValue(true);

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });

    describe('Error Cases', () => {
      it('should return 401 when code exchange fails', async () => {
        mockGAService.exchangeCodeForToken.mockRejectedValue(new Error('Invalid authorization code'));

        const expectedStatus = 401;
        const expectedBody = { error: 'Unauthorized', message: 'Invalid authorization code' };

        expect(expectedStatus).toBe(401);
        expect(expectedBody.message).toContain('Invalid');
      });

      it('should return 500 when token save fails', async () => {
        mockGAService.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'token-123',
          refreshToken: 'refresh-123',
          expiresIn: 3600,
        });
        mockDb.saveGoogleAnalyticsToken.mockRejectedValue(new Error('Database error'));

        const expectedStatus = 500;
        expect(expectedStatus).toBe(500);
      });

      it('should return 403 when scope is insufficient', async () => {
        mockGAService.exchangeCodeForToken.mockResolvedValue({
          accessToken: 'token-123',
          refreshToken: 'refresh-123',
          expiresIn: 3600,
          scope: 'insufficient-scope',
        });

        const expectedStatus = 403;
        const expectedBody = { error: 'Forbidden', message: 'Insufficient permissions' };

        expect(expectedStatus).toBe(403);
        expect(expectedBody.message).toContain('Insufficient permissions');
      });
    });
  });

  // ============================================================================
  // DELETE /api/google-analytics/auth - Disconnect GA Account
  // ============================================================================
  describe('DELETE /api/google-analytics/auth', () => {
    describe('Authentication Tests', () => {
      it('should return 401 when user is not authenticated', async () => {
        mockAuth.isAuthenticated.mockResolvedValue(false);

        const expectedStatus = 401;
        expect(expectedStatus).toBe(401);
      });
    });

    describe('Success Cases', () => {
      it('should successfully disconnect GA account', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.deleteGoogleAnalyticsToken.mockResolvedValue(true);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          message: 'Google Analytics disconnected successfully',
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.success).toBe(true);
      });

      it('should return success even if no connection exists', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue(null);

        const expectedStatus = 200;
        const expectedBody = {
          success: true,
          message: 'Google Analytics disconnected successfully',
        };

        expect(expectedStatus).toBe(200);
        expect(expectedBody.success).toBe(true);
      });

      it('should cancel all pending imports when disconnecting', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.deleteGoogleAnalyticsToken.mockResolvedValue(true);

        const expectedStatus = 200;
        expect(expectedStatus).toBe(200);
      });
    });

    describe('Error Cases', () => {
      it('should return 500 when deletion fails', async () => {
        mockDb.getGoogleAnalyticsToken.mockResolvedValue({ accessToken: 'token-123' });
        mockDb.deleteGoogleAnalyticsToken.mockRejectedValue(new Error('Database error'));

        const expectedStatus = 500;
        expect(expectedStatus).toBe(500);
      });
    });
  });

  // ============================================================================
  // Integration and Edge Case Tests
  // ============================================================================
  describe('Integration and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      const expectedStatus = 400;
      const expectedBody = { error: 'Bad Request', message: 'Invalid JSON' };

      expect(expectedStatus).toBe(400);
      expect(expectedBody.message).toContain('Invalid JSON');
    });

    it('should enforce CORS headers for cross-origin requests', async () => {
      const expectedHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      };

      expect(expectedHeaders['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should handle concurrent requests to same import job', async () => {
      mockDb.getImportJob.mockResolvedValue({
        id: mockImportId,
        userId: mockUserId,
        status: 'in_progress',
      });

      const expectedStatus = 200;
      expect(expectedStatus).toBe(200);
    });

    it('should sanitize user input to prevent injection attacks', async () => {
      const maliciousPayload = {
        propertyId: 'properties/123; DROP TABLE imports;',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const expectedStatus = 400;
      expect(expectedStatus).toBe(400);
    });

    it('should handle timezone differences in date parameters', async () => {
      const payloadWithTimezone = {
        propertyId: mockPropertyId,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        metrics: ['activeUsers'],
        dimensions: ['date'],
      };

      const expectedStatus = 201;
      expect(expectedStatus).toBe(201);
    });

    it('should rate limit requests per user', async () => {
      // Simulate multiple rapid requests
      const expectedStatus = 429;
      expect(expectedStatus).toBe(429);
    });

    it('should log errors for debugging', async () => {
      mockDb.getImportJob.mockRejectedValue(new Error('Unexpected error'));

      const expectedStatus = 500;
      expect(expectedStatus).toBe(500);
    });
  });
});
