'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Input, Card, Alert, Modal, ModalFooter } from '@/components/ui'
import { useAuth, useUser } from '@/lib/gatekeep-auth'
import { isSelfHostedMode } from '@/components/auth/AuthProvider'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
// Sign-in, passkeys and devices are managed by gatekeep, not by ZTA.
const gatekeepUrl = process.env.NEXT_PUBLIC_GATEKEEP_ISSUER ?? 'https://id.gatekeepauth.com'

export default function SettingsPage() {
  const { getToken, signOut } = useAuth()
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const handleExport = async () => {
    setExporting(true)
    setMessage(null)
    try {
      const res = await fetch(`${apiUrl}/api/user/export`, { headers: await authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed')
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `zta-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed' })
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setMessage(null)
    try {
      const res = await fetch(`${apiUrl}/api/user/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        // The typed email already matched (case-insensitively); send the
        // account's own spelling, which the server compares exactly.
        body: JSON.stringify({ confirmEmail: email, confirmDelete: 'DELETE_MY_ACCOUNT' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Deletion failed')
      await signOut()
      window.location.href = 'https://ztas.io'
    } catch (err) {
      setDeleteOpen(false)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Deletion failed' })
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Account Settings</h1>

      {message && (
        <Alert variant={message.type} className="mb-6">
          {message.text}
        </Alert>
      )}

      {/* Sign-in */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Sign-in</h2>
        {isSelfHostedMode ? (
          <p className="text-muted-foreground">
            This is a self-hosted install. Access is controlled by the server, so there are no
            individual accounts to manage here.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-1">Email</p>
            <p className="font-medium mb-4">{email || '—'}</p>
            <p className="text-muted-foreground mb-4">
              You sign in with a passkey through gatekeep. There is no password to change. Add or
              remove passkeys and devices in your gatekeep account.
            </p>
            <a href={gatekeepUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">Manage passkeys</Button>
            </a>
          </>
        )}
      </Card>

      {/* Integrations */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Integrations</h2>
        <p className="text-muted-foreground mb-4">
          Connect external services like Google Search Console to view organic search keywords and rankings alongside your analytics.
        </p>
        <Link href="/dashboard/settings/integrations">
          <Button variant="outline">
            Manage Integrations
          </Button>
        </Link>
      </Card>

      {/* White-Label Branding */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">White-Label Branding</h2>
        <p className="text-muted-foreground mb-4">
          Customize reports and shared dashboards with your own company branding. Remove Zero Trust Analytics branding and replace it with your logo and colors.
        </p>
        <Link href="/dashboard/settings/branding">
          <Button variant="outline">
            Configure Branding
          </Button>
        </Link>
      </Card>

      {/* Your data (hosted accounts; a self-hosted operator owns the database) */}
      {!isSelfHostedMode && (
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Your Data</h2>
        <p className="text-muted-foreground mb-4">
          Download everything ZTA stores about your account and sites as a JSON file.
        </p>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Export my data'}
        </Button>
      </Card>
      )}

      {/* Danger Zone */}
      {!isSelfHostedMode && (
        <Card className="p-6 border-red-200 dark:border-red-900">
          <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
          <p className="text-muted-foreground mb-4">
            Deleting your account immediately and permanently erases your account, every site, and
            all of their analytics. There is no restore window.
          </p>
          <Button variant="destructive" onClick={() => { setConfirmEmail(''); setDeleteOpen(true) }}>
            Delete Account
          </Button>
        </Card>
      )}

      <Modal
        isOpen={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete your account?"
        description="This erases your account, all sites and all analytics data right away. It cannot be undone."
      >
        <label htmlFor="confirm-email" className="block text-sm font-medium mb-1">
          Type <span className="font-mono">{email}</span> to confirm
        </label>
        <Input
          id="confirm-email"
          type="email"
          autoComplete="off"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
        />
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || !email || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
          >
            {deleting ? 'Deleting…' : 'Delete everything'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
