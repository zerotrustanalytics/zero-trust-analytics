'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * RouteAnnouncer - Announces route changes to screen readers
 *
 * This component provides an accessible way to announce page navigation
 * to users of assistive technology. It uses an ARIA live region to
 * announce the new page title when the route changes.
 */
export function RouteAnnouncer() {
  const pathname = usePathname()
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    // Get the page title after navigation
    // Use a small delay to ensure the title has been updated
    const timer = setTimeout(() => {
      const title = document.title || 'Page'
      setAnnouncement(`Navigated to ${title}`)
    }, 100)

    return () => clearTimeout(timer)
  }, [pathname])

  // Clear announcement after it's been read
  useEffect(() => {
    if (announcement) {
      const timer = setTimeout(() => setAnnouncement(''), 1000)
      return () => clearTimeout(timer)
    }
  }, [announcement])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  )
}
