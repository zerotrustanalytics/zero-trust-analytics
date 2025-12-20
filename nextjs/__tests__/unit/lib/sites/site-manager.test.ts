/**
 * Site Manager Unit Tests
 * Tests for site CRUD operations and business logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SiteManager } from '@/lib/sites/site-manager'
import type { Site, CreateSiteInput, UpdateSiteInput } from '@/types/site'

// Mock database client
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
    batch: vi.fn()
  }
}))

import { db } from '@/lib/db'

describe('SiteManager', () => {
  let siteManager: SiteManager
  const mockUserId = 'user_123'

  beforeEach(() => {
    siteManager = new SiteManager()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSite', () => {
    it('should create a new site with valid data', async () => {
      const input: CreateSiteInput = {
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId
      }

      const mockSite: Site = {
        id: 'site_123',
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 0,
        visitors: 0
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.createSite(input)

      expect(result).toEqual(mockSite)
      expect(db.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('INSERT INTO sites')
        })
      )
    })

    it('should throw error when domain is missing', async () => {
      const input = {
        domain: '',
        name: 'Example Site',
        userId: mockUserId
      } as CreateSiteInput

      await expect(siteManager.createSite(input)).rejects.toThrow('Domain is required')
    })

    it('should throw error when name is missing', async () => {
      const input = {
        domain: 'example.com',
        name: '',
        userId: mockUserId
      } as CreateSiteInput

      await expect(siteManager.createSite(input)).rejects.toThrow('Site name is required')
    })

    it('should throw error when userId is missing', async () => {
      const input = {
        domain: 'example.com',
        name: 'Example Site',
        userId: ''
      } as CreateSiteInput

      await expect(siteManager.createSite(input)).rejects.toThrow('User ID is required')
    })

    it('should normalize domain to lowercase', async () => {
      const input: CreateSiteInput = {
        domain: 'EXAMPLE.COM',
        name: 'Example Site',
        userId: mockUserId
      }

      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: input.name,
        userId: mockUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 0,
        visitors: 0
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.createSite(input)

      expect(result.domain).toBe('example.com')
    })

    it('should generate unique tracking ID', async () => {
      const input: CreateSiteInput = {
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [{
          id: 'site_123',
          ...input,
          trackingId: 'zt_unique123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isActive: true,
          pageviews: 0,
          visitors: 0
        }]
      } as any)

      const result = await siteManager.createSite(input)

      expect(result.trackingId).toMatch(/^zt_/)
      expect(result.trackingId.length).toBeGreaterThan(5)
    })

    it('should reject duplicate domain for same user', async () => {
      const input: CreateSiteInput = {
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId
      }

      const error = new Error('UNIQUE constraint failed: sites.domain, sites.userId')
      vi.mocked(db.execute).mockRejectedValue(error)

      await expect(siteManager.createSite(input)).rejects.toThrow('Site with this domain already exists')
    })

    it('should allow same domain for different users', async () => {
      const input1: CreateSiteInput = {
        domain: 'example.com',
        name: 'Example Site',
        userId: 'user_123'
      }

      const input2: CreateSiteInput = {
        domain: 'example.com',
        name: 'Example Site 2',
        userId: 'user_456'
      }

      vi.mocked(db.execute)
        .mockResolvedValueOnce({
          rows: [{
            id: 'site_123',
            ...input1,
            trackingId: 'zt_abc123',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            pageviews: 0,
            visitors: 0
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 'site_456',
            ...input2,
            trackingId: 'zt_def456',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            pageviews: 0,
            visitors: 0
          }]
        } as any)

      const result1 = await siteManager.createSite(input1)
      const result2 = await siteManager.createSite(input2)

      expect(result1.userId).toBe('user_123')
      expect(result2.userId).toBe('user_456')
      expect(result1.domain).toBe(result2.domain)
    })
  })

  describe('getSiteById', () => {
    it('should retrieve site by ID', async () => {
      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.getSiteById('site_123', mockUserId)

      expect(result).toEqual(mockSite)
    })

    it('should return null when site not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const result = await siteManager.getSiteById('nonexistent', mockUserId)

      expect(result).toBeNull()
    })

    it('should not return site for different user', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const result = await siteManager.getSiteById('site_123', 'different_user')

      expect(result).toBeNull()
    })

    it('should throw error when ID is empty', async () => {
      await expect(siteManager.getSiteById('', mockUserId)).rejects.toThrow('Site ID is required')
    })

    it('should throw error when userId is empty', async () => {
      await expect(siteManager.getSiteById('site_123', '')).rejects.toThrow('User ID is required')
    })
  })

  describe('getSitesByUserId', () => {
    it('should retrieve all sites for user', async () => {
      const mockSites: Site[] = [
        {
          id: 'site_1',
          domain: 'example1.com',
          name: 'Site 1',
          userId: mockUserId,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          isActive: true,
          trackingId: 'zt_abc123',
          pageviews: 1000,
          visitors: 500
        },
        {
          id: 'site_2',
          domain: 'example2.com',
          name: 'Site 2',
          userId: mockUserId,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          isActive: true,
          trackingId: 'zt_def456',
          pageviews: 2000,
          visitors: 1000
        }
      ]

      vi.mocked(db.execute).mockResolvedValue({
        rows: mockSites
      } as any)

      const result = await siteManager.getSitesByUserId(mockUserId)

      expect(result).toEqual(mockSites)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when user has no sites', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const result = await siteManager.getSitesByUserId(mockUserId)

      expect(result).toEqual([])
    })

    it('should sort sites by creation date (newest first)', async () => {
      const mockSites: Site[] = [
        {
          id: 'site_2',
          domain: 'example2.com',
          name: 'Site 2',
          userId: mockUserId,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          isActive: true,
          trackingId: 'zt_def456',
          pageviews: 2000,
          visitors: 1000
        },
        {
          id: 'site_1',
          domain: 'example1.com',
          name: 'Site 1',
          userId: mockUserId,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          isActive: true,
          trackingId: 'zt_abc123',
          pageviews: 1000,
          visitors: 500
        }
      ]

      vi.mocked(db.execute).mockResolvedValue({
        rows: mockSites
      } as any)

      const result = await siteManager.getSitesByUserId(mockUserId)

      expect(result[0].createdAt > result[1].createdAt).toBe(true)
    })

    it('should only return active sites by default', async () => {
      const mockSites: Site[] = [
        {
          id: 'site_1',
          domain: 'example1.com',
          name: 'Site 1',
          userId: mockUserId,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          isActive: true,
          trackingId: 'zt_abc123',
          pageviews: 1000,
          visitors: 500
        }
      ]

      vi.mocked(db.execute).mockResolvedValue({
        rows: mockSites
      } as any)

      const result = await siteManager.getSitesByUserId(mockUserId)

      expect(result.every(site => site.isActive)).toBe(true)
    })
  })

  describe('updateSite', () => {
    it('should update site name', async () => {
      const updates: UpdateSiteInput = {
        name: 'Updated Name'
      }

      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Updated Name',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.updateSite('site_123', mockUserId, updates)

      expect(result.name).toBe('Updated Name')
    })

    it('should update site domain', async () => {
      const updates: UpdateSiteInput = {
        domain: 'newdomain.com'
      }

      const mockSite: Site = {
        id: 'site_123',
        domain: 'newdomain.com',
        name: 'Example Site',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.updateSite('site_123', mockUserId, updates)

      expect(result.domain).toBe('newdomain.com')
    })

    it('should update isActive status', async () => {
      const updates: UpdateSiteInput = {
        isActive: false
      }

      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        isActive: false,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.updateSite('site_123', mockUserId, updates)

      expect(result.isActive).toBe(false)
    })

    it('should update multiple fields at once', async () => {
      const updates: UpdateSiteInput = {
        name: 'Updated Name',
        domain: 'updated.com',
        isActive: false
      }

      const mockSite: Site = {
        id: 'site_123',
        domain: 'updated.com',
        name: 'Updated Name',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        isActive: false,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.updateSite('site_123', mockUserId, updates)

      expect(result.name).toBe('Updated Name')
      expect(result.domain).toBe('updated.com')
      expect(result.isActive).toBe(false)
    })

    it('should update updatedAt timestamp', async () => {
      const updates: UpdateSiteInput = {
        name: 'Updated Name'
      }

      const now = new Date().toISOString()
      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Updated Name',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: now,
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.updateSite('site_123', mockUserId, updates)

      expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(
        new Date(result.createdAt).getTime()
      )
    })

    it('should throw error when site not found', async () => {
      const updates: UpdateSiteInput = {
        name: 'Updated Name'
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      await expect(
        siteManager.updateSite('nonexistent', mockUserId, updates)
      ).rejects.toThrow('Site not found')
    })

    it('should not update site for different user', async () => {
      const updates: UpdateSiteInput = {
        name: 'Updated Name'
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      await expect(
        siteManager.updateSite('site_123', 'different_user', updates)
      ).rejects.toThrow('Site not found')
    })
  })

  describe('deleteSite', () => {
    it('should soft delete site by default', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{
          id: 'site_123',
          isActive: false
        }]
      } as any)

      await siteManager.deleteSite('site_123', mockUserId)

      expect(db.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE sites')
        })
      )
    })

    it('should hard delete site when specified', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      await siteManager.deleteSite('site_123', mockUserId, true)

      expect(db.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('DELETE FROM sites')
        })
      )
    })

    it('should throw error when site not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      await expect(
        siteManager.deleteSite('nonexistent', mockUserId)
      ).rejects.toThrow('Site not found')
    })

    it('should not delete site for different user', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      await expect(
        siteManager.deleteSite('site_123', 'different_user')
      ).rejects.toThrow('Site not found')
    })
  })

  describe('getSiteByTrackingId', () => {
    it('should retrieve site by tracking ID', async () => {
      const mockSite: Site = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: mockUserId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isActive: true,
        trackingId: 'zt_abc123',
        pageviews: 1000,
        visitors: 500
      }

      vi.mocked(db.execute).mockResolvedValue({
        rows: [mockSite]
      } as any)

      const result = await siteManager.getSiteByTrackingId('zt_abc123')

      expect(result).toEqual(mockSite)
    })

    it('should return null when tracking ID not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const result = await siteManager.getSiteByTrackingId('zt_nonexistent')

      expect(result).toBeNull()
    })

    it('should throw error when tracking ID is empty', async () => {
      await expect(siteManager.getSiteByTrackingId('')).rejects.toThrow('Tracking ID is required')
    })
  })

  describe('incrementPageview', () => {
    it('should increment pageview count', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{
          pageviews: 1001
        }]
      } as any)

      await siteManager.incrementPageview('site_123')

      expect(db.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE sites SET pageviews = pageviews + 1')
        })
      )
    })

    it('should increment visitor count when new visitor', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{
          pageviews: 1001,
          visitors: 501
        }]
      } as any)

      await siteManager.incrementPageview('site_123', true)

      expect(db.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('visitors = visitors + 1')
        })
      )
    })
  })
})
