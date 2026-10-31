import { NextResponse, type NextRequest } from 'next/server'

// Auth mode is inlined at build time.
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'oidc'

// Routes reachable without a session.
const PUBLIC_ROUTES = [
  /^\/$/,
  /^\/sign-in/,
  /^\/sign-up/,
  /^\/accept-invite/,
  /^\/shared\//, // public read-only dashboards (access is by share token)
  /^\/api\/health/,
  /^\/api\/auth\//, // Auth.js endpoints (session, signin, callback, csrf, ...)
]

// Presence check for the Auth.js session cookie. Full cryptographic
// verification happens server-side (route handlers) and in the ZTA API
// (AUTH_MODE=oidc verifies the gatekeep JWT); the middleware only gates
// navigation to protected pages.
function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get('authjs.session-token') || req.cookies.get('__Secure-authjs.session-token')
  )
}

export default function proxy(req: NextRequest) {
  // Only the OIDC (gatekeep) multi-user mode gates via session cookie.
  // none/password self-host modes are handled client-side by AuthProvider.
  if (AUTH_MODE !== 'oidc') return NextResponse.next()

  const { pathname } = req.nextUrl
  if (PUBLIC_ROUTES.some((re) => re.test(pathname))) return NextResponse.next()

  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
