import { LoginForm } from '@/components/auth'

export const metadata = {
  title: 'Sign In | Zero Trust Analytics',
  description: 'Sign in to your Zero Trust Analytics account',
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign in</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Welcome back to Zero Trust Analytics
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}
