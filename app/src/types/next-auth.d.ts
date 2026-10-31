import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    idToken?: string
    error?: 'RefreshTokenError'
    user?: {
      sub?: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    idToken?: string
    refreshToken?: string
    expiresAt?: number
    gatekeepSub?: string
    error?: 'RefreshTokenError'
  }
}
