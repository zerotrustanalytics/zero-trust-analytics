'use client'

import { SiteList } from '@/components/dashboard'
import { useSites } from '@/hooks'

export default function SitesPage() {
  const { sites, loading, addSite } = useSites()

  const handleSiteAdded = (site: { id: string; domain: string; name: string }) => {
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
