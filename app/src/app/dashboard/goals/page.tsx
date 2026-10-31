'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/gatekeep-auth'
import { Button, Alert, Modal, ModalFooter, ConfirmModal } from '@/components/ui'
import { TallyArt } from '@/components/ui/TallyArt'

interface Site {
  id: string
  domain: string
  name?: string
}

type Metric = 'pageviews' | 'visitors' | 'sessions' | 'events' | 'bounce_rate' | 'session_duration'
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

// A goal is a target for one metric over a calendar period. The server
// computes currentValue/progress from the site's analytics on every load.
interface Goal {
  id: string
  siteId: string
  name: string
  metric: Metric
  target: number
  period: Period
  comparison: 'gte' | 'lte'
  currentValue: number
  progress: number
  isComplete: boolean
  createdAt: string
}

const METRICS: { value: Metric; label: string; unit?: string }[] = [
  { value: 'pageviews', label: 'Pageviews' },
  { value: 'visitors', label: 'Unique visitors' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'events', label: 'Custom events' },
  { value: 'bounce_rate', label: 'Bounce rate', unit: '%' },
  { value: 'session_duration', label: 'Avg. time on page', unit: 's' },
]

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'quarterly', label: 'This quarter' },
  { value: 'yearly', label: 'This year' },
]

// Lower is better for bounce rate; everything else is "reach at least".
const defaultComparison = (metric: Metric) => (metric === 'bounce_rate' ? 'lte' : 'gte')

const metricInfo = (metric: Metric) => METRICS.find((m) => m.value === metric) ?? METRICS[0]
const periodLabel = (period: Period) => PERIODS.find((p) => p.value === period)?.label ?? period
const formatValue = (value: number, metric: Metric) =>
  `${(value ?? 0).toLocaleString()}${metricInfo(metric).unit ?? ''}`

const emptyGoal = { name: '', metric: 'pageviews' as Metric, target: '', period: 'monthly' as Period }

export default function GoalsPage() {
  const { getToken } = useAuth()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGoal, setNewGoal] = useState(emptyGoal)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [getToken])

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/sites/list`, { headers: await authHeaders() })
      if (!res.ok) throw new Error('Could not load your sites')
      const data = await res.json()
      setSites(data.sites || [])
      if (data.sites?.length > 0) {
        setSelectedSite((current) => current || data.sites[0].id)
      } else {
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your sites')
      setLoading(false)
    }
  }, [apiUrl, authHeaders])

  const fetchGoals = useCallback(async () => {
    if (!selectedSite) return
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/goals?siteId=${selectedSite}`, { headers: await authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load goals')
      const data = await res.json()
      setGoals(data.goals || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load goals')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, authHeaders, selectedSite])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const openCreate = () => {
    setNewGoal(emptyGoal)
    setShowCreateModal(true)
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    const target = Number(newGoal.target)
    if (!newGoal.name.trim() || !(target >= 1)) return

    setSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          siteId: selectedSite,
          name: newGoal.name.trim(),
          metric: newGoal.metric,
          target: Math.floor(target),
          period: newGoal.period,
          comparison: defaultComparison(newGoal.metric),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create goal')
      setShowCreateModal(false)
      // Reload so the new goal arrives with its current progress.
      await fetchGoals()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create goal')
      setShowCreateModal(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/goals?goalId=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not delete goal')
      setGoals((current) => current.filter((g) => g.id !== deleteTarget.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete goal')
    } finally {
      setSaving(false)
      setDeleteTarget(null)
    }
  }

  const selectedMetric = metricInfo(newGoal.metric)
  const lowerIsBetter = defaultComparison(newGoal.metric) === 'lte'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground">Set a target for a metric and watch your progress this period</p>
        </div>
        {sites.length > 0 && (
          <div className="flex items-center gap-3">
            <label htmlFor="goals-site" className="sr-only">Site</label>
            <select
              id="goals-site"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name || site.domain}</option>
              ))}
            </select>
            <Button onClick={openCreate}>Create Goal</Button>
          </div>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" aria-label="Loading goals"></div>
        </div>
      ) : sites.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <TallyArt pose="sleep" className="mx-auto mb-4" />
          <h2 className="font-medium mb-2">Add a site first</h2>
          <p className="text-muted-foreground">Goals track a site&apos;s numbers, so you need a site before you can set one.</p>
        </div>
      ) : goals.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <TallyArt pose="count" className="mx-auto mb-4" />
          <h2 className="font-medium mb-2">No goals yet</h2>
          <p className="text-muted-foreground mb-4">
            Pick a number to aim for, like 10,000 pageviews this month, and Tally keeps score.
          </p>
          <Button onClick={openCreate}>Create your first goal</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const info = metricInfo(goal.metric)
            return (
              <div
                key={goal.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{goal.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {info.label} · {periodLabel(goal.period)}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(goal)}
                    className="text-gray-500 hover:text-red-500 transition"
                    aria-label={`Delete goal ${goal.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="flex justify-between items-end mb-2">
                  <p className="text-3xl font-bold">{formatValue(goal.currentValue, goal.metric)}</p>
                  <p className="text-sm text-muted-foreground">
                    {goal.comparison === 'lte' ? 'at most ' : 'of '}
                    {formatValue(goal.target, goal.metric)}
                  </p>
                </div>

                <div
                  className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
                  role="progressbar"
                  aria-label={`${goal.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goal.progress}
                >
                  <div
                    className={`h-full rounded-full ${goal.isComplete ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${goal.comparison === 'lte' ? (goal.isComplete ? 100 : 0) : goal.progress}%` }}
                  />
                </div>

                <p className={`mt-2 text-sm ${goal.isComplete ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                  {goal.comparison === 'lte'
                    ? goal.isComplete ? 'On target' : 'Above target'
                    : goal.isComplete ? 'Goal reached' : `${goal.progress}% of the way there`}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => !saving && setShowCreateModal(false)}
        title="Create Goal"
        description="Goals reset at the start of each period."
      >
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <div>
            <label htmlFor="goals-goal-name" className="block text-sm font-medium mb-1">Goal name</label>
            <input
              id="goals-goal-name"
              type="text"
              value={newGoal.name}
              onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
              placeholder="e.g., Monthly traffic"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goals-metric" className="block text-sm font-medium mb-1">Metric</label>
              <select
                id="goals-metric"
                value={newGoal.metric}
                onChange={(e) => setNewGoal({ ...newGoal, metric: e.target.value as Metric })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="goals-period" className="block text-sm font-medium mb-1">Period</label>
              <select
                id="goals-period"
                value={newGoal.period}
                onChange={(e) => setNewGoal({ ...newGoal, period: e.target.value as Period })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="goals-target" className="block text-sm font-medium mb-1">
              {lowerIsBetter ? 'Stay at or below' : 'Target'}
              {selectedMetric.unit === '%' ? ' (%)' : selectedMetric.unit === 's' ? ' (seconds)' : ''}
            </label>
            <input
              id="goals-target"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={newGoal.target}
              onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })}
              placeholder={lowerIsBetter ? '40' : '10000'}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
              required
            />
          </div>

          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create Goal'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => !saving && setDeleteTarget(null)}
        onConfirm={handleDeleteGoal}
        title="Delete this goal?"
        message={<>The goal <strong>{deleteTarget?.name}</strong> will stop being tracked.</>}
        confirmText="Delete"
        variant="danger"
        loading={saving}
      />
    </div>
  )
}
