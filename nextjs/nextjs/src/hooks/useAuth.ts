'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  plan: string
  status: string
  canAccess: boolean
}

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string, twoFactorCode?: string) => Promise<boolean>
  register: (email: string, password: string, plan: string) => Promise<boolean>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/user/status')
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (
    email: string,
    password: string,
    twoFactorCode?: string
  ): Promise<boolean> => {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, twoFactorCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.requires2FA) {
          setError('2FA_REQUIRED')
          return false
        }
        setError(data.error || 'Login failed')
        return false
      }

      await fetchUser()
      return true
    } catch {
      setError('An error occurred during login')
      return false
    } finally {
      setLoading(false)
    }
  }

  const register = async (
    email: string,
    password: string,
    plan: string
  ): Promise<boolean> => {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, plan }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return false
      }

      await fetchUser()
      return true
    } catch {
      setError('An error occurred during registration')
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      router.push('/login')
    } catch {
      console.error('Logout failed')
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    await fetchUser()
  }

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    refresh,
  }
}
