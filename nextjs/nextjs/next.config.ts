import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  },

  // Redirects for Hugo static site integration
  async redirects() {
    return [
      // Docs, blog, and landing pages served by Hugo
      {
        source: '/docs/:path*',
        destination: process.env.HUGO_URL ? `${process.env.HUGO_URL}/docs/:path*` : '/docs/:path*',
        permanent: false,
        has: [{ type: 'header', key: 'x-use-hugo' }]
      }
    ]
  }
}

export default nextConfig
