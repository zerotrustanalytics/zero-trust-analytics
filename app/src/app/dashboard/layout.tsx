import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard'

// Check auth mode from environment
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'oidc'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // In gatekeep OIDC mode, require a session (belt-and-suspenders with proxy.ts).
  if (AUTH_MODE === 'oidc') {
    const session = await auth()

    if (!session) {
      redirect('/sign-in')
    }
  }

  // For self-hosted modes (none, password), auth is handled client-side
  // by the AuthProvider/PasswordGate components

  return <DashboardShell>{children}</DashboardShell>
}
