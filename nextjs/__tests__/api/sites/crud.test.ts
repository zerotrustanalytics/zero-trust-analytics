/**
 * Sites API CRUD Tests
 * Tests for Sites API endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST, PUT, DELETE } from '@/app/api/sites/route'
import { GET as GET_BY_ID, PUT as PUT_BY_ID, DELETE as DELETE_BY_ID } from '@/app/api/sites/[id]/route'

// Mock authentication
vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    userId: 'user_123',
    email: 'test@example.com'
  })
}))

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn()
  }
}))

import { verifyAuth } from '@/lib/auth'
import { db } from '@/lib/db'

describe('Sites API - CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/sites - Create Site', () => {
    it('should create a new site', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'example.com',
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.site).toEqual(mockSite)
      expect(data.site.trackingId).toMatch(/^zt_/)
    })

    it('should return 400 for missing domain', async () => {
      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('domain')
    })

    it('should return 400 for missing name', async () => {
      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'example.com'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('name')
    })

    it('should return 400 for invalid domain format', async () => {
      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'invalid domain',
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid domain')
    })

    it('should return 409 for duplicate domain', async () => {
      vi.mocked(db.execute).mockRejectedValue(
        new Error('UNIQUE constraint failed: sites.domain')
      )

      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'example.com',
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('already exists')
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(verifyAuth).mockResolvedValue(null)

      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          domain: 'example.com',
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })

    it('should sanitize domain input', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'https://www.example.com/',
          name: 'Example Site'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.site.domain).toBe('example.com')
    })
  })

  describe('GET /api/sites - List Sites', () => {
    it('should return all sites for user', async () => {
      const mockSites = [
        {
          id: 'site_1',
          domain: 'example1.com',
          name: 'Site 1',
          userId: 'user_123',
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
          userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sites).toEqual(mockSites)
      expect(data.sites).toHaveLength(2)
    })

    it('should return empty array when user has no sites', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sites).toEqual([])
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(verifyAuth).mockResolvedValue(null)

      const request = new Request('http://localhost/api/sites', {
        method: 'GET'
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })

    it('should support pagination', async () => {
      const mockSites = Array.from({ length: 5 }, (_, i) => ({
        id: `site_${i}`,
        domain: `example${i}.com`,
        name: `Site ${i}`,
        userId: 'user_123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        trackingId: `zt_${i}`,
        pageviews: 1000,
        visitors: 500
      }))

      vi.mocked(db.execute).mockResolvedValue({
        rows: mockSites.slice(0, 2)
      } as any)

      const request = new Request('http://localhost/api/sites?limit=2&offset=0', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sites).toHaveLength(2)
    })

    it('should filter by active status', async () => {
      const mockSites = [
        {
          id: 'site_1',
          domain: 'example1.com',
          name: 'Site 1',
          userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites?active=true', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sites.every((s: any) => s.isActive)).toBe(true)
    })
  })

  describe('GET /api/sites/[id] - Get Site', () => {
    it('should return site by ID', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.site).toEqual(mockSite)
    })

    it('should return 404 when site not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites/nonexistent', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET_BY_ID(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('not found')
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(verifyAuth).mockResolvedValue(null)

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'GET'
      })

      const response = await GET_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })

    it('should not return site for different user', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await GET_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
    })
  })

  describe('PUT /api/sites/[id] - Update Site', () => {
    it('should update site name', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Updated Name',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          name: 'Updated Name'
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.site.name).toBe('Updated Name')
    })

    it('should update site domain', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'newdomain.com',
        name: 'Example Site',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'newdomain.com'
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.site.domain).toBe('newdomain.com')
    })

    it('should update active status', async () => {
      const mockSite = {
        id: 'site_123',
        domain: 'example.com',
        name: 'Example Site',
        userId: 'user_123',
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

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          isActive: false
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.site.isActive).toBe(false)
    })

    it('should return 404 when site not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites/nonexistent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          name: 'Updated Name'
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('not found')
    })

    it('should return 400 for invalid domain', async () => {
      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          domain: 'invalid domain'
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid domain')
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(verifyAuth).mockResolvedValue(null)

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Name'
        })
      })

      const response = await PUT_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })
  })

  describe('DELETE /api/sites/[id] - Delete Site', () => {
    it('should soft delete site', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ id: 'site_123' }]
      } as any)

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('deleted')
    })

    it('should hard delete site when specified', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites/site_123?hard=true', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('permanently deleted')
    })

    it('should return 404 when site not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: []
      } as any)

      const request = new Request('http://localhost/api/sites/nonexistent', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE_BY_ID(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('not found')
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(verifyAuth).mockResolvedValue(null)

      const request = new Request('http://localhost/api/sites/site_123', {
        method: 'DELETE'
      })

      const response = await DELETE_BY_ID(request, { params: { id: 'site_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })
  })
})
