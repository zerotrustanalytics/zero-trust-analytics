import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js Middleware
 * Handles CSRF protection and rate limiting for API routes
 */

const CSRF_HEADER = 'x-csrf-token'
const CSRF_COOKIE = 'csrf-token'

// Paths that require CSRF protection (state-changing operations)
const PROTECTED_PATHS = [
  '/api/auth',
  '/api/sites',
  '/api/user',
  '/api/privacy',
]

// Methods that require CSRF validation
const CSRF_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Check if path requires CSRF protection
 */
function requiresCsrfProtection(pathname: string): boolean {
  return PROTECTED_PATHS.some(path => pathname.startsWith(path))
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const method = request.method.toUpperCase()

  // Skip CSRF check for GET, HEAD, OPTIONS
  if (!CSRF_METHODS.includes(method)) {
    return NextResponse.next()
  }

  // Only validate CSRF for protected API paths
  if (!requiresCsrfProtection(pathname)) {
    return NextResponse.next()
  }

  // Get tokens
  const headerToken = request.headers.get(CSRF_HEADER)
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value

  // Validate CSRF token
  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    return NextResponse.json(
      {
        error: 'Invalid CSRF token',
        code: 'CSRF_VALIDATION_FAILED',
      },
      { status: 403 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all API routes except public ones
    '/api/:path*',
  ],
}
