'use client'

import type { ReactNode } from 'react'
import { UpgradePrompt } from './PlanContext'
import type { Breakdown } from '@/lib/site-events'
import type { EventsPeriod } from '@/lib/use-site-events'

const PERIODS: { value: EventsPeriod; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

interface PageProps {
  title: string
  description: string
  period: EventsPeriod
  onPeriod: (period: EventsPeriod) => void
  loading: boolean
  error: string
  locked: boolean
  children: ReactNode
}

/** Header, period picker and loading / error / upgrade states shared by the event reports. */
export function EventsPage({ title, description, period, onPeriod, loading, error, locked, children }: PageProps) {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <label className="text-sm text-muted-foreground">
          <span className="sr-only">Time period</span>
          <select
            value={period}
            onChange={(e) => onPeriod(e.target.value as EventsPeriod)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      {locked ? (
        <UpgradePrompt feature="custom events" />
      ) : error ? (
        <p role="alert" className="text-red-600">{error}</p>
      ) : loading ? (
        <p role="status" className="text-muted-foreground">Loading…</p>
      ) : (
        children
      )}
    </div>
  )
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  )
}

export function BreakdownCard({ title, rows, empty }: { title: string; rows: Breakdown[]; empty: string }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0)
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
      <h2 className="font-semibold text-foreground mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-foreground break-all">{row.name}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {row.count.toLocaleString()} · {Math.round((row.count / total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 mt-1 rounded bg-muted overflow-hidden" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${(row.count / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
