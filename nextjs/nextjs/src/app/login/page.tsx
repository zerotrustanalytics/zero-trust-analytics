import { LoginForm } from '@/components/auth'

export const metadata = {
  title: 'Sign In | Zero Trust Analytics',
  description: 'Sign in to your Zero Trust Analytics account',
}

export default function LoginPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Sign in</h1>
          <p>Welcome back to Zero Trust Analytics</p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}
