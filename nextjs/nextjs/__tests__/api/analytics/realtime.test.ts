import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

/**
 * Realtime Analytics API Tests
 * Tests for the /api/analytics/realtime endpoint
 * Provides live visitor tracking and current activity monitoring
 */

interface RealtimeRequest {
  siteId: string
  timeWindow?: number // in minutes, default 30
}

interface RealtimeResponse {
  activeVisitors: number
  pageViews: number
  topPages: Array<{ path: string; visitors: number }>
  topCountries: Array<{ country: string; visitors: number }>
  topReferrers: Array<{ referrer: string; visitors: number }>
  recentEvents: RealtimeEvent[]
  metrics: {
    avgSessionDuration: number
    bounceRate: number
    pagesPerSession: number
  }
  timestamp: Date
}

interface RealtimeEvent {
  id: string
  timestamp: Date
  sessionId: string
  visitorId?: string
  path: string
  country?: string
  city?: string
  device?: string
  browser?: string
  referrer?: string
  eventType: 'pageview' | 'session_start' | 'session_end' | 'conversion'
}

interface ActiveSession {
  sessionId: string
  visitorId?: string
  startTime: Date
  lastActivity: Date
  pageViews: number
  currentPage: string
  country?: string
  device?: string
}

interface RealtimeStats {
  currentVisitors: number
  peakVisitors: number
  peakTime?: Date
  avgVisitorsLast24h: number
}

// Mock event store
let mockEvents: RealtimeEvent[] = []

// TDD: Implementation will follow these tests
class RealtimeAnalyticsAPI {
  private events: RealtimeEvent[]
  private sessions: Map<string, ActiveSession>
  private sessionTimeout: number // milliseconds

  constructor() {
    this.events = mockEvents
    this.sessions = new Map()
    this.sessionTimeout = 30 * 60 * 1000 // 30 minutes
  }

  /**
   * Validate realtime request
   */
  validateRequest(request: RealtimeRequest): { valid: boolean; error?: string } {
    if (!request.siteId) {
      return { valid: false, error: 'siteId is required' }
    }

    if (request.timeWindow !== undefined && request.timeWindow <= 0) {
      return { valid: false, error: 'timeWindow must be positive' }
    }

    if (request.timeWindow !== undefined && request.timeWindow > 1440) {
      return { valid: false, error: 'timeWindow cannot exceed 1440 minutes (24 hours)' }
    }

    return { valid: true }
  }

  /**
   * Get realtime analytics
   */
  async getRealtime(request: RealtimeRequest): Promise<RealtimeResponse> {
    const validation = this.validateRequest(request)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const timeWindow = request.timeWindow || 30
    const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000)

    // Filter events within time window
    const recentEvents = this.events.filter(e => e.timestamp >= cutoffTime)

    // Calculate metrics
    const activeVisitors = this.getActiveVisitors(recentEvents)
    const pageViews = recentEvents.filter(e => e.eventType === 'pageview').length
    const topPages = this.getTopPages(recentEvents, 10)
    const topCountries = this.getTopCountries(recentEvents, 10)
    const topReferrers = this.getTopReferrers(recentEvents, 10)
    const metrics = this.calculateMetrics(recentEvents)

    return {
      activeVisitors,
      pageViews,
      topPages,
      topCountries,
      topReferrers,
      recentEvents: recentEvents.slice(0, 50),
      metrics,
      timestamp: new Date()
    }
  }

  /**
   * Track new event
   */
  async trackEvent(event: Omit<RealtimeEvent, 'id' | 'timestamp'>): Promise<RealtimeEvent> {
    const newEvent: RealtimeEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    }

    this.events.push(newEvent)

    // Update session
    if (event.eventType === 'pageview') {
      this.updateSession(newEvent)
    }

    return newEvent
  }

  /**
   * Get active visitors count
   */
  private getActiveVisitors(events: RealtimeEvent[]): number {
    const activeSessions = new Set(events.map(e => e.sessionId))
    return activeSessions.size
  }

  /**
   * Get top pages
   */
  private getTopPages(events: RealtimeEvent[], limit: number): Array<{ path: string; visitors: number }> {
    const pageStats = new Map<string, Set<string>>()

    events
      .filter(e => e.eventType === 'pageview')
      .forEach(event => {
        if (!pageStats.has(event.path)) {
          pageStats.set(event.path, new Set())
        }
        pageStats.get(event.path)!.add(event.sessionId)
      })

    return Array.from(pageStats.entries())
      .map(([path, sessions]) => ({ path, visitors: sessions.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, limit)
  }

  /**
   * Get top countries
   */
  private getTopCountries(events: RealtimeEvent[], limit: number): Array<{ country: string; visitors: number }> {
    const countryStats = new Map<string, Set<string>>()

    events.forEach(event => {
      if (event.country) {
        if (!countryStats.has(event.country)) {
          countryStats.set(event.country, new Set())
        }
        countryStats.get(event.country)!.add(event.sessionId)
      }
    })

    return Array.from(countryStats.entries())
      .map(([country, sessions]) => ({ country, visitors: sessions.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, limit)
  }

  /**
   * Get top referrers
   */
  private getTopReferrers(events: RealtimeEvent[], limit: number): Array<{ referrer: string; visitors: number }> {
    const referrerStats = new Map<string, Set<string>>()

    events.forEach(event => {
      if (event.referrer) {
        if (!referrerStats.has(event.referrer)) {
          referrerStats.set(event.referrer, new Set())
        }
        referrerStats.get(event.referrer)!.add(event.sessionId)
      }
    })

    return Array.from(referrerStats.entries())
      .map(([referrer, sessions]) => ({ referrer, visitors: sessions.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, limit)
  }

  /**
   * Calculate realtime metrics
   */
  private calculateMetrics(events: RealtimeEvent[]): {
    avgSessionDuration: number
    bounceRate: number
    pagesPerSession: number
  } {
    const sessionData = new Map<string, { pageViews: number; startTime: Date; endTime?: Date }>()

    events
      .filter(e => e.eventType === 'pageview')
      .forEach(event => {
        if (!sessionData.has(event.sessionId)) {
          sessionData.set(event.sessionId, {
            pageViews: 0,
            startTime: event.timestamp
          })
        }

        const session = sessionData.get(event.sessionId)!
        session.pageViews++
        session.endTime = event.timestamp
      })

    // Calculate average session duration
    let totalDuration = 0
    let sessionsWithDuration = 0

    sessionData.forEach(session => {
      if (session.endTime && session.pageViews > 1) {
        const duration = (session.endTime.getTime() - session.startTime.getTime()) / 1000
        totalDuration += duration
        sessionsWithDuration++
      }
    })

    const avgSessionDuration = sessionsWithDuration > 0
      ? Math.round(totalDuration / sessionsWithDuration)
      : 0

    // Calculate bounce rate
    const totalSessions = sessionData.size
    const bouncedSessions = Array.from(sessionData.values()).filter(s => s.pageViews === 1).length
    const bounceRate = totalSessions > 0
      ? Math.round((bouncedSessions / totalSessions) * 100 * 10) / 10
      : 0

    // Calculate pages per session
    const totalPageViews = Array.from(sessionData.values()).reduce((sum, s) => sum + s.pageViews, 0)
    const pagesPerSession = totalSessions > 0
      ? Math.round((totalPageViews / totalSessions) * 10) / 10
      : 0

    return {
      avgSessionDuration,
      bounceRate,
      pagesPerSession
    }
  }

  /**
   * Update active session
   */
  private updateSession(event: RealtimeEvent): void {
    let session = this.sessions.get(event.sessionId)

    if (!session) {
      session = {
        sessionId: event.sessionId,
        visitorId: event.visitorId,
        startTime: event.timestamp,
        lastActivity: event.timestamp,
        pageViews: 0,
        currentPage: event.path,
        country: event.country,
        device: event.device
      }
      this.sessions.set(event.sessionId, session)
    }

    session.pageViews++
    session.lastActivity = event.timestamp
    session.currentPage = event.path
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ActiveSession[] {
    const now = new Date()
    const activeSessions: ActiveSession[] = []

    this.sessions.forEach(session => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime < this.sessionTimeout) {
        activeSessions.push(session)
      }
    })

    return activeSessions
  }

  /**
   * Get current visitor count
   */
  getCurrentVisitorCount(): number {
    return this.getActiveSessions().length
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 50): RealtimeEvent[] {
    return [...this.events]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  /**
   * Get events by session
   */
  getSessionEvents(sessionId: string): RealtimeEvent[] {
    return this.events.filter(e => e.sessionId === sessionId)
  }

  /**
   * Clear old events
   */
  clearOldEvents(olderThanMinutes: number): number {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000)
    const initialLength = this.events.length

    this.events = this.events.filter(e => e.timestamp >= cutoffTime)

    return initialLength - this.events.length
  }

  /**
   * Get realtime statistics
   */
  getRealtimeStats(timeWindow: number = 1440): RealtimeStats {
    const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000)
    const recentEvents = this.events.filter(e => e.timestamp >= cutoffTime)

    // Group by time buckets (5-minute intervals)
    const buckets = new Map<number, Set<string>>()

    recentEvents.forEach(event => {
      const bucketTime = Math.floor(event.timestamp.getTime() / (5 * 60 * 1000))
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, new Set())
      }
      buckets.get(bucketTime)!.add(event.sessionId)
    })

    // Find peak
    let peakVisitors = 0
    let peakTime: Date | undefined

    buckets.forEach((sessions, bucketTime) => {
      if (sessions.size > peakVisitors) {
        peakVisitors = sessions.size
        peakTime = new Date(bucketTime * 5 * 60 * 1000)
      }
    })

    // Calculate average
    const totalVisitors = Array.from(buckets.values()).reduce((sum, sessions) => sum + sessions.size, 0)
    const avgVisitorsLast24h = buckets.size > 0
      ? Math.round(totalVisitors / buckets.size)
      : 0

    return {
      currentVisitors: this.getCurrentVisitorCount(),
      peakVisitors,
      peakTime,
      avgVisitorsLast24h
    }
  }

  /**
   * Get visitor journey
   */
  getVisitorJourney(visitorId: string): RealtimeEvent[] {
    return this.events
      .filter(e => e.visitorId === visitorId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: RealtimeEvent['eventType'], limit?: number): RealtimeEvent[] {
    const filtered = this.events.filter(e => e.eventType === eventType)
    return limit ? filtered.slice(0, limit) : filtered
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length
  }

  /**
   * Clear all events
   */
  clearAllEvents(): void {
    this.events = []
    this.sessions.clear()
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Expire inactive sessions
   */
  expireInactiveSessions(): number {
    const now = new Date()
    let expiredCount = 0

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime >= this.sessionTimeout) {
        this.sessions.delete(sessionId)
        expiredCount++
      }
    })

    return expiredCount
  }

  /**
   * Get visitor count by country
   */
  getVisitorsByCountry(timeWindow: number = 30): Map<string, number> {
    const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000)
    const recentEvents = this.events.filter(e => e.timestamp >= cutoffTime)

    const countryVisitors = new Map<string, Set<string>>()

    recentEvents.forEach(event => {
      if (event.country) {
        if (!countryVisitors.has(event.country)) {
          countryVisitors.set(event.country, new Set())
        }
        countryVisitors.get(event.country)!.add(event.sessionId)
      }
    })

    const result = new Map<string, number>()
    countryVisitors.forEach((sessions, country) => {
      result.set(country, sessions.size)
    })

    return result
  }

  /**
   * Get visitor count by device
   */
  getVisitorsByDevice(timeWindow: number = 30): Map<string, number> {
    const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000)
    const recentEvents = this.events.filter(e => e.timestamp >= cutoffTime)

    const deviceVisitors = new Map<string, Set<string>>()

    recentEvents.forEach(event => {
      if (event.device) {
        if (!deviceVisitors.has(event.device)) {
          deviceVisitors.set(event.device, new Set())
        }
        deviceVisitors.get(event.device)!.add(event.sessionId)
      }
    })

    const result = new Map<string, number>()
    deviceVisitors.forEach((sessions, device) => {
      result.set(device, sessions.size)
    })

    return result
  }
}

describe('RealtimeAnalyticsAPI', () => {
  let api: RealtimeAnalyticsAPI
  let validRequest: RealtimeRequest

  beforeEach(() => {
    // Reset mock events
    mockEvents = []
    api = new RealtimeAnalyticsAPI()

    validRequest = {
      siteId: 'site123',
      timeWindow: 30
    }

    // Add sample events
    const now = Date.now()
    mockEvents.push(
      {
        id: 'evt1',
        timestamp: new Date(now - 5 * 60 * 1000),
        sessionId: 'session1',
        visitorId: 'visitor1',
        path: '/home',
        country: 'US',
        device: 'desktop',
        browser: 'Chrome',
        referrer: 'https://google.com',
        eventType: 'pageview'
      },
      {
        id: 'evt2',
        timestamp: new Date(now - 3 * 60 * 1000),
        sessionId: 'session1',
        visitorId: 'visitor1',
        path: '/about',
        country: 'US',
        device: 'desktop',
        browser: 'Chrome',
        eventType: 'pageview'
      },
      {
        id: 'evt3',
        timestamp: new Date(now - 2 * 60 * 1000),
        sessionId: 'session2',
        visitorId: 'visitor2',
        path: '/home',
        country: 'GB',
        device: 'mobile',
        browser: 'Safari',
        referrer: 'https://twitter.com',
        eventType: 'pageview'
      }
    )
  })

  afterEach(() => {
    mockEvents = []
  })

  describe('Request Validation', () => {
    it('should validate correct request', () => {
      const validation = api.validateRequest(validRequest)

      expect(validation.valid).toBe(true)
      expect(validation.error).toBeUndefined()
    })

    it('should require siteId', () => {
      const request = { ...validRequest, siteId: '' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.error).toBe('siteId is required')
    })

    it('should reject negative timeWindow', () => {
      const request = { ...validRequest, timeWindow: -1 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('positive')
    })

    it('should reject timeWindow exceeding maximum', () => {
      const request = { ...validRequest, timeWindow: 2000 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('1440')
    })

    it('should accept maximum timeWindow', () => {
      const request = { ...validRequest, timeWindow: 1440 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(true)
    })

    it('should use default timeWindow if not provided', () => {
      const request = { siteId: 'site123' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(true)
    })
  })

  describe('Realtime Analytics', () => {
    it('should get realtime analytics', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response).toBeDefined()
      expect(response.activeVisitors).toBeGreaterThan(0)
      expect(response.pageViews).toBeGreaterThan(0)
      expect(response.timestamp).toBeInstanceOf(Date)
    })

    it('should count active visitors correctly', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.activeVisitors).toBe(2) // 2 unique sessions
    })

    it('should count pageviews correctly', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.pageViews).toBe(3)
    })

    it('should include top pages', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.topPages.length).toBeGreaterThan(0)
      expect(response.topPages[0]).toHaveProperty('path')
      expect(response.topPages[0]).toHaveProperty('visitors')
    })

    it('should include top countries', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.topCountries.length).toBeGreaterThan(0)
      expect(response.topCountries[0]).toHaveProperty('country')
      expect(response.topCountries[0]).toHaveProperty('visitors')
    })

    it('should include top referrers', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.topReferrers.length).toBeGreaterThan(0)
      expect(response.topReferrers[0]).toHaveProperty('referrer')
    })

    it('should include metrics', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.metrics.avgSessionDuration).toBeDefined()
      expect(response.metrics.bounceRate).toBeDefined()
      expect(response.metrics.pagesPerSession).toBeDefined()
    })

    it('should include recent events', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.recentEvents).toBeDefined()
      expect(Array.isArray(response.recentEvents)).toBe(true)
    })

    it('should throw error for invalid request', async () => {
      const invalidRequest = { siteId: '' }

      await expect(api.getRealtime(invalidRequest)).rejects.toThrow('siteId is required')
    })
  })

  describe('Event Tracking', () => {
    it('should track new event', async () => {
      const event = await api.trackEvent({
        sessionId: 'session3',
        visitorId: 'visitor3',
        path: '/products',
        eventType: 'pageview'
      })

      expect(event.id).toBeDefined()
      expect(event.timestamp).toBeInstanceOf(Date)
      expect(event.path).toBe('/products')
    })

    it('should generate unique event IDs', async () => {
      const event1 = await api.trackEvent({
        sessionId: 'session3',
        path: '/page1',
        eventType: 'pageview'
      })

      const event2 = await api.trackEvent({
        sessionId: 'session3',
        path: '/page2',
        eventType: 'pageview'
      })

      expect(event1.id).not.toBe(event2.id)
    })

    it('should update session on pageview', async () => {
      await api.trackEvent({
        sessionId: 'session_new',
        path: '/test',
        eventType: 'pageview'
      })

      const sessions = api.getActiveSessions()
      const session = sessions.find(s => s.sessionId === 'session_new')

      expect(session).toBeDefined()
      expect(session?.pageViews).toBe(1)
    })

    it('should track conversion events', async () => {
      const event = await api.trackEvent({
        sessionId: 'session3',
        path: '/checkout/success',
        eventType: 'conversion'
      })

      expect(event.eventType).toBe('conversion')
    })
  })

  describe('Active Sessions', () => {
    it('should get active sessions', () => {
      const sessions = api.getActiveSessions()

      expect(sessions.length).toBeGreaterThan(0)
    })

    it('should include session details', () => {
      const sessions = api.getActiveSessions()

      expect(sessions[0]).toHaveProperty('sessionId')
      expect(sessions[0]).toHaveProperty('startTime')
      expect(sessions[0]).toHaveProperty('pageViews')
    })

    it('should get current visitor count', () => {
      const count = api.getCurrentVisitorCount()

      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should expire inactive sessions', () => {
      const expiredCount = api.expireInactiveSessions()

      expect(expiredCount).toBeGreaterThanOrEqual(0)
    })

    it('should get session count', () => {
      const count = api.getSessionCount()

      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Event Queries', () => {
    it('should get recent events', () => {
      const events = api.getRecentEvents(10)

      expect(events.length).toBeGreaterThan(0)
      expect(events.length).toBeLessThanOrEqual(10)
    })

    it('should order events by timestamp descending', () => {
      const events = api.getRecentEvents()

      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          events[i].timestamp.getTime()
        )
      }
    })

    it('should get events by session', () => {
      const events = api.getSessionEvents('session1')

      expect(events.length).toBeGreaterThan(0)
      expect(events.every(e => e.sessionId === 'session1')).toBe(true)
    })

    it('should get events by type', () => {
      const events = api.getEventsByType('pageview')

      expect(events.every(e => e.eventType === 'pageview')).toBe(true)
    })

    it('should limit events by type', () => {
      const events = api.getEventsByType('pageview', 2)

      expect(events.length).toBeLessThanOrEqual(2)
    })

    it('should get event count', () => {
      const count = api.getEventCount()

      expect(count).toBe(mockEvents.length)
    })
  })

  describe('Data Management', () => {
    it('should clear old events', () => {
      const cleared = api.clearOldEvents(10)

      expect(cleared).toBeGreaterThanOrEqual(0)
    })

    it('should keep recent events when clearing old ones', () => {
      const initialCount = api.getEventCount()
      api.clearOldEvents(1)
      const afterCount = api.getEventCount()

      expect(afterCount).toBeLessThanOrEqual(initialCount)
    })

    it('should clear all events', () => {
      api.clearAllEvents()

      expect(api.getEventCount()).toBe(0)
      expect(api.getSessionCount()).toBe(0)
    })
  })

  describe('Realtime Statistics', () => {
    it('should get realtime stats', () => {
      const stats = api.getRealtimeStats()

      expect(stats.currentVisitors).toBeDefined()
      expect(stats.peakVisitors).toBeDefined()
      expect(stats.avgVisitorsLast24h).toBeDefined()
    })

    it('should calculate current visitors', () => {
      const stats = api.getRealtimeStats()

      expect(stats.currentVisitors).toBeGreaterThanOrEqual(0)
    })

    it('should calculate peak visitors', () => {
      const stats = api.getRealtimeStats()

      expect(stats.peakVisitors).toBeGreaterThanOrEqual(0)
    })

    it('should include peak time if available', () => {
      const stats = api.getRealtimeStats()

      if (stats.peakVisitors > 0) {
        expect(stats.peakTime).toBeDefined()
      }
    })
  })

  describe('Visitor Journey', () => {
    it('should get visitor journey', () => {
      const journey = api.getVisitorJourney('visitor1')

      expect(journey.length).toBeGreaterThan(0)
      expect(journey.every(e => e.visitorId === 'visitor1')).toBe(true)
    })

    it('should order journey by timestamp', () => {
      const journey = api.getVisitorJourney('visitor1')

      for (let i = 1; i < journey.length; i++) {
        expect(journey[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          journey[i - 1].timestamp.getTime()
        )
      }
    })

    it('should return empty array for unknown visitor', () => {
      const journey = api.getVisitorJourney('unknown')

      expect(journey).toHaveLength(0)
    })
  })

  describe('Geographic Distribution', () => {
    it('should get visitors by country', () => {
      const byCountry = api.getVisitorsByCountry()

      expect(byCountry.size).toBeGreaterThan(0)
    })

    it('should count visitors per country correctly', () => {
      const byCountry = api.getVisitorsByCountry()

      byCountry.forEach(count => {
        expect(count).toBeGreaterThan(0)
      })
    })

    it('should respect time window for country stats', () => {
      const byCountry = api.getVisitorsByCountry(5)

      expect(byCountry).toBeDefined()
    })
  })

  describe('Device Distribution', () => {
    it('should get visitors by device', () => {
      const byDevice = api.getVisitorsByDevice()

      expect(byDevice.size).toBeGreaterThan(0)
    })

    it('should count visitors per device correctly', () => {
      const byDevice = api.getVisitorsByDevice()

      byDevice.forEach(count => {
        expect(count).toBeGreaterThan(0)
      })
    })
  })

  describe('Top Lists', () => {
    it('should order top pages by visitor count', async () => {
      const response = await api.getRealtime(validRequest)

      for (let i = 1; i < response.topPages.length; i++) {
        expect(response.topPages[i - 1].visitors).toBeGreaterThanOrEqual(
          response.topPages[i].visitors
        )
      }
    })

    it('should order top countries by visitor count', async () => {
      const response = await api.getRealtime(validRequest)

      for (let i = 1; i < response.topCountries.length; i++) {
        expect(response.topCountries[i - 1].visitors).toBeGreaterThanOrEqual(
          response.topCountries[i].visitors
        )
      }
    })

    it('should limit top pages', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.topPages.length).toBeLessThanOrEqual(10)
    })

    it('should limit top countries', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.topCountries.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Metrics Calculation', () => {
    it('should calculate bounce rate correctly', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.metrics.bounceRate).toBeGreaterThanOrEqual(0)
      expect(response.metrics.bounceRate).toBeLessThanOrEqual(100)
    })

    it('should calculate pages per session', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.metrics.pagesPerSession).toBeGreaterThan(0)
    })

    it('should calculate average session duration', async () => {
      const response = await api.getRealtime(validRequest)

      expect(response.metrics.avgSessionDuration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Time Windows', () => {
    it('should respect custom time window', async () => {
      const request = { ...validRequest, timeWindow: 10 }
      const response = await api.getRealtime(request)

      expect(response).toBeDefined()
    })

    it('should handle very short time window', async () => {
      const request = { ...validRequest, timeWindow: 1 }
      const response = await api.getRealtime(request)

      expect(response).toBeDefined()
    })

    it('should handle maximum time window', async () => {
      const request = { ...validRequest, timeWindow: 1440 }
      const response = await api.getRealtime(request)

      expect(response).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle no active visitors', () => {
      api.clearAllEvents()
      const count = api.getCurrentVisitorCount()

      expect(count).toBe(0)
    })

    it('should handle empty event list', async () => {
      api.clearAllEvents()
      const response = await api.getRealtime(validRequest)

      expect(response.activeVisitors).toBe(0)
      expect(response.pageViews).toBe(0)
      expect(response.topPages).toHaveLength(0)
    })

    it('should handle session with single pageview', async () => {
      api.clearAllEvents()
      await api.trackEvent({
        sessionId: 'single',
        path: '/page',
        eventType: 'pageview'
      })

      const response = await api.getRealtime(validRequest)

      expect(response.metrics.bounceRate).toBe(100)
    })
  })

  describe('Performance', () => {
    it('should handle large number of events', async () => {
      // Add many events
      for (let i = 0; i < 1000; i++) {
        await api.trackEvent({
          sessionId: `session${i}`,
          path: '/test',
          eventType: 'pageview'
        })
      }

      const startTime = Date.now()
      await api.getRealtime(validRequest)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(1000)
    })
  })
})
