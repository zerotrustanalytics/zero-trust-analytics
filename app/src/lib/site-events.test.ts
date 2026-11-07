import { describe, expect, it } from 'vitest'
import { formatMs, formatPercent, summarizeChat, type EventGroup } from './site-events'

const group = (name: string, over: Partial<EventGroup> = {}): EventGroup => ({
  name,
  category: 'chat',
  label: '',
  count: 1,
  visitors: 1,
  avgValue: null,
  maxValue: null,
  ...over,
})

describe('summarizeChat', () => {
  it('reports no data when there are no chat events', () => {
    const summary = summarizeChat([group('signup')])
    expect(summary.hasData).toBe(false)
    expect(summary.understoodRate).toBeNull()
    expect(summary.avgAnswerMs).toBeNull()
  })

  it('works out how often the chat understands people', () => {
    const summary = summarizeChat([
      group('chat_need_found', { category: 'model', label: 'food', count: 6 }),
      group('chat_need_found', { category: 'phrase', label: 'food', count: 2 }),
      group('chat_not_understood', { category: 'need', count: 2 }),
    ])
    expect(summary.understoodRate).toBe(0.8)
    expect(summary.sources).toEqual([{ name: 'model', count: 6 }, { name: 'phrase', count: 2 }])
    expect(summary.needs).toEqual([{ name: 'food', count: 8 }])
    expect(summary.notUnderstoodBySteps).toEqual([{ name: 'need', count: 2 }])
  })

  it('averages answer times by how many answers each group had', () => {
    const summary = summarizeChat([
      group('chat_model_answer', { label: 'need', count: 3, avgValue: 100, maxValue: 200 }),
      group('chat_model_answer', { label: 'faq', count: 1, avgValue: 500, maxValue: 500 }),
    ])
    expect(summary.modelAnswers).toBe(4)
    expect(summary.avgAnswerMs).toBe(200)
    expect(summary.maxAnswerMs).toBe(500)
    expect(summary.outcomes[0]).toEqual({ name: 'need', count: 3 })
  })

  it('separates failed model loads and leaves them out of load time', () => {
    const summary = summarizeChat([
      group('chat_model_load', { label: 'ready', count: 9, avgValue: 100 }),
      group('chat_model_load', { label: 'failed', count: 1, avgValue: 8000 }),
    ])
    expect(summary.loads).toBe(10)
    expect(summary.loadFailures).toBe(1)
    expect(summary.avgLoadMs).toBe(100)
  })

  it('counts searches with and without results', () => {
    const summary = summarizeChat([
      group('chat_results', { label: 'found', count: 4, avgValue: 10 }),
      group('chat_results', { label: 'none', count: 1, avgValue: 0 }),
    ])
    expect(summary.resultsFound).toBe(4)
    expect(summary.resultsNone).toBe(1)
    expect(summary.avgResults).toBe(10)
  })
})

describe('formatting', () => {
  it('formats rates and durations', () => {
    expect(formatPercent(0.804)).toBe('80%')
    expect(formatPercent(null)).toBe('—')
    expect(formatMs(240)).toBe('240 ms')
    expect(formatMs(1500)).toBe('1.5 s')
    expect(formatMs(null)).toBe('—')
  })
})
