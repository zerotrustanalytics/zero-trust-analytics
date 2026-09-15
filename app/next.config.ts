import type { NextConfig } from 'next'

// Self-hosted (Docker) build vs. hosted SaaS (Clerk) build.
// Default to Clerk mode (SaaS) when AUTH_MODE is not set.
const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || 'clerk'
const isSelfHosted = authMode !== 'clerk'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['ztas.io'],
  },
  // Standalone output for the Docker image (self-hosted only).
  output: isSelfHosted ? 'standalone' : undefined,
  // Pin the file-tracing root to this app dir so the standalone build always
  // emits `server.js` at `.next/standalone/server.js` (no nesting), regardless
  // of any lockfile higher up the tree. Keeps the Dockerfile COPY deterministic.
  ...(isSelfHosted ? { outputFileTracingRoot: process.cwd() } : {}),
  // NOTE: no `basePath`. The dashboard owns its own origin (app.ztas.io); its
  // pages already live under the app/dashboard/ route folder (=> /dashboard/*),
  // and Auth.js sits at /api/auth/* (Express proxies that to Next in oidc mode).
  // No `/api/*` rewrite: the browser hits Express directly for the ZTA API, so
  // a Next-side rewrite would only risk a proxy loop on /api/auth/*.
}

export default nextConfig
