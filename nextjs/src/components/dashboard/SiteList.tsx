'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Spinner } from '@/components/ui'
import { SiteCard, Site } from './SiteCard'
import { AddSiteModal } from './AddSiteModal'
import { TrackingSnippet } from './TrackingSnippet'

interface SiteListProps {
  sites: Site[]
  loading?: boolean
  onSiteAdded?: (site: Site) => void
}

export function SiteList({ sites, loading, onSiteAdded }: SiteListProps) {
  const router = useRouter()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSnippetModal, setShowSnippetModal] = useState(false)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)

  const handleViewAnalytics = (siteId: string) => {
    router.push(`/dashboard/sites/${siteId}`)
  }

  const handleShowSnippet = (siteId: string) => {
    const site = sites.find((s) => s.id === siteId)
    if (site) {
      setSelectedSite(site)
      setShowSnippetModal(true)
    }
  }

  const handleSettings = (siteId: string) => {
    router.push(`/dashboard/sites/${siteId}/settings`)
  }

  const handleSiteAdded = (site: { id: string; domain: string; name: string }) => {
    onSiteAdded?.({
      ...site,
      pageviews: 0,
      visitors: 0,
      status: 'pending',
    })
    setShowAddModal(false)

    // Show snippet modal for new site
    setSelectedSite({
      ...site,
      pageviews: 0,
      visitors: 0,
    })
    setShowSnippetModal(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Your Sites</h1>
        <Button onClick={() => setShowAddModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Site
        </Button>
      </div>

      {sites.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-border">
          <svg
            className="w-16 h-16 mx-auto text-muted-foreground mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
          <h2 className="text-xl font-medium mb-2">No sites yet</h2>
          <p className="text-muted-foreground mb-6">
            Get started by adding your first site to track
          </p>
          <Button onClick={() => setShowAddModal(true)} size="lg">
            Add Your First Site
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onViewAnalytics={handleViewAnalytics}
              onShowSnippet={handleShowSnippet}
              onSettings={handleSettings}
            />
          ))}
        </div>
      )}

      <AddSiteModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleSiteAdded}
      />

      <TrackingSnippet
        isOpen={showSnippetModal}
        onClose={() => {
          setShowSnippetModal(false)
          setSelectedSite(null)
        }}
        siteId={selectedSite?.id || ''}
        domain={selectedSite?.domain}
      />
    </div>
  )
}
