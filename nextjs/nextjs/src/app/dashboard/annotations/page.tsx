'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface Annotation {
  id: string
  title: string
  description: string
  date: string
  category: 'release' | 'campaign' | 'incident' | 'other'
  createdAt: string
  siteId: string
}

interface Site {
  id: string
  domain: string
  name?: string
}

const categoryColors = {
  release: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  campaign: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  incident: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
}

export default function AnnotationsPage() {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<Annotation['category']>('other')
  const [saving, setSaving] = useState(false)

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (res.ok && data.sites) {
        setSites(data.sites)
        if (data.sites.length > 0 && !selectedSiteId) {
          setSelectedSiteId(data.sites[0].id)
        }
      }
    } catch {
      console.error('Failed to fetch sites')
    }
  }, [getToken, selectedSiteId])

  const fetchAnnotations = useCallback(async () => {
    if (!selectedSiteId) {
      setLoading(false)
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/annotations?siteId=${selectedSiteId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch annotations')
        return
      }

      setAnnotations(data.annotations || [])
    } catch {
      setError('Failed to load annotations')
    } finally {
      setLoading(false)
    }
  }, [getToken, selectedSiteId])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  useEffect(() => {
    if (selectedSiteId) {
      setLoading(true)
      setError('')
      fetchAnnotations()
    }
  }, [selectedSiteId, fetchAnnotations])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDate('')
    setCategory('other')
    setEditingAnnotation(null)
  }

  const handleOpenModal = (annotation?: Annotation) => {
    if (annotation) {
      setEditingAnnotation(annotation)
      setTitle(annotation.title)
      setDescription(annotation.description)
      setDate(annotation.date)
      setCategory(annotation.category)
    } else {
      resetForm()
      setDate(new Date().toISOString().split('T')[0])
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSiteId) {
      alert('Please select a site first')
      return
    }

    setSaving(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      if (editingAnnotation) {
        // Update
        const res = await fetch(`${apiUrl}/api/annotations`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingAnnotation.id,
            siteId: selectedSiteId,
            title,
            description,
            date,
            category,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          alert(data.error || 'Failed to update annotation')
          return
        }

        setAnnotations(annotations.map(a =>
          a.id === editingAnnotation.id
            ? { ...a, title, description, date, category }
            : a
        ))
      } else {
        // Create
        const res = await fetch(`${apiUrl}/api/annotations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siteId: selectedSiteId,
            title,
            description,
            date,
            category,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          alert(data.error || 'Failed to create annotation')
          return
        }

        setAnnotations([data.annotation, ...annotations])
      }
      handleCloseModal()
    } catch {
      alert('Failed to save annotation')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (annotationId: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/annotations?id=${annotationId}&siteId=${selectedSiteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        setAnnotations(annotations.filter(a => a.id !== annotationId))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete annotation')
      }
    } catch {
      alert('Failed to delete annotation')
    }
  }

  const sortedAnnotations = [...annotations].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  if (loading && sites.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Annotations</h1>
          <p className="text-muted-foreground">Add notes and markers to your analytics timeline.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          disabled={!selectedSiteId}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Annotation
        </button>
      </div>

      {/* Site Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Site</label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          <option value="">Select a site...</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name || site.domain}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {!selectedSiteId ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <h3 className="font-medium mb-2">Select a site</h3>
          <p className="text-muted-foreground">Choose a site above to view and manage annotations.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : sortedAnnotations.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <h3 className="font-medium mb-2">No annotations yet</h3>
          <p className="text-muted-foreground mb-4">Add your first annotation to mark important events.</p>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Add Annotation
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedAnnotations.map((annotation) => (
            <div
              key={annotation.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{annotation.title}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${categoryColors[annotation.category]}`}>
                      {annotation.category}
                    </span>
                  </div>
                  {annotation.description && (
                    <p className="text-sm text-muted-foreground mb-2">{annotation.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(annotation.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenModal(annotation)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(annotation.id)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-600"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingAnnotation ? 'Edit Annotation' : 'Add Annotation'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Product Launch"
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the event..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Annotation['category'])}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      <option value="release">Release</option>
                      <option value="campaign">Campaign</option>
                      <option value="incident">Incident</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingAnnotation ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
