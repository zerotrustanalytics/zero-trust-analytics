'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Input, Alert } from '@/components/ui'
import { OAuthButtons } from './OAuthButtons'

interface RegisterFormProps {
  onSuccess?: () => void
  redirectTo?: string
}

type Plan = 'solo' | 'pro' | 'team'

const plans: { id: Plan; name: string; description: string }[] = [
  { id: 'solo', name: 'Solo', description: 'For personal projects' },
  { id: 'pro', name: 'Pro', description: 'For growing businesses' },
  { id: 'team', name: 'Team', description: 'For teams and agencies' },
]

export function RegisterForm({ onSuccess, redirectTo = '/dashboard' }: RegisterFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<Plan>('solo')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 12) return 'Password must be at least 12 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number'
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) return 'Password must contain a special character'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Email is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, plan: selectedPlan }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }

      // Store auth token and CSRF token
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
      if (data.csrfToken) {
        sessionStorage.setItem('csrfToken', data.csrfToken)
      }

      onSuccess?.()
      router.push(redirectTo)
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={loading}
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={loading}
          hint="12+ characters, uppercase, lowercase, number, special character"
        />

        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={loading}
        />

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Select a Plan
          </label>
          <div className="grid grid-cols-3 gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                disabled={loading}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedPlan === plan.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-sm">{plan.name}</div>
                <div className="text-xs text-muted-foreground">
                  {plan.description}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>

        <Button
          type="submit"
          fullWidth
          loading={loading}
        >
          Create Account
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-background text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <OAuthButtons disabled={loading} />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
