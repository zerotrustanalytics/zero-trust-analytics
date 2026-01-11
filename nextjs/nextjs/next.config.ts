import type { NextConfig } from 'next'

// Check if building for self-hosted (Docker)
const isSelfHosted = process.env.NEXT_PUBLIC_AUTH_MODE !== 'clerk'

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
