import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    idToken?: string
    user?: {
      sub?: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    idToken?: string
    gatekeepSub?: string
  }
}
