import { authenticateRequest } from './lib/auth.js';
import { getTeamUsage, getTeamUsageBySite, getTeamUsageHistory, checkUsageLimit } from './lib/turso.js';
import { Config } from './lib/config.js';
import { getUser, getUserById, getUserSites, getUserTeams, getTeamMembers } from './lib/storage.js';

/**
 * Get plan limits from config
 */
function getPlanLimits(plan) {
  const tier = Config.pricing.tiers[plan] || Config.pricing.tiers.free;
  return {
    name: tier.name,
    monthlyPageviews: tier.monthlyPageviews,
    siteLimit: Config.pricing.siteLimits[plan] || Config.pricing.siteLimits.free,
    teamMemberLimit: Config.pricing.teamMemberLimits[plan] || Config.pricing.teamMemberLimits.free,
    dataRetentionDays: Config.pricing.dataRetention[plan] || Config.pricing.dataRetention.free,
    features: tier.features
  };
}

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Authenticate request
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = auth.user.id;
  const userEmail = auth.user.email;
  const url = new URL(req.url);
  const month = url.searchParams.get('month'); // Optional: specific month YYYY-MM

  try {
    // Get user to determine their plan
    const user = await getUser(userEmail);
    const plan = user?.plan || 'free';
    const planLimits = getPlanLimits(plan);

    // Get current usage (using userId as the "team_id" for usage tracking)
    const currentUsage = await getTeamUsage(userId, month);

    // Get usage by site
    const usageBySite = await getTeamUsageBySite(userId, month);

    // Get usage history (last 6 months)
    const usageHistory = await getTeamUsageHistory(userId, 6);

    // Check limits
    const limitCheck = await checkUsageLimit(userId, planLimits.monthlyPageviews);

    // Get actual counts for sites and team members
    let sitesCount = 0;
    let teamMembersCount = 1; // At least the user themselves

    try {
      const userSites = await getUserSites(userId);
      sitesCount = userSites?.length || 0;
    } catch (e) {
      console.error('Error fetching user sites:', e);
    }

    try {
      const userTeams = await getUserTeams(userId);
      if (userTeams && userTeams.length > 0) {
        // Count members across all teams
        let totalMembers = 0;
        for (const team of userTeams) {
          const members = await getTeamMembers(team.id);
          totalMembers += members?.length || 0;
        }
        teamMembersCount = totalMembers || 1;
      }
    } catch (e) {
      console.error('Error fetching team members:', e);
    }

    // Calculate billing period info
    const now = new Date();
    const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.ceil((billingPeriodEnd - now) / (1000 * 60 * 60 * 24));

    return new Response(JSON.stringify({
      plan: {
        name: planLimits.name,
        tier: plan,
        limits: {
          monthlyPageviews: planLimits.monthlyPageviews,
          sites: planLimits.siteLimit,
          teamMembers: planLimits.teamMemberLimit,
          dataRetentionDays: planLimits.dataRetentionDays
        },
        features: planLimits.features
      },
      usage: {
        current: {
          month: currentUsage.month,
          pageviews: currentUsage.pageviews,
          visitors: currentUsage.visitors,
          events: currentUsage.events
        },
        limit: planLimits.monthlyPageviews,
        percentUsed: limitCheck.percentUsed,
        remaining: limitCheck.remaining,
        isWithinLimit: limitCheck.isWithinLimit
      },
      counts: {
        sites: sitesCount,
        teamMembers: teamMembersCount
      },
      breakdown: {
        bySite: usageBySite.map(site => ({
          siteId: site.site_id,
          pageviews: site.pageviews,
          visitors: site.unique_visitors,
          events: site.events
        }))
      },
      history: usageHistory.map(h => ({
        month: h.month,
        pageviews: h.total_pageviews,
        visitors: h.total_visitors,
        events: h.total_events
      })),
      billingPeriod: {
        start: billingPeriodStart.toISOString().split('T')[0],
        end: billingPeriodEnd.toISOString().split('T')[0],
        daysRemaining
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    console.error('Usage API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to get usage data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/usage'
};
