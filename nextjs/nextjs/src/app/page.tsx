import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/nextjs'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <main
        id="main-content"
        className="flex min-h-screen flex-col items-center justify-center p-24"
        role="main"
        tabIndex={-1}
      >
        <div className="max-w-4xl text-center">
          <h1 className="text-5xl font-bold mb-6">
            Zero Trust Analytics
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Privacy-first analytics for modern websites.
            No cookies, GDPR compliant, under 2KB gzipped.
          </p>
          <div className="flex gap-4 justify-center">
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Get Started Free
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="px-6 py-3 border border-border rounded-lg hover:bg-secondary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Go to Dashboard
              </Link>
            </SignedIn>
          </div>
        </div>
      </main>
    </>
  )
}
