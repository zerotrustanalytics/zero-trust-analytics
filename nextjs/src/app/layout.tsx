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
        {children}
      </body>
    </html>
  )
}
