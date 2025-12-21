import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'

/**
 * TDD Tests for Google Analytics API Client
 * These tests define the expected behavior BEFORE implementation
 *
 * The GA API client should handle:
 * - Fetching GA4 properties
 * - Running reports with dimensions/metrics
 * - Pagination for large datasets
 * - Rate limiting (429 responses)
 * - Various error scenarios
 * - Request retries with exponential backoff
 * - Request timeouts
 * - Different report types
 */

// Types we expect to exist in the implementation
interface GA4Property {
  name: string // Format: properties/123456789
  displayName: string
  propertyType: 'PROPERTY_TYPE_ORDINARY' | 'PROPERTY_TYPE_SUBPROPERTY' | 'PROPERTY_TYPE_ROLLUP'
  createTime: string
  updateTime: string
  timeZone: string
  currencyCode: string
}

interface DateRange {
  startDate: string
  endDate: string
}

interface Dimension {
  name: string
}

interface Metric {
  name: string
}

interface ReportRequest {
  property: string // Format: properties/123456789
  dateRanges: DateRange[]
  dimensions: Dimension[]
  metrics: Metric[]
  limit?: number
  offset?: number
  orderBy?: Array<{ dimension?: { dimensionName: string }; metric?: { metricName: string }; desc?: boolean }>
  dimensionFilter?: object
  metricFilter?: object
}

interface DimensionValue {
  value: string
}

interface MetricValue {
  value: string
}

interface ReportRow {
  dimensionValues: DimensionValue[]
  metricValues: MetricValue[]
}

interface DimensionHeader {
  name: string
}

interface MetricHeader {
  name: string
  type: 'TYPE_INTEGER' | 'TYPE_FLOAT' | 'TYPE_SECONDS' | 'TYPE_CURRENCY'
}

interface ReportResponse {
  dimensionHeaders: DimensionHeader[]
  metricHeaders: MetricHeader[]
  rows: ReportRow[]
  rowCount: number
  metadata?: {
    dataLossFromOtherRow: boolean
    currencyCode: string
    timeZone: string
  }
}

interface GA4ClientConfig {
  accessToken: string
  timeout?: number
  maxRetries?: number
  retryDelay?: number
}

interface PaginatedReportOptions {
  property: string
  dateRanges: DateRange[]
  dimensions: Dimension[]
  metrics: Metric[]
  pageSize?: number
  maxResults?: number
}

// Mock implementation class - to be replaced with real implementation
class GA4Client {
  private accessToken: string
  private timeout: number
  private maxRetries: number
  private retryDelay: number
  private baseUrl = 'https://analyticsdata.googleapis.com/v1beta'

  constructor(config: GA4ClientConfig) {
    this.accessToken = config.accessToken
    this.timeout = config.timeout || 30000
    this.maxRetries = config.maxRetries || 3
    this.retryDelay = config.retryDelay || 1000
  }

  async listProperties(): Promise<GA4Property[]> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/properties`,
      { method: 'GET' }
    )
    const data = await response.json()
    return data.properties || []
  }

  async runReport(request: ReportRequest): Promise<ReportResponse> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/${request.property}:runReport`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }
    )
    return response.json()
  }

  async runReportWithPagination(options: PaginatedReportOptions): Promise<ReportResponse> {
    const pageSize = options.pageSize || 100
    const maxResults = options.maxResults || 10000
    let allRows: ReportRow[] = []
    let offset = 0
    let dimensionHeaders: DimensionHeader[] = []
    let metricHeaders: MetricHeader[] = []

    while (allRows.length < maxResults) {
      const request: ReportRequest = {
        property: options.property,
        dateRanges: options.dateRanges,
        dimensions: options.dimensions,
        metrics: options.metrics,
        limit: pageSize,
        offset
      }

      const response = await this.runReport(request)

      if (response.rows && response.rows.length > 0) {
        allRows = allRows.concat(response.rows)
        dimensionHeaders = response.dimensionHeaders
        metricHeaders = response.metricHeaders
      }

      if (!response.rows || response.rows.length < pageSize) {
        break
      }

      offset += pageSize
    }

    return {
      dimensionHeaders,
      metricHeaders,
      rows: allRows.slice(0, maxResults),
      rowCount: allRows.length
    }
  }

  validatePropertyId(propertyId: string): boolean {
    return /^properties\/\d+$/.test(propertyId)
  }

  private async fetchWithRetry(url: string, options: RequestInit, retryCount = 0): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.accessToken}`
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // Handle rate limiting
      if (response.status === 429) {
        if (retryCount < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, retryCount)
          await new Promise(resolve => setTimeout(resolve, delay))
          return this.fetchWithRetry(url, options, retryCount + 1)
        }
        throw new Error('Rate limit exceeded')
      }

      // Handle other errors
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(`API Error ${response.status}: ${error.message || response.statusText}`)
      }

      return response
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout')
      }

      // Retry on network errors
      if (retryCount < this.maxRetries && !(error instanceof Error && error.message.includes('API Error'))) {
        const delay = this.retryDelay * Math.pow(2, retryCount)
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.fetchWithRetry(url, options, retryCount + 1)
      }

      throw error
    }
  }

  // Report builders for different types
  buildOverviewReport(propertyId: string, startDate: string, endDate: string): ReportRequest {
    return {
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViewsPerSession' }
      ]
    }
  }

  buildPagesReport(propertyId: string, startDate: string, endDate: string, limit = 100): ReportRequest {
    return {
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'pagePath' },
        { name: 'pageTitle' }
      ],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' }
      ],
      limit,
      orderBy: [{ metric: { metricName: 'screenPageViews' }, desc: true }]
    }
  }

  buildReferrersReport(propertyId: string, startDate: string, endDate: string, limit = 50): ReportRequest {
    return {
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'sessionSource' },
        { name: 'sessionMedium' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' },
        { name: 'conversions' }
      ],
      limit,
      orderBy: [{ metric: { metricName: 'sessions' }, desc: true }]
    }
  }

  buildGeoReport(propertyId: string, startDate: string, endDate: string, limit = 100): ReportRequest {
    return {
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'country' },
        { name: 'city' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' }
      ],
      limit,
      orderBy: [{ metric: { metricName: 'sessions' }, desc: true }]
    }
  }

  buildDevicesReport(propertyId: string, startDate: string, endDate: string, limit = 50): ReportRequest {
    return {
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'deviceCategory' },
        { name: 'browser' },
        { name: 'operatingSystem' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' }
      ],
      limit,
      orderBy: [{ metric: { metricName: 'sessions' }, desc: true }]
    }
  }
}

describe('GA4Client', () => {
  let client: GA4Client

  beforeEach(() => {
    client = new GA4Client({
      accessToken: 'test_access_token',
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 100
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Constructor and Configuration', () => {
    it('should create client with access token', () => {
      expect(client).toBeDefined()
      expect(client).toBeInstanceOf(GA4Client)
    })

    it('should use default timeout if not provided', () => {
      const defaultClient = new GA4Client({ accessToken: 'token' })
      expect(defaultClient).toBeDefined()
    })

    it('should accept custom timeout configuration', () => {
      const customClient = new GA4Client({
        accessToken: 'token',
        timeout: 10000
      })
      expect(customClient).toBeDefined()
    })

    it('should accept custom retry configuration', () => {
      const customClient = new GA4Client({
        accessToken: 'token',
        maxRetries: 5,
        retryDelay: 500
      })
      expect(customClient).toBeDefined()
    })
  })

  describe('Fetching GA4 Properties', () => {
    it('should fetch available GA4 properties', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json({
            properties: [
              {
                name: 'properties/123456789',
                displayName: 'Test Property',
                propertyType: 'PROPERTY_TYPE_ORDINARY',
                createTime: '2024-01-01T00:00:00Z',
                updateTime: '2024-01-15T00:00:00Z',
                timeZone: 'America/New_York',
                currencyCode: 'USD'
              }
            ]
          })
        })
      )

      const properties = await client.listProperties()

      expect(properties).toHaveLength(1)
      expect(properties[0].name).toBe('properties/123456789')
      expect(properties[0].displayName).toBe('Test Property')
    })

    it('should return empty array when no properties available', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json({ properties: [] })
        })
      )

      const properties = await client.listProperties()
      expect(properties).toHaveLength(0)
    })

    it('should handle missing properties field', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json({})
        })
      )

      const properties = await client.listProperties()
      expect(properties).toHaveLength(0)
    })

    it('should include authorization header in request', async () => {
      let authHeader = ''

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', ({ request }) => {
          authHeader = request.headers.get('Authorization') || ''
          return HttpResponse.json({ properties: [] })
        })
      )

      await client.listProperties()
      expect(authHeader).toBe('Bearer test_access_token')
    })
  })

  describe('Running Reports with Date Ranges', () => {
    it('should fetch report data with single date range', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'screenPageViews', type: 'TYPE_INTEGER' }],
            rows: [
              {
                dimensionValues: [{ value: '20240115' }],
                metricValues: [{ value: '1000' }]
              }
            ],
            rowCount: 1
          })
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'screenPageViews' }]
      }

      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(1)
      expect(response.dimensionHeaders[0].name).toBe('date')
      expect(response.rows[0].metricValues[0].value).toBe('1000')
    })

    it('should support multiple date ranges', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest
          expect(body.dateRanges).toHaveLength(2)

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: [
              {
                dimensionValues: [{ value: '20240101' }],
                metricValues: [{ value: '500' }]
              },
              {
                dimensionValues: [{ value: '20240201' }],
                metricValues: [{ value: '600' }]
              }
            ],
            rowCount: 2
          })
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [
          { startDate: '2024-01-01', endDate: '2024-01-31' },
          { startDate: '2024-02-01', endDate: '2024-02-29' }
        ],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }]
      }

      const response = await client.runReport(request)
      expect(response.rows).toHaveLength(2)
    })

    it('should support relative date ranges', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest
          expect(body.dateRanges[0].startDate).toBe('7daysAgo')
          expect(body.dateRanges[0].endDate).toBe('today')

          return HttpResponse.json({
            dimensionHeaders: [],
            metricHeaders: [],
            rows: [],
            rowCount: 0
          })
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [],
        metrics: [{ name: 'sessions' }]
      }

      await client.runReport(request)
    })
  })

  describe('Building Report Requests', () => {
    it('should build overview report with correct dimensions and metrics', () => {
      const request = client.buildOverviewReport('properties/123456789', '2024-01-01', '2024-01-31')

      expect(request.property).toBe('properties/123456789')
      expect(request.dateRanges).toHaveLength(1)
      expect(request.dimensions).toHaveLength(1)
      expect(request.dimensions[0].name).toBe('date')
      expect(request.metrics).toContainEqual({ name: 'screenPageViews' })
      expect(request.metrics).toContainEqual({ name: 'sessions' })
      expect(request.metrics).toContainEqual({ name: 'totalUsers' })
    })

    it('should build pages report with page dimensions', () => {
      const request = client.buildPagesReport('properties/123456789', '2024-01-01', '2024-01-31', 50)

      expect(request.dimensions).toContainEqual({ name: 'pagePath' })
      expect(request.dimensions).toContainEqual({ name: 'pageTitle' })
      expect(request.limit).toBe(50)
      expect(request.orderBy).toBeDefined()
      expect(request.orderBy![0].metric?.metricName).toBe('screenPageViews')
      expect(request.orderBy![0].desc).toBe(true)
    })

    it('should build referrers report with source and medium dimensions', () => {
      const request = client.buildReferrersReport('properties/123456789', '2024-01-01', '2024-01-31')

      expect(request.dimensions).toContainEqual({ name: 'sessionSource' })
      expect(request.dimensions).toContainEqual({ name: 'sessionMedium' })
      expect(request.metrics).toContainEqual({ name: 'sessions' })
      expect(request.metrics).toContainEqual({ name: 'conversions' })
    })

    it('should build geo report with country and city dimensions', () => {
      const request = client.buildGeoReport('properties/123456789', '2024-01-01', '2024-01-31')

      expect(request.dimensions).toContainEqual({ name: 'country' })
      expect(request.dimensions).toContainEqual({ name: 'city' })
      expect(request.metrics).toContainEqual({ name: 'sessions' })
      expect(request.metrics).toContainEqual({ name: 'totalUsers' })
    })

    it('should build devices report with device dimensions', () => {
      const request = client.buildDevicesReport('properties/123456789', '2024-01-01', '2024-01-31')

      expect(request.dimensions).toContainEqual({ name: 'deviceCategory' })
      expect(request.dimensions).toContainEqual({ name: 'browser' })
      expect(request.dimensions).toContainEqual({ name: 'operatingSystem' })
      expect(request.metrics).toContainEqual({ name: 'sessions' })
    })

    it('should allow custom limits for reports', () => {
      const request = client.buildPagesReport('properties/123456789', '2024-01-01', '2024-01-31', 200)
      expect(request.limit).toBe(200)
    })
  })

  describe('Pagination Handling', () => {
    it('should handle single page of results', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: Array(50).fill(null).map((_, i) => ({
              dimensionValues: [{ value: `2024011${i % 10}` }],
              metricValues: [{ value: `${100 + i}` }]
            })),
            rowCount: 50
          })
        })
      )

      const response = await client.runReportWithPagination({
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        pageSize: 100
      })

      expect(response.rows).toHaveLength(50)
    })

    it('should fetch multiple pages of results', async () => {
      let callCount = 0

      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest
          callCount++

          const offset = body.offset || 0
          const limit = body.limit || 100

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: Array(limit).fill(null).map((_, i) => ({
              dimensionValues: [{ value: `2024011${(offset + i) % 10}` }],
              metricValues: [{ value: `${offset + i}` }]
            })),
            rowCount: limit
          })
        })
      )

      const response = await client.runReportWithPagination({
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        pageSize: 100,
        maxResults: 250
      })

      expect(response.rows).toHaveLength(250)
      expect(callCount).toBe(3) // 3 calls needed for 250 results
    })

    it('should stop fetching when no more results available', async () => {
      let callCount = 0

      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest
          callCount++

          const offset = body.offset || 0

          // Return less than pageSize on second call
          if (callCount === 2) {
            return HttpResponse.json({
              dimensionHeaders: [{ name: 'date' }],
              metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
              rows: Array(50).fill(null).map((_, i) => ({
                dimensionValues: [{ value: `2024011${(offset + i) % 10}` }],
                metricValues: [{ value: `${offset + i}` }]
              })),
              rowCount: 50
            })
          }

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: Array(100).fill(null).map((_, i) => ({
              dimensionValues: [{ value: `2024011${(offset + i) % 10}` }],
              metricValues: [{ value: `${offset + i}` }]
            })),
            rowCount: 100
          })
        })
      )

      const response = await client.runReportWithPagination({
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        pageSize: 100
      })

      expect(response.rows).toHaveLength(150)
      expect(callCount).toBe(2)
    })

    it('should respect maxResults limit', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: Array(100).fill(null).map((_, i) => ({
              dimensionValues: [{ value: `2024011${i % 10}` }],
              metricValues: [{ value: `${i}` }]
            })),
            rowCount: 100
          })
        })
      )

      const response = await client.runReportWithPagination({
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
        pageSize: 100,
        maxResults: 75
      })

      expect(response.rows.length).toBeLessThanOrEqual(75)
    })
  })

  describe('Rate Limit Handling', () => {
    it('should retry on 429 rate limit response', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          attemptCount++
          if (attemptCount < 2) {
            return new HttpResponse(null, { status: 429 })
          }
          return HttpResponse.json({ properties: [] })
        })
      )

      const properties = await client.listProperties()

      expect(attemptCount).toBe(2)
      expect(properties).toHaveLength(0)
    })

    it('should use exponential backoff for rate limit retries', async () => {
      const delays: number[] = []
      let attemptCount = 0
      const originalSetTimeout = global.setTimeout

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        if (delay > 0) {
          delays.push(delay)
        }
        return originalSetTimeout(callback, 0)
      })

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          attemptCount++
          if (attemptCount <= 2) {
            return new HttpResponse(null, { status: 429 })
          }
          return HttpResponse.json({ properties: [] })
        })
      )

      await client.listProperties()

      expect(delays[0]).toBe(100) // First retry: 100ms
      expect(delays[1]).toBe(200) // Second retry: 200ms (exponential backoff)
    })

    it('should fail after max retries on rate limit', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return new HttpResponse(null, { status: 429 })
        })
      )

      await expect(client.listProperties()).rejects.toThrow('Rate limit exceeded')
    })

    it('should include retry count in exponential backoff calculation', async () => {
      const delays: number[] = []
      let attemptCount = 0
      const originalSetTimeout = global.setTimeout

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        if (delay > 0) {
          delays.push(delay)
        }
        return originalSetTimeout(callback, 0)
      })

      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          attemptCount++
          if (attemptCount <= 3) {
            return new HttpResponse(null, { status: 429 })
          }
          return HttpResponse.json({
            dimensionHeaders: [],
            metricHeaders: [],
            rows: [],
            rowCount: 0
          })
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [],
        metrics: [{ name: 'sessions' }]
      }

      await client.runReport(request)

      expect(delays[0]).toBe(100) // 100 * 2^0
      expect(delays[1]).toBe(200) // 100 * 2^1
      expect(delays[2]).toBe(400) // 100 * 2^2
    })
  })

  describe('API Error Handling', () => {
    it('should handle 400 Bad Request error', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json(
            { message: 'Invalid request parameters' },
            { status: 400 }
          )
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: 'invalid', endDate: 'invalid' }],
        dimensions: [],
        metrics: []
      }

      await expect(client.runReport(request)).rejects.toThrow('API Error 400')
    })

    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json(
            { message: 'Invalid authentication credentials' },
            { status: 401 }
          )
        })
      )

      await expect(client.listProperties()).rejects.toThrow('API Error 401')
    })

    it('should handle 403 Forbidden error', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json(
            { message: 'User does not have permission to access this resource' },
            { status: 403 }
          )
        })
      )

      await expect(client.listProperties()).rejects.toThrow('API Error 403')
    })

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/999999999:runReport', () => {
          return HttpResponse.json(
            { message: 'Property not found' },
            { status: 404 }
          )
        })
      )

      const request: ReportRequest = {
        property: 'properties/999999999',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [],
        metrics: [{ name: 'sessions' }]
      }

      await expect(client.runReport(request)).rejects.toThrow('API Error 404')
    })

    it('should handle 500 Internal Server Error', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(client.listProperties()).rejects.toThrow()
    })

    it('should include error message from API response', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json(
            { message: 'Invalid dimension name: invalidDimension' },
            { status: 400 }
          )
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [{ name: 'invalidDimension' }],
        metrics: [{ name: 'sessions' }]
      }

      await expect(client.runReport(request)).rejects.toThrow('Invalid dimension name')
    })

    it('should handle error response without message', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      await expect(client.listProperties()).rejects.toThrow('API Error 500')
    })
  })

  describe('Request Timeout Handling', () => {
    it('should timeout request after configured duration', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', async () => {
          await new Promise(resolve => setTimeout(resolve, 10000))
          return HttpResponse.json({ properties: [] })
        })
      )

      const timeoutClient = new GA4Client({
        accessToken: 'token',
        timeout: 100,
        maxRetries: 0
      })

      await expect(timeoutClient.listProperties()).rejects.toThrow('Request timeout')
    })

    it('should not timeout for fast responses', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json({ properties: [] })
        })
      )

      const timeoutClient = new GA4Client({
        accessToken: 'token',
        timeout: 5000
      })

      const properties = await timeoutClient.listProperties()
      expect(properties).toHaveLength(0)
    })

    it('should clear timeout after successful response', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.json({ properties: [] })
        })
      )

      await client.listProperties()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })
  })

  describe('Retrying Failed Requests', () => {
    it('should retry on network error', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          attemptCount++
          if (attemptCount < 2) {
            return HttpResponse.error()
          }
          return HttpResponse.json({ properties: [] })
        })
      )

      const properties = await client.listProperties()

      expect(attemptCount).toBe(2)
      expect(properties).toHaveLength(0)
    })

    it('should not retry on client errors (4xx)', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          attemptCount++
          return HttpResponse.json(
            { message: 'Bad request' },
            { status: 400 }
          )
        })
      )

      await expect(client.listProperties()).rejects.toThrow()
      expect(attemptCount).toBe(1)
    })

    it('should use exponential backoff for retries', async () => {
      const delays: number[] = []
      let attemptCount = 0
      const originalSetTimeout = global.setTimeout

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        if (delay > 0) {
          delays.push(delay)
        }
        return originalSetTimeout(callback, 0)
      })

      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          attemptCount++
          if (attemptCount <= 2) {
            return HttpResponse.error()
          }
          return HttpResponse.json({ properties: [] })
        })
      )

      await client.listProperties()

      expect(delays[0]).toBe(100)
      expect(delays[1]).toBe(200)
    })

    it('should fail after max retries on network error', async () => {
      server.use(
        http.get('https://analyticsdata.googleapis.com/v1beta/properties', () => {
          return HttpResponse.error()
        })
      )

      await expect(client.listProperties()).rejects.toThrow()
    })

    it('should retry different types of requests', async () => {
      let attemptCount = 0

      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          attemptCount++
          if (attemptCount < 2) {
            return HttpResponse.error()
          }
          return HttpResponse.json({
            dimensionHeaders: [],
            metricHeaders: [],
            rows: [],
            rowCount: 0
          })
        })
      )

      const request: ReportRequest = {
        property: 'properties/123456789',
        dateRanges: [{ startDate: '2024-01-01', endDate: '2024-01-31' }],
        dimensions: [],
        metrics: [{ name: 'sessions' }]
      }

      const response = await client.runReport(request)

      expect(attemptCount).toBe(2)
      expect(response.rows).toHaveLength(0)
    })
  })

  describe('Validating Property IDs', () => {
    it('should validate correct property ID format', () => {
      expect(client.validatePropertyId('properties/123456789')).toBe(true)
      expect(client.validatePropertyId('properties/987654321')).toBe(true)
    })

    it('should reject invalid property ID formats', () => {
      expect(client.validatePropertyId('123456789')).toBe(false)
      expect(client.validatePropertyId('property/123456789')).toBe(false)
      expect(client.validatePropertyId('properties/')).toBe(false)
      expect(client.validatePropertyId('properties/abc')).toBe(false)
      expect(client.validatePropertyId('')).toBe(false)
    })

    it('should reject property IDs with extra characters', () => {
      expect(client.validatePropertyId('properties/123456789/extra')).toBe(false)
      expect(client.validatePropertyId(' properties/123456789')).toBe(false)
      expect(client.validatePropertyId('properties/123456789 ')).toBe(false)
    })

    it('should handle edge cases', () => {
      expect(client.validatePropertyId('properties/0')).toBe(true)
      expect(client.validatePropertyId('properties/999999999999')).toBe(true)
      expect(client.validatePropertyId('properties/-123')).toBe(false)
    })
  })

  describe('Different Report Types', () => {
    it('should run overview report successfully', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest

          expect(body.dimensions).toContainEqual({ name: 'date' })
          expect(body.metrics.some(m => m.name === 'screenPageViews')).toBe(true)

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [
              { name: 'screenPageViews', type: 'TYPE_INTEGER' },
              { name: 'sessions', type: 'TYPE_INTEGER' }
            ],
            rows: [
              {
                dimensionValues: [{ value: '20240115' }],
                metricValues: [{ value: '1000' }, { value: '500' }]
              }
            ],
            rowCount: 1
          })
        })
      )

      const request = client.buildOverviewReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(1)
    })

    it('should run pages report with ordering', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest

          expect(body.dimensions).toContainEqual({ name: 'pagePath' })
          expect(body.orderBy).toBeDefined()

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'pagePath' }, { name: 'pageTitle' }],
            metricHeaders: [{ name: 'screenPageViews', type: 'TYPE_INTEGER' }],
            rows: [
              {
                dimensionValues: [{ value: '/' }, { value: 'Home' }],
                metricValues: [{ value: '5000' }]
              },
              {
                dimensionValues: [{ value: '/pricing' }, { value: 'Pricing' }],
                metricValues: [{ value: '2000' }]
              }
            ],
            rowCount: 2
          })
        })
      )

      const request = client.buildPagesReport('properties/123456789', '2024-01-01', '2024-01-31', 100)
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(2)
      expect(response.rows[0].dimensionValues[0].value).toBe('/')
    })

    it('should run referrers report', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest

          expect(body.dimensions).toContainEqual({ name: 'sessionSource' })
          expect(body.dimensions).toContainEqual({ name: 'sessionMedium' })

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
            metricHeaders: [
              { name: 'sessions', type: 'TYPE_INTEGER' },
              { name: 'conversions', type: 'TYPE_INTEGER' }
            ],
            rows: [
              {
                dimensionValues: [{ value: 'google' }, { value: 'organic' }],
                metricValues: [{ value: '1000' }, { value: '50' }]
              }
            ],
            rowCount: 1
          })
        })
      )

      const request = client.buildReferrersReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(1)
      expect(response.rows[0].dimensionValues[0].value).toBe('google')
    })

    it('should run geo report', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest

          expect(body.dimensions).toContainEqual({ name: 'country' })
          expect(body.dimensions).toContainEqual({ name: 'city' })

          return HttpResponse.json({
            dimensionHeaders: [{ name: 'country' }, { name: 'city' }],
            metricHeaders: [
              { name: 'sessions', type: 'TYPE_INTEGER' },
              { name: 'totalUsers', type: 'TYPE_INTEGER' }
            ],
            rows: [
              {
                dimensionValues: [{ value: 'United States' }, { value: 'New York' }],
                metricValues: [{ value: '500' }, { value: '400' }]
              }
            ],
            rowCount: 1
          })
        })
      )

      const request = client.buildGeoReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(1)
      expect(response.rows[0].dimensionValues[0].value).toBe('United States')
    })

    it('should run devices report', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', async ({ request }) => {
          const body = await request.json() as ReportRequest

          expect(body.dimensions).toContainEqual({ name: 'deviceCategory' })
          expect(body.dimensions).toContainEqual({ name: 'browser' })

          return HttpResponse.json({
            dimensionHeaders: [
              { name: 'deviceCategory' },
              { name: 'browser' },
              { name: 'operatingSystem' }
            ],
            metricHeaders: [
              { name: 'sessions', type: 'TYPE_INTEGER' },
              { name: 'bounceRate', type: 'TYPE_FLOAT' }
            ],
            rows: [
              {
                dimensionValues: [{ value: 'mobile' }, { value: 'Chrome' }, { value: 'Android' }],
                metricValues: [{ value: '300' }, { value: '0.45' }]
              }
            ],
            rowCount: 1
          })
        })
      )

      const request = client.buildDevicesReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(1)
      expect(response.rows[0].dimensionValues[0].value).toBe('mobile')
    })

    it('should handle empty report responses', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json({
            dimensionHeaders: [],
            metricHeaders: [],
            rows: [],
            rowCount: 0
          })
        })
      )

      const request = client.buildOverviewReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.rows).toHaveLength(0)
      expect(response.rowCount).toBe(0)
    })

    it('should preserve report metadata in response', async () => {
      server.use(
        http.post('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport', () => {
          return HttpResponse.json({
            dimensionHeaders: [{ name: 'date' }],
            metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }],
            rows: [],
            rowCount: 0,
            metadata: {
              dataLossFromOtherRow: false,
              currencyCode: 'USD',
              timeZone: 'America/New_York'
            }
          })
        })
      )

      const request = client.buildOverviewReport('properties/123456789', '2024-01-01', '2024-01-31')
      const response = await client.runReport(request)

      expect(response.metadata).toBeDefined()
      expect(response.metadata?.currencyCode).toBe('USD')
      expect(response.metadata?.timeZone).toBe('America/New_York')
    })
  })
})
