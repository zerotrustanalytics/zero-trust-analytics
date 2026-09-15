// Auth.js route handler (session, signin, signout, callback, csrf, providers).
// In the self-hosted container the Express server must proxy /api/auth/* to
// Next (not the old function router) — see server/index.js / plan Phase 4.
import { handlers } from '@/auth'

export const { GET, POST } = handlers
