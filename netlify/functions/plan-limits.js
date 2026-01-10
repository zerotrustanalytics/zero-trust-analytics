import { authenticateRequest, corsPreflightResponse, successResponse, getSecurityHeaders } from './lib/auth.js';
import { getUser, getUserById, getUserSites } from './lib/storage.js';
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
    // Try to find user by email first, then by Clerk ID
    let user = null;
    let userEmail = auth.user.email;

    // If no email from auth, fetch from Clerk API
    if (!userEmail && auth.user.id?.startsWith('user_')) {
      try {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${auth.user.id}`, {
          headers: {
            'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          const primaryEmail = clerkUser.email_addresses?.find(e => e.id === clerkUser.primary_email_address_id);
          userEmail = primaryEmail?.email_address || clerkUser.email_addresses?.[0]?.email_address;
        }
      } catch (clerkErr) {
        console.error('Failed to fetch email from Clerk:', clerkErr.message);
      }
    }

    if (userEmail) {
      user = await getUser(userEmail);
    }
    if (!user && auth.user.id) {
      user = await getUserById(auth.user.id);
    }

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
