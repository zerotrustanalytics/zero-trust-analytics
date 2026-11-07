'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { EventsPage } from '@/components/dashboard/EventsReport'
import { useSiteEvents, type EventsPeriod } from '@/lib/use-site-events'

/** Every custom event a site sends, grouped by name, category and label. */
export default function SiteEventsPage() {
  const siteId = useParams().siteId as string
  const [period, setPeriod] = useState<EventsPeriod>('7d')
  const { data, loading, error, locked } = useSiteEvents(siteId, period)
  const events = data?.events ?? []

  return (
    <EventsPage
      title="Events"
      description="Everything your site sends with ZTA.track()."
      period={period}
      onPeriod={setPeriod}
      loading={loading}
      error={error}
      locked={locked}
      truncated={data?.truncated}
    >
      {events.length === 0 ? (
        <p className="text-muted-foreground">
          No events in this period. See <a className="underline" href="https://ztas.io/docs/custom-events/">Custom Events</a> to start sending them.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th scope="col" className="p-3 font-medium">Event</th>
                <th scope="col" className="p-3 font-medium">Category</th>
                <th scope="col" className="p-3 font-medium">Label</th>
                <th scope="col" className="p-3 font-medium text-right">Count</th>
                <th scope="col" className="p-3 font-medium text-right">Visitors</th>
                <th scope="col" className="p-3 font-medium text-right">Avg value</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={`${e.name}|${e.category}|${e.label}`} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium text-foreground break-all">{e.name}</td>
                  <td className="p-3 text-muted-foreground break-all">{e.category || '—'}</td>
                  <td className="p-3 text-muted-foreground break-all">{e.label || '—'}</td>
                  <td className="p-3 text-right text-foreground">{e.count.toLocaleString()}</td>
                  <td className="p-3 text-right text-muted-foreground">{e.visitors.toLocaleString()}</td>
                  <td className="p-3 text-right text-muted-foreground">
                    {e.avgValue === null ? '—' : Math.round(e.avgValue * 100) / 100}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EventsPage>
  )
}
