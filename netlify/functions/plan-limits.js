import { authenticateRequest, corsPreflightResponse, successResponse, getSecurityHeaders } from './lib/auth.js';
import { getUser, getUserSites } from './lib/storage.js';
import { getTeamMembers } from './lib/storage.js';
import { Config } from './lib/config.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'GET, OPTIONS');
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: getSecurityHeaders(origin)
    });
  }

  // Authenticate
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const user = await getUser(auth.user.email);
    const plan = user?.plan || 'free';
    const planConfig = Config.pricing.tiers[plan] || Config.pricing.tiers.free;

    // Get current counts
    const userSites = await getUserSites(auth.user.id);
    const siteCount = userSites?.length || 0;

    // Get limits
    const siteLimit = Config.pricing.siteLimits[plan] || Config.pricing.siteLimits.free;
    const teamMemberLimit = Config.pricing.teamMemberLimits[plan] || Config.pricing.teamMemberLimits.free;
    const dataRetention = Config.pricing.dataRetention[plan] || Config.pricing.dataRetention.free;
    const features = Config.pricing.features[plan] || Config.pricing.features.free;

    return successResponse({
      plan: {
        id: plan,
        name: planConfig.name,
        price: planConfig.price
      },
      limits: {
        sites: {
          current: siteCount,
          max: siteLimit,
          canAdd: siteLimit === Infinity || siteCount < siteLimit
        },
        teamMembers: {
          max: teamMemberLimit,
          canInvite: teamMemberLimit > 1
        },
        pageviews: {
          max: planConfig.monthlyPageviews
        },
        dataRetentionDays: dataRetention
      },
      features: features,
      upgradePath: getUpgradePath(plan)
    }, 200, origin);

  } catch (err) {
    console.error('Plan limits error:', err);
    return new Response(JSON.stringify({ error: 'Failed to get plan limits' }), {
      status: 500,
      headers: getSecurityHeaders(origin)
    });
  }
}

function getUpgradePath(currentPlan) {
  const planOrder = ['free', 'starter', 'growth', 'business', 'scale', 'enterprise'];
  const currentIndex = planOrder.indexOf(currentPlan);

  if (currentIndex === -1 || currentIndex >= planOrder.length - 1) {
    return null;
  }

  const nextPlan = planOrder[currentIndex + 1];
  const nextConfig = Config.pricing.tiers[nextPlan];

  return {
    plan: nextPlan,
    name: nextConfig.name,
    price: nextConfig.price,
    benefits: [
      `${Config.pricing.siteLimits[nextPlan] === Infinity ? 'Unlimited' : Config.pricing.siteLimits[nextPlan]} sites`,
      `${nextConfig.monthlyPageviews === Infinity ? 'Unlimited' : nextConfig.monthlyPageviews.toLocaleString()} pageviews/mo`,
      `${Config.pricing.teamMemberLimits[nextPlan] === Infinity ? 'Unlimited' : Config.pricing.teamMemberLimits[nextPlan]} team members`
    ]
  };
}

export const config = {
  path: '/api/plan-limits'
};
