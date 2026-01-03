'use client'

import { useState } from 'react'
import { Button, Card, Input } from '@/components/ui'
import { Modal, ModalFooter } from '@/components/ui/Modal'

interface Annotation {
  id: string
  title: string
  description: string
  date: string
  category: 'release' | 'campaign' | 'incident' | 'other'
  createdAt: string
}

const mockAnnotations: Annotation[] = [
  {
    id: '1',
    title: 'v2.0 Release',
    description: 'Major product update with new dashboard features',
    date: '2026-01-01',
    category: 'release',
    createdAt: '2025-12-30',
  },
  {
    id: '2',
    title: 'New Year Campaign',
    description: 'Email campaign to all subscribers',
    date: '2025-12-31',
    category: 'campaign',
    createdAt: '2025-12-29',
  },
  {
    id: '3',
    title: 'Server Migration',
    description: 'Moved to new infrastructure, brief downtime expected',
    date: '2025-12-15',
    category: 'incident',
    createdAt: '2025-12-14',
  },
]

const categoryColors = {
  release: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  campaign: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  incident: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
}

const categoryIcons = {
  release: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  campaign: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  incident: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  other: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
}

export default function AnnotationsPage() {
  const [annotations, setAnnotations] = useState<Annotation[]>(mockAnnotations)
  const [showModal, setShowModal] = useState(false)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<Annotation['category']>('other')
  const [loading, setLoading] = useState(false)

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
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingAnnotation) {
        // Update existing
        setAnnotations(annotations.map(a =>
          a.id === editingAnnotation.id
            ? { ...a, title, description, date, category }
            : a
        ))
      } else {
        // Create new
        const newAnnotation: Annotation = {
          id: Date.now().toString(),
          title,
          description,
          date,
          category,
          createdAt: new Date().toISOString(),
        }
        setAnnotations([newAnnotation, ...annotations])
      }
      handleCloseModal()
    } catch (error) {
      console.error('Save error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (annotationId: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) return
    setAnnotations(annotations.filter(a => a.id !== annotationId))
  }

  // Sort annotations by date (newest first)
  const sortedAnnotations = [...annotations].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Annotations</h1>
          <p className="text-muted-foreground">Mark important events on your analytics timeline</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Annotation
        </Button>
      </div>

      {/* Info Card */}
      <Card className="p-4 mb-6 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Annotations help you correlate traffic changes with events like product launches, marketing campaigns, or incidents.
              They appear as markers on your analytics charts.
            </p>
          </div>
        </div>
      </Card>

      {/* Timeline */}
      <div className="space-y-4">
        {sortedAnnotations.map((annotation, index) => (
          <Card key={annotation.id} className="p-4">
            <div className="flex items-start gap-4">
              {/* Timeline indicator */}
              <div className="flex flex-col items-center">
                <div className={`p-2 rounded-full ${categoryColors[annotation.category]}`}>
                  {categoryIcons[annotation.category]}
                </div>
                {index < sortedAnnotations.length - 1 && (
                  <div className="w-0.5 h-full min-h-[40px] bg-gray-200 dark:bg-gray-700 mt-2" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{annotation.title}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${categoryColors[annotation.category]}`}>
                        {annotation.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{annotation.description}</p>
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
                    <Button variant="ghost" size="sm" onClick={() => handleOpenModal(annotation)}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(annotation.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {annotations.length === 0 && (
          <Card className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h3 className="font-medium mb-2">No annotations yet</h3>
            <p className="text-muted-foreground mb-4">Add your first annotation to mark important events</p>
            <Button onClick={() => handleOpenModal()}>Add Annotation</Button>
          </Card>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingAnnotation ? 'Edit Annotation' : 'Add Annotation'}
        description={editingAnnotation ? 'Update the annotation details' : 'Mark an important event on your timeline'}
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Product Launch"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the event..."
                className="w-full px-3 py-2 border border-input rounded-md bg-background resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium mb-1">
                  Date
                </label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="category" className="block text-sm font-medium mb-1">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Annotation['category'])}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="release">Release</option>
                  <option value="campaign">Campaign</option>
                  <option value="incident">Incident</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : editingAnnotation ? 'Update' : 'Add Annotation'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
