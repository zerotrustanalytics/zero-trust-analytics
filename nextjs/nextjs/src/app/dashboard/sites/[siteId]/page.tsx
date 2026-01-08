'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, subDays } from 'date-fns'

// Types
interface Summary {
  pageviews: number
  unique_visitors: number
  sessions: number
  bounce_rate: number
  avg_duration: number
  views_per_visit: number
}

interface DailyStats {
  date: string
  pageviews: number
  unique_visitors: number
}

interface DataItem {
  name: string
  visitors: number
  views: number
  country?: string
}

interface UTMData {
  sources: DataItem[]
  mediums: DataItem[]
  campaigns: DataItem[]
  contents: DataItem[]
  terms: DataItem[]
}

interface Stats {
  summary: Summary
  daily: DailyStats[]
  pages: Record<string, number>
  referrers: Record<string, number>
  devices: Record<string, number>
  browsers: Record<string, number>
  countries: Record<string, number>
  topPages: DataItem[]
  entryPages: DataItem[]
  exitPages: DataItem[]
  sources: DataItem[]
  devicesList: DataItem[]
  browsersList: DataItem[]
  operatingSystems: DataItem[]
  countriesList: DataItem[]
  regions: DataItem[]
  cities: DataItem[]
  utm: UTMData
}

interface Site {
  id: string
  domain: string
  name?: string
}

interface RealtimeData {
  active_visitors: number
  pageviews_last_5min: number
}

// Source icons mapping
const SOURCE_ICONS: Record<string, JSX.Element> = {
  'google': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  ),
  'direct': (
    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  'twitter': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1DA1F2">
      <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/>
    </svg>
  ),
  'facebook': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  'linkedin': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  'reddit': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FF4500">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
    </svg>
  ),
  'hackernews': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FF6600">
      <path d="M0 0v24h24V0H0zm12.3 13.27l-3.89-7.2h1.87l2.36 4.64c.16.32.27.56.35.72.09-.16.2-.4.36-.72l2.37-4.64h1.77l-3.87 7.2v4.8h-1.32v-4.8z"/>
    </svg>
  ),
}

// Browser icons
const BROWSER_ICONS: Record<string, JSX.Element> = {
  chrome: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#4285F4"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
      <path d="M12 8L21 8C19.5 4 16 2 12 2C8 2 4.5 4 3 8L8 8" fill="#EA4335"/>
      <path d="M8 12L3 8C1.5 10.5 1.5 13.5 3 16L8 12" fill="#FBBC05"/>
      <path d="M12 16L8 12L3 16C4.5 20 8 22 12 22C16 22 19.5 20 21 16L12 16" fill="#34A853"/>
    </svg>
  ),
  firefox: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FF7139">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    </svg>
  ),
  safari: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#006CFF">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 12L16 6L10 10L8 18L12 12Z" fill="currentColor"/>
    </svg>
  ),
  edge: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0078D7">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
    </svg>
  ),
}

// OS icons
const OS_ICONS: Record<string, JSX.Element> = {
  windows: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#00A4EF">
      <path d="M0 3.5L10 2v9H0V3.5zm11-1.5L24 0v11H11V2zm-1 11v9L0 20.5V13h10zm1 0h13v11l-13-2V13z"/>
    </svg>
  ),
  macos: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#555555">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  ios: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#555555">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  android: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#3DDC84">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
    </svg>
  ),
  linux: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FCC624">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
    </svg>
  ),
}

// Map referrer to source
function mapReferrerToSource(referrer: string): { name: string; icon: JSX.Element } {
  const domain = referrer.toLowerCase()
  if (domain.includes('google')) return { name: 'Google', icon: SOURCE_ICONS['google'] }
  if (domain.includes('twitter') || domain.includes('t.co')) return { name: 'Twitter', icon: SOURCE_ICONS['twitter'] }
  if (domain.includes('facebook') || domain.includes('fb.')) return { name: 'Facebook', icon: SOURCE_ICONS['facebook'] }
  if (domain.includes('linkedin')) return { name: 'LinkedIn', icon: SOURCE_ICONS['linkedin'] }
  if (domain.includes('reddit')) return { name: 'Reddit', icon: SOURCE_ICONS['reddit'] }
  if (domain.includes('ycombinator') || domain.includes('news.ycombinator')) return { name: 'Hacker News', icon: SOURCE_ICONS['hackernews'] }
  if (!referrer || referrer === 'Direct' || referrer === '') return { name: 'Direct', icon: SOURCE_ICONS['direct'] }
  return { name: referrer, icon: SOURCE_ICONS['direct'] }
}

// Get browser icon
function getBrowserIcon(browser: string): JSX.Element {
  const b = browser.toLowerCase()
  if (b.includes('chrome')) return BROWSER_ICONS['chrome']
  if (b.includes('firefox')) return BROWSER_ICONS['firefox']
  if (b.includes('safari')) return BROWSER_ICONS['safari']
  if (b.includes('edge')) return BROWSER_ICONS['edge']
  return <div className="w-4 h-4 rounded-full bg-gray-400" />
}

// Get OS icon
function getOSIcon(os: string): JSX.Element {
  const o = os.toLowerCase()
  if (o.includes('windows')) return OS_ICONS['windows']
  if (o.includes('mac') || o.includes('macos')) return OS_ICONS['macos']
  if (o.includes('ios') || o.includes('iphone') || o.includes('ipad')) return OS_ICONS['ios']
  if (o.includes('android')) return OS_ICONS['android']
  if (o.includes('linux')) return OS_ICONS['linux']
  return <div className="w-4 h-4 rounded-full bg-gray-400" />
}

// Format duration
function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '0s'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (minutes === 0) return `${secs}s`
  return `${minutes}m ${secs}s`
}

// Stat card component
function StatCard({
  label,
  value,
  change,
  format: formatFn = (v: number) => v.toLocaleString()
}: {
  label: string
  value: number
  change?: number
  format?: (v: number) => string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {change !== undefined && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            change >= 0
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold">{formatFn(value)}</div>
    </div>
  )
}

// Data table component
function DataTable({
  title,
  data,
  columns,
  emptyMessage = 'No data yet'
}: {
  title: string
  data: DataItem[]
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  emptyMessage?: string
}) {
  const totalVisitors = data.reduce((sum, item) => sum + item.visitors, 0) || 1

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {data.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
              {columns.map(col => (
                <th key={col.key} className={`pb-2 font-medium ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 5).map((item, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-2 text-primary truncate max-w-[180px]">{item.name}</td>
                <td className="py-2 text-right">{item.visitors.toLocaleString()}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {((item.visitors / totalVisitors) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      )}
    </div>
  )
}

// Device icons
const DEVICE_ICONS: Record<string, JSX.Element> = {
  desktop: (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  mobile: (
    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  tablet: (
    <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
}

export default function SiteDetailsPage() {
  const params = useParams()
  const siteId = params.siteId as string
  const { getToken } = useAuth()

  const [site, setSite] = useState<Site | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [prevStats, setPrevStats] = useState<Stats | null>(null)
  const [realtime, setRealtime] = useState<RealtimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('7d')
  const [chartMetric, setChartMetric] = useState<'visitors' | 'pageviews'>('visitors')
  const [activeTab, setActiveTab] = useState<'pages' | 'entry' | 'exit'>('pages')
  const [utmTab, setUtmTab] = useState<'sources' | 'mediums' | 'campaigns'>('sources')
  const [locationTab, setLocationTab] = useState<'countries' | 'regions' | 'cities'>('countries')
  const [techTab, setTechTab] = useState<'browsers' | 'os' | 'devices'>('browsers')

  const getPeriodDays = (p: string) => {
    switch (p) {
      case '24h': return 1
      case '7d': return 7
      case '30d': return 30
      case '90d': return 90
      default: return 7
    }
  }

  const fetchSiteAndStats = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const days = getPeriodDays(period)
      const now = new Date()
      const prevEndDate = subDays(now, days)
      const prevStartDate = subDays(now, days * 2)

      const [siteRes, statsRes, prevStatsRes, realtimeRes] = await Promise.all([
        fetch(`${apiUrl}/api/sites/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/stats?siteId=${siteId}&period=${period}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/stats?siteId=${siteId}&startDate=${prevStartDate.toISOString()}&endDate=${prevEndDate.toISOString()}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/realtime?siteId=${siteId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ])

      const siteData = await siteRes.json()
      const statsData = await statsRes.json()
      const prevStatsData = prevStatsRes.ok ? await prevStatsRes.json() : null
      const realtimeData = realtimeRes.ok ? await realtimeRes.json() : null

      if (!siteRes.ok) {
        setError(siteData.error || 'Failed to fetch site')
        return
      }

      const foundSite = siteData.sites?.find((s: Site) => s.id === siteId)
      if (!foundSite) {
        setError('Site not found')
        return
      }

      setSite(foundSite)
      if (statsRes.ok) setStats(statsData)
      if (prevStatsData) setPrevStats(prevStatsData)
      if (realtimeData) setRealtime(realtimeData)
    } catch {
      setError('Failed to load site data')
    } finally {
      setLoading(false)
    }
  }, [getToken, siteId, period])

  useEffect(() => {
    fetchSiteAndStats()
  }, [fetchSiteAndStats])

  // Refresh realtime every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const token = await getToken()
        if (!token) return
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
        const res = await fetch(`${apiUrl}/api/realtime?siteId=${siteId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setRealtime(data)
        }
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [getToken, siteId])

  const calcChange = (current: number, previous: number): number | undefined => {
    if (!previous || previous === 0) return undefined
    return ((current - previous) / previous) * 100
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 max-w-md mx-auto">
          {error}
        </div>
        <Link href="/dashboard/sites" className="text-primary hover:underline">Back to Sites</Link>
      </div>
    )
  }

  // Prepare chart data
  const chartData = stats?.daily?.slice().reverse().map(d => ({
    date: d.date,
    formattedDate: format(parseISO(d.date), 'MMM d'),
    visitors: d.unique_visitors || 0,
    pageviews: d.pageviews || 0,
  })) || []

  // Prepare traffic sources with Direct
  const totalReferrerVisitors = stats?.sources?.reduce((sum, s) => sum + s.visitors, 0) || 0
  const directTraffic = Math.max(0, (stats?.summary?.unique_visitors || 0) - totalReferrerVisitors)
  const trafficSources = [
    ...(directTraffic > 0 ? [{ name: 'Direct', visitors: directTraffic, views: 0 }] : []),
    ...(stats?.sources || [])
  ].slice(0, 5).map(item => ({
    ...item,
    ...mapReferrerToSource(item.name)
  }))

  // Prepare devices data
  const totalDeviceVisitors = stats?.devicesList?.reduce((sum, d) => sum + d.visitors, 0) || 1
  const devices = (stats?.devicesList || []).map(d => ({
    ...d,
    percent: ((d.visitors / totalDeviceVisitors) * 100).toFixed(1)
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/sites" className="hover:text-primary">Sites</Link>
            <span>/</span>
            <span>{site?.domain}</span>
          </div>
          <h1 className="text-xl font-semibold">{site?.name || site?.domain}</h1>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={() => { setLoading(true); fetchSiteAndStats() }}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Current Visitors Badge */}
      {realtime && (
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium">
            <span className="text-green-600 dark:text-green-400">{realtime.active_visitors}</span>
            {' '}current visitor{realtime.active_visitors !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Stats Cards - 6 metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Unique Visitors"
          value={stats?.summary?.unique_visitors || 0}
          change={calcChange(stats?.summary?.unique_visitors || 0, prevStats?.summary?.unique_visitors || 0)}
        />
        <StatCard
          label="Page Views"
          value={stats?.summary?.pageviews || 0}
          change={calcChange(stats?.summary?.pageviews || 0, prevStats?.summary?.pageviews || 0)}
        />
        <StatCard
          label="Views/Visit"
          value={stats?.summary?.views_per_visit || 0}
          change={calcChange(stats?.summary?.views_per_visit || 0, prevStats?.summary?.views_per_visit || 0)}
          format={(v) => v.toFixed(1)}
        />
        <StatCard
          label="Bounce Rate"
          value={stats?.summary?.bounce_rate || 0}
          change={calcChange(stats?.summary?.bounce_rate || 0, prevStats?.summary?.bounce_rate || 0)}
          format={(v) => `${v}%`}
        />
        <StatCard
          label="Avg. Time on Site"
          value={stats?.summary?.avg_duration || 0}
          change={calcChange(stats?.summary?.avg_duration || 0, prevStats?.summary?.avg_duration || 0)}
          format={formatDuration}
        />
        <StatCard
          label="Total Sessions"
          value={stats?.summary?.sessions || 0}
          change={calcChange(stats?.summary?.sessions || 0, prevStats?.summary?.sessions || 0)}
        />
      </div>

      {/* Traffic Overview Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Traffic Overview</h2>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setChartMetric('visitors')}
              className={`px-3 py-1 text-xs font-medium transition ${
                chartMetric === 'visitors'
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Visitors
            </button>
            <button
              onClick={() => setChartMetric('pageviews')}
              className={`px-3 py-1 text-xs font-medium transition ${
                chartMetric === 'pageviews'
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Page Views
            </button>
          </div>
        </div>
        <div className="h-56">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dx={-10} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#F9FAFB' }}
                  formatter={(value: number) => [value.toLocaleString(), chartMetric === 'visitors' ? 'Visitors' : 'Page Views']}
                />
                <Line type="monotone" dataKey={chartMetric} stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Pages Section with Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-4 mb-4 border-b border-gray-100 dark:border-gray-700">
          {['pages', 'entry', 'exit'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'pages' | 'entry' | 'exit')}
              className={`pb-2 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'pages' ? 'Top Pages' : tab === 'entry' ? 'Entry Pages' : 'Exit Pages'}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 text-left font-medium">Page</th>
              <th className="pb-2 text-right font-medium">Visitors</th>
              <th className="pb-2 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {(activeTab === 'pages' ? stats?.topPages : activeTab === 'entry' ? stats?.entryPages : stats?.exitPages)?.slice(0, 5).map((page, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-2 text-primary truncate max-w-[250px]">{page.name}</td>
                <td className="py-2 text-right">{page.visitors.toLocaleString()}</td>
                <td className="py-2 text-right">{page.views.toLocaleString()}</td>
              </tr>
            )) || <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Sources & UTM */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Traffic Sources */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold mb-3">Traffic Sources</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-right font-medium">Visitors</th>
                <th className="pb-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {trafficSources.map((source, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {source.icon}
                      <span>{source.name}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right">{source.visitors.toLocaleString()}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {((source.visitors / (stats?.summary?.unique_visitors || 1)) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* UTM Parameters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4 mb-4 border-b border-gray-100 dark:border-gray-700">
            {['sources', 'mediums', 'campaigns'].map(tab => (
              <button
                key={tab}
                onClick={() => setUtmTab(tab as 'sources' | 'mediums' | 'campaigns')}
                className={`pb-2 text-sm font-medium border-b-2 transition ${
                  utmTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                UTM {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 text-left font-medium">{utmTab.slice(0, -1)}</th>
                <th className="pb-2 text-right font-medium">Visitors</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.utm?.[utmTab] || []).slice(0, 5).map((item, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="py-2 truncate max-w-[180px]">{item.name}</td>
                  <td className="py-2 text-right">{item.visitors.toLocaleString()}</td>
                </tr>
              ))}
              {(!stats?.utm?.[utmTab] || stats.utm[utmTab].length === 0) && (
                <tr><td colSpan={2} className="py-4 text-center text-muted-foreground">No UTM data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Locations */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-4 mb-4 border-b border-gray-100 dark:border-gray-700">
          {['countries', 'regions', 'cities'].map(tab => (
            <button
              key={tab}
              onClick={() => setLocationTab(tab as 'countries' | 'regions' | 'cities')}
              className={`pb-2 text-sm font-medium border-b-2 transition ${
                locationTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 text-left font-medium">{locationTab.slice(0, -1 - (locationTab === 'cities' ? 2 : 0))}</th>
              <th className="pb-2 text-right font-medium">Visitors</th>
              <th className="pb-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {(locationTab === 'countries' ? stats?.countriesList : locationTab === 'regions' ? stats?.regions : stats?.cities)?.slice(0, 5).map((item, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-2">{item.name || 'Unknown'}</td>
                <td className="py-2 text-right">{item.visitors.toLocaleString()}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {((item.visitors / (stats?.summary?.unique_visitors || 1)) * 100).toFixed(1)}%
                </td>
              </tr>
            )) || <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Technology Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Browsers & OS */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4 mb-4 border-b border-gray-100 dark:border-gray-700">
            {['browsers', 'os'].map(tab => (
              <button
                key={tab}
                onClick={() => setTechTab(tab as 'browsers' | 'os' | 'devices')}
                className={`pb-2 text-sm font-medium border-b-2 transition ${
                  techTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'browsers' ? 'Browsers' : 'Operating Systems'}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 text-left font-medium">{techTab === 'browsers' ? 'Browser' : 'OS'}</th>
                <th className="pb-2 text-right font-medium">Visitors</th>
                <th className="pb-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {(techTab === 'browsers' ? stats?.browsersList : stats?.operatingSystems)?.slice(0, 5).map((item, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {techTab === 'browsers' ? getBrowserIcon(item.name) : getOSIcon(item.name)}
                      <span>{item.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right">{item.visitors.toLocaleString()}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {((item.visitors / (stats?.summary?.unique_visitors || 1)) * 100).toFixed(1)}%
                  </td>
                </tr>
              )) || <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Devices */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold mb-4">Devices</h3>
          {devices.length > 0 ? (
            <div className="flex items-center justify-around py-4">
              {devices.map((device, i) => (
                <div key={i} className="text-center">
                  <div className="flex justify-center mb-2">
                    {DEVICE_ICONS[device.name.toLowerCase()] || DEVICE_ICONS['desktop']}
                  </div>
                  <div className="text-xl font-bold">{device.percent}%</div>
                  <div className="text-xs text-muted-foreground capitalize">{device.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">No data</p>
          )}
        </div>
      </div>
    </div>
  )
}
