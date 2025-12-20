'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Input, Alert } from '@/components/ui'

interface ForgotPasswordFormProps {
  onSuccess?: () => void
}

export function ForgotPasswordForm({ onSuccess }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Email is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send reset email')
        return
      }

      setSuccess(true)
      onSuccess?.()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <Alert variant="success" title="Check your email">
          We&apos;ve sent a password reset link to <strong>{email}</strong>.
          Please check your inbox and follow the instructions.
        </Alert>
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t receive the email?{' '}
          <button
            onClick={() => setSuccess(false)}
            className="text-primary hover:underline font-medium"
          >
            Try again
          </button>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        <p className="text-sm text-muted-foreground">
          Enter the email address associated with your account, and we&apos;ll
          send you a link to reset your password.
        </p>

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={loading}
        />

        <Button
          type="submit"
          fullWidth
          loading={loading}
        >
          Send Reset Link
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
