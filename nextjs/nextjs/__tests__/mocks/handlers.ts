import { http, HttpResponse } from 'msw'

// Mock data
export const mockUser = {
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  plan: 'pro',
  createdAt: '2024-01-01T00:00:00Z'
}

export const mockSites = [
  {
    id: 'site_1',
    domain: 'example.com',
    name: 'Example Site',
    createdAt: '2024-01-01T00:00:00Z',
    pageviews: 1234,
    visitors: 567
  },
  {
    id: 'site_2',
    domain: 'test.com',
    name: 'Test Site',
    createdAt: '2024-01-15T00:00:00Z',
    pageviews: 890,
    visitors: 234
  }
]

export const mockAnalytics = {
  pageviews: 5678,
  visitors: 1234,
  bounceRate: 45.2,
  avgSessionDuration: 180,
  topPages: [
    { path: '/', views: 1000 },
    { path: '/pricing', views: 500 },
    { path: '/docs', views: 300 }
  ],
  topReferrers: [
    { source: 'google.com', visits: 400 },
    { source: 'twitter.com', visits: 200 },
    { source: 'direct', visits: 300 }
  ],
  countries: [
    { code: 'US', name: 'United States', visits: 500 },
    { code: 'GB', name: 'United Kingdom', visits: 200 },
    { code: 'DE', name: 'Germany', visits: 150 }
  ]
}

export const mockGoogleAnalyticsImport = {
  status: 'pending',
  progress: 0,
  totalRows: 0,
  importedRows: 0
}

export const handlers = [
  // Auth endpoints
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string }
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        user: mockUser,
        token: 'mock_jwt_token'
      })
    }
    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    )
  }),

  http.post('/api/auth/register', async ({ request }) => {
    const body = await request.json() as { email: string; password: string; name: string }
    return HttpResponse.json({
      user: { ...mockUser, email: body.email, name: body.name },
      token: 'mock_jwt_token'
    })
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({ user: mockUser })
  }),

  // Sites endpoints
  http.get('/api/sites', () => {
    return HttpResponse.json({ sites: mockSites })
  }),

  http.post('/api/sites', async ({ request }) => {
    const body = await request.json() as { domain: string; name: string }
    return HttpResponse.json({
      site: {
        id: 'site_new',
        ...body,
        createdAt: new Date().toISOString(),
        pageviews: 0,
        visitors: 0
      }
    })
  }),

  http.get('/api/sites/:siteId', ({ params }) => {
    const site = mockSites.find(s => s.id === params.siteId)
    if (site) {
      return HttpResponse.json({ site })
    }
    return HttpResponse.json({ error: 'Site not found' }, { status: 404 })
  }),

  http.delete('/api/sites/:siteId', ({ params }) => {
    return HttpResponse.json({ success: true, siteId: params.siteId })
  }),

  // Analytics endpoints
  http.get('/api/analytics/:siteId', () => {
    return HttpResponse.json({ analytics: mockAnalytics })
  }),

  http.get('/api/analytics/:siteId/realtime', () => {
    return HttpResponse.json({
      activeVisitors: Math.floor(Math.random() * 50) + 10,
      recentPageviews: [
        { path: '/', timestamp: Date.now() - 1000 },
        { path: '/pricing', timestamp: Date.now() - 5000 }
      ]
    })
  }),

  // Google Analytics Import endpoints
  http.post('/api/import/google-analytics', async ({ request }) => {
    const body = await request.json() as { siteId: string; accessToken: string }
    return HttpResponse.json({
      importId: 'import_123',
      status: 'started'
    })
  }),

  http.get('/api/import/:importId/status', () => {
    return HttpResponse.json({
      status: 'completed',
      progress: 100,
      totalRows: 10000,
      importedRows: 10000
    })
  }),

  // Billing endpoints
  http.get('/api/billing/subscription', () => {
    return HttpResponse.json({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: '2025-01-01T00:00:00Z',
      cancelAtPeriodEnd: false
    })
  }),

  http.post('/api/billing/create-checkout', async ({ request }) => {
    const body = await request.json() as { priceId: string }
    return HttpResponse.json({
      url: `https://checkout.stripe.com/test?price=${body.priceId}`
    })
  }),

  http.post('/api/billing/create-portal', () => {
    return HttpResponse.json({
      url: 'https://billing.stripe.com/test/portal'
    })
  }),

  // Tracking script endpoint
  http.get('/api/script/:siteId', ({ params }) => {
    return new HttpResponse(
      `(function(){window.zta={siteId:"${params.siteId}"}})()`,
      { headers: { 'Content-Type': 'application/javascript' } }
    )
  }),

  // Collect analytics data
  http.post('/api/collect', () => {
    return HttpResponse.json({ success: true })
  })
]
