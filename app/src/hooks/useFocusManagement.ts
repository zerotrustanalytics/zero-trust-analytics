'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * useFocusManagement - Manages focus on route changes
 *
 * This hook ensures that when users navigate between routes,
 * focus is moved to the main content area. This is essential
 * for keyboard and screen reader users who would otherwise
 * have to tab through the entire page from the beginning.
 */
export function useFocusManagement() {
  const pathname = usePathname()
  const previousPathname = useRef<string | null>(null)
  const isFirstMount = useRef(true)

  useEffect(() => {
    // Skip on initial mount - don't steal focus when page first loads
    if (isFirstMount.current) {
      isFirstMount.current = false
      previousPathname.current = pathname
      return
    }

    // If route changed, move focus to main content
    if (previousPathname.current !== pathname) {
      const mainContent = document.getElementById('main-content')
      if (mainContent) {
        // Use setTimeout to ensure the new page content has rendered
        setTimeout(() => {
          mainContent.focus({ preventScroll: false })
          // Scroll to top of main content
          mainContent.scrollIntoView({ behavior: 'instant', block: 'start' })
        }, 0)
      }
      previousPathname.current = pathname
    }
  }, [pathname])
}
