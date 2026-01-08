'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth, SignInButton } from '@clerk/nextjs'
import { Button, Card } from '@/components/ui'

interface InviteDetails {
  invite: {
    email: string
    role: string
    expiresAt: string
  }
  team: {
    name: string
  }
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

  useEffect(() => {
    if (!token) {
      setError('No invite token provided')
      setLoading(false)
      return
    }

    fetchInviteDetails()
  }, [token])

  async function fetchInviteDetails() {
    try {
      const res = await fetch(`${apiUrl}/api/invite?token=${token}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid or expired invite')
        return
      }

      setInvite(data)
    } catch {
      setError('Failed to load invite details')
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    if (!token) return

    setProcessing(true)
    setError(null)

    try {
      const authToken = await getToken()
      const res = await fetch(`${apiUrl}/api/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, action: 'accept' }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite')
        return
      }

      setSuccess(`You've joined ${invite?.team.name}!`)
      setTimeout(() => {
        router.push('/dashboard/team')
      }, 2000)
    } catch {
      setError('Failed to accept invite')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDecline() {
    if (!token) return

    setProcessing(true)
    setError(null)

    try {
      const authToken = await getToken()
      const res = await fetch(`${apiUrl}/api/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, action: 'decline' }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to decline invite')
        return
      }

      setSuccess('Invite declined')
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch {
      setError('Failed to decline invite')
    } finally {
      setProcessing(false)
    }
  }

  if (loading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <svg
            className="w-16 h-16 mx-auto text-red-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 className="text-xl font-bold mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <svg
            className="w-16 h-16 mx-auto text-green-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <h1 className="text-xl font-bold mb-2">{success}</h1>
          <p className="text-muted-foreground">Redirecting...</p>
        </Card>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <svg
            className="w-16 h-16 mx-auto text-primary mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h1 className="text-xl font-bold mb-2">Team Invitation</h1>
          <p className="text-muted-foreground mb-2">
            You&apos;ve been invited to join <strong>{invite?.team.name}</strong>
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in or create an account to accept this invitation.
          </p>
          <SignInButton mode="modal" forceRedirectUrl={`/accept-invite?token=${token}`}>
            <Button className="w-full">Sign In to Continue</Button>
          </SignInButton>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-6">
          <svg
            className="w-16 h-16 mx-auto text-primary mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h1 className="text-xl font-bold mb-2">Team Invitation</h1>
          <p className="text-muted-foreground">
            You&apos;ve been invited to join a team
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">Team</span>
              <p className="font-semibold">{invite?.team.name}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Your Role</span>
              <p className="font-semibold">{roleLabels[invite?.invite.role || ''] || invite?.invite.role}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Invited Email</span>
              <p className="font-semibold">{invite?.invite.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Expires</span>
              <p className="font-semibold">
                {invite?.invite.expiresAt
                  ? new Date(invite.invite.expiresAt).toLocaleDateString()
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={processing}
          >
            Decline
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Accept Invitation'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}
