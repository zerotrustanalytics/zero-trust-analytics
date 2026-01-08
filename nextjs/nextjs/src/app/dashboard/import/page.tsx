'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Card, Button, Alert } from '@/components/ui'

interface Site {
  id: string
  domain: string
  name?: string
}

interface ImportPreview {
  totalRows: number
  skippedRows: number
  eventsToInsert: number
  headerMapping: Record<string, string>
  unmappedHeaders: string[]
  sampleEvents: Array<Record<string, unknown>>
}

interface ImportResult {
  totalRows: number
  skippedRows: number
  eventsInserted: number
  headerMapping: Record<string, string>
  unmappedHeaders: string[]
}

export default function ImportPage() {
  const { getToken } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [fileData, setFileData] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setSites(data.sites || [])
        if (data.sites?.length > 0) {
          setSelectedSite(data.sites[0].id)
        }
      }
    } catch {
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setSuccess('')
    setPreview(null)
    setResult(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setFileData(content)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const handlePreview = async () => {
    if (!fileData || !selectedSite) return

    setImporting(true)
    setError('')

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/import/ga`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: selectedSite,
          data: fileData,
          format: fileName.endsWith('.json') ? 'json' : 'csv',
          dryRun: true
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Preview failed')
        return
      }

      setPreview(data.preview)
    } catch {
      setError('Failed to preview import')
    } finally {
      setImporting(false)
    }
  }

  const handleImport = async () => {
    if (!fileData || !selectedSite) return

    setImporting(true)
    setError('')
    setSuccess('')

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/import/ga`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: selectedSite,
          data: fileData,
          format: fileName.endsWith('.json') ? 'json' : 'csv',
          dryRun: false
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Import failed')
        return
      }

      setResult(data.imported)
      setSuccess(`Successfully imported ${data.imported.eventsInserted.toLocaleString()} events!`)
      setPreview(null)
      setFileData(null)
      setFileName('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch {
      setError('Failed to import data')
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setFileData(null)
    setFileName('')
    setPreview(null)
    setResult(null)
    setError('')
    setSuccess('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Import Google Analytics Data</h1>
        <p className="text-muted-foreground">Migrate your historical data from Google Analytics</p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
          <button onClick={() => setError('')} className="ml-4 text-sm underline">Dismiss</button>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="ml-4 text-sm underline">Dismiss</button>
        </Alert>
      )}

      {/* Instructions */}
      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">How to Export from Google Analytics</h2>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Go to <strong>Google Analytics 4</strong> &rarr; Reports</li>
          <li>Select a report (e.g., Pages and screens, Traffic acquisition)</li>
          <li>Set your desired date range</li>
          <li>Click the <strong>Share</strong> button (top right)</li>
          <li>Select <strong>Download file</strong> &rarr; <strong>Download CSV</strong></li>
          <li>Upload the CSV file below</li>
        </ol>

        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Supported formats:</strong> CSV exports from GA4 reports, including Pages, Traffic Sources,
            Geo, and Device reports. The more dimensions you include, the richer your imported data will be.
          </p>
        </div>
      </Card>

      {/* Site Selection */}
      <Card className="p-6 mb-6">
        <label className="block text-sm font-medium mb-2">
          Select Target Site
        </label>
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          disabled={importing}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name || site.domain}
            </option>
          ))}
        </select>
        {sites.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            No sites found. Please add a site first.
          </p>
        )}
      </Card>

      {/* File Upload */}
      <Card className="p-6 mb-6">
        <label className="block text-sm font-medium mb-2">
          Upload GA Export File
        </label>

        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
            disabled={importing}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer"
          >
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {fileName ? (
              <div>
                <p className="font-medium text-primary">{fileName}</p>
                <p className="text-sm text-muted-foreground mt-1">Click to select a different file</p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">CSV or JSON file from Google Analytics</p>
              </div>
            )}
          </label>
        </div>

        {fileData && !preview && !result && (
          <div className="mt-4 flex gap-3">
            <Button onClick={handlePreview} loading={importing}>
              Preview Import
            </Button>
            <Button variant="outline" onClick={resetImport} disabled={importing}>
              Clear
            </Button>
          </div>
        )}
      </Card>

      {/* Preview */}
      {preview && (
        <Card className="p-6 mb-6">
          <h2 className="font-semibold mb-4">Import Preview</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Rows</p>
              <p className="text-2xl font-bold">{preview.totalRows.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Skipped Rows</p>
              <p className="text-2xl font-bold">{preview.skippedRows.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Events to Import</p>
              <p className="text-2xl font-bold text-primary">{preview.eventsToInsert.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Mapped Fields</p>
              <p className="text-2xl font-bold">{Object.keys(preview.headerMapping).length}</p>
            </div>
          </div>

          {/* Field Mapping */}
          <div className="mb-6">
            <h3 className="text-sm font-medium mb-2">Field Mapping</h3>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(preview.headerMapping).map(([ga, zta]) => (
                  <div key={ga} className="flex justify-between">
                    <span className="text-muted-foreground">{ga}</span>
                    <span className="font-mono text-primary">&rarr; {zta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {preview.unmappedHeaders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Unmapped Headers (will be ignored)</h3>
              <div className="flex flex-wrap gap-2">
                {preview.unmappedHeaders.map((header) => (
                  <span key={header} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 rounded">
                    {header}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sample Events */}
          {preview.sampleEvents.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Sample Events (first 5)</h3>
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs">
                  {JSON.stringify(preview.sampleEvents, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleImport} loading={importing}>
              Import {preview.eventsToInsert.toLocaleString()} Events
            </Button>
            <Button variant="outline" onClick={resetImport} disabled={importing}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-semibold text-lg">Import Complete</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Rows Processed</p>
              <p className="text-2xl font-bold">{result.totalRows.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Rows Skipped</p>
              <p className="text-2xl font-bold">{result.skippedRows.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-sm text-green-600 dark:text-green-400">Events Imported</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.eventsInserted.toLocaleString()}
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={resetImport}>
            Import More Data
          </Button>
        </Card>
      )}
    </div>
  )
}
