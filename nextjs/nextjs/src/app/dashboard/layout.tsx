import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard'

// Check auth mode from environment
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'clerk'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Only check Clerk auth if in Clerk mode
  if (AUTH_MODE === 'clerk') {
    const { userId } = await auth()

    if (!userId) {
      redirect('/sign-in')
    }
  }

  // For self-hosted modes (none, password), auth is handled client-side
  // by the AuthProvider/PasswordGate components

  return <DashboardShell>{children}</DashboardShell>
}
