import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { JWT } from 'next-auth/jwt'
import { createTokenRefresher } from '@/lib/gatekeep-tokens'

const ISSUER = 'https://id.example.test'
const now = () => Math.floor(Date.now() / 1000)

// Minimal gatekeep: discovery + a /token endpoint that rotates refresh tokens
// and, like gatekeep, rejects reuse of a consumed refresh token.
function mockGatekeep() {
  const consumed = new Set<string>()
  let n = 0
  const tokenCalls: string[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify({ token_endpoint: `${ISSUER}/token` }))
    }
    const form = new URLSearchParams(init?.body as string)
    const rt = form.get('refresh_token') as string
    tokenCalls.push(rt)
    if (consumed.has(rt)) {
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'refresh token replay (family revoked)' }), { status: 400 })
    }
    consumed.add(rt)
    n++
    return new Response(JSON.stringify({ id_token: `id_${n}`, refresh_token: `rt_${n}`, expires_in: 900 }))
  })
  return { fetchMock, tokenCalls }
}

describe('gatekeep token refresh', () => {
  let gk: ReturnType<typeof mockGatekeep>

  beforeEach(() => {
    gk = mockGatekeep()
    vi.stubGlobal('fetch', gk.fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('leaves a fresh token alone', async () => {
    const ensureFresh = createTokenRefresher(ISSUER, 'zta')
    const token: JWT = { idToken: 'id_0', refreshToken: 'rt_0', expiresAt: now() + 600 }
    expect(await ensureFresh(token)).toBe(token)
    expect(gk.fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes a token about to expire', async () => {
    const ensureFresh = createTokenRefresher(ISSUER, 'zta')
    const out = await ensureFresh({ idToken: 'id_0', refreshToken: 'rt_0', expiresAt: now() + 30 })
    expect(out.idToken).toBe('id_1')
    expect(out.refreshToken).toBe('rt_1')
    expect(out.expiresAt).toBeGreaterThan(now() + 800)
    expect(out.error).toBeUndefined()
  })

  it('shares one refresh between concurrent requests (no replay revocation)', async () => {
    const ensureFresh = createTokenRefresher(ISSUER, 'zta')
    const stale: JWT = { idToken: 'id_0', refreshToken: 'rt_0', expiresAt: now() - 5 }
    const results = await Promise.all([ensureFresh(stale), ensureFresh(stale), ensureFresh(stale)])
    expect(gk.tokenCalls).toEqual(['rt_0'])
    expect(results.every((r) => r.idToken === 'id_1' && !r.error)).toBe(true)

    // A request arriving just after, still carrying the old cookie, reuses the result
    const late = await ensureFresh(stale)
    expect(late.idToken).toBe('id_1')
    expect(gk.tokenCalls).toEqual(['rt_0'])
  })

  it('flags RefreshTokenError when gatekeep rejects the refresh', async () => {
    const ensureFresh = createTokenRefresher(ISSUER, 'zta')
    await ensureFresh({ refreshToken: 'rt_0', expiresAt: now() - 5 })
    // A different process/session replaying the consumed token
    const fresh = createTokenRefresher(ISSUER, 'zta')
    const out = await fresh({ refreshToken: 'rt_0', expiresAt: now() - 5 })
    expect(out.error).toBe('RefreshTokenError')
  })

  it('flags RefreshTokenError when there is no refresh token', async () => {
    const ensureFresh = createTokenRefresher(ISSUER, 'zta')
    const out = await ensureFresh({ idToken: 'id_0', expiresAt: now() - 5 })
    expect(out.error).toBe('RefreshTokenError')
    expect(gk.fetchMock).not.toHaveBeenCalled()
  })
})
