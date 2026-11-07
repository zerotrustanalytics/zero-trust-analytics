/** Custom events as returned by /api/events, and the summary behind the Chat widget report. */

export interface EventGroup {
  name: string
  category: string
  label: string
  count: number
  visitors: number
  avgValue: number | null
  maxValue: number | null
}

export interface SiteEvents {
  events: EventGroup[]
  /** More groups exist than the report returned. */
  truncated: boolean
}

export interface Breakdown {
  name: string
  count: number
}

export interface ChatSummary {
  hasData: boolean
  opened: number
  visitors: number
  /** Share of free-text attempts that found a need. Null with no attempts. */
  understoodRate: number | null
  notUnderstood: number
  crisisRule: number
  modelAnswers: number
  avgAnswerMs: number | null
  maxAnswerMs: number | null
  loads: number
  loadFailures: number
  avgLoadMs: number | null
  resultsFound: number
  resultsNone: number
  avgResults: number | null
  outcomes: Breakdown[]
  sources: Breakdown[]
  needs: Breakdown[]
  notUnderstoodBySteps: Breakdown[]
  answersBySteps: Breakdown[]
}

const sum = (groups: EventGroup[]) => groups.reduce((total, g) => total + g.count, 0)

/** Count-weighted average of each group's average; groups without a value are skipped. */
function weightedAverage(groups: EventGroup[]): number | null {
  const valued = groups.filter((g) => g.avgValue !== null)
  const count = sum(valued)
  if (!count) return null
  return valued.reduce((total, g) => total + (g.avgValue as number) * g.count, 0) / count
}

function breakdown(groups: EventGroup[], key: 'category' | 'label'): Breakdown[] {
  const totals = new Map<string, number>()
  for (const g of groups) totals.set(g[key] || 'unknown', (totals.get(g[key] || 'unknown') ?? 0) + g.count)
  return [...totals].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

export function summarizeChat(events: EventGroup[]): ChatSummary {
  const named = (name: string) => events.filter((e) => e.name === name)
  const opened = named('chat_opened')
  const answers = named('chat_model_answer')
  const loads = named('chat_model_load')
  const needs = named('chat_need_found')
  const notUnderstood = named('chat_not_understood')
  const results = named('chat_results')
  const found = results.filter((r) => r.label === 'found')

  const attempts = sum(needs) + sum(notUnderstood)
  const maxOf = (groups: EventGroup[]) => {
    const values = groups.map((g) => g.maxValue).filter((v): v is number => v !== null)
    return values.length ? Math.max(...values) : null
  }

  return {
    hasData: events.some((e) => e.name.startsWith('chat_')),
    opened: sum(opened),
    // Distinct counts can't be added across groups, so this is the largest group's.
    visitors: opened.reduce((largest, g) => Math.max(largest, g.visitors), 0),
    understoodRate: attempts ? sum(needs) / attempts : null,
    notUnderstood: sum(notUnderstood),
    crisisRule: sum(named('chat_crisis_rule')),
    modelAnswers: sum(answers),
    avgAnswerMs: weightedAverage(answers),
    maxAnswerMs: maxOf(answers),
    loads: sum(loads),
    loadFailures: sum(loads.filter((l) => l.label === 'failed')),
    avgLoadMs: weightedAverage(loads.filter((l) => l.label === 'ready')),
    resultsFound: sum(found),
    resultsNone: sum(results.filter((r) => r.label === 'none')),
    avgResults: weightedAverage(found),
    outcomes: breakdown(answers, 'label'),
    sources: breakdown(needs, 'category'),
    needs: breakdown(needs, 'label'),
    notUnderstoodBySteps: breakdown(notUnderstood, 'category'),
    answersBySteps: breakdown(answers, 'category'),
  }
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}
