'use client'

import { SidebarProvider } from './SidebarContext'
import { UsageProvider } from './UsageContext'
import { Sidebar } from './Sidebar'
import { MainContent } from './MainContent'

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <UsageProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
      </UsageProvider>
    </SidebarProvider>
  )
}
