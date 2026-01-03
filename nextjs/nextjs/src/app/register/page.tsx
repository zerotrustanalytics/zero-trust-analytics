import { RegisterForm } from '@/components/auth'

export const metadata = {
  title: 'Sign Up | Zero Trust Analytics',
  description: 'Create your Zero Trust Analytics account',
}

export default function RegisterPage() {
  return (
    <main className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create an account</h1>
          <p>Start tracking your website analytics</p>
        </div>

        <RegisterForm />
      </div>
    </main>
  )
}
