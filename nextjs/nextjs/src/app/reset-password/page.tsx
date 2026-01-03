'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ResetPasswordForm } from '@/components/auth'
import { Alert } from '@/components/ui'
import Link from 'next/link'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert variant="error" title="Invalid Link">
          This password reset link is invalid or has expired.
          Please request a new one.
        </Alert>
        <p className="text-center">
          <Link
            href="/forgot-password"
            className="text-primary hover:underline font-medium"
          >
            Request new reset link
          </Link>
        </p>
      </div>
    )
  }

  return <ResetPasswordForm token={token} />
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter your new password</p>
        </div>

        <Suspense fallback={<div className="text-center">Loading...</div>}>
          <ResetPasswordContent />
        </Suspense>
      </div>
    </main>
  )
}
