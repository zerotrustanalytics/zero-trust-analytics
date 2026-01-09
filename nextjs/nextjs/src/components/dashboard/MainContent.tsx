'use client'

import { clsx } from 'clsx'
import { useSidebar } from './SidebarContext'

interface MainContentProps {
  children: React.ReactNode
}

export function MainContent({ children }: MainContentProps) {
  const { collapsed } = useSidebar()

  return (
    <main
      id="main-content"
      className={clsx(
        'p-4 md:p-8 transition-all duration-300',
        collapsed ? 'md:ml-16' : 'md:ml-64'
      )}
      role="main"
      tabIndex={-1}
    >
      {children}
    </main>
  )
}
