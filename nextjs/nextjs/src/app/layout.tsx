import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Zero Trust Analytics',
  description: 'Privacy-first analytics for modern websites. No cookies, GDPR compliant, under 2KB.',
  keywords: ['analytics', 'privacy', 'GDPR', 'cookieless', 'web analytics'],
  authors: [{ name: 'Jason Sutter' }],
  openGraph: {
    title: 'Zero Trust Analytics',
    description: 'Privacy-first analytics for modern websites',
    url: 'https://ztas.io',
    siteName: 'Zero Trust Analytics',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zero Trust Analytics',
    description: 'Privacy-first analytics for modern websites'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* Skip link for keyboard users - becomes visible on focus */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
