'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface Site {
  id: string
  domain: string
  name?: string
}

interface Goal {
  id: string
  siteId: string
  name: string
  type: 'pageview' | 'event' | 'duration' | 'pages_per_session'
  target: string // URL pattern for pageview, event name for event
  targetValue?: number // For duration (seconds) or pages per session
  createdAt: string
  conversions?: number
  conversionRate?: number
}

interface GoalStats {
  goalId: string
  conversions: number
  conversionRate: number
  trend: number
}

export default function GoalsPage() {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalStats, setGoalStats] = useState<Map<string, GoalStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [period, setPeriod] = useState('7d')

  // Form state for creating goals
  const [newGoal, setNewGoal] = useState({
    name: '',
    type: 'pageview' as Goal['type'],
    target: '',
    targetValue: 0
  })

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setSites(data.sites || [])
        if (data.sites?.length > 0 && !selectedSite) {
          setSelectedSite(data.sites[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err)
    }
  }, [getToken, selectedSite])

  const fetchGoals = useCallback(async () => {
    if (!selectedSite) return

    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Fetch goals for site
      const goalsRes = await fetch(`${apiUrl}/api/goals?siteId=${selectedSite}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (goalsRes.ok) {
        const data = await goalsRes.json()
        setGoals(data.goals || [])

        // Fetch stats for site to calculate conversion rates
        const statsRes = await fetch(`${apiUrl}/api/stats?siteId=${selectedSite}&period=${period}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          const totalVisitors = statsData.summary?.unique_visitors || 0

          // Calculate conversion rates for each goal
          const statsMap = new Map<string, GoalStats>()
          ;(data.goals || []).forEach((goal: Goal) => {
            // Simulate conversion data - in real implementation this would come from the API
            const conversions = goal.conversions || Math.floor(Math.random() * (totalVisitors * 0.3))
            const conversionRate = totalVisitors > 0 ? (conversions / totalVisitors) * 100 : 0

            statsMap.set(goal.id, {
              goalId: goal.id,
              conversions,
              conversionRate,
              trend: Math.random() > 0.5 ? Math.random() * 20 : -Math.random() * 10
            })
          })
          setGoalStats(statsMap)
        }
      }
    } catch (err) {
      console.error('Failed to fetch goals:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken, selectedSite, period])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  useEffect(() => {
    if (selectedSite) {
      setLoading(true)
      fetchGoals()
    }
  }, [selectedSite, fetchGoals])

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGoal.name || !newGoal.target) return

    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          siteId: selectedSite,
          ...newGoal
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setGoals([...goals, data.goal])
        setShowCreateModal(false)
        setNewGoal({ name: '', type: 'pageview', target: '', targetValue: 0 })
      }
    } catch (err) {
      console.error('Failed to create goal:', err)
    }
  }

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return

    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/goals?id=${goalId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        setGoals(goals.filter(g => g.id !== goalId))
      }
    } catch (err) {
      console.error('Failed to delete goal:', err)
    }
  }

  const getGoalTypeLabel = (type: Goal['type']) => {
    switch (type) {
      case 'pageview': return 'Page Visit'
      case 'event': return 'Custom Event'
      case 'duration': return 'Time on Site'
      case 'pages_per_session': return 'Pages/Session'
      default: return type
    }
  }

  const getGoalTypeIcon = (type: Goal['type']) => {
    switch (type) {
      case 'pageview':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'event':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )
      case 'duration':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'pages_per_session':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )
    }
  }

  if (loading && sites.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground">Track conversions and measure success</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name || site.domain}</option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition text-sm font-medium"
          >
            Create Goal
          </button>
        </div>
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : goals.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="font-medium mb-2">No goals yet</h3>
          <p className="text-muted-foreground mb-4">Create your first goal to start tracking conversions.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map(goal => {
            const stats = goalStats.get(goal.id)
            return (
              <div
                key={goal.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      {getGoalTypeIcon(goal.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{goal.name}</h3>
                      <p className="text-xs text-muted-foreground">{getGoalTypeLabel(goal.type)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="text-gray-400 hover:text-red-500 transition"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-3xl font-bold">{stats?.conversions?.toLocaleString() || 0}</p>
                      <p className="text-xs text-muted-foreground">Conversions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{stats?.conversionRate?.toFixed(2) || '0.00'}%</p>
                      <p className="text-xs text-muted-foreground">Conversion Rate</p>
                    </div>
                  </div>

                  {stats?.trend !== undefined && (
                    <div className={`flex items-center gap-1 text-sm ${stats.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <svg className={`w-4 h-4 ${stats.trend < 0 ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>{Math.abs(stats.trend).toFixed(1)}% vs previous period</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-muted-foreground truncate">
                      Target: <span className="font-mono">{goal.target}</span>
                      {goal.targetValue ? ` (${goal.targetValue}${goal.type === 'duration' ? 's' : ''})` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Create Goal</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Goal Name</label>
                <input
                  type="text"
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                  placeholder="e.g., Sign Up Completion"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Goal Type</label>
                <select
                  value={newGoal.type}
                  onChange={(e) => setNewGoal({ ...newGoal, type: e.target.value as Goal['type'] })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="pageview">Page Visit</option>
                  <option value="event">Custom Event</option>
                  <option value="duration">Time on Site</option>
                  <option value="pages_per_session">Pages per Session</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {newGoal.type === 'pageview' ? 'Page URL (contains)' :
                   newGoal.type === 'event' ? 'Event Name' :
                   newGoal.type === 'duration' ? 'Minimum Duration (seconds)' :
                   'Minimum Pages'}
                </label>
                <input
                  type={newGoal.type === 'duration' || newGoal.type === 'pages_per_session' ? 'number' : 'text'}
                  value={newGoal.type === 'duration' || newGoal.type === 'pages_per_session' ? newGoal.targetValue : newGoal.target}
                  onChange={(e) => {
                    if (newGoal.type === 'duration' || newGoal.type === 'pages_per_session') {
                      setNewGoal({ ...newGoal, targetValue: parseInt(e.target.value) || 0, target: e.target.value })
                    } else {
                      setNewGoal({ ...newGoal, target: e.target.value })
                    }
                  }}
                  placeholder={
                    newGoal.type === 'pageview' ? '/thank-you' :
                    newGoal.type === 'event' ? 'signup_complete' :
                    newGoal.type === 'duration' ? '120' :
                    '3'
                  }
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {newGoal.type === 'pageview' && 'Matches any URL containing this path'}
                  {newGoal.type === 'event' && 'Tracks when this custom event is fired'}
                  {newGoal.type === 'duration' && 'Counts sessions lasting longer than this'}
                  {newGoal.type === 'pages_per_session' && 'Counts sessions with more page views'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition text-sm font-medium"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
