import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock providers wrapper
interface ProvidersProps {
  children: React.ReactNode
}

function AllProviders({ children }: ProvidersProps) {
  return (
    <>
      {children}
    </>
  )
}

// Custom render function
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllProviders, ...options })
  }
}

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }
export { userEvent }

// Test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  plan: 'pro',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides
})

export const createMockSite = (overrides = {}) => ({
  id: 'site_123',
  domain: 'example.com',
  name: 'Example Site',
  createdAt: '2024-01-01T00:00:00Z',
  pageviews: 1000,
  visitors: 500,
  ...overrides
})

export const createMockAnalytics = (overrides = {}) => ({
  pageviews: 5678,
  visitors: 1234,
  bounceRate: 45.2,
  avgSessionDuration: 180,
  topPages: [
    { path: '/', views: 1000 },
    { path: '/pricing', views: 500 }
  ],
  topReferrers: [
    { source: 'google.com', visits: 400 },
    { source: 'direct', visits: 300 }
  ],
  countries: [
    { code: 'US', name: 'United States', visits: 500 }
  ],
  ...overrides
})

// Wait utilities
export const waitForLoadingToFinish = () =>
  new Promise(resolve => setTimeout(resolve, 0))

// Mock fetch helper
export const mockFetch = (data: unknown, status = 200) => {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
  })
}
