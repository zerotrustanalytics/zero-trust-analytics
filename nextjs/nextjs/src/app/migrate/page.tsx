'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function MigratePage() {
  const { getToken } = useAuth()
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const runMigration = async () => {
    setLoading(true)
    setResult('Running migration...')

    try {
      const token = await getToken()
      const res = await fetch('https://ztas.io/api/migrate-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await res.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setResult(`Error: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">User Migration</h1>
      <p className="mb-4 text-gray-600">
        This will migrate your data from the dev user to your production user.
      </p>

      <button
        onClick={runMigration}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run Migration'}
      </button>

      {result && (
        <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto text-sm">
          {result}
        </pre>
      )}
    </div>
  )
}
