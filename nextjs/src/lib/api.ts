/**
 * API utilities for making requests to the backend
 */

interface ApiError {
  error: string
  status: number
}

interface ApiOptions extends RequestInit {
  timeout?: number
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { timeout = 30000, ...fetchOptions } = options

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: `HTTP error ${response.status}`,
          status: response.status,
        }))
        throw new ApiRequestError(error.error, response.status)
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof ApiRequestError) throw error
      if ((error as Error).name === 'AbortError') {
        throw new ApiRequestError('Request timeout', 408)
      }
      throw new ApiRequestError('Network error', 0)
    }
  }

  async get<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }
}

export class ApiRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export const api = new ApiClient('/api')

// Convenience methods for common endpoints
export const authApi = {
  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post<{ user: { id: string; email: string } }>('/auth/login', {
      email,
      password,
      twoFactorCode,
    }),

  register: (email: string, password: string, plan: string) =>
    api.post<{ user: { id: string; email: string } }>('/auth/register', {
      email,
      password,
      plan,
    }),

  logout: () => api.post<{ success: boolean }>('/auth/logout'),

  forgotPassword: (email: string) =>
    api.post<{ success: boolean }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ success: boolean }>('/auth/reset-password', { token, password }),

  getSession: () =>
    api.get<{ user: { id: string; email: string } | null }>('/auth/session'),
}

export const sitesApi = {
  list: () =>
    api.get<{ sites: Array<{ id: string; domain: string; name: string }> }>('/sites'),

  get: (siteId: string) =>
    api.get<{ site: { id: string; domain: string; name: string } }>(`/sites/${siteId}`),

  create: (domain: string, name?: string) =>
    api.post<{ site: { id: string; domain: string; name: string } }>('/sites', {
      domain,
      name,
    }),

  update: (siteId: string, data: { name?: string }) =>
    api.patch<{ site: { id: string; domain: string; name: string } }>(
      `/sites/${siteId}`,
      data
    ),

  delete: (siteId: string) =>
    api.delete<{ success: boolean }>(`/sites/${siteId}`),

  getStats: (siteId: string, period: string) =>
    api.get<{
      uniqueVisitors: number
      pageviews: number
      bounceRate: number
      avgDuration: number
      pages: Array<{ path: string; views: number }>
      referrers: Array<{ source: string; visits: number }>
      daily: Array<{ date: string; visitors: number; pageviews: number }>
    }>(`/sites/${siteId}/stats?period=${period}`),
}

export const userApi = {
  getStatus: () =>
    api.get<{
      id: string
      email: string
      plan: string
      status: string
      canAccess: boolean
    }>('/user/status'),

  getSessions: () =>
    api.get<{
      sessions: Array<{
        id: string
        device: string
        lastActiveAt: string
        isCurrent: boolean
      }>
    }>('/user/sessions'),

  revokeSession: (sessionId: string) =>
    api.delete<{ success: boolean }>(`/user/sessions?sessionId=${sessionId}`),

  revokeAllSessions: () =>
    api.delete<{ success: boolean }>('/user/sessions?all=true'),
}
