import type { NextConfig } from 'next'

// Check if building for self-hosted (Docker)
// Default to Clerk mode (SaaS) when AUTH_MODE is not set
const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || 'clerk'
const isSelfHosted = authMode !== 'clerk'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['ztas.io'],
  },
  // Enable standalone output for Docker deployment
  output: isSelfHosted ? 'standalone' : undefined,
  // Use /dashboard base path for self-hosted (served by Express proxy)
  basePath: isSelfHosted ? '/dashboard' : '',
  // API rewrites - point to local API in self-hosted mode
  async rewrites() {
    if (!isSelfHosted) {
      return []
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ]
  },
}

export default nextConfig
