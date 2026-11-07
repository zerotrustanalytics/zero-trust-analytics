'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BreakdownCard, EventsPage, MetricCard } from '@/components/dashboard/EventsReport'
import { formatMs, formatPercent, summarizeChat } from '@/lib/site-events'
import { useSiteEvents, type EventsPeriod } from '@/lib/use-site-events'

/** How a chat widget is being used, from events named chat_*. */
export default function SiteChatPage() {
  const siteId = useParams().siteId as string
  const [period, setPeriod] = useState<EventsPeriod>('7d')
  const { data, loading, error, locked } = useSiteEvents(siteId, period)
  const chat = useMemo(() => summarizeChat(data?.events ?? []), [data])

  return (
    <EventsPage
      title="Chat widget"
      description="How your site’s chat is used, and how well it understands people."
      period={period}
      onPeriod={setPeriod}
      loading={loading}
      error={error}
      locked={locked}
    >
      {!chat.hasData ? (
        <p className="text-muted-foreground">
          No chat events in this period. See <a className="underline" href="https://ztas.io/docs/chat-widgets/">Chat Widgets</a> to set this up.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Chats opened" value={chat.opened.toLocaleString()} detail={`${chat.visitors.toLocaleString()} daily visitors`} />
            <MetricCard label="Understood" value={formatPercent(chat.understoodRate)} detail={`${chat.notUnderstood.toLocaleString()} not understood`} />
            <MetricCard label="Average answer time" value={formatMs(chat.avgAnswerMs)} detail={`Slowest ${formatMs(chat.maxAnswerMs)}`} />
            <MetricCard label="Model load time" value={formatMs(chat.avgLoadMs)} detail={`${chat.loadFailures.toLocaleString()} of ${chat.loads.toLocaleString()} loads failed`} />
            <MetricCard label="Model answers" value={chat.modelAnswers.toLocaleString()} />
            <MetricCard label="Searches with results" value={chat.resultsFound.toLocaleString()} detail={chat.avgResults === null ? undefined : `${Math.round(chat.avgResults)} results on average`} />
            <MetricCard label="Searches with none" value={chat.resultsNone.toLocaleString()} />
            <MetricCard label="Crisis rule matches" value={chat.crisisRule.toLocaleString()} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownCard title="What the model answered" rows={chat.outcomes} empty="No model answers yet." />
            <BreakdownCard title="How needs were found" rows={chat.sources} empty="No needs found yet." />
            <BreakdownCard title="Needs found" rows={chat.needs} empty="No needs found yet." />
            <BreakdownCard title="Not understood, by step" rows={chat.notUnderstoodBySteps} empty="Nothing here yet." />
            <BreakdownCard title="Model answers, by step" rows={chat.answersBySteps} empty="No model answers yet." />
          </div>
        </div>
      )}
    </EventsPage>
  )
}
