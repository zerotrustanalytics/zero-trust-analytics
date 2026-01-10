import { authenticateRequest } from './lib/auth.js';
import { getStore } from '@netlify/blobs';
import { getTeamUsage, getTeamUsageBySite, getTeamUsageHistory, checkUsageLimit, getActualUsageFromPageviews, getCurrentMonth } from './lib/turso.js';
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
  let userEmail = auth.user.email;
  const url = new URL(req.url);
  const month = url.searchParams.get('month'); // Optional: specific month YYYY-MM

  try {
    // If no email from auth, fetch from Clerk API
    if (!userEmail && userId?.startsWith('user_')) {
      try {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          const primaryEmail = clerkUser.email_addresses?.find(e => e.id === clerkUser.primary_email_address_id);
          userEmail = primaryEmail?.email_address || clerkUser.email_addresses?.[0]?.email_address;

          // Create userId -> email mapping for track.js lookups
          if (userEmail) {
            try {
              const users = getStore({ name: 'users', consistency: 'strong' });
              await users.set(`user_id_map_${userId}`, userEmail);
            } catch (mapErr) {
              console.error('Failed to create userId mapping:', mapErr.message);
            }
          }
        }
      } catch (clerkErr) {
        console.error('Failed to fetch email from Clerk:', clerkErr.message);
      }
    }

    // Get user to determine their plan
    const user = userEmail ? await getUser(userEmail) : null;
    const plan = user?.plan || 'free';
    const planLimits = getPlanLimits(plan);

    // ALWAYS ensure userId -> email mapping exists for track.js
    if (userId && userEmail) {
      try {
        const users = getStore({ name: 'users', consistency: 'strong' });
        await users.set(`user_id_map_${userId}`, userEmail);
        console.log('[usage] Created/updated userId mapping', { userId, userEmail, userPlan: user?.plan });
      } catch (mapErr) {
        console.error('[usage] Failed to create userId mapping:', mapErr.message);
      }
    }

    // Get user's sites first (needed for actual usage calculation)
    let sitesCount = 0;
    let userSites = [];
    try {
      userSites = await getUserSites(userId) || [];
      sitesCount = userSites.length;
    } catch (e) {
      console.error('Error fetching user sites:', e);
    }

    // Calculate actual usage from pageviews table (more accurate than monthly_usage)
    const targetMonth = month || getCurrentMonth();
    let currentUsage = { month: targetMonth, pageviews: 0, visitors: 0, events: 0 };
    let usageBySite = [];
    let usageHistory = [];

    try {
      // Get actual pageview counts from the pageviews table
      const actualUsage = await getActualUsageFromPageviews(userSites, targetMonth);
      currentUsage = {
        month: actualUsage.month,
        pageviews: actualUsage.pageviews,
        visitors: actualUsage.visitors,
        events: 0
      };
    } catch (usageErr) {
      console.error('Error calculating actual usage:', usageErr.message);
    }

    // Try to get historical data from monthly_usage table (may not exist)
    try {
      usageBySite = await getTeamUsageBySite(userId, month);
      usageHistory = await getTeamUsageHistory(userId, 6);
    } catch (historyErr) {
      console.error('Error fetching usage history (table may not exist):', historyErr.message);
    }

    // Calculate limit check based on actual usage
    const limitCheck = {
      isWithinLimit: currentUsage.pageviews < planLimits.monthlyPageviews,
      currentUsage: currentUsage.pageviews,
      limit: planLimits.monthlyPageviews,
      percentUsed: planLimits.monthlyPageviews > 0 ? Math.round((currentUsage.pageviews / planLimits.monthlyPageviews) * 100) : 0,
      remaining: Math.max(0, planLimits.monthlyPageviews - currentUsage.pageviews)
    };

    // Get team member counts
    let teamMembersCount = 1; // At least the user themselves

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
    return new Response(JSON.stringify({
      error: 'Failed to get usage data',
      details: err.message,
      stack: err.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export const config = {
  path: '/api/usage'
};
