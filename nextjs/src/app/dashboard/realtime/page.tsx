'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui'

interface RealtimeVisitor {
  id: string
  page: string
  referrer: string
  country: string
  device: string
  timestamp: Date
}

export default function RealtimePage() {
  const [activeVisitors, setActiveVisitors] = useState(12)
  const [visitors, setVisitors] = useState<RealtimeVisitor[]>([
    { id: '1', page: '/pricing', referrer: 'google.com', country: 'US', device: 'Desktop', timestamp: new Date() },
    { id: '2', page: '/features', referrer: 'twitter.com', country: 'UK', device: 'Mobile', timestamp: new Date(Date.now() - 30000) },
    { id: '3', page: '/', referrer: 'direct', country: 'DE', device: 'Desktop', timestamp: new Date(Date.now() - 60000) },
    { id: '4', page: '/docs/api', referrer: 'github.com', country: 'CA', device: 'Desktop', timestamp: new Date(Date.now() - 90000) },
    { id: '5', page: '/blog/analytics', referrer: 'hackernews', country: 'US', device: 'Tablet', timestamp: new Date(Date.now() - 120000) },
  ])

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveVisitors((prev) => prev + Math.floor(Math.random() * 3) - 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const getTimeAgo = (timestamp: Date) => {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    return `${Math.floor(seconds / 60)}m ago`
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Real-time Analytics</h1>
        <p className="text-muted-foreground">Live visitor activity on your sites</p>
      </div>

      {/* Active Visitors Counter */}
      <Card className="p-8 mb-8 text-center bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium text-green-600">Live</span>
        </div>
        <p className="text-6xl font-bold text-primary">{activeVisitors}</p>
        <p className="text-muted-foreground mt-2">Active visitors right now</p>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">156</p>
          <p className="text-sm text-muted-foreground">Last 30 minutes</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">1,234</p>
          <p className="text-sm text-muted-foreground">Today</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">2.4</p>
          <p className="text-sm text-muted-foreground">Pages/Session</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">1m 32s</p>
          <p className="text-sm text-muted-foreground">Avg. Duration</p>
        </Card>
      </div>

      {/* Live Feed */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold">Live Activity Feed</h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {visitors.map((visitor) => (
            <div key={visitor.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs">{visitor.country}</span>
                </div>
                <div>
                  <p className="font-medium">{visitor.page}</p>
                  <p className="text-sm text-muted-foreground">
                    from {visitor.referrer} • {visitor.device}
                  </p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">{getTimeAgo(visitor.timestamp)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
