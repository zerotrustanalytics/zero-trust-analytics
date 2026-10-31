/**
 * Keeps the gatekeep id_token in the Auth.js session fresh.
 *
 * gatekeep id_tokens live 15 minutes, but the dashboard session lasts much
 * longer and the id_token is what ZTA's API accepts as a Bearer token. When it
 * is about to expire, exchange the refresh token for a new one.
 *
 * gatekeep rotates refresh tokens and treats reuse of a consumed one as replay
 * (it revokes the whole token family, signing the user out). Several requests
 * can carry the same expiring session cookie at once (tabs, parallel fetches),
 * so concurrent refreshes of one token share a single request, and the result
 * is kept briefly for requests that arrive with the old cookie just after.
 */
import type { JWT } from 'next-auth/jwt'

// Refresh this long before the id_token expires.
export const REFRESH_LEEWAY_SEC = 60
const RESULT_TTL_MS = 60_000

export function createTokenRefresher(issuer: string, clientId: string) {
  const refreshes = new Map<string, Promise<JWT>>()

  let tokenEndpoint: Promise<string> | null = null
  function getTokenEndpoint(): Promise<string> {
    tokenEndpoint ??= fetch(`${issuer}/.well-known/openid-configuration`)
      .then((r) => r.json())
      .then((c: { token_endpoint: string }) => c.token_endpoint)
      .catch((err) => {
        tokenEndpoint = null
        throw err
      })
    return tokenEndpoint
  }

  async function refresh(token: JWT): Promise<JWT> {
    try {
      const res = await fetch(await getTokenEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken as string,
          client_id: clientId,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error_description || body.error || `HTTP ${res.status}`)
      return {
        ...token,
        idToken: body.id_token,
        refreshToken: body.refresh_token ?? token.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + Number(body.expires_in ?? 900),
        error: undefined,
      }
    } catch (err) {
      console.error('gatekeep token refresh failed:', (err as Error).message)
      return { ...token, error: 'RefreshTokenError' }
    }
  }

  /** The session token, refreshed if its id_token is (nearly) expired. */
  return function ensureFresh(token: JWT): Promise<JWT> | JWT {
    if (Date.now() / 1000 < Number(token.expiresAt ?? 0) - REFRESH_LEEWAY_SEC) return token
    if (!token.refreshToken) return { ...token, error: 'RefreshTokenError' }

    const key = token.refreshToken
    let pending = refreshes.get(key)
    if (!pending) {
      pending = refresh(token)
      refreshes.set(key, pending)
      setTimeout(() => refreshes.delete(key), RESULT_TTL_MS).unref?.()
    }
    return pending
  }
}
