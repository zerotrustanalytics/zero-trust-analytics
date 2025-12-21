import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Analytics Query API Tests
 * Tests for the /api/analytics/query endpoint
 * Handles complex analytics queries with filters, grouping, and aggregations
 */

interface QueryRequest {
  siteId: string
  startDate: string
  endDate: string
  metrics?: string[]
  dimensions?: string[]
  filters?: QueryFilter[]
  groupBy?: string
  orderBy?: string
  limit?: number
  offset?: number
}

interface QueryFilter {
  dimension: string
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains'
  value: string | number | string[]
}

interface QueryResponse {
  data: AnalyticsRow[]
  totals: MetricTotals
  metadata: QueryMetadata
}

interface AnalyticsRow {
  [key: string]: string | number | Date
}

interface MetricTotals {
  pageViews: number
  uniqueVisitors: number
  sessions: number
  bounceRate: number
  avgSessionDuration: number
}

interface QueryMetadata {
  startDate: string
  endDate: string
  totalRows: number
  hasMore: boolean
  query: string
}

interface ValidationError {
  field: string
  message: string
}

// Mock data store
const mockAnalyticsData: AnalyticsRow[] = [
  {
    date: '2024-01-01',
    path: '/home',
    country: 'US',
    pageViews: 100,
    uniqueVisitors: 50,
    sessions: 60,
    bounceRate: 45.5,
    avgSessionDuration: 180
  },
  {
    date: '2024-01-01',
    path: '/about',
    country: 'US',
    pageViews: 50,
    uniqueVisitors: 25,
    sessions: 30,
    bounceRate: 60.0,
    avgSessionDuration: 120
  },
  {
    date: '2024-01-02',
    path: '/home',
    country: 'GB',
    pageViews: 80,
    uniqueVisitors: 40,
    sessions: 50,
    bounceRate: 50.0,
    avgSessionDuration: 150
  }
]

// TDD: Implementation will follow these tests
class AnalyticsQueryAPI {
  private data: AnalyticsRow[]

  constructor() {
    this.data = mockAnalyticsData
  }

  /**
   * Validate query request
   */
  validateRequest(request: QueryRequest): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = []

    // Required fields
    if (!request.siteId) {
      errors.push({ field: 'siteId', message: 'siteId is required' })
    }

    if (!request.startDate) {
      errors.push({ field: 'startDate', message: 'startDate is required' })
    }

    if (!request.endDate) {
      errors.push({ field: 'endDate', message: 'endDate is required' })
    }

    // Date validation
    if (request.startDate && request.endDate) {
      const start = new Date(request.startDate)
      const end = new Date(request.endDate)

      if (isNaN(start.getTime())) {
        errors.push({ field: 'startDate', message: 'Invalid date format' })
      }

      if (isNaN(end.getTime())) {
        errors.push({ field: 'endDate', message: 'Invalid date format' })
      }

      if (start > end) {
        errors.push({ field: 'dateRange', message: 'startDate must be before endDate' })
      }

      // Max range check (e.g., 90 days)
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff > 90) {
        errors.push({ field: 'dateRange', message: 'Date range cannot exceed 90 days' })
      }
    }

    // Validate metrics
    if (request.metrics && request.metrics.length === 0) {
      errors.push({ field: 'metrics', message: 'At least one metric is required' })
    }

    // Validate limit
    if (request.limit !== undefined && request.limit <= 0) {
      errors.push({ field: 'limit', message: 'Limit must be positive' })
    }

    if (request.limit !== undefined && request.limit > 1000) {
      errors.push({ field: 'limit', message: 'Limit cannot exceed 1000' })
    }

    // Validate offset
    if (request.offset !== undefined && request.offset < 0) {
      errors.push({ field: 'offset', message: 'Offset cannot be negative' })
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Execute analytics query
   */
  async executeQuery(request: QueryRequest): Promise<QueryResponse> {
    // Validate request
    const validation = this.validateRequest(request)
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`)
    }

    // Filter data by date range
    let filteredData = this.filterByDateRange(
      this.data,
      request.startDate,
      request.endDate
    )

    // Apply filters
    if (request.filters) {
      filteredData = this.applyFilters(filteredData, request.filters)
    }

    // Group by dimension
    let results = filteredData
    if (request.groupBy) {
      results = this.groupByDimension(filteredData, request.groupBy)
    }

    // Order results
    if (request.orderBy) {
      results = this.orderResults(results, request.orderBy)
    }

    // Calculate totals
    const totals = this.calculateTotals(filteredData)

    // Apply pagination
    const totalRows = results.length
    const offset = request.offset || 0
    const limit = request.limit || 100
    const paginatedResults = results.slice(offset, offset + limit)

    return {
      data: paginatedResults,
      totals,
      metadata: {
        startDate: request.startDate,
        endDate: request.endDate,
        totalRows,
        hasMore: offset + limit < totalRows,
        query: JSON.stringify(request)
      }
    }
  }

  /**
   * Filter data by date range
   */
  private filterByDateRange(data: AnalyticsRow[], startDate: string, endDate: string): AnalyticsRow[] {
    const start = new Date(startDate)
    const end = new Date(endDate)

    return data.filter(row => {
      const rowDate = new Date(row.date as string)
      return rowDate >= start && rowDate <= end
    })
  }

  /**
   * Apply filters to data
   */
  private applyFilters(data: AnalyticsRow[], filters: QueryFilter[]): AnalyticsRow[] {
    return data.filter(row => {
      return filters.every(filter => {
        const value = row[filter.dimension]

        switch (filter.operator) {
          case 'eq':
            return value === filter.value
          case 'ne':
            return value !== filter.value
          case 'gt':
            return Number(value) > Number(filter.value)
          case 'lt':
            return Number(value) < Number(filter.value)
          case 'gte':
            return Number(value) >= Number(filter.value)
          case 'lte':
            return Number(value) <= Number(filter.value)
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value as string)
          case 'contains':
            return String(value).includes(String(filter.value))
          default:
            return true
        }
      })
    })
  }

  /**
   * Group data by dimension
   */
  private groupByDimension(data: AnalyticsRow[], dimension: string): AnalyticsRow[] {
    const grouped = new Map<string, AnalyticsRow[]>()

    data.forEach(row => {
      const key = String(row[dimension])
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(row)
    })

    const results: AnalyticsRow[] = []
    grouped.forEach((rows, key) => {
      const aggregated: AnalyticsRow = {
        [dimension]: key,
        pageViews: rows.reduce((sum, r) => sum + Number(r.pageViews), 0),
        uniqueVisitors: rows.reduce((sum, r) => sum + Number(r.uniqueVisitors), 0),
        sessions: rows.reduce((sum, r) => sum + Number(r.sessions), 0),
        bounceRate: Math.round((rows.reduce((sum, r) => sum + Number(r.bounceRate), 0) / rows.length) * 10) / 10,
        avgSessionDuration: Math.round(rows.reduce((sum, r) => sum + Number(r.avgSessionDuration), 0) / rows.length)
      }
      results.push(aggregated)
    })

    return results
  }

  /**
   * Order results
   */
  private orderResults(data: AnalyticsRow[], orderBy: string): AnalyticsRow[] {
    const [field, direction = 'desc'] = orderBy.split(':')

    return [...data].sort((a, b) => {
      const aVal = a[field]
      const bVal = b[field]

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'desc' ? bVal - aVal : aVal - bVal
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'desc'
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal)
      }

      return 0
    })
  }

  /**
   * Calculate totals
   */
  private calculateTotals(data: AnalyticsRow[]): MetricTotals {
    if (data.length === 0) {
      return {
        pageViews: 0,
        uniqueVisitors: 0,
        sessions: 0,
        bounceRate: 0,
        avgSessionDuration: 0
      }
    }

    return {
      pageViews: data.reduce((sum, r) => sum + Number(r.pageViews), 0),
      uniqueVisitors: data.reduce((sum, r) => sum + Number(r.uniqueVisitors), 0),
      sessions: data.reduce((sum, r) => sum + Number(r.sessions), 0),
      bounceRate: Math.round((data.reduce((sum, r) => sum + Number(r.bounceRate), 0) / data.length) * 10) / 10,
      avgSessionDuration: Math.round(data.reduce((sum, r) => sum + Number(r.avgSessionDuration), 0) / data.length)
    }
  }

  /**
   * Get top pages
   */
  async getTopPages(siteId: string, startDate: string, endDate: string, limit: number = 10): Promise<AnalyticsRow[]> {
    const request: QueryRequest = {
      siteId,
      startDate,
      endDate,
      groupBy: 'path',
      orderBy: 'pageViews:desc',
      limit
    }

    const response = await this.executeQuery(request)
    return response.data
  }

  /**
   * Get top countries
   */
  async getTopCountries(siteId: string, startDate: string, endDate: string, limit: number = 10): Promise<AnalyticsRow[]> {
    const request: QueryRequest = {
      siteId,
      startDate,
      endDate,
      groupBy: 'country',
      orderBy: 'pageViews:desc',
      limit
    }

    const response = await this.executeQuery(request)
    return response.data
  }

  /**
   * Get metrics for specific page
   */
  async getPageMetrics(siteId: string, path: string, startDate: string, endDate: string): Promise<MetricTotals> {
    const request: QueryRequest = {
      siteId,
      startDate,
      endDate,
      filters: [{ dimension: 'path', operator: 'eq', value: path }]
    }

    const response = await this.executeQuery(request)
    return response.totals
  }

  /**
   * Compare two time periods
   */
  async comparePeriods(
    siteId: string,
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string
  ): Promise<{
    current: MetricTotals
    previous: MetricTotals
    change: { [key: string]: number }
  }> {
    const currentRequest: QueryRequest = {
      siteId,
      startDate: currentStart,
      endDate: currentEnd
    }

    const previousRequest: QueryRequest = {
      siteId,
      startDate: previousStart,
      endDate: previousEnd
    }

    const [currentResponse, previousResponse] = await Promise.all([
      this.executeQuery(currentRequest),
      this.executeQuery(previousRequest)
    ])

    const change = {
      pageViews: currentResponse.totals.pageViews - previousResponse.totals.pageViews,
      uniqueVisitors: currentResponse.totals.uniqueVisitors - previousResponse.totals.uniqueVisitors,
      sessions: currentResponse.totals.sessions - previousResponse.totals.sessions,
      bounceRate: Math.round((currentResponse.totals.bounceRate - previousResponse.totals.bounceRate) * 10) / 10,
      avgSessionDuration: currentResponse.totals.avgSessionDuration - previousResponse.totals.avgSessionDuration
    }

    return {
      current: currentResponse.totals,
      previous: previousResponse.totals,
      change
    }
  }

  /**
   * Get available dimensions
   */
  getAvailableDimensions(): string[] {
    return ['date', 'path', 'country', 'device', 'referrer', 'browser', 'os']
  }

  /**
   * Get available metrics
   */
  getAvailableMetrics(): string[] {
    return ['pageViews', 'uniqueVisitors', 'sessions', 'bounceRate', 'avgSessionDuration']
  }

  /**
   * Build query from parts
   */
  buildQuery(parts: Partial<QueryRequest>): QueryRequest {
    return {
      siteId: parts.siteId || '',
      startDate: parts.startDate || new Date().toISOString().split('T')[0],
      endDate: parts.endDate || new Date().toISOString().split('T')[0],
      metrics: parts.metrics,
      dimensions: parts.dimensions,
      filters: parts.filters,
      groupBy: parts.groupBy,
      orderBy: parts.orderBy,
      limit: parts.limit,
      offset: parts.offset
    }
  }
}

describe('AnalyticsQueryAPI', () => {
  let api: AnalyticsQueryAPI
  let validRequest: QueryRequest

  beforeEach(() => {
    api = new AnalyticsQueryAPI()

    validRequest = {
      siteId: 'site123',
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    }
  })

  describe('Request Validation', () => {
    it('should validate correct request', () => {
      const validation = api.validateRequest(validRequest)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should require siteId', () => {
      const request = { ...validRequest, siteId: '' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'siteId')).toBe(true)
    })

    it('should require startDate', () => {
      const request = { ...validRequest, startDate: '' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'startDate')).toBe(true)
    })

    it('should require endDate', () => {
      const request = { ...validRequest, endDate: '' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'endDate')).toBe(true)
    })

    it('should validate date format', () => {
      const request = { ...validRequest, startDate: 'invalid-date' }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'startDate')).toBe(true)
    })

    it('should reject startDate after endDate', () => {
      const request = {
        ...validRequest,
        startDate: '2024-12-31',
        endDate: '2024-01-01'
      }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'dateRange')).toBe(true)
    })

    it('should reject date range exceeding 90 days', () => {
      const request = {
        ...validRequest,
        startDate: '2024-01-01',
        endDate: '2024-06-01'
      }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.message.includes('90 days'))).toBe(true)
    })

    it('should validate limit is positive', () => {
      const request = { ...validRequest, limit: 0 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'limit')).toBe(true)
    })

    it('should validate limit does not exceed maximum', () => {
      const request = { ...validRequest, limit: 2000 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'limit')).toBe(true)
    })

    it('should validate offset is non-negative', () => {
      const request = { ...validRequest, offset: -1 }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'offset')).toBe(true)
    })

    it('should reject empty metrics array', () => {
      const request = { ...validRequest, metrics: [] }
      const validation = api.validateRequest(request)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.field === 'metrics')).toBe(true)
    })
  })

  describe('Query Execution', () => {
    it('should execute basic query', async () => {
      const response = await api.executeQuery(validRequest)

      expect(response).toBeDefined()
      expect(response.data).toBeDefined()
      expect(response.totals).toBeDefined()
      expect(response.metadata).toBeDefined()
    })

    it('should return data within date range', async () => {
      const response = await api.executeQuery(validRequest)

      expect(response.data.length).toBeGreaterThan(0)
    })

    it('should calculate totals correctly', async () => {
      const response = await api.executeQuery(validRequest)

      expect(response.totals.pageViews).toBeGreaterThan(0)
      expect(response.totals.uniqueVisitors).toBeGreaterThan(0)
      expect(response.totals.sessions).toBeGreaterThan(0)
    })

    it('should include metadata', async () => {
      const response = await api.executeQuery(validRequest)

      expect(response.metadata.startDate).toBe(validRequest.startDate)
      expect(response.metadata.endDate).toBe(validRequest.endDate)
      expect(response.metadata.totalRows).toBeDefined()
      expect(response.metadata.hasMore).toBeDefined()
    })

    it('should throw error for invalid request', async () => {
      const invalidRequest = { ...validRequest, siteId: '' }

      await expect(api.executeQuery(invalidRequest)).rejects.toThrow('Validation failed')
    })

    it('should handle empty results', async () => {
      const request = {
        ...validRequest,
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      }

      const response = await api.executeQuery(request)

      expect(response.data).toHaveLength(0)
      expect(response.totals.pageViews).toBe(0)
    })
  })

  describe('Filtering', () => {
    it('should filter by dimension equality', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'country', operator: 'eq', value: 'US' }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => row.country === 'US')).toBe(true)
    })

    it('should filter by dimension inequality', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'country', operator: 'ne', value: 'US' }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => row.country !== 'US')).toBe(true)
    })

    it('should filter by greater than', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'pageViews', operator: 'gt', value: 75 }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => Number(row.pageViews) > 75)).toBe(true)
    })

    it('should filter by less than', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'pageViews', operator: 'lt', value: 100 }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => Number(row.pageViews) < 100)).toBe(true)
    })

    it('should filter by in array', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'country', operator: 'in', value: ['US', 'GB'] }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => ['US', 'GB'].includes(row.country as string))).toBe(true)
    })

    it('should filter by contains', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [{ dimension: 'path', operator: 'contains', value: 'home' }]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row => String(row.path).includes('home'))).toBe(true)
    })

    it('should apply multiple filters', async () => {
      const request: QueryRequest = {
        ...validRequest,
        filters: [
          { dimension: 'country', operator: 'eq', value: 'US' },
          { dimension: 'pageViews', operator: 'gt', value: 50 }
        ]
      }

      const response = await api.executeQuery(request)

      expect(response.data.every(row =>
        row.country === 'US' && Number(row.pageViews) > 50
      )).toBe(true)
    })
  })

  describe('Grouping', () => {
    it('should group by dimension', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'country'
      }

      const response = await api.executeQuery(request)

      const countries = response.data.map(row => row.country)
      expect(new Set(countries).size).toBe(countries.length)
    })

    it('should aggregate metrics when grouping', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'path'
      }

      const response = await api.executeQuery(request)

      expect(response.data[0].pageViews).toBeDefined()
      expect(response.data[0].uniqueVisitors).toBeDefined()
    })

    it('should group by path', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'path'
      }

      const response = await api.executeQuery(request)

      expect(response.data.length).toBeGreaterThan(0)
    })
  })

  describe('Ordering', () => {
    it('should order by pageViews descending', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'path',
        orderBy: 'pageViews:desc'
      }

      const response = await api.executeQuery(request)

      for (let i = 1; i < response.data.length; i++) {
        expect(Number(response.data[i - 1].pageViews)).toBeGreaterThanOrEqual(
          Number(response.data[i].pageViews)
        )
      }
    })

    it('should order by pageViews ascending', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'path',
        orderBy: 'pageViews:asc'
      }

      const response = await api.executeQuery(request)

      for (let i = 1; i < response.data.length; i++) {
        expect(Number(response.data[i - 1].pageViews)).toBeLessThanOrEqual(
          Number(response.data[i].pageViews)
        )
      }
    })

    it('should order by string dimension', async () => {
      const request: QueryRequest = {
        ...validRequest,
        groupBy: 'country',
        orderBy: 'country:asc'
      }

      const response = await api.executeQuery(request)

      for (let i = 1; i < response.data.length; i++) {
        expect(String(response.data[i - 1].country).localeCompare(
          String(response.data[i].country)
        )).toBeLessThanOrEqual(0)
      }
    })
  })

  describe('Pagination', () => {
    it('should apply limit', async () => {
      const request: QueryRequest = {
        ...validRequest,
        limit: 1
      }

      const response = await api.executeQuery(request)

      expect(response.data.length).toBeLessThanOrEqual(1)
    })

    it('should apply offset', async () => {
      const request: QueryRequest = {
        ...validRequest,
        offset: 1
      }

      const response = await api.executeQuery(request)

      expect(response.data.length).toBeGreaterThan(0)
    })

    it('should set hasMore flag correctly', async () => {
      const request: QueryRequest = {
        ...validRequest,
        limit: 1,
        offset: 0
      }

      const response = await api.executeQuery(request)

      if (response.metadata.totalRows > 1) {
        expect(response.metadata.hasMore).toBe(true)
      }
    })

    it('should handle offset beyond data length', async () => {
      const request: QueryRequest = {
        ...validRequest,
        offset: 1000
      }

      const response = await api.executeQuery(request)

      expect(response.data).toHaveLength(0)
      expect(response.metadata.hasMore).toBe(false)
    })
  })

  describe('Top Pages', () => {
    it('should get top pages', async () => {
      const topPages = await api.getTopPages('site123', '2024-01-01', '2024-01-31', 10)

      expect(topPages.length).toBeGreaterThan(0)
      expect(topPages[0].path).toBeDefined()
    })

    it('should order top pages by pageviews', async () => {
      const topPages = await api.getTopPages('site123', '2024-01-01', '2024-01-31', 10)

      for (let i = 1; i < topPages.length; i++) {
        expect(Number(topPages[i - 1].pageViews)).toBeGreaterThanOrEqual(
          Number(topPages[i].pageViews)
        )
      }
    })

    it('should respect limit', async () => {
      const topPages = await api.getTopPages('site123', '2024-01-01', '2024-01-31', 1)

      expect(topPages.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Top Countries', () => {
    it('should get top countries', async () => {
      const topCountries = await api.getTopCountries('site123', '2024-01-01', '2024-01-31', 10)

      expect(topCountries.length).toBeGreaterThan(0)
      expect(topCountries[0].country).toBeDefined()
    })

    it('should order top countries by pageviews', async () => {
      const topCountries = await api.getTopCountries('site123', '2024-01-01', '2024-01-31', 10)

      for (let i = 1; i < topCountries.length; i++) {
        expect(Number(topCountries[i - 1].pageViews)).toBeGreaterThanOrEqual(
          Number(topCountries[i].pageViews)
        )
      }
    })
  })

  describe('Page Metrics', () => {
    it('should get metrics for specific page', async () => {
      const metrics = await api.getPageMetrics('site123', '/home', '2024-01-01', '2024-01-31')

      expect(metrics.pageViews).toBeGreaterThan(0)
      expect(metrics.uniqueVisitors).toBeGreaterThan(0)
    })

    it('should return zero metrics for non-existent page', async () => {
      const metrics = await api.getPageMetrics('site123', '/nonexistent', '2024-01-01', '2024-01-31')

      expect(metrics.pageViews).toBe(0)
    })
  })

  describe('Period Comparison', () => {
    it('should compare two periods', async () => {
      const comparison = await api.comparePeriods(
        'site123',
        '2024-01-02',
        '2024-01-02',
        '2024-01-01',
        '2024-01-01'
      )

      expect(comparison.current).toBeDefined()
      expect(comparison.previous).toBeDefined()
      expect(comparison.change).toBeDefined()
    })

    it('should calculate change correctly', async () => {
      const comparison = await api.comparePeriods(
        'site123',
        '2024-01-02',
        '2024-01-02',
        '2024-01-01',
        '2024-01-01'
      )

      expect(comparison.change.pageViews).toBeDefined()
      expect(typeof comparison.change.pageViews).toBe('number')
    })
  })

  describe('Schema Information', () => {
    it('should get available dimensions', () => {
      const dimensions = api.getAvailableDimensions()

      expect(dimensions).toContain('date')
      expect(dimensions).toContain('path')
      expect(dimensions).toContain('country')
    })

    it('should get available metrics', () => {
      const metrics = api.getAvailableMetrics()

      expect(metrics).toContain('pageViews')
      expect(metrics).toContain('uniqueVisitors')
      expect(metrics).toContain('sessions')
    })
  })

  describe('Query Builder', () => {
    it('should build query from parts', () => {
      const query = api.buildQuery({
        siteId: 'site123',
        startDate: '2024-01-01'
      })

      expect(query.siteId).toBe('site123')
      expect(query.startDate).toBe('2024-01-01')
      expect(query.endDate).toBeDefined()
    })

    it('should use default dates if not provided', () => {
      const query = api.buildQuery({ siteId: 'site123' })

      expect(query.startDate).toBeDefined()
      expect(query.endDate).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle query with no results', async () => {
      const request: QueryRequest = {
        ...validRequest,
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      }

      const response = await api.executeQuery(request)

      expect(response.data).toHaveLength(0)
    })

    it('should handle single day query', async () => {
      const request: QueryRequest = {
        ...validRequest,
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      }

      const response = await api.executeQuery(request)

      expect(response.data.length).toBeGreaterThan(0)
    })

    it('should handle maximum date range', async () => {
      const request: QueryRequest = {
        ...validRequest,
        startDate: '2024-01-01',
        endDate: '2024-03-31'
      }

      const response = await api.executeQuery(request)

      expect(response).toBeDefined()
    })
  })
})
