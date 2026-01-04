import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockVerifyGoogleToken = vi.fn()
const mockFetchGAData = vi.fn()
const mockCreateImportJob = vi.fn()
const mockUpdateImportProgress = vi.fn()
const mockInsertAnalyticsData = vi.fn()
const mockGetImportStatus = vi.fn()

interface GAImportData {
  date: string
  pageviews: number
  sessions: number
  users: number
  bounceRate: number
  avgSessionDuration: number
  pagePath: string
  source: string
  medium: string
  country: string
}

describe('Google Analytics Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/import/google-analytics', () => {
    it('initiates import with valid OAuth token', async () => {
      mockVerifyGoogleToken.mockResolvedValue({ valid: true, accountId: 'ga_123' })
      mockCreateImportJob.mockResolvedValue({ id: 'import_123', status: 'pending' })

      const response = await simulateInitiateImport({
        siteId: 'site_123',
        accessToken: 'valid_google_token',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(response.status).toBe(200)
      expect(response.body.importId).toBe('import_123')
      expect(response.body.status).toBe('pending')
    })

    it('returns 401 for invalid Google token', async () => {
      mockVerifyGoogleToken.mockResolvedValue({ valid: false })

      const response = await simulateInitiateImport({
        siteId: 'site_123',
        accessToken: 'invalid_token',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(response.status).toBe(401)
      expect(response.body.error).toContain('token')
    })

    it('returns 400 for missing propertyId', async () => {
      const response = await simulateInitiateImport({
        siteId: 'site_123',
        accessToken: 'valid_token',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('propertyId')
    })

    it('returns 400 for invalid date range', async () => {
      const response = await simulateInitiateImport({
        siteId: 'site_123',
        accessToken: 'valid_token',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-12-31', end: '2024-01-01' }
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('date')
    })
  })

  describe('GET /api/import/:importId/status', () => {
    it('returns current import status', async () => {
      mockGetImportStatus.mockResolvedValue({
        id: 'import_123',
        status: 'in_progress',
        progress: 45,
        totalRows: 10000,
        importedRows: 4500,
        startedAt: '2024-01-01T00:00:00Z'
      })

      const response = await simulateGetStatus('import_123')

      expect(response.status).toBe(200)
      expect(response.body.progress).toBe(45)
      expect(response.body.importedRows).toBe(4500)
    })

    it('returns 404 for non-existent import', async () => {
      mockGetImportStatus.mockResolvedValue(null)

      const response = await simulateGetStatus('nonexistent_import')

      expect(response.status).toBe(404)
    })

    it('shows completed status', async () => {
      mockGetImportStatus.mockResolvedValue({
        id: 'import_123',
        status: 'completed',
        progress: 100,
        totalRows: 10000,
        importedRows: 10000,
        completedAt: '2024-01-01T01:00:00Z'
      })

      const response = await simulateGetStatus('import_123')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('completed')
      expect(response.body.progress).toBe(100)
    })

    it('shows failed status with error message', async () => {
      mockGetImportStatus.mockResolvedValue({
        id: 'import_123',
        status: 'failed',
        error: 'API rate limit exceeded'
      })

      const response = await simulateGetStatus('import_123')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('failed')
      expect(response.body.error).toBe('API rate limit exceeded')
    })
  })

  describe('Import Data Processing', () => {
    it('correctly maps GA4 data to internal format', () => {
      const gaData: GAImportData = {
        date: '2024-01-15',
        pageviews: 1000,
        sessions: 500,
        users: 400,
        bounceRate: 45.5,
        avgSessionDuration: 180,
        pagePath: '/pricing',
        source: 'google',
        medium: 'organic',
        country: 'US'
      }

      const mapped = mapGADataToInternal(gaData)

      expect(mapped.timestamp).toBeDefined()
      expect(mapped.pageviews).toBe(1000)
      expect(mapped.visitors).toBe(400)
      expect(mapped.path).toBe('/pricing')
      expect(mapped.referrer).toBe('google')
      expect(mapped.country).toBe('US')
    })

    it('handles missing optional fields', () => {
      const gaData: Partial<GAImportData> = {
        date: '2024-01-15',
        pageviews: 100,
        sessions: 50,
        users: 40
      }

      const mapped = mapGADataToInternal(gaData as GAImportData)

      expect(mapped.path).toBe('/')
      expect(mapped.referrer).toBe('direct')
      expect(mapped.country).toBe('Unknown')
    })

    it('batches large imports correctly', async () => {
      const totalRows = 50000
      const batchSize = 1000
      const expectedBatches = Math.ceil(totalRows / batchSize)

      const batches = calculateImportBatches(totalRows, batchSize)

      expect(batches.length).toBe(expectedBatches)
      expect(batches[0]).toEqual({ offset: 0, limit: 1000 })
      expect(batches[batches.length - 1].offset).toBe(49000)
    })
  })

  describe('DELETE /api/import/:importId', () => {
    it('cancels in-progress import', async () => {
      mockGetImportStatus.mockResolvedValue({
        id: 'import_123',
        status: 'in_progress'
      })

      const response = await simulateCancelImport('import_123')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('cancelled')
    })

    it('returns 400 for already completed import', async () => {
      mockGetImportStatus.mockResolvedValue({
        id: 'import_123',
        status: 'completed'
      })

      const response = await simulateCancelImport('import_123')

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('cannot cancel')
    })
  })
})

// Helper functions
async function simulateInitiateImport(data: {
  siteId: string
  accessToken: string
  propertyId?: string
  dateRange: { start: string; end: string }
}) {
  if (!data.propertyId) {
    return { status: 400, body: { error: 'propertyId is required' } }
  }

  if (new Date(data.dateRange.start) > new Date(data.dateRange.end)) {
    return { status: 400, body: { error: 'Invalid date range' } }
  }

  const tokenResult = await mockVerifyGoogleToken(data.accessToken)
  if (!tokenResult.valid) {
    return { status: 401, body: { error: 'Invalid Google token' } }
  }

  const importJob = await mockCreateImportJob({
    siteId: data.siteId,
    propertyId: data.propertyId,
    dateRange: data.dateRange
  })

  return { status: 200, body: { importId: importJob.id, status: importJob.status } }
}

async function simulateGetStatus(importId: string) {
  const status = await mockGetImportStatus(importId)
  if (!status) {
    return { status: 404, body: { error: 'Import not found' } }
  }
  return { status: 200, body: status }
}

async function simulateCancelImport(importId: string) {
  const status = await mockGetImportStatus(importId)
  if (status?.status === 'completed') {
    return { status: 400, body: { error: 'cannot cancel completed import' } }
  }
  return { status: 200, body: { status: 'cancelled' } }
}

function mapGADataToInternal(gaData: GAImportData) {
  return {
    timestamp: new Date(gaData.date).toISOString(),
    pageviews: gaData.pageviews,
    visitors: gaData.users,
    sessions: gaData.sessions,
    bounceRate: gaData.bounceRate || 0,
    avgSessionDuration: gaData.avgSessionDuration || 0,
    path: gaData.pagePath || '/',
    referrer: gaData.source || 'direct',
    medium: gaData.medium || 'none',
    country: gaData.country || 'Unknown'
  }
}

function calculateImportBatches(totalRows: number, batchSize: number) {
  const batches = []
  for (let offset = 0; offset < totalRows; offset += batchSize) {
    batches.push({ offset, limit: Math.min(batchSize, totalRows - offset) })
  }
  return batches
}
