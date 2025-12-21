import { ForgotPasswordForm } from '@/components/auth'

export const metadata = {
  title: 'Forgot Password | Zero Trust Analytics',
  description: 'Reset your Zero Trust Analytics password',
}

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Forgot Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            We&apos;ll send you a reset link
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  )
}
