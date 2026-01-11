'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode, createContext, useContext, useEffect, useState } from 'react'

// Auth mode from environment (set at build time or runtime)
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'clerk'

// Context for auth state in non-Clerk modes
interface SelfHostedAuthContext {
  isAuthenticated: boolean
  authenticate: (password?: string) => Promise<boolean>
  logout: () => void
}

const SelfHostedAuthContext = createContext<SelfHostedAuthContext>({
  isAuthenticated: false,
  authenticate: async () => false,
  logout: () => {},
})

export function useSelfHostedAuth() {
  return useContext(SelfHostedAuthContext)
}

// Password gate component for AUTH_MODE=password
function PasswordGate({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(true)
  const { isAuthenticated, authenticate } = useSelfHostedAuth()

  useEffect(() => {
    // Check if already authenticated (stored in sessionStorage)
    const stored = sessionStorage.getItem('zta_auth')
    if (stored === 'authenticated') {
      authenticate().then(() => setIsChecking(false))
    } else {
      setIsChecking(false)
    }
  }, [authenticate])

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <>{children}</>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const success = await authenticate(password)
    if (!success) {
      setError('Invalid password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Zero Trust Analytics
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Enter password to access dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

// Self-hosted auth provider (for password and none modes)
function SelfHostedAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(AUTH_MODE === 'none')

  const authenticate = async (password?: string): Promise<boolean> => {
    if (AUTH_MODE === 'none') {
      setIsAuthenticated(true)
      return true
    }

    if (AUTH_MODE === 'password') {
      try {
        // Verify password against API
        const response = await fetch('/api/auth/config', {
          headers: password ? { 'X-Auth-Password': password } : {},
        })

        if (response.ok) {
          sessionStorage.setItem('zta_auth', 'authenticated')
          sessionStorage.setItem('zta_password', password || '')
          setIsAuthenticated(true)
          return true
        }
      } catch (err) {
        console.error('Auth error:', err)
      }
      return false
    }

    return false
  }

  const logout = () => {
    sessionStorage.removeItem('zta_auth')
    sessionStorage.removeItem('zta_password')
    setIsAuthenticated(false)
  }

  const content = (
    <SelfHostedAuthContext.Provider value={{ isAuthenticated, authenticate, logout }}>
      {AUTH_MODE === 'password' ? (
        <PasswordGate>{children}</PasswordGate>
      ) : (
        children
      )}
    </SelfHostedAuthContext.Provider>
  )

  return content
}

// Main auth provider - chooses between Clerk and self-hosted
export function AuthProvider({ children }: { children: ReactNode }) {
  // For Clerk mode, use ClerkProvider
  if (AUTH_MODE === 'clerk') {
    return <ClerkProvider>{children}</ClerkProvider>
  }

  // For self-hosted modes (none, password, jwt), use our provider
  return <SelfHostedAuthProvider>{children}</SelfHostedAuthProvider>
}

// Export auth mode for other components to check
export const authMode = AUTH_MODE
export const isClerkMode = AUTH_MODE === 'clerk'
export const isSelfHostedMode = AUTH_MODE !== 'clerk'
