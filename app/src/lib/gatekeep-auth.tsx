'use client'

/**
 * Clerk-compatibility shim backed by Auth.js (gatekeep OIDC).
 *
 * The dashboard was written against @clerk/nextjs. Rather than rewrite every
 * consumer, this module re-implements the small Clerk surface the app uses
 * (useAuth, useUser, SignedIn/SignedOut, SignInButton/SignUpButton, UserButton,
 * SignIn/SignUp) on top of next-auth/react, with the same call signatures — so
 * migrating a file is just swapping the import path.
 *
 * Login/enrollment happens at gatekeep (passkeys); signIn('gatekeep') kicks off
 * the OIDC Authorization Code + PKCE redirect.
 */
import * as React from 'react'
import { useSession, signIn as naSignIn, signOut as naSignOut } from 'next-auth/react'

// --- hooks -----------------------------------------------------------------

export function useAuth() {
  const { data, status } = useSession()
  return {
    isLoaded: status !== 'loading',
    isSignedIn: status === 'authenticated',
    userId: (data?.user as { sub?: string } | undefined)?.sub ?? null,
    // ZTA's API expects the gatekeep id_token as a Bearer token.
    getToken: async () => (data as { idToken?: string } | null)?.idToken ?? null,
    signOut: () => naSignOut(),
  }
}

export function useUser() {
  const { data, status } = useSession()
  const u = data?.user
  return {
    isLoaded: status !== 'loading',
    isSignedIn: status === 'authenticated',
    user: u
      ? {
          id: (u as { sub?: string }).sub ?? null,
          fullName: u.name ?? null,
          firstName: u.name?.split(' ')[0] ?? null,
          imageUrl: u.image ?? null,
          primaryEmailAddress: u.email ? { emailAddress: u.email } : null,
          emailAddresses: u.email ? [{ emailAddress: u.email }] : [],
        }
      : null,
  }
}

// --- conditional renderers -------------------------------------------------

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  return status === 'authenticated' ? <>{children}</> : null
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  return status === 'unauthenticated' ? <>{children}</> : null
}

// --- sign-in / sign-up triggers -------------------------------------------

type SignButtonProps = {
  children?: React.ReactNode
  mode?: 'modal' | 'redirect'
  forceRedirectUrl?: string
  afterSignInUrl?: string
  afterSignUpUrl?: string
}

function startSignIn(callbackUrl?: string) {
  return naSignIn('gatekeep', { callbackUrl: callbackUrl || '/dashboard' })
}

// Clerk's <SignInButton>/<SignUpButton> wrap a child that becomes clickable.
// gatekeep handles both sign-in and passkey enrollment in one flow.
export function SignInButton({ children, forceRedirectUrl, afterSignInUrl }: SignButtonProps) {
  const onClick = () => startSignIn(forceRedirectUrl || afterSignInUrl)
  if (children) {
    return (
      <span onClick={onClick} style={{ display: 'contents', cursor: 'pointer' }}>
        {children}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick}>
      Sign in
    </button>
  )
}

export function SignUpButton({ children, forceRedirectUrl, afterSignUpUrl }: SignButtonProps) {
  const onClick = () => startSignIn(forceRedirectUrl || afterSignUpUrl)
  if (children) {
    return (
      <span onClick={onClick} style={{ display: 'contents', cursor: 'pointer' }}>
        {children}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick}>
      Sign up
    </button>
  )
}

// Full-page Clerk widgets: gatekeep hosts the passkey UI, so just redirect.
export function SignIn({ afterSignInUrl }: { afterSignInUrl?: string; [k: string]: unknown }) {
  React.useEffect(() => {
    startSignIn(afterSignInUrl)
  }, [afterSignInUrl])
  return <RedirectingNotice />
}

export function SignUp({ afterSignUpUrl }: { afterSignUpUrl?: string; [k: string]: unknown }) {
  React.useEffect(() => {
    startSignIn(afterSignUpUrl)
  }, [afterSignUpUrl])
  return <RedirectingNotice />
}

function RedirectingNotice() {
  return (
    <div className="text-center text-gray-600 dark:text-gray-400">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
      Redirecting to sign in…
    </div>
  )
}

// --- user menu (Clerk <UserButton/>) --------------------------------------

export function UserButton({ afterSignOutUrl = '/' }: { afterSignOutUrl?: string; [k: string]: unknown }) {
  const { data } = useSession()
  const [open, setOpen] = React.useState(false)
  const email = data?.user?.email ?? ''
  const initial = (data?.user?.name?.[0] || email[0] || 'U').toUpperCase()

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 bottom-10 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-2 z-50">
          {email && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate">{email}</div>
          )}
          <button
            type="button"
            onClick={() => naSignOut({ callbackUrl: afterSignOutUrl })}
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export { SessionProvider } from 'next-auth/react'
