import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * TDD Tests for Google Analytics Import Job Manager
 *
 * These tests define the expected behavior BEFORE implementation.
 * The Import Job Manager handles:
 * - Creating and tracking import jobs
 * - Managing job state transitions
 * - Batching large imports
 * - Resuming interrupted imports
 * - Cancelling jobs
 * - Rate limiting and retry logic
 * - Concurrent import prevention
 * - Cleanup of old jobs
 */

// Type definitions for the Import Job Manager
interface ImportJob {
  id: string
  siteId: string
  propertyId: string
  status: ImportJobStatus
  progress: number
  totalRows: number
  importedRows: number
  batchSize: number
  currentBatch: number
  totalBatches: number
  startedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  error?: string
  retryCount: number
  maxRetries: number
  dateRange: {
    start: string
    end: string
  }
  lastCheckpoint?: {
    batch: number
    rowsImported: number
    timestamp: string
  }
}

type ImportJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

interface CreateImportJobParams {
  siteId: string
  propertyId: string
  dateRange: {
    start: string
    end: string
  }
  estimatedRows?: number
}

interface UpdateProgressParams {
  jobId: string
  importedRows: number
  currentBatch: number
}

interface ImportJobManager {
  createJob(params: CreateImportJobParams): Promise<ImportJob>
  getJob(jobId: string): Promise<ImportJob | null>
  updateProgress(params: UpdateProgressParams): Promise<ImportJob>
  updateStatus(jobId: string, status: ImportJobStatus, error?: string): Promise<ImportJob>
  cancelJob(jobId: string): Promise<ImportJob>
  resumeJob(jobId: string): Promise<ImportJob>
  hasActiveImport(siteId: string): Promise<boolean>
  cleanupOldJobs(daysOld: number): Promise<number>
  retryFailedJob(jobId: string): Promise<ImportJob>
  createCheckpoint(jobId: string): Promise<void>
  getActiveJobForSite(siteId: string): Promise<ImportJob | null>
}

// Mock database
const mockDb = {
  importJobs: new Map<string, ImportJob>(),

  reset() {
    this.importJobs.clear()
  },

  insert(job: ImportJob) {
    this.importJobs.set(job.id, job)
    return job
  },

  findById(id: string) {
    return this.importJobs.get(id) || null
  },

  update(id: string, updates: Partial<ImportJob>) {
    const job = this.importJobs.get(id)
    if (!job) return null
    const updated = { ...job, ...updates }
    this.importJobs.set(id, updated)
    return updated
  },

  findBySiteId(siteId: string, status?: ImportJobStatus) {
    return Array.from(this.importJobs.values()).filter(job => {
      if (job.siteId !== siteId) return false
      if (status && job.status !== status) return false
      return true
    })
  },

  deleteOlderThan(timestamp: string) {
    let deleted = 0
    for (const [id, job] of this.importJobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        const jobDate = new Date(job.completedAt || job.failedAt || job.cancelledAt || job.startedAt)
        if (jobDate < new Date(timestamp)) {
          this.importJobs.delete(id)
          deleted++
        }
      }
    }
    return deleted
  }
}

// Mock rate limiter
const mockRateLimiter = {
  attempts: new Map<string, number>(),
  lastAttempt: new Map<string, number>(),

  reset() {
    this.attempts.clear()
    this.lastAttempt.clear()
  },

  async checkLimit(jobId: string, maxPerMinute: number = 60): Promise<boolean> {
    const now = Date.now()
    const lastTime = this.lastAttempt.get(jobId) || 0
    const timeSinceLastAttempt = now - lastTime

    // Reset counter after 1 minute
    if (timeSinceLastAttempt > 60000) {
      this.attempts.set(jobId, 0)
    }

    const currentAttempts = this.attempts.get(jobId) || 0
    if (currentAttempts >= maxPerMinute) {
      return false
    }

    this.attempts.set(jobId, currentAttempts + 1)
    this.lastAttempt.set(jobId, now)
    return true
  }
}

// Mock Import Job Manager implementation for testing
class MockImportJobManager implements ImportJobManager {
  private defaultBatchSize = 1000
  private defaultMaxRetries = 3

  async createJob(params: CreateImportJobParams): Promise<ImportJob> {
    // Check for concurrent imports
    const existingActive = await this.getActiveJobForSite(params.siteId)
    if (existingActive) {
      throw new Error(`An import is already in progress for site ${params.siteId}`)
    }

    const totalRows = params.estimatedRows || 0
    const totalBatches = totalRows > 0 ? Math.ceil(totalRows / this.defaultBatchSize) : 0

    const job: ImportJob = {
      id: `import_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      siteId: params.siteId,
      propertyId: params.propertyId,
      status: 'pending',
      progress: 0,
      totalRows,
      importedRows: 0,
      batchSize: this.defaultBatchSize,
      currentBatch: 0,
      totalBatches,
      startedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: this.defaultMaxRetries,
      dateRange: params.dateRange
    }

    return mockDb.insert(job)
  }

  async getJob(jobId: string): Promise<ImportJob | null> {
    return mockDb.findById(jobId)
  }

  async updateProgress(params: UpdateProgressParams): Promise<ImportJob> {
    const job = await this.getJob(params.jobId)
    if (!job) {
      throw new Error(`Job ${params.jobId} not found`)
    }

    const progress = job.totalRows > 0
      ? Math.round((params.importedRows / job.totalRows) * 100)
      : 0

    const updates: Partial<ImportJob> = {
      importedRows: params.importedRows,
      currentBatch: params.currentBatch,
      progress,
      status: params.importedRows >= job.totalRows ? 'completed' : 'in_progress'
    }

    if (updates.status === 'completed') {
      updates.completedAt = new Date().toISOString()
    }

    return mockDb.update(params.jobId, updates)!
  }

  async updateStatus(jobId: string, status: ImportJobStatus, error?: string): Promise<ImportJob> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    const updates: Partial<ImportJob> = { status }

    if (error) {
      updates.error = error
    }

    if (status === 'completed') {
      updates.completedAt = new Date().toISOString()
      updates.progress = 100
    } else if (status === 'failed') {
      updates.failedAt = new Date().toISOString()
    } else if (status === 'cancelled') {
      updates.cancelledAt = new Date().toISOString()
    }

    return mockDb.update(jobId, updates)!
  }

  async cancelJob(jobId: string): Promise<ImportJob> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    if (job.status === 'completed') {
      throw new Error('Cannot cancel a completed job')
    }

    if (job.status === 'cancelled') {
      throw new Error('Job is already cancelled')
    }

    return this.updateStatus(jobId, 'cancelled')
  }

  async resumeJob(jobId: string): Promise<ImportJob> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    if (job.status === 'completed') {
      throw new Error('Cannot resume a completed job')
    }

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new Error(`Cannot resume job with status: ${job.status}`)
    }

    // Check for concurrent imports
    const existingActive = await this.getActiveJobForSite(job.siteId)
    if (existingActive && existingActive.id !== jobId) {
      throw new Error(`Another import is already in progress for site ${job.siteId}`)
    }

    return this.updateStatus(jobId, 'in_progress')
  }

  async hasActiveImport(siteId: string): Promise<boolean> {
    const activeJob = await this.getActiveJobForSite(siteId)
    return activeJob !== null
  }

  async getActiveJobForSite(siteId: string): Promise<ImportJob | null> {
    const jobs = mockDb.findBySiteId(siteId)
    return jobs.find(job => job.status === 'pending' || job.status === 'in_progress') || null
  }

  async cleanupOldJobs(daysOld: number): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    return mockDb.deleteOlderThan(cutoffDate.toISOString())
  }

  async retryFailedJob(jobId: string): Promise<ImportJob> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    if (job.status !== 'failed') {
      throw new Error('Can only retry failed jobs')
    }

    if (job.retryCount >= job.maxRetries) {
      throw new Error('Maximum retry attempts exceeded')
    }

    const updates: Partial<ImportJob> = {
      status: 'in_progress',
      retryCount: job.retryCount + 1,
      error: undefined
    }

    return mockDb.update(jobId, updates)!
  }

  async createCheckpoint(jobId: string): Promise<void> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    const checkpoint = {
      batch: job.currentBatch,
      rowsImported: job.importedRows,
      timestamp: new Date().toISOString()
    }

    mockDb.update(jobId, { lastCheckpoint: checkpoint })
  }
}

describe('Google Analytics Import Job Manager', () => {
  let manager: MockImportJobManager

  beforeEach(() => {
    mockDb.reset()
    mockRateLimiter.reset()
    manager = new MockImportJobManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Creating Import Jobs', () => {
    it('creates a new import job with valid parameters', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: {
          start: '2024-01-01',
          end: '2024-12-31'
        },
        estimatedRows: 10000
      })

      expect(job.id).toBeDefined()
      expect(job.siteId).toBe('site_123')
      expect(job.propertyId).toBe('GA4-123456')
      expect(job.status).toBe('pending')
      expect(job.progress).toBe(0)
      expect(job.totalRows).toBe(10000)
      expect(job.importedRows).toBe(0)
      expect(job.currentBatch).toBe(0)
      expect(job.retryCount).toBe(0)
    })

    it('calculates total batches correctly for 10k rows', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      expect(job.totalBatches).toBe(10)
      expect(job.batchSize).toBe(1000)
    })

    it('calculates total batches correctly for 15k rows', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 15000
      })

      expect(job.totalBatches).toBe(15)
    })

    it('sets default values for optional parameters', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job.totalRows).toBe(0)
      expect(job.totalBatches).toBe(0)
      expect(job.maxRetries).toBe(3)
    })

    it('sets startedAt timestamp', async () => {
      const before = new Date()
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })
      const after = new Date()

      const startedAt = new Date(job.startedAt)
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(startedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('Updating Import Job Progress', () => {
    it('updates progress correctly', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      const updated = await manager.updateProgress({
        jobId: job.id,
        importedRows: 5000,
        currentBatch: 5
      })

      expect(updated.importedRows).toBe(5000)
      expect(updated.currentBatch).toBe(5)
      expect(updated.progress).toBe(50)
      expect(updated.status).toBe('in_progress')
    })

    it('calculates progress percentage correctly', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      await manager.updateProgress({
        jobId: job.id,
        importedRows: 2500,
        currentBatch: 3
      })

      const updated = await manager.getJob(job.id)
      expect(updated?.progress).toBe(25)
    })

    it('marks job as completed when all rows imported', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      const updated = await manager.updateProgress({
        jobId: job.id,
        importedRows: 10000,
        currentBatch: 10
      })

      expect(updated.status).toBe('completed')
      expect(updated.progress).toBe(100)
      expect(updated.completedAt).toBeDefined()
    })

    it('throws error for non-existent job', async () => {
      await expect(
        manager.updateProgress({
          jobId: 'nonexistent',
          importedRows: 1000,
          currentBatch: 1
        })
      ).rejects.toThrow('Job nonexistent not found')
    })
  })

  describe('Handling Import Job States', () => {
    it('transitions from pending to in_progress', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job.status).toBe('pending')

      const updated = await manager.updateStatus(job.id, 'in_progress')
      expect(updated.status).toBe('in_progress')
    })

    it('transitions from in_progress to completed', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'in_progress')
      const completed = await manager.updateStatus(job.id, 'completed')

      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toBeDefined()
      expect(completed.progress).toBe(100)
    })

    it('transitions from in_progress to failed with error message', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'in_progress')
      const failed = await manager.updateStatus(job.id, 'failed', 'API rate limit exceeded')

      expect(failed.status).toBe('failed')
      expect(failed.failedAt).toBeDefined()
      expect(failed.error).toBe('API rate limit exceeded')
    })

    it('transitions from in_progress to cancelled', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'in_progress')
      const cancelled = await manager.updateStatus(job.id, 'cancelled')

      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancelledAt).toBeDefined()
    })

    it('handles pending state correctly', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job.status).toBe('pending')
      expect(job.completedAt).toBeUndefined()
      expect(job.failedAt).toBeUndefined()
    })
  })

  describe('Batching Large Imports', () => {
    it('handles 10k rows with 10 batches', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      expect(job.totalBatches).toBe(10)
      expect(job.batchSize).toBe(1000)
    })

    it('handles 25k rows with 25 batches', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 25000
      })

      expect(job.totalBatches).toBe(25)
    })

    it('handles 100k rows with 100 batches', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 100000
      })

      expect(job.totalBatches).toBe(100)
    })

    it('tracks current batch during import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      await manager.updateProgress({
        jobId: job.id,
        importedRows: 3000,
        currentBatch: 3
      })

      const updated = await manager.getJob(job.id)
      expect(updated?.currentBatch).toBe(3)
    })

    it('progresses through multiple batches correctly', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      // Batch 1
      await manager.updateProgress({
        jobId: job.id,
        importedRows: 1000,
        currentBatch: 1
      })
      let updated = await manager.getJob(job.id)
      expect(updated?.progress).toBe(10)

      // Batch 5
      await manager.updateProgress({
        jobId: job.id,
        importedRows: 5000,
        currentBatch: 5
      })
      updated = await manager.getJob(job.id)
      expect(updated?.progress).toBe(50)

      // Final batch
      await manager.updateProgress({
        jobId: job.id,
        importedRows: 10000,
        currentBatch: 10
      })
      updated = await manager.getJob(job.id)
      expect(updated?.progress).toBe(100)
      expect(updated?.status).toBe('completed')
    })
  })

  describe('Resuming Interrupted Imports', () => {
    it('resumes a failed import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      await manager.updateStatus(job.id, 'in_progress')
      await manager.updateProgress({
        jobId: job.id,
        importedRows: 5000,
        currentBatch: 5
      })
      await manager.updateStatus(job.id, 'failed', 'Network error')

      const resumed = await manager.resumeJob(job.id)
      expect(resumed.status).toBe('in_progress')
      expect(resumed.importedRows).toBe(5000)
      expect(resumed.currentBatch).toBe(5)
    })

    it('resumes a cancelled import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'in_progress')
      await manager.cancelJob(job.id)

      const resumed = await manager.resumeJob(job.id)
      expect(resumed.status).toBe('in_progress')
    })

    it('creates checkpoint for resuming', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      await manager.updateProgress({
        jobId: job.id,
        importedRows: 5000,
        currentBatch: 5
      })

      await manager.createCheckpoint(job.id)

      const updated = await manager.getJob(job.id)
      expect(updated?.lastCheckpoint).toBeDefined()
      expect(updated?.lastCheckpoint?.batch).toBe(5)
      expect(updated?.lastCheckpoint?.rowsImported).toBe(5000)
    })

    it('cannot resume a completed job', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'completed')

      await expect(manager.resumeJob(job.id)).rejects.toThrow('Cannot resume a completed job')
    })

    it('cannot resume a pending job', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await expect(manager.resumeJob(job.id)).rejects.toThrow('Cannot resume job with status: pending')
    })

    it('throws error when resuming non-existent job', async () => {
      await expect(manager.resumeJob('nonexistent')).rejects.toThrow('Job nonexistent not found')
    })
  })

  describe('Cancelling In-Progress Imports', () => {
    it('cancels an in-progress import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'in_progress')
      const cancelled = await manager.cancelJob(job.id)

      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancelledAt).toBeDefined()
    })

    it('cancels a pending import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      const cancelled = await manager.cancelJob(job.id)
      expect(cancelled.status).toBe('cancelled')
    })

    it('cannot cancel a completed import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'completed')

      await expect(manager.cancelJob(job.id)).rejects.toThrow('Cannot cancel a completed job')
    })

    it('cannot cancel an already cancelled import', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.cancelJob(job.id)

      await expect(manager.cancelJob(job.id)).rejects.toThrow('Job is already cancelled')
    })

    it('preserves progress when cancelling', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        estimatedRows: 10000
      })

      await manager.updateProgress({
        jobId: job.id,
        importedRows: 7000,
        currentBatch: 7
      })

      const cancelled = await manager.cancelJob(job.id)
      expect(cancelled.importedRows).toBe(7000)
      expect(cancelled.currentBatch).toBe(7)
      expect(cancelled.progress).toBe(70)
    })
  })

  describe('Rate Limiting Handling', () => {
    it('allows requests within rate limit', async () => {
      const canProceed = await mockRateLimiter.checkLimit('job_123', 60)
      expect(canProceed).toBe(true)
    })

    it('blocks requests exceeding rate limit', async () => {
      const jobId = 'job_123'

      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        await mockRateLimiter.checkLimit(jobId, 60)
      }

      // 61st request should be blocked
      const canProceed = await mockRateLimiter.checkLimit(jobId, 60)
      expect(canProceed).toBe(false)
    })

    it('resets rate limit after 1 minute', async () => {
      const jobId = 'job_123'

      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        await mockRateLimiter.checkLimit(jobId, 60)
      }

      // Simulate time passing
      mockRateLimiter.lastAttempt.set(jobId, Date.now() - 61000)

      const canProceed = await mockRateLimiter.checkLimit(jobId, 60)
      expect(canProceed).toBe(true)
    })

    it('tracks rate limits per job independently', async () => {
      // Max out job 1
      for (let i = 0; i < 60; i++) {
        await mockRateLimiter.checkLimit('job_1', 60)
      }

      // Job 2 should still be allowed
      const canProceed = await mockRateLimiter.checkLimit('job_2', 60)
      expect(canProceed).toBe(true)
    })
  })

  describe('Error Recovery and Retries', () => {
    it('retries a failed job', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'failed', 'Temporary error')

      const retried = await manager.retryFailedJob(job.id)
      expect(retried.status).toBe('in_progress')
      expect(retried.retryCount).toBe(1)
      expect(retried.error).toBeUndefined()
    })

    it('increments retry count on each retry', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job.id, 'failed', 'Error 1')
      await manager.retryFailedJob(job.id)

      await manager.updateStatus(job.id, 'failed', 'Error 2')
      const retried = await manager.retryFailedJob(job.id)

      expect(retried.retryCount).toBe(2)
    })

    it('prevents retrying after max retries exceeded', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      // Retry 3 times (max retries)
      for (let i = 0; i < 3; i++) {
        await manager.updateStatus(job.id, 'failed', `Error ${i}`)
        await manager.retryFailedJob(job.id)
      }

      // 4th retry should fail
      await manager.updateStatus(job.id, 'failed', 'Error 4')
      await expect(manager.retryFailedJob(job.id)).rejects.toThrow('Maximum retry attempts exceeded')
    })

    it('cannot retry a non-failed job', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await expect(manager.retryFailedJob(job.id)).rejects.toThrow('Can only retry failed jobs')
    })

    it('tracks retry count correctly', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job.retryCount).toBe(0)
      expect(job.maxRetries).toBe(3)
    })
  })

  describe('Import Job Cleanup', () => {
    it('cleans up completed jobs older than specified days', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)

      const oldJob = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-01-31' }
      })

      await manager.updateStatus(oldJob.id, 'completed')
      mockDb.update(oldJob.id, { completedAt: oldDate.toISOString() })

      const deleted = await manager.cleanupOldJobs(30)
      expect(deleted).toBe(1)

      const job = await manager.getJob(oldJob.id)
      expect(job).toBeNull()
    })

    it('does not clean up recent completed jobs', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-01-31' }
      })

      await manager.updateStatus(job.id, 'completed')

      const deleted = await manager.cleanupOldJobs(30)
      expect(deleted).toBe(0)

      const retrieved = await manager.getJob(job.id)
      expect(retrieved).not.toBeNull()
    })

    it('cleans up failed jobs older than specified days', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)

      const oldJob = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-01-31' }
      })

      await manager.updateStatus(oldJob.id, 'failed', 'Error')
      mockDb.update(oldJob.id, { failedAt: oldDate.toISOString() })

      const deleted = await manager.cleanupOldJobs(30)
      expect(deleted).toBe(1)
    })

    it('does not clean up active jobs', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)

      const oldJob = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-01-31' }
      })

      await manager.updateStatus(oldJob.id, 'in_progress')
      mockDb.update(oldJob.id, { startedAt: oldDate.toISOString() })

      const deleted = await manager.cleanupOldJobs(30)
      expect(deleted).toBe(0)
    })

    it('cleans up multiple old jobs', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)

      for (let i = 0; i < 5; i++) {
        const job = await manager.createJob({
          siteId: `site_${i}`,
          propertyId: 'GA4-123456',
          dateRange: { start: '2024-01-01', end: '2024-01-31' }
        })
        await manager.updateStatus(job.id, 'completed')
        mockDb.update(job.id, { completedAt: oldDate.toISOString() })
      }

      const deleted = await manager.cleanupOldJobs(30)
      expect(deleted).toBe(5)
    })
  })

  describe('Concurrent Import Prevention', () => {
    it('prevents multiple simultaneous imports for same site', async () => {
      await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await expect(
        manager.createJob({
          siteId: 'site_123',
          propertyId: 'GA4-123456',
          dateRange: { start: '2024-01-01', end: '2024-12-31' }
        })
      ).rejects.toThrow('An import is already in progress for site site_123')
    })

    it('allows import for different sites simultaneously', async () => {
      const job1 = await manager.createJob({
        siteId: 'site_1',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      const job2 = await manager.createJob({
        siteId: 'site_2',
        propertyId: 'GA4-789012',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job1.id).not.toBe(job2.id)
      expect(job1.siteId).toBe('site_1')
      expect(job2.siteId).toBe('site_2')
    })

    it('allows new import after previous one completes', async () => {
      const job1 = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-06-30' }
      })

      await manager.updateStatus(job1.id, 'completed')

      const job2 = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-07-01', end: '2024-12-31' }
      })

      expect(job2.id).not.toBe(job1.id)
    })

    it('allows new import after previous one fails', async () => {
      const job1 = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      await manager.updateStatus(job1.id, 'failed', 'Error')

      const job2 = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(job2.id).not.toBe(job1.id)
    })

    it('checks for active imports correctly', async () => {
      expect(await manager.hasActiveImport('site_123')).toBe(false)

      await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      expect(await manager.hasActiveImport('site_123')).toBe(true)
    })

    it('returns active job for site', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      const activeJob = await manager.getActiveJobForSite('site_123')
      expect(activeJob?.id).toBe(job.id)
    })

    it('prevents resuming job when another is active', async () => {
      const job1 = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-06-30' }
      })

      await manager.updateStatus(job1.id, 'failed', 'Error')

      await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-07-01', end: '2024-12-31' }
      })

      await expect(manager.resumeJob(job1.id)).rejects.toThrow('Another import is already in progress')
    })
  })

  describe('Job Retrieval', () => {
    it('retrieves job by ID', async () => {
      const job = await manager.createJob({
        siteId: 'site_123',
        propertyId: 'GA4-123456',
        dateRange: { start: '2024-01-01', end: '2024-12-31' }
      })

      const retrieved = await manager.getJob(job.id)
      expect(retrieved?.id).toBe(job.id)
      expect(retrieved?.siteId).toBe('site_123')
    })

    it('returns null for non-existent job', async () => {
      const job = await manager.getJob('nonexistent')
      expect(job).toBeNull()
    })
  })
})
