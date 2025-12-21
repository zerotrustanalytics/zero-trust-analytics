'use client'

import { SiteList } from '@/components/dashboard'
import { useSites } from '@/hooks'

export default function DashboardPage() {
  const { sites, loading, addSite } = useSites()

  const handleSiteAdded = (site: { id: string; domain: string; name: string }) => {
    // Site already added via hook, just refresh if needed
    console.log('Site added:', site)
  }

  return (
    <SiteList
      sites={sites.map((site) => ({
        ...site,
        status: 'active' as const,
      }))}
      loading={loading}
      onSiteAdded={handleSiteAdded}
    />
  )
}
