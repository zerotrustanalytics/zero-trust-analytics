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
import Link from 'next/link'
import type { Session } from 'next-auth'
import { useSession, getSession, signIn as naSignIn, signOut as naSignOut } from 'next-auth/react'

// Self-hosted modes (none/password) have no gatekeep session: access is
// handled by the server (and AuthProvider's password gate), so the client acts
// as the single local user. Inlined at build time.
const LOCAL_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE || 'oidc') !== 'oidc'
const LOCAL_TOKEN = 'self-hosted'

// --- hooks -----------------------------------------------------------------

// Seconds until a JWT's exp claim (no signature check — only to decide when to
// ask the server for a refreshed session).
function secondsUntilExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp - Date.now() / 1000
  } catch {
    return 0
  }
}

/**
 * The gatekeep id_token (Bearer for ZTA's API). It lives 15 minutes; the
 * session cached in the browser can be older than that, so when it is about to
 * expire, fetch the session again — the server refreshes it (src/auth.ts). If
 * refreshing failed, the gatekeep session is over: sign in again.
 */
async function freshIdToken(cached: Session | null): Promise<string | null> {
  let session = cached
  if (!session?.idToken || secondsUntilExpiry(session.idToken) < 30) {
    session = await getSession()
  }
  if (session?.error === 'RefreshTokenError') {
    await naSignIn('gatekeep', { callbackUrl: window.location.href })
    return null
  }
  return session?.idToken ?? null
}

const localGetToken = async () => LOCAL_TOKEN
const signOutGatekeep = () => naSignOut()
const signOutLocal = () => Promise.resolve()

export function useAuth() {
  const { data, status } = useSession()

  // getToken MUST keep the same identity across renders: components list it
  // in useEffect/useCallback deps (as with Clerk's stable getToken), and a new
  // function per render makes every data-loading effect re-run forever. It
  // reads the latest session through a ref instead.
  const sessionRef = React.useRef(data)
  React.useEffect(() => {
    sessionRef.current = data
  })
  const getToken = React.useCallback(() => freshIdToken(sessionRef.current), [])

  if (LOCAL_MODE) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: 'self-hosted-user',
      getToken: localGetToken,
      signOut: signOutLocal,
    }
  }
  return {
    isLoaded: status !== 'loading',
    isSignedIn: status === 'authenticated',
    userId: (data?.user as { sub?: string } | undefined)?.sub ?? null,
    // ZTA's API expects the gatekeep id_token as a Bearer token.
    getToken,
    signOut: signOutGatekeep,
  }
}

export function useUser() {
  const { data, status } = useSession()
  if (LOCAL_MODE) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'self-hosted-user',
        fullName: 'Admin',
        firstName: 'Admin',
        imageUrl: null,
        primaryEmailAddress: { emailAddress: 'admin@localhost' },
        emailAddresses: [{ emailAddress: 'admin@localhost' }],
      },
    }
  }
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
  return LOCAL_MODE || status === 'authenticated' ? <>{children}</> : null
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  return !LOCAL_MODE && status === 'unauthenticated' ? <>{children}</> : null
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

// Full-page sign-in / sign-up screens (ZTA × Tally "auth" layout). gatekeep
// hosts the passkey ceremony, so both screens offer one action that starts
// the OIDC redirect; gatekeep handles sign-in and passkey enrollment alike.
type AuthScreenProps = { mode: 'in' | 'up'; next?: string }

function AuthScreen({ mode, next }: AuthScreenProps) {
  const [busy, setBusy] = React.useState(false)
  const start = () => {
    setBusy(true)
    startSignIn(next)
  }
  const signUp = mode === 'up'
  return (
    <main className="auth" id="main-content">
      <section className="auth-l">
        <a href="https://ztas.io" className="logo" aria-label="ZTA home">
          <img src="/tally/zta-mark.svg" alt="" width={36} height={36} />
          <b>ZTA</b>
        </a>
        <div className="stack" style={{ gap: 20, maxWidth: 440, margin: 'auto 0' }}>
          <h1 className="h1">{signUp ? 'Start counting.' : 'Welcome back.'}</h1>
          <p className="lead">
            {signUp
              ? 'Create your account with a passkey. No password to remember, nothing to leak.'
              : 'Sign in with your passkey to see your sites.'}
          </p>
          <button type="button" className="btn btn-go" onClick={start} disabled={busy}>
            {busy ? 'Opening sign-in…' : 'Continue with passkey'}
          </button>
          <p className="sm muted">
            {signUp ? (
              <>Already have an account? <Link className="link" href="/sign-in">Sign in</Link></>
            ) : (
              <>New to ZTA? <Link className="link" href="/sign-up">Create an account</Link></>
            )}
          </p>
        </div>
        <p className="xs faint">
          Free plan, unlimited sites. <a className="link" href="https://ztas.io/privacy-policy/">Privacy</a>
        </p>
      </section>
      <section className="auth-r" aria-hidden="true">
        <p className="bubble">{signUp ? 'Nice to not meet you.' : 'Good to sense you again.'}</p>
        <img src="/tally/tally-wave.svg" alt="" width={260} height={244} />
      </section>
    </main>
  )
}

export function SignIn({ afterSignInUrl }: { afterSignInUrl?: string; [k: string]: unknown }) {
  return <AuthScreen mode="in" next={afterSignInUrl} />
}

export function SignUp({ afterSignUpUrl }: { afterSignUpUrl?: string; [k: string]: unknown }) {
  return <AuthScreen mode="up" next={afterSignUpUrl} />
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
        className="w-8 h-8 rounded-full bg-primary text-on-accent border-[1.5px] border-line flex items-center justify-center text-sm font-display font-semibold"
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
