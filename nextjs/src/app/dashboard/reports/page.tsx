'use client'

import { useState } from 'react'
import { Button, Card } from '@/components/ui'

interface Report {
  id: string
  name: string
  type: 'traffic' | 'conversion' | 'engagement' | 'custom'
  schedule: 'daily' | 'weekly' | 'monthly' | 'none'
  lastGenerated: string | null
  status: 'ready' | 'generating' | 'scheduled'
}

const mockReports: Report[] = [
  {
    id: '1',
    name: 'Weekly Traffic Summary',
    type: 'traffic',
    schedule: 'weekly',
    lastGenerated: '2026-01-01',
    status: 'ready',
  },
  {
    id: '2',
    name: 'Monthly Conversion Report',
    type: 'conversion',
    schedule: 'monthly',
    lastGenerated: '2025-12-31',
    status: 'ready',
  },
  {
    id: '3',
    name: 'User Engagement Analysis',
    type: 'engagement',
    schedule: 'none',
    lastGenerated: '2025-12-28',
    status: 'ready',
  },
]

const reportTemplates = [
  {
    id: 'traffic',
    name: 'Traffic Overview',
    description: 'Pageviews, unique visitors, sessions, and traffic sources',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'conversion',
    name: 'Conversion Funnel',
    description: 'Goal completions, conversion rates, and drop-off analysis',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
  },
  {
    id: 'engagement',
    name: 'User Engagement',
    description: 'Time on page, bounce rate, scroll depth, and interactions',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'custom',
    name: 'Custom Report',
    description: 'Build a report with your own metrics and dimensions',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
]

const typeColors = {
  traffic: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  conversion: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  engagement: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>(mockReports)
  const [generating, setGenerating] = useState<string | null>(null)

  const handleGenerateReport = async (templateId: string) => {
    setGenerating(templateId)

    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000))

    const newReport: Report = {
      id: Date.now().toString(),
      name: `${reportTemplates.find(t => t.id === templateId)?.name} - ${new Date().toLocaleDateString()}`,
      type: templateId as Report['type'],
      schedule: 'none',
      lastGenerated: new Date().toISOString(),
      status: 'ready',
    }

    setReports([newReport, ...reports])
    setGenerating(null)
  }

  const handleDownload = (reportId: string) => {
    // In a real app, this would trigger a download
    console.log('Downloading report:', reportId)
  }

  const handleDelete = (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return
    setReports(reports.filter(r => r.id !== reportId))
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Generate and download analytics reports</p>
      </div>

      {/* Report Templates */}
      <h2 className="text-lg font-semibold mb-4">Generate New Report</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {reportTemplates.map((template) => (
          <Card
            key={template.id}
            className="p-4 hover:border-primary cursor-pointer transition-colors"
            onClick={() => !generating && handleGenerateReport(template.id)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                {template.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{template.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full mt-4"
              disabled={generating === template.id}
              onClick={(e) => {
                e.stopPropagation()
                handleGenerateReport(template.id)
              }}
            >
              {generating === template.id ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </Button>
          </Card>
        ))}
      </div>

      {/* Existing Reports */}
      <h2 className="text-lg font-semibold mb-4">Your Reports</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Report Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Generated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium">{report.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${typeColors[report.type]}`}>
                      {report.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                    {report.schedule === 'none' ? 'One-time' : report.schedule}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {report.lastGenerated ? new Date(report.lastGenerated).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(report.id)}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(report.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {reports.length === 0 && (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="font-medium mb-2">No reports yet</h3>
            <p className="text-muted-foreground">Generate your first report using the templates above</p>
          </div>
        )}
      </Card>
    </div>
  )
}
