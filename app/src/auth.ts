/**
 * Auth.js (next-auth v5) configuration — gatekeep OIDC.
 *
 * gatekeep is a standards-compliant OpenID Connect provider (WebAuthn passkeys,
 * EdDSA-signed JWTs). ZTA is a PUBLIC OIDC client (PKCE, no client secret), so
 * we authenticate via Authorization Code + PKCE and keep the gatekeep id_token
 * in the Auth.js session so the dashboard can call ZTA's API with it as a Bearer
 * token (verified server-side by lib/auth.js AUTH_MODE=oidc).
 *
 * Env:
 *   GATEKEEP_ISSUER     - gatekeep canonical URL (discovery at <issuer>/.well-known/openid-configuration)
 *   GATEKEEP_CLIENT_ID  - client_id registered in gatekeep's clients.toml (default "zta")
 *   AUTH_SECRET         - Auth.js session-cookie signing secret
 */
import NextAuth from 'next-auth'

const issuer = process.env.GATEKEEP_ISSUER ?? ''
const clientId = process.env.GATEKEEP_CLIENT_ID ?? 'zta'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    {
      id: 'gatekeep',
      name: 'gatekeep',
      type: 'oidc',
      issuer,
      clientId,
      // Public client: PKCE, no secret. token_endpoint_auth_method=none tells
      // Auth.js not to send client credentials to gatekeep's /token endpoint.
      clientSecret: '',
      client: { token_endpoint_auth_method: 'none' },
      checks: ['pkce', 'state'],
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the gatekeep id_token + stable subject on first sign-in.
      if (account) {
        token.idToken = account.id_token
        token.gatekeepSub = (account.providerAccountId as string) ?? (profile?.sub as string)
      }
      return token
    },
    async session({ session, token }) {
      // Expose the id_token + subject to the client (used by useApi -> Bearer).
      ;(session as { idToken?: string }).idToken = token.idToken as string | undefined
      if (session.user) {
        ;(session.user as { sub?: string }).sub = token.gatekeepSub as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: '/sign-in',
  },
})
