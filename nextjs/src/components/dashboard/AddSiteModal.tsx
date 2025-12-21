'use client'

import { useState } from 'react'
import { Modal, ModalFooter, Button, Input, Alert } from '@/components/ui'

interface AddSiteModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (site: { id: string; domain: string; name: string }) => void
}

export function AddSiteModal({ isOpen, onClose, onSuccess }: AddSiteModalProps) {
  const [domain, setDomain] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validateDomain = (value: string): boolean => {
    // Basic domain validation
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    return domainRegex.test(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

    if (!cleanDomain) {
      setError('Domain is required')
      return
    }

    if (!validateDomain(cleanDomain)) {
      setError('Please enter a valid domain (e.g., example.com)')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: cleanDomain,
          name: name || cleanDomain,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add site')
        return
      }

      onSuccess?.(data.site)
      handleClose()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setDomain('')
    setName('')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Site"
      description="Enter your website details to start tracking analytics"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Domain"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          disabled={loading}
          hint="Enter your domain without http:// or https://"
        />

        <Input
          label="Site Name (optional)"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Website"
          disabled={loading}
          hint="A friendly name to identify your site"
        />

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Add Site
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
