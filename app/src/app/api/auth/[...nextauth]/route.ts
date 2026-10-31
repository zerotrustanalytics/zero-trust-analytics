// Auth.js route handler (session, signin, signout, callback, csrf, providers).
// In the self-hosted container the Express server must proxy /api/auth/* to
// Next (not the old function router) — see server/index.js / plan Phase 4.
import { handlers } from '@/auth'

// Self-hosted modes (none/password) have no gatekeep, so Auth.js isn't
// configured: answer "no session" instead of a configuration error.
const OIDC = (process.env.NEXT_PUBLIC_AUTH_MODE || process.env.AUTH_MODE || 'oidc') === 'oidc'
const noSession = async () => Response.json(null)
const notFound = async () => new Response(null, { status: 404 })

export const GET = OIDC ? handlers.GET : noSession
export const POST = OIDC ? handlers.POST : notFound
