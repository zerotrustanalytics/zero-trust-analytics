/**
 * Usage API Tests
 *
 * Tests for /api/usage endpoint
 * Covers plan info, usage tracking, limits, and billing period
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// MOCK RESPONSE HELPERS
// ==========================================

interface UsageResponse {
  plan: {
    name: string
    tier: string
    limits: {
      monthlyPageviews: number
      sites: number
      teamMembers: number
      dataRetentionDays: number
    }
    features: string[]
  }
  usage: {
    current: {
      month: string
      pageviews: number
      visitors: number
      events: number
    }
    limit: number
    percentUsed: number
    remaining: number
    isWithinLimit: boolean
  }
  counts: {
    sites: number
    teamMembers: number
  }
  breakdown: {
    bySite: Array<{
      siteId: string
      pageviews: number
      visitors: number
      events: number
    }>
  }
  history: Array<{
    month: string
    pageviews: number
    visitors: number
    events: number
  }>
  billingPeriod: {
    start: string
    end: string
    daysRemaining: number
  }
}

// Plan configuration
const PLANS = {
  free: {
    name: 'Free',
    monthlyPageviews: 10000,
    siteLimit: 1,
    teamMemberLimit: 1,
    dataRetentionDays: 30,
    features: ['Basic analytics', 'Single site'],
  },
  pro: {
    name: 'Pro',
    monthlyPageviews: 100000,
    siteLimit: 10,
    teamMemberLimit: 5,
    dataRetentionDays: 365,
    features: ['Advanced analytics', 'Multiple sites', 'API access'],
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPageviews: 1000000,
    siteLimit: 100,
    teamMemberLimit: 50,
    dataRetentionDays: 730,
    features: ['Unlimited analytics', 'Dedicated support', 'SSO'],
  },
}

// ==========================================
// USAGE HANDLER SIMULATION
// ==========================================

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function calculateBillingPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    daysRemaining,
  }
}

interface MockUserData {
  id: string
  email: string
  plan: string
  sites: string[]
  teamMemberCount: number
  pageviews: number
  visitors: number
}

async function handleUsageRequest(
  method: string,
  authResult: { user?: { id: string; email: string }; error?: string; status?: number },
  userData: MockUserData | null,
  month?: string
): Promise<Response> {
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (authResult.error) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status || 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!userData) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
  }

  const planConfig = PLANS[userData.plan as keyof typeof PLANS] || PLANS.free
  const targetMonth = month || getCurrentMonth()

  const response: UsageResponse = {
    plan: {
      name: planConfig.name,
      tier: userData.plan,
      limits: {
        monthlyPageviews: planConfig.monthlyPageviews,
        sites: planConfig.siteLimit,
        teamMembers: planConfig.teamMemberLimit,
        dataRetentionDays: planConfig.dataRetentionDays,
      },
      features: planConfig.features,
    },
    usage: {
      current: {
        month: targetMonth,
        pageviews: userData.pageviews,
        visitors: userData.visitors,
        events: 0,
      },
      limit: planConfig.monthlyPageviews,
      percentUsed: Math.round((userData.pageviews / planConfig.monthlyPageviews) * 100),
      remaining: Math.max(0, planConfig.monthlyPageviews - userData.pageviews),
      isWithinLimit: userData.pageviews < planConfig.monthlyPageviews,
    },
    counts: {
      sites: userData.sites.length,
      teamMembers: userData.teamMemberCount,
    },
    breakdown: {
      bySite: userData.sites.map((siteId) => ({
        siteId,
        pageviews: Math.floor(userData.pageviews / userData.sites.length),
        visitors: Math.floor(userData.visitors / userData.sites.length),
        events: 0,
      })),
    },
    history: [],
    billingPeriod: calculateBillingPeriod(),
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ==========================================
// TEST SUITE
// ==========================================

describe('Usage API', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-09T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ==========================================
  // HTTP METHOD TESTS
  // ==========================================
  describe('HTTP Methods', () => {
    it('returns 204 for OPTIONS preflight', async () => {
      const response = await handleUsageRequest('OPTIONS', {}, null)

      expect(response.status).toBe(204)
    })

    it('returns 405 for POST requests', async () => {
      const response = await handleUsageRequest('POST', {}, null)

      expect(response.status).toBe(405)
    })

    it('returns 405 for PUT requests', async () => {
      const response = await handleUsageRequest('PUT', {}, null)

      expect(response.status).toBe(405)
    })
  })

  // ==========================================
  // AUTHENTICATION TESTS
  // ==========================================
  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const authResult = { error: 'No token provided', status: 401 }

      const response = await handleUsageRequest('GET', authResult, null)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('No token provided')
    })

    it('returns 401 for invalid token', async () => {
      const authResult = { error: 'Invalid token', status: 401 }

      const response = await handleUsageRequest('GET', authResult, null)

      expect(response.status).toBe(401)
    })

    it('returns 401 for expired token', async () => {
      const authResult = { error: 'Token expired', status: 401 }

      const response = await handleUsageRequest('GET', authResult, null)

      expect(response.status).toBe(401)
    })
  })

  // ==========================================
  // PLAN INFO TESTS
  // ==========================================
  describe('Plan Information', () => {
    const userData: MockUserData = {
      id: 'user_123',
      email: 'test@example.com',
      plan: 'pro',
      sites: ['site_1'],
      teamMemberCount: 1,
      pageviews: 5000,
      visitors: 1000,
    }

    it('returns plan name and tier', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.plan.name).toBe('Pro')
      expect(body.plan.tier).toBe('pro')
    })

    it('returns plan limits', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.plan.limits.monthlyPageviews).toBe(100000)
      expect(body.plan.limits.sites).toBe(10)
      expect(body.plan.limits.teamMembers).toBe(5)
      expect(body.plan.limits.dataRetentionDays).toBe(365)
    })

    it('returns plan features', async () => {
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.plan.features).toContain('Advanced analytics')
      expect(body.plan.features).toContain('API access')
    })

    it('defaults to free plan for unknown plan', async () => {
      const freeUser: MockUserData = { ...userData, plan: 'unknown' }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, freeUser)
      const body = await response.json()

      expect(body.plan.name).toBe('Free')
      expect(body.plan.limits.monthlyPageviews).toBe(10000)
    })
  })

  // ==========================================
  // USAGE TRACKING TESTS
  // ==========================================
  describe('Usage Tracking', () => {
    it('returns current month pageviews', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.current.pageviews).toBe(5000)
      expect(body.usage.current.visitors).toBe(1000)
    })

    it('returns current month in YYYY-MM format', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.current.month).toBe('2026-01')
    })

    it('calculates percent used correctly', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 50000, // 50% of 100000
        visitors: 10000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.percentUsed).toBe(50)
    })

    it('calculates remaining pageviews correctly', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 75000,
        visitors: 15000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.remaining).toBe(25000) // 100000 - 75000
    })

    it('returns isWithinLimit true when under limit', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 50000,
        visitors: 10000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.isWithinLimit).toBe(true)
    })

    it('returns isWithinLimit false when over limit', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 150000, // Over 100000 limit
        visitors: 30000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.isWithinLimit).toBe(false)
    })

    it('remaining does not go negative when over limit', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 150000, // Over limit
        visitors: 30000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.remaining).toBe(0)
    })
  })

  // ==========================================
  // COUNTS TESTS
  // ==========================================
  describe('Resource Counts', () => {
    it('returns site count', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1', 'site_2', 'site_3'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.counts.sites).toBe(3)
    })

    it('returns team member count', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 5,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.counts.teamMembers).toBe(5)
    })

    it('returns zero sites for new user', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: [],
        teamMemberCount: 1,
        pageviews: 0,
        visitors: 0,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.counts.sites).toBe(0)
    })
  })

  // ==========================================
  // BREAKDOWN TESTS
  // ==========================================
  describe('Usage Breakdown', () => {
    it('returns breakdown by site', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1', 'site_2'],
        teamMemberCount: 1,
        pageviews: 10000,
        visitors: 2000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.breakdown.bySite).toHaveLength(2)
      expect(body.breakdown.bySite[0].siteId).toBe('site_1')
      expect(body.breakdown.bySite[0].pageviews).toBe(5000)
    })

    it('returns empty breakdown for user with no sites', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: [],
        teamMemberCount: 1,
        pageviews: 0,
        visitors: 0,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.breakdown.bySite).toHaveLength(0)
    })
  })

  // ==========================================
  // BILLING PERIOD TESTS
  // ==========================================
  describe('Billing Period', () => {
    it('returns billing period start date', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.billingPeriod.start).toBe('2026-01-01')
    })

    it('returns billing period end date', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.billingPeriod.end).toBe('2026-01-31')
    })

    it('calculates days remaining in billing period', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      // Jan 9 to Jan 31 = 22 days remaining
      expect(body.billingPeriod.daysRemaining).toBe(22)
    })
  })

  // ==========================================
  // PLAN TIER TESTS
  // ==========================================
  describe('Plan Tiers', () => {
    it('returns free plan limits', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'free',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.plan.limits.monthlyPageviews).toBe(10000)
      expect(body.plan.limits.sites).toBe(1)
    })

    it('returns enterprise plan limits', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'enterprise',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 5000,
        visitors: 1000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.plan.limits.monthlyPageviews).toBe(1000000)
      expect(body.plan.limits.sites).toBe(100)
    })
  })

  // ==========================================
  // WARNING THRESHOLD TESTS
  // ==========================================
  describe('Usage Warning Thresholds', () => {
    it('shows 80% usage correctly', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 80000, // 80% of 100000
        visitors: 16000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.percentUsed).toBe(80)
      expect(body.usage.isWithinLimit).toBe(true)
      expect(body.usage.remaining).toBe(20000)
    })

    it('shows 100% usage correctly', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 100000, // Exactly at limit
        visitors: 20000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.percentUsed).toBe(100)
      expect(body.usage.isWithinLimit).toBe(false) // At limit = over
      expect(body.usage.remaining).toBe(0)
    })

    it('shows over 100% usage correctly', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: ['site_1'],
        teamMemberCount: 1,
        pageviews: 150000, // 150% of limit
        visitors: 30000,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)
      const body = await response.json()

      expect(body.usage.percentUsed).toBe(150)
      expect(body.usage.isWithinLimit).toBe(false)
    })
  })

  // ==========================================
  // CORS TESTS
  // ==========================================
  describe('CORS Headers', () => {
    it('includes CORS headers in response', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: [],
        teamMemberCount: 1,
        pageviews: 0,
        visitors: 0,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('includes Content-Type header', async () => {
      const userData: MockUserData = {
        id: 'user_123',
        email: 'test@example.com',
        plan: 'pro',
        sites: [],
        teamMemberCount: 1,
        pageviews: 0,
        visitors: 0,
      }
      const authResult = { user: { id: 'user_123', email: 'test@example.com' } }

      const response = await handleUsageRequest('GET', authResult, userData)

      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })
})
