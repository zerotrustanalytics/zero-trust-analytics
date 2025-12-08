import { getStore } from '@netlify/blobs';

// Store names
const STORES = {
  USERS: 'users',
  SITES: 'sites',
  PAGEVIEWS: 'pageviews',
  VISITORS: 'visitors'
};

// Get a store instance
function store(name) {
  return getStore({ name, consistency: 'strong' });
}

// === USER OPERATIONS ===

export async function createUser(email, passwordHash) {
  const users = store(STORES.USERS);
  const userId = 'user_' + Date.now();
  const user = {
    id: userId,
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    subscription: null
  };
  await users.setJSON(email, user);
  return user;
}

export async function getUser(email) {
  const users = store(STORES.USERS);
  return await users.get(email, { type: 'json' });
}

export async function updateUser(email, updates) {
  const users = store(STORES.USERS);
  const user = await getUser(email);
  if (!user) return null;
  const updated = { ...user, ...updates };
  await users.setJSON(email, updated);
  return updated;
}

// === SITE OPERATIONS ===

export async function createSite(userId, siteId, domain) {
  const sites = store(STORES.SITES);
  const site = {
    id: siteId,
    userId,
    domain,
    createdAt: new Date().toISOString()
  };
  await sites.setJSON(siteId, site);

  // Also store in user's site list
  const userSites = await getUserSites(userId);
  userSites.push(siteId);
  await sites.setJSON(`user:${userId}`, userSites);

  return site;
}

export async function getSite(siteId) {
  const sites = store(STORES.SITES);
  return await sites.get(siteId, { type: 'json' });
}

export async function getUserSites(userId) {
  const sites = store(STORES.SITES);
  const list = await sites.get(`user:${userId}`, { type: 'json' });
  return list || [];
}

// === PAGEVIEW OPERATIONS ===

export async function recordPageview(siteId, visitorHash, path, referrer) {
  const pageviews = store(STORES.PAGEVIEWS);
  const visitors = store(STORES.VISITORS);

  const today = new Date().toISOString().split('T')[0];
  const statsKey = `${siteId}:${today}`;

  // Get or create daily stats
  let stats = await pageviews.get(statsKey, { type: 'json' });
  if (!stats) {
    stats = {
      siteId,
      date: today,
      pageviews: 0,
      visitors: new Set(),
      pages: {},
      referrers: {}
    };
  } else {
    // Convert visitors array back to Set
    stats.visitors = new Set(stats.visitors);
  }

  // Update stats
  stats.pageviews++;
  stats.visitors.add(visitorHash);
  stats.pages[path] = (stats.pages[path] || 0) + 1;
  if (referrer) {
    stats.referrers[referrer] = (stats.referrers[referrer] || 0) + 1;
  }

  // Convert Set to array for storage
  const toStore = {
    ...stats,
    visitors: Array.from(stats.visitors),
    uniqueVisitors: stats.visitors.size
  };

  await pageviews.setJSON(statsKey, toStore);

  return toStore;
}

export async function getStats(siteId, startDate, endDate) {
  const pageviews = store(STORES.PAGEVIEWS);

  // Generate date range
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // Fetch stats for each day
  const dailyStats = await Promise.all(
    dates.map(async (date) => {
      const stats = await pageviews.get(`${siteId}:${date}`, { type: 'json' });
      return stats || { date, pageviews: 0, uniqueVisitors: 0, pages: {}, referrers: {} };
    })
  );

  // Aggregate
  const totals = {
    pageviews: 0,
    uniqueVisitors: 0,
    pages: {},
    referrers: {},
    daily: dailyStats
  };

  for (const day of dailyStats) {
    totals.pageviews += day.pageviews || 0;
    totals.uniqueVisitors += day.uniqueVisitors || 0;

    for (const [page, count] of Object.entries(day.pages || {})) {
      totals.pages[page] = (totals.pages[page] || 0) + count;
    }
    for (const [ref, count] of Object.entries(day.referrers || {})) {
      totals.referrers[ref] = (totals.referrers[ref] || 0) + count;
    }
  }

  return totals;
}
