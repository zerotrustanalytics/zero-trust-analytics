import { RegisterForm } from '@/components/auth'

export const metadata = {
  title: 'Sign Up | Zero Trust Analytics',
  description: 'Create your Zero Trust Analytics account',
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create an account</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Start tracking your website analytics
          </p>
        </div>

        <RegisterForm />
      </div>
    </main>
  )
}
