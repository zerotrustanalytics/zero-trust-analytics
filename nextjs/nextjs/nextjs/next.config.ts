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
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://ztas.io https://*.ztas.io https://*.clerk.accounts.dev https://*.clerk.com",
              "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.com"
            ].join('; ')
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
