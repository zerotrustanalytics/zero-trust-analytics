import { ForgotPasswordForm } from '@/components/auth'

export const metadata = {
  title: 'Forgot Password | Zero Trust Analytics',
  description: 'Reset your Zero Trust Analytics password',
}

export default function ForgotPasswordPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Forgot Password</h1>
          <p>We&apos;ll send you a reset link</p>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  )
}
