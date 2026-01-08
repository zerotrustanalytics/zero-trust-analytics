'use client'

import { Card } from '@/components/ui'

export default function ReportsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Generate and download analytics reports</p>
      </div>

      <Card className="p-12 text-center">
        <svg className="w-16 h-16 mx-auto text-gray-400 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h2 className="text-xl font-semibold mb-2">Reports Coming Soon</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          We're building powerful reporting features to help you analyze your analytics data.
          Check back soon for traffic reports, conversion funnels, and custom report builders.
        </p>
      </Card>
    </div>
  )
}
