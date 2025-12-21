'use client'

import { Sidebar } from '@/components/dashboard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />

      {/* Main content - offset for sidebar */}
      <main className="md:ml-64 p-4 md:p-8 transition-all" role="main">
        {children}
      </main>
    </div>
  )
}
