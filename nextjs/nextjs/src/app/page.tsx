import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-4xl text-center">
        <h1 className="text-5xl font-bold mb-6">
          Zero Trust Analytics
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Privacy-first analytics for modern websites.
          No cookies, GDPR compliant, under 2KB gzipped.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
