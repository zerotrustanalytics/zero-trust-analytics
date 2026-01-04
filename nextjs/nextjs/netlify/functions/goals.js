import { authenticateRequest } from './lib/auth.js';
import {
  getUserSites,
  createGoal,
  getSiteGoals,
  updateGoal,
  deleteGoal,
  getStats,
  calculateGoalValue,
  getGoalDateRange,
  updateGoalProgress,
  GoalMetrics,
  GoalPeriods
} from './lib/storage.js';

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Authenticate request
  const auth = authenticateRequest(req.headers);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = auth.user.id;
  const url = new URL(req.url);

  // GET - List goals for a site with current progress
  if (req.method === 'GET') {
    const siteId = url.searchParams.get('siteId');

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user owns site
    const userSites = await getUserSites(userId);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const goals = await getSiteGoals(siteId);

      // Calculate current progress for each goal
      const goalsWithProgress = await Promise.all(goals.map(async (goal) => {
        const dateRange = getGoalDateRange(goal.period);
        const stats = await getStats(siteId, dateRange.startDate, dateRange.endDate);
        const currentValue = calculateGoalValue(stats, goal.metric);

        // Update the stored progress
        await updateGoalProgress(goal.id, currentValue);

        const progress = goal.target > 0 ? Math.min(100, Math.round((currentValue / goal.target) * 100)) : 0;
        const isComplete = goal.comparison === 'gte'
          ? currentValue >= goal.target
          : currentValue <= goal.target;

        return {
          ...goal,
          currentValue,
          progress,
          isComplete,
          dateRange
        };
      }));

      return new Response(JSON.stringify({
        goals: goalsWithProgress,
        metrics: Object.values(GoalMetrics),
        periods: Object.values(GoalPeriods)
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('List goals error:', err);
      return new Response(JSON.stringify({ error: 'Failed to list goals' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Create goal
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, name, metric, target, period, comparison, notifyOnComplete } = body;

      if (!siteId) {
        return new Response(JSON.stringify({ error: 'Site ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify user owns site
      const userSites = await getUserSites(userId);
      if (!userSites.includes(siteId)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate metric
      if (metric && !Object.values(GoalMetrics).includes(metric)) {
        return new Response(JSON.stringify({ error: 'Invalid metric' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate period
      if (period && !Object.values(GoalPeriods).includes(period)) {
        return new Response(JSON.stringify({ error: 'Invalid period' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const goal = await createGoal(siteId, userId, {
        name,
        metric,
        target: Math.max(1, parseInt(target) || 1000),
        period,
        comparison: comparison || 'gte',
        notifyOnComplete
      });

      return new Response(JSON.stringify({ goal }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Create goal error:', err);
      return new Response(JSON.stringify({ error: 'Failed to create goal' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // PATCH - Update goal
  if (req.method === 'PATCH') {
    try {
      const body = await req.json();
      const { goalId, ...updates } = body;

      if (!goalId) {
        return new Response(JSON.stringify({ error: 'Goal ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updated = await updateGoal(goalId, userId, updates);

      if (!updated) {
        return new Response(JSON.stringify({ error: 'Goal not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ goal: updated }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Update goal error:', err);
      return new Response(JSON.stringify({ error: 'Failed to update goal' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Delete goal
  if (req.method === 'DELETE') {
    const goalId = url.searchParams.get('goalId');

    if (!goalId) {
      return new Response(JSON.stringify({ error: 'Goal ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const success = await deleteGoal(goalId, userId);

      if (!success) {
        return new Response(JSON.stringify({ error: 'Goal not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Delete goal error:', err);
      return new Response(JSON.stringify({ error: 'Failed to delete goal' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/goals'
};
