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
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Reset Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Enter your new password
          </p>
        </div>

        <Suspense fallback={<div className="text-center">Loading...</div>}>
          <ResetPasswordContent />
        </Suspense>
      </div>
    </main>
  )
}
