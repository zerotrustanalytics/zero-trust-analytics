'use client'

import { useCallback, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

interface ApiOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
  skipAuth?: boolean
}

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseApiReturn<T> extends ApiState<T> {
  execute: (endpoint: string, options?: ApiOptions) => Promise<T | null>
  reset: () => void
  setData: (data: T | null) => void
}

/**
 * useApi - Consolidated hook for API calls with authentication
 *
 * Handles:
 * - Clerk authentication token injection
 * - API URL configuration
 * - Loading/error state management
 * - Response parsing
 *
 * @example
 * const { data, loading, error, execute } = useApi<Site[]>()
 *
 * useEffect(() => {
 *   execute('/api/sites/list')
 * }, [execute])
 */
export function useApi<T = unknown>(): UseApiReturn<T> {
  const { getToken } = useAuth()
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(async (endpoint: string, options: ApiOptions = {}): Promise<T | null> => {
    const { skipAuth = false, headers = {}, ...fetchOptions } = options

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const authHeaders: Record<string, string> = { ...headers }

      if (!skipAuth) {
        const token = await getToken()
        if (!token) {
          setState({ data: null, loading: false, error: 'Not authenticated' })
          return null
        }
        authHeaders['Authorization'] = `Bearer ${token}`
      }

      // Add Content-Type for non-GET requests with body
      if (fetchOptions.body && !authHeaders['Content-Type']) {
        authHeaders['Content-Type'] = 'application/json'
      }

      const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`
      const res = await fetch(url, {
        ...fetchOptions,
        headers: authHeaders,
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.error || data.message || `Request failed with status ${res.status}`
        setState({ data: null, loading: false, error: errorMessage })
        return null
      }

      setState({ data, loading: false, error: null })
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Request failed'
      setState({ data: null, loading: false, error: errorMessage })
      return null
    }
  }, [getToken])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  const setData = useCallback((data: T | null) => {
    setState(prev => ({ ...prev, data }))
  }, [])

  return {
    ...state,
    execute,
    reset,
    setData,
  }
}

/**
 * useFetch - Simplified hook for GET requests that auto-execute
 *
 * @example
 * const { data, loading, error, refetch } = useFetch<Site[]>('/api/sites/list')
 */
export function useFetch<T = unknown>(endpoint: string, options: ApiOptions = {}) {
  const { getToken } = useAuth()
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const fetchData = useCallback(async () => {
    const { skipAuth = false, headers = {}, ...fetchOptions } = options

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const authHeaders: Record<string, string> = { ...headers }

      if (!skipAuth) {
        const token = await getToken()
        if (!token) {
          setState({ data: null, loading: false, error: 'Not authenticated' })
          return
        }
        authHeaders['Authorization'] = `Bearer ${token}`
      }

      const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`
      const res = await fetch(url, {
        ...fetchOptions,
        headers: authHeaders,
      })

      const data = await res.json()

      if (!res.ok) {
        setState({ data: null, loading: false, error: data.error || 'Request failed' })
        return
      }

      setState({ data, loading: false, error: null })
    } catch (err) {
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Request failed' })
    }
  }, [endpoint, getToken, options])

  return {
    ...state,
    refetch: fetchData,
    setData: (data: T | null) => setState(prev => ({ ...prev, data })),
  }
}

/**
 * apiClient - Standalone API client for use outside of React components
 *
 * @example
 * const data = await apiClient('/api/sites/list', token)
 */
export async function apiClient<T = unknown>(
  endpoint: string,
  token?: string | null,
  options: ApiOptions = {}
): Promise<{ data: T | null; error: string | null }> {
  const { headers = {}, ...fetchOptions } = options

  try {
    const authHeaders: Record<string, string> = { ...headers }

    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`
    }

    if (fetchOptions.body && !authHeaders['Content-Type']) {
      authHeaders['Content-Type'] = 'application/json'
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`
    const res = await fetch(url, {
      ...fetchOptions,
      headers: authHeaders,
    })

    const data = await res.json()

    if (!res.ok) {
      return { data: null, error: data.error || 'Request failed' }
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

export { API_URL }
