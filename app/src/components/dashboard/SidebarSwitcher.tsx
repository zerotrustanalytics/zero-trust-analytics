'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { SiteSidebar } from './SiteSidebar'
import { useSiteContext } from './SiteContext'

export function SidebarSwitcher() {
  const pathname = usePathname()
  const { activeSite } = useSiteContext()

  // Use pathname as primary signal to avoid flash on navigation
  const isSiteRoute = /^\/dashboard\/sites\/[^/]+/.test(pathname)

  if (isSiteRoute && activeSite) {
    return <SiteSidebar />
  }

  return <Sidebar />
}
