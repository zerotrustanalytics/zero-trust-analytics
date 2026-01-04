import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />

      {/* Main content - offset for sidebar, skip link target */}
      <main
        id="main-content"
        className="md:ml-64 p-4 md:p-8 transition-all"
        role="main"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  )
}
