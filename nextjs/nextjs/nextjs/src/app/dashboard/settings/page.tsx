'use client'

import { useState } from 'react'
import { useUser, useAuth } from '@clerk/nextjs'

export default function SettingsPage() {
  const { user } = useUser()
  const { getToken, signOut } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const exportData = async () => {
    setExporting(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/user/export`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to export data')
        return
      }

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zta-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  const deleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm')
      return
    }

    setDeleting(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/user/delete`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete account')
        return
      }

      await signOut()
      window.location.href = '/'
    } catch {
      alert('Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Account Settings</h1>
      <p className="text-muted-foreground mb-8">Manage your account and preferences</p>

      {/* Profile Section */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="Profile" className="w-16 h-16 rounded-full" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <p className="font-medium">{user?.fullName || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            To update your profile, click on your avatar in the sidebar.
          </p>
        </div>
      </section>

      {/* Data Export Section */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Export Your Data</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download all your analytics data, sites, and settings in JSON format.
        </p>
        <button
          onClick={exportData}
          disabled={exporting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export Data'}
        </button>
      </section>

      {/* Account Info Section */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account Information</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono">{user?.id?.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Sign In</span>
            <span>{user?.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : '-'}</span>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800 p-6">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Type DELETE to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
