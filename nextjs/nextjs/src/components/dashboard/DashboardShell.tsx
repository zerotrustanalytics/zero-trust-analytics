'use client'

import { SidebarProvider } from './SidebarContext'
import { UsageProvider } from './UsageContext'
import { PlanProvider } from './PlanContext'
import { SiteProvider } from './SiteContext'
import { SidebarSwitcher } from './SidebarSwitcher'
import { MainContent } from './MainContent'

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <SiteProvider>
        <UsageProvider>
          <PlanProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
              <SidebarSwitcher />
              <MainContent>{children}</MainContent>
            </div>
          </PlanProvider>
        </UsageProvider>
      </SiteProvider>
    </SidebarProvider>
  )
}
