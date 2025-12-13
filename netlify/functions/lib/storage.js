import { getStore } from '@netlify/blobs';

// Store names
const STORES = {
  USERS: 'users',
  SITES: 'sites',
  PAGEVIEWS: 'pageviews',
  VISITORS: 'visitors',
  ENGAGEMENT: 'engagement',
  EVENTS: 'events',
  REALTIME: 'realtime',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  PUBLIC_SHARES: 'public_shares',
  SESSIONS: 'sessions',
  API_KEYS: 'api_keys',
  ACTIVITY_LOG: 'activity_log',
  WEBHOOKS: 'webhooks',
  ALERTS: 'alerts',
  ANNOTATIONS: 'annotations',
  TEAMS: 'teams',
  GOALS: 'goals',
  FUNNELS: 'funnels',
  HEATMAPS: 'heatmaps'
};

// Get a store instance
function store(name) {
  return getStore({ name, consistency: 'strong' });
}

// === USER OPERATIONS ===

export async function createUser(email, passwordHash, plan = 'pro') {
  const users = store(STORES.USERS);
  const userId = 'user_' + Date.now();
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const user = {
    id: userId,
    email,
    passwordHash,
    createdAt: now.toISOString(),
    plan,
    trialEndsAt: trialEndsAt.toISOString(),
    subscription: null // Will be set when Stripe subscription is created
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

// Check user's subscription/trial status
export function getUserStatus(user) {
  if (!user) {
    return { status: 'none', canAccess: false };
  }

  // Active subscription takes priority
  if (user.subscription && user.subscription.status === 'active') {
    return {
      status: 'active',
      plan: user.plan || 'pro',
      canAccess: true,
      subscription: user.subscription
    };
  }

  // Check trial status
  const now = new Date();
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

  if (trialEndsAt && now < trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24));
    return {
      status: 'trial',
      plan: user.plan || 'pro',
      canAccess: true,
      trialEndsAt: user.trialEndsAt,
      daysLeft
    };
  }

  // Trial expired, no active subscription
  return {
    status: 'expired',
    plan: user.plan || 'pro',
    canAccess: false,
    trialEndsAt: user.trialEndsAt
  };
}

// === PASSWORD RESET TOKEN OPERATIONS ===

export async function createPasswordResetToken(email, token) {
  const tokens = store(STORES.PASSWORD_RESET_TOKENS);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour expiry

  const tokenData = {
    email,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await tokens.setJSON(token, tokenData);
  return tokenData;
}

export async function getPasswordResetToken(token) {
  const tokens = store(STORES.PASSWORD_RESET_TOKENS);
  try {
    const tokenData = await tokens.get(token, { type: 'json' });
    if (!tokenData) return null;

    // Check if token is expired
    if (new Date(tokenData.expiresAt) < new Date()) {
      await deletePasswordResetToken(token);
      return null;
    }

    return tokenData;
  } catch (e) {
    return null;
  }
}

export async function deletePasswordResetToken(token) {
  const tokens = store(STORES.PASSWORD_RESET_TOKENS);
  await tokens.delete(token);
  return true;
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

  console.log('Storage: Saving site with key:', siteId);
  await sites.setJSON(siteId, site);
  console.log('Storage: Site saved');

  // Also store in user's site list
  const userSitesKey = `user_sites_${userId}`;
  console.log('Storage: Getting user sites with key:', userSitesKey);
  let userSites = [];
  try {
    userSites = await sites.get(userSitesKey, { type: 'json' }) || [];
  } catch (e) {
    console.log('Storage: No existing user sites, starting fresh');
    userSites = [];
  }

  userSites.push(siteId);
  console.log('Storage: Saving user sites:', userSites);
  await sites.setJSON(userSitesKey, userSites);
  console.log('Storage: User sites saved');

  return site;
}

export async function getSite(siteId) {
  const sites = store(STORES.SITES);
  return await sites.get(siteId, { type: 'json' });
}

export async function updateSite(siteId, updates) {
  const sites = store(STORES.SITES);
  const site = await getSite(siteId);
  if (!site) return null;
  const updated = { ...site, ...updates };
  await sites.setJSON(siteId, updated);
  return updated;
}

export async function deleteSite(siteId, userId) {
  const sites = store(STORES.SITES);

  // Delete the site
  await sites.delete(siteId);

  // Remove from user's site list
  const userSitesKey = `user_sites_${userId}`;
  let userSites = [];
  try {
    userSites = await sites.get(userSitesKey, { type: 'json' }) || [];
  } catch (e) {
    userSites = [];
  }
  userSites = userSites.filter(id => id !== siteId);
  await sites.setJSON(userSitesKey, userSites);

  return true;
}

export async function getUserSites(userId) {
  const sites = store(STORES.SITES);
  const userSitesKey = `user_sites_${userId}`;
  console.log('Storage: getUserSites with key:', userSitesKey);
  try {
    const list = await sites.get(userSitesKey, { type: 'json' });
    console.log('Storage: getUserSites result:', list);
    return list || [];
  } catch (e) {
    console.log('Storage: getUserSites error:', e.message);
    return [];
  }
}

// === PAGEVIEW OPERATIONS ===

export async function recordPageview(siteId, visitorHash, data) {
  const pageviews = store(STORES.PAGEVIEWS);

  const today = new Date().toISOString().split('T')[0];
  const statsKey = `${siteId}:${today}`;

  // Get or create daily stats
  let stats = await pageviews.get(statsKey, { type: 'json' });
  if (!stats) {
    stats = createEmptyDayStats(siteId, today);
  }
  // Convert arrays to Sets for processing
  stats.visitors = new Set(stats.visitors || []);
  stats.sessions = new Set(stats.sessions || []);

  // Update basic stats
  stats.pageviews++;
  stats.visitors.add(visitorHash);

  if (data.sessionId) {
    stats.sessions.add(data.sessionId);
  }

  // Page stats
  const path = data.path || '/';
  stats.pages[path] = (stats.pages[path] || 0) + 1;

  // Referrer stats
  if (data.referrer && data.trafficSource?.type !== 'internal') {
    const refKey = data.trafficSource?.source || data.referrer;
    stats.referrers[refKey] = (stats.referrers[refKey] || 0) + 1;
  }

  // Landing pages
  if (data.landingPage && data.pageCount === 1) {
    stats.landingPages[data.landingPage] = (stats.landingPages[data.landingPage] || 0) + 1;
  }

  // Traffic sources
  if (data.trafficSource) {
    const sourceType = data.trafficSource.type;
    stats.trafficSources[sourceType] = (stats.trafficSources[sourceType] || 0) + 1;
  }

  // Device stats
  if (data.device) {
    // Device type
    stats.devices[data.device.type] = (stats.devices[data.device.type] || 0) + 1;

    // Browser
    stats.browsers[data.device.browser] = (stats.browsers[data.device.browser] || 0) + 1;

    // OS
    stats.operatingSystems[data.device.os] = (stats.operatingSystems[data.device.os] || 0) + 1;

    // Screen resolution
    if (data.device.screenWidth && data.device.screenHeight) {
      const resolution = `${data.device.screenWidth}x${data.device.screenHeight}`;
      stats.screenResolutions[resolution] = (stats.screenResolutions[resolution] || 0) + 1;
    }

    // Language
    if (data.device.language) {
      const lang = data.device.language.split('-')[0]; // Just the primary language
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;
    }
  }

  // Geographic data
  if (data.geo) {
    if (data.geo.country) {
      stats.countries[data.geo.country] = (stats.countries[data.geo.country] || 0) + 1;
    }
    if (data.geo.city) {
      stats.cities[data.geo.city] = (stats.cities[data.geo.city] || 0) + 1;
    }
  }

  // UTM campaigns
  if (data.utm && data.utm.campaign) {
    stats.campaigns[data.utm.campaign] = (stats.campaigns[data.utm.campaign] || 0) + 1;
  }

  // New vs returning visitors
  if (data.isNewVisitor) {
    stats.newVisitors++;
  } else {
    stats.returningVisitors++;
  }

  // Convert Sets to arrays for storage
  const toStore = {
    ...stats,
    visitors: Array.from(stats.visitors),
    sessions: Array.from(stats.sessions),
    uniqueVisitors: stats.visitors.size,
    uniqueSessions: stats.sessions.size
  };

  await pageviews.setJSON(statsKey, toStore);

  return toStore;
}

// === ENGAGEMENT OPERATIONS ===

export async function recordEngagement(siteId, visitorHash, data) {
  const engagement = store(STORES.ENGAGEMENT);
  const pageviews = store(STORES.PAGEVIEWS);

  const today = new Date().toISOString().split('T')[0];
  const statsKey = `${siteId}:${today}`;

  // Get daily stats
  let stats = await pageviews.get(statsKey, { type: 'json' });
  if (!stats) {
    stats = createEmptyDayStats(siteId, today);
  }

  // Update time on page stats
  const path = data.path || '/';
  if (data.timeOnPage > 0 && data.timeOnPage < 3600) { // Max 1 hour to filter outliers
    if (!stats.timeOnPage) stats.timeOnPage = {};
    if (!stats.timeOnPage[path]) {
      stats.timeOnPage[path] = { total: 0, count: 0 };
    }
    stats.timeOnPage[path].total += data.timeOnPage;
    stats.timeOnPage[path].count++;
  }

  // Update scroll depth stats
  if (data.maxScrollDepth !== undefined) {
    if (!stats.scrollDepth) stats.scrollDepth = { total: 0, count: 0 };
    stats.scrollDepth.total += data.maxScrollDepth;
    stats.scrollDepth.count++;
  }

  // Track exit pages
  if (data.isExitPage) {
    if (!stats.exitPages) stats.exitPages = {};
    stats.exitPages[path] = (stats.exitPages[path] || 0) + 1;
  }

  // Track bounces
  if (data.isBounce) {
    stats.bounces = (stats.bounces || 0) + 1;
  }

  // Session duration
  if (data.sessionDuration > 0 && data.sessionDuration < 7200) { // Max 2 hours
    if (!stats.sessionDuration) stats.sessionDuration = { total: 0, count: 0 };
    stats.sessionDuration.total += data.sessionDuration;
    stats.sessionDuration.count++;
  }

  // Pages per session
  if (data.pageCount > 0) {
    if (!stats.pagesPerSession) stats.pagesPerSession = { total: 0, count: 0 };
    stats.pagesPerSession.total += data.pageCount;
    stats.pagesPerSession.count++;
  }

  await pageviews.setJSON(statsKey, stats);

  return stats;
}

// === EVENT OPERATIONS ===

export async function recordEvent(siteId, visitorHash, data) {
  const events = store(STORES.EVENTS);

  const today = new Date().toISOString().split('T')[0];
  const statsKey = `${siteId}:events:${today}`;

  // Get or create daily event stats
  let eventStats = await events.get(statsKey, { type: 'json' });
  if (!eventStats) {
    eventStats = {
      siteId,
      date: today,
      events: {},
      total: 0
    };
  }

  // Create event key
  const eventKey = `${data.category}:${data.action}`;
  if (!eventStats.events[eventKey]) {
    eventStats.events[eventKey] = {
      category: data.category,
      action: data.action,
      count: 0,
      labels: {},
      totalValue: 0
    };
  }

  eventStats.events[eventKey].count++;
  eventStats.total++;

  // Track labels
  if (data.label) {
    eventStats.events[eventKey].labels[data.label] =
      (eventStats.events[eventKey].labels[data.label] || 0) + 1;
  }

  // Track value (for purchases, etc.)
  if (data.value && typeof data.value === 'number') {
    eventStats.events[eventKey].totalValue += data.value;
  }

  await events.setJSON(statsKey, eventStats);

  return eventStats;
}

// === HEARTBEAT / REALTIME OPERATIONS ===

export async function recordHeartbeat(siteId, visitorHash, data) {
  const realtime = store(STORES.REALTIME);

  const now = Date.now();
  const key = `${siteId}:active`;

  // Get current active visitors
  let active = await realtime.get(key, { type: 'json' });
  if (!active) {
    active = { visitors: {} };
  }

  // Update visitor's last seen time
  active.visitors[visitorHash] = {
    sessionId: data.sessionId,
    path: data.path,
    lastSeen: now
  };

  // Clean up old visitors (inactive for > 30 seconds)
  const TIMEOUT = 30000;
  for (const hash in active.visitors) {
    if (now - active.visitors[hash].lastSeen > TIMEOUT) {
      delete active.visitors[hash];
    }
  }

  await realtime.setJSON(key, active);

  return active;
}

// Get real-time active visitors
export async function getActiveVisitors(siteId) {
  const realtime = store(STORES.REALTIME);
  const key = `${siteId}:active`;

  let active = await realtime.get(key, { type: 'json' });
  if (!active) return { count: 0, visitors: [] };

  const now = Date.now();
  const TIMEOUT = 30000;

  // Filter active visitors
  const activeVisitors = [];
  for (const hash in active.visitors) {
    if (now - active.visitors[hash].lastSeen <= TIMEOUT) {
      activeVisitors.push({
        path: active.visitors[hash].path
      });
    }
  }

  return {
    count: activeVisitors.length,
    visitors: activeVisitors
  };
}

// === STATS RETRIEVAL ===

export async function getStats(siteId, startDate, endDate) {
  const pageviews = store(STORES.PAGEVIEWS);
  const events = store(STORES.EVENTS);

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
      return stats || createEmptyDayStats(siteId, date);
    })
  );

  // Fetch events for each day
  const dailyEvents = await Promise.all(
    dates.map(async (date) => {
      const eventStats = await events.get(`${siteId}:events:${date}`, { type: 'json' });
      return eventStats || { events: {}, total: 0 };
    })
  );

  // Aggregate totals
  const totals = {
    pageviews: 0,
    uniqueVisitors: 0,
    uniqueSessions: 0,
    newVisitors: 0,
    returningVisitors: 0,
    bounces: 0,
    pages: {},
    referrers: {},
    landingPages: {},
    exitPages: {},
    trafficSources: {},
    devices: {},
    browsers: {},
    operatingSystems: {},
    screenResolutions: {},
    languages: {},
    countries: {},
    cities: {},
    campaigns: {},
    timeOnPage: {},
    scrollDepth: { total: 0, count: 0 },
    sessionDuration: { total: 0, count: 0 },
    pagesPerSession: { total: 0, count: 0 },
    events: {},
    totalEvents: 0,
    daily: dailyStats
  };

  for (const day of dailyStats) {
    totals.pageviews += day.pageviews || 0;
    totals.uniqueVisitors += day.uniqueVisitors || 0;
    totals.uniqueSessions += day.uniqueSessions || 0;
    totals.newVisitors += day.newVisitors || 0;
    totals.returningVisitors += day.returningVisitors || 0;
    totals.bounces += day.bounces || 0;

    // Aggregate objects
    aggregateObject(totals.pages, day.pages);
    aggregateObject(totals.referrers, day.referrers);
    aggregateObject(totals.landingPages, day.landingPages);
    aggregateObject(totals.exitPages, day.exitPages);
    aggregateObject(totals.trafficSources, day.trafficSources);
    aggregateObject(totals.devices, day.devices);
    aggregateObject(totals.browsers, day.browsers);
    aggregateObject(totals.operatingSystems, day.operatingSystems);
    aggregateObject(totals.screenResolutions, day.screenResolutions);
    aggregateObject(totals.languages, day.languages);
    aggregateObject(totals.countries, day.countries);
    aggregateObject(totals.cities, day.cities);
    aggregateObject(totals.campaigns, day.campaigns);

    // Time on page aggregation
    if (day.timeOnPage) {
      for (const [path, data] of Object.entries(day.timeOnPage)) {
        if (!totals.timeOnPage[path]) {
          totals.timeOnPage[path] = { total: 0, count: 0 };
        }
        totals.timeOnPage[path].total += data.total;
        totals.timeOnPage[path].count += data.count;
      }
    }

    // Scroll depth
    if (day.scrollDepth) {
      totals.scrollDepth.total += day.scrollDepth.total || 0;
      totals.scrollDepth.count += day.scrollDepth.count || 0;
    }

    // Session duration
    if (day.sessionDuration) {
      totals.sessionDuration.total += day.sessionDuration.total || 0;
      totals.sessionDuration.count += day.sessionDuration.count || 0;
    }

    // Pages per session
    if (day.pagesPerSession) {
      totals.pagesPerSession.total += day.pagesPerSession.total || 0;
      totals.pagesPerSession.count += day.pagesPerSession.count || 0;
    }
  }

  // Aggregate events
  for (const dayEvents of dailyEvents) {
    totals.totalEvents += dayEvents.total || 0;
    for (const [key, data] of Object.entries(dayEvents.events || {})) {
      if (!totals.events[key]) {
        totals.events[key] = { ...data, count: 0, labels: {} };
      }
      totals.events[key].count += data.count;
      aggregateObject(totals.events[key].labels, data.labels);
    }
  }

  // Calculate derived metrics
  totals.bounceRate = totals.uniqueSessions > 0
    ? Math.round((totals.bounces / totals.uniqueSessions) * 100)
    : 0;

  totals.avgScrollDepth = totals.scrollDepth.count > 0
    ? Math.round(totals.scrollDepth.total / totals.scrollDepth.count)
    : 0;

  totals.avgSessionDuration = totals.sessionDuration.count > 0
    ? Math.round(totals.sessionDuration.total / totals.sessionDuration.count)
    : 0;

  totals.avgPagesPerSession = totals.pagesPerSession.count > 0
    ? Math.round((totals.pagesPerSession.total / totals.pagesPerSession.count) * 10) / 10
    : 0;

  // Calculate avg time on page per path
  totals.avgTimeOnPage = {};
  for (const [path, data] of Object.entries(totals.timeOnPage)) {
    totals.avgTimeOnPage[path] = data.count > 0 ? Math.round(data.total / data.count) : 0;
  }

  return totals;
}

// === HELPER FUNCTIONS ===

function createEmptyDayStats(siteId, date) {
  return {
    siteId,
    date,
    pageviews: 0,
    visitors: [],
    sessions: [],
    uniqueVisitors: 0,
    uniqueSessions: 0,
    newVisitors: 0,
    returningVisitors: 0,
    bounces: 0,
    pages: {},
    referrers: {},
    landingPages: {},
    exitPages: {},
    trafficSources: {},
    devices: {},
    browsers: {},
    operatingSystems: {},
    screenResolutions: {},
    languages: {},
    countries: {},
    cities: {},
    campaigns: {},
    timeOnPage: {},
    scrollDepth: { total: 0, count: 0 },
    sessionDuration: { total: 0, count: 0 },
    pagesPerSession: { total: 0, count: 0 }
  };
}

function aggregateObject(target, source) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

// === PUBLIC SHARE OPERATIONS ===

export async function createPublicShare(siteId, userId, options = {}) {
  const shares = store(STORES.PUBLIC_SHARES);

  // Generate unique share token
  const shareToken = 'share_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

  const share = {
    token: shareToken,
    siteId,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt || null, // null = never expires
    password: options.password || null, // optional password protection
    allowedPeriods: options.allowedPeriods || ['7d', '30d', '90d'], // limit date ranges
    isActive: true
  };

  // Store by token for lookup
  await shares.setJSON(shareToken, share);

  // Store in site's share list
  const siteSharesKey = `site_shares_${siteId}`;
  let siteShares = await shares.get(siteSharesKey, { type: 'json' }) || [];
  siteShares.push(shareToken);
  await shares.setJSON(siteSharesKey, siteShares);

  return share;
}

export async function getPublicShare(shareToken) {
  const shares = store(STORES.PUBLIC_SHARES);
  const share = await shares.get(shareToken, { type: 'json' });

  if (!share) return null;

  // Check if expired
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return null;
  }

  // Check if active
  if (!share.isActive) {
    return null;
  }

  return share;
}

export async function getSiteShares(siteId) {
  const shares = store(STORES.PUBLIC_SHARES);
  const siteSharesKey = `site_shares_${siteId}`;
  const shareTokens = await shares.get(siteSharesKey, { type: 'json' }) || [];

  const result = [];
  for (const token of shareTokens) {
    const share = await shares.get(token, { type: 'json' });
    if (share && share.isActive) {
      result.push(share);
    }
  }

  return result;
}

export async function deletePublicShare(shareToken, userId) {
  const shares = store(STORES.PUBLIC_SHARES);
  const share = await shares.get(shareToken, { type: 'json' });

  if (!share || share.userId !== userId) {
    return false;
  }

  // Mark as inactive instead of deleting (for audit trail)
  share.isActive = false;
  share.deletedAt = new Date().toISOString();
  await shares.setJSON(shareToken, share);

  return true;
}

// === SESSION MANAGEMENT ===

export async function createSession(userId, sessionInfo = {}) {
  const sessions = store(STORES.SESSIONS);

  const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

  const session = {
    id: sessionId,
    userId,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    userAgent: sessionInfo.userAgent || 'Unknown',
    ipAddress: sessionInfo.ipAddress || 'Unknown',
    device: parseUserAgent(sessionInfo.userAgent),
    isActive: true
  };

  // Store the session
  await sessions.setJSON(sessionId, session);

  // Add to user's session list
  const userSessionsKey = `user_sessions_${userId}`;
  let userSessions = await sessions.get(userSessionsKey, { type: 'json' }) || [];
  userSessions.push(sessionId);
  await sessions.setJSON(userSessionsKey, userSessions);

  return session;
}

export async function getSession(sessionId) {
  const sessions = store(STORES.SESSIONS);
  return await sessions.get(sessionId, { type: 'json' });
}

export async function getUserSessions(userId) {
  const sessions = store(STORES.SESSIONS);
  const userSessionsKey = `user_sessions_${userId}`;
  const sessionIds = await sessions.get(userSessionsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of sessionIds) {
    const session = await sessions.get(id, { type: 'json' });
    if (session && session.isActive) {
      result.push(session);
    }
  }

  // Sort by last active (most recent first)
  result.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

  return result;
}

export async function updateSessionActivity(sessionId) {
  const sessions = store(STORES.SESSIONS);
  const session = await sessions.get(sessionId, { type: 'json' });

  if (session) {
    session.lastActiveAt = new Date().toISOString();
    await sessions.setJSON(sessionId, session);
  }

  return session;
}

export async function revokeSession(sessionId, userId) {
  const sessions = store(STORES.SESSIONS);
  const session = await sessions.get(sessionId, { type: 'json' });

  if (!session || session.userId !== userId) {
    return false;
  }

  session.isActive = false;
  session.revokedAt = new Date().toISOString();
  await sessions.setJSON(sessionId, session);

  return true;
}

export async function revokeAllSessions(userId, exceptSessionId = null) {
  const sessions = store(STORES.SESSIONS);
  const userSessionsKey = `user_sessions_${userId}`;
  const sessionIds = await sessions.get(userSessionsKey, { type: 'json' }) || [];

  let revokedCount = 0;
  for (const id of sessionIds) {
    if (id === exceptSessionId) continue;

    const session = await sessions.get(id, { type: 'json' });
    if (session && session.isActive) {
      session.isActive = false;
      session.revokedAt = new Date().toISOString();
      await sessions.setJSON(id, session);
      revokedCount++;
    }
  }

  return revokedCount;
}

// Helper to parse user agent into device info
function parseUserAgent(ua) {
  if (!ua) return { type: 'Unknown', browser: 'Unknown', os: 'Unknown' };

  let type = 'Desktop';
  if (/mobile|android|iphone|ipad/i.test(ua)) type = 'Mobile';
  if (/tablet|ipad/i.test(ua)) type = 'Tablet';

  let browser = 'Unknown';
  if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/edge|edg/i.test(ua)) browser = 'Edge';

  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';

  return { type, browser, os };
}

// === API KEY MANAGEMENT ===

export async function createApiKey(userId, name, permissions = ['read']) {
  const apiKeys = store(STORES.API_KEYS);

  // Generate secure API key (format: zta_live_xxx or zta_test_xxx)
  const keyId = 'key_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const secretKey = 'zta_live_' + crypto.randomUUID().replace(/-/g, '');

  // Hash the key for storage (we only store the hash, show full key once)
  const keyHash = await hashApiKey(secretKey);

  const apiKey = {
    id: keyId,
    userId,
    name: name || 'Unnamed Key',
    keyHash,
    keyPrefix: secretKey.substring(0, 12) + '...', // First 12 chars for identification
    permissions, // ['read', 'write', 'admin']
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    isActive: true
  };

  // Store the key
  await apiKeys.setJSON(keyId, apiKey);

  // Add to user's key list
  const userKeysKey = `user_keys_${userId}`;
  let userKeys = await apiKeys.get(userKeysKey, { type: 'json' }) || [];
  userKeys.push(keyId);
  await apiKeys.setJSON(userKeysKey, userKeys);

  // Return full key (only time it's visible)
  return {
    ...apiKey,
    key: secretKey
  };
}

export async function getApiKey(keyId) {
  const apiKeys = store(STORES.API_KEYS);
  return await apiKeys.get(keyId, { type: 'json' });
}

export async function getUserApiKeys(userId) {
  const apiKeys = store(STORES.API_KEYS);
  const userKeysKey = `user_keys_${userId}`;
  const keyIds = await apiKeys.get(userKeysKey, { type: 'json' }) || [];

  const result = [];
  for (const id of keyIds) {
    const key = await apiKeys.get(id, { type: 'json' });
    if (key && key.isActive) {
      // Don't include the hash in the response
      const { keyHash, ...safeKey } = key;
      result.push(safeKey);
    }
  }

  // Sort by created date (newest first)
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return result;
}

export async function validateApiKey(secretKey) {
  if (!secretKey || !secretKey.startsWith('zta_')) {
    return null;
  }

  const apiKeys = store(STORES.API_KEYS);
  const keyHash = await hashApiKey(secretKey);

  // Look up by hash (need to scan - in production use a hash index)
  const { blobs } = await apiKeys.list();

  for (const blob of blobs) {
    if (blob.key.startsWith('key_')) {
      const apiKey = await apiKeys.get(blob.key, { type: 'json' });
      if (apiKey && apiKey.isActive && apiKey.keyHash === keyHash) {
        // Update last used time
        apiKey.lastUsedAt = new Date().toISOString();
        await apiKeys.setJSON(apiKey.id, apiKey);

        return apiKey;
      }
    }
  }

  return null;
}

export async function revokeApiKey(keyId, userId) {
  const apiKeys = store(STORES.API_KEYS);
  const apiKey = await apiKeys.get(keyId, { type: 'json' });

  if (!apiKey || apiKey.userId !== userId) {
    return false;
  }

  apiKey.isActive = false;
  apiKey.revokedAt = new Date().toISOString();
  await apiKeys.setJSON(keyId, apiKey);

  return true;
}

export async function updateApiKeyName(keyId, userId, newName) {
  const apiKeys = store(STORES.API_KEYS);
  const apiKey = await apiKeys.get(keyId, { type: 'json' });

  if (!apiKey || apiKey.userId !== userId || !apiKey.isActive) {
    return null;
  }

  apiKey.name = newName;
  await apiKeys.setJSON(keyId, apiKey);

  const { keyHash, ...safeKey } = apiKey;
  return safeKey;
}

// Simple hash function for API keys
async function hashApiKey(key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// === ACTIVITY LOG ===

// Activity types
export const ActivityTypes = {
  // Auth
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGE: 'auth.password_change',
  PASSWORD_RESET: 'auth.password_reset',

  // Sites
  SITE_CREATE: 'site.create',
  SITE_UPDATE: 'site.update',
  SITE_DELETE: 'site.delete',

  // API Keys
  API_KEY_CREATE: 'api_key.create',
  API_KEY_REVOKE: 'api_key.revoke',

  // Shares
  SHARE_CREATE: 'share.create',
  SHARE_REVOKE: 'share.revoke',

  // Sessions
  SESSION_REVOKE: 'session.revoke',
  SESSION_REVOKE_ALL: 'session.revoke_all',

  // Export
  DATA_EXPORT: 'data.export',

  // Billing
  SUBSCRIPTION_CREATE: 'billing.subscribe',
  SUBSCRIPTION_CANCEL: 'billing.cancel'
};

export async function logActivity(userId, type, details = {}, meta = {}) {
  const activityLog = store(STORES.ACTIVITY_LOG);

  const activityId = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  const activity = {
    id: activityId,
    userId,
    type,
    details, // e.g., { siteId: 'xxx', domain: 'example.com' }
    ipAddress: meta.ipAddress || 'Unknown',
    userAgent: meta.userAgent || 'Unknown',
    timestamp: new Date().toISOString()
  };

  // Store individual activity
  await activityLog.setJSON(activityId, activity);

  // Add to user's activity list (keep last 100)
  const userLogKey = `user_log_${userId}`;
  let userLog = await activityLog.get(userLogKey, { type: 'json' }) || [];
  userLog.unshift(activityId);
  if (userLog.length > 100) {
    userLog = userLog.slice(0, 100);
  }
  await activityLog.setJSON(userLogKey, userLog);

  return activity;
}

export async function getUserActivityLog(userId, limit = 50, offset = 0) {
  const activityLog = store(STORES.ACTIVITY_LOG);
  const userLogKey = `user_log_${userId}`;
  const activityIds = await activityLog.get(userLogKey, { type: 'json' }) || [];

  // Get activities with pagination
  const paginatedIds = activityIds.slice(offset, offset + limit);
  const activities = [];

  for (const id of paginatedIds) {
    const activity = await activityLog.get(id, { type: 'json' });
    if (activity) {
      activities.push(activity);
    }
  }

  return {
    activities,
    total: activityIds.length,
    hasMore: offset + limit < activityIds.length
  };
}

// Helper to format activity for display
export function formatActivityMessage(activity) {
  const messages = {
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'auth.password_change': 'Changed password',
    'auth.password_reset': 'Reset password',
    'site.create': `Created site "${activity.details?.domain || 'Unknown'}"`,
    'site.update': `Updated site "${activity.details?.domain || 'Unknown'}"`,
    'site.delete': `Deleted site "${activity.details?.domain || 'Unknown'}"`,
    'api_key.create': `Created API key "${activity.details?.name || 'Unnamed'}"`,
    'api_key.revoke': `Revoked API key "${activity.details?.name || 'Unknown'}"`,
    'share.create': `Created share link for "${activity.details?.domain || 'Unknown'}"`,
    'share.revoke': 'Revoked share link',
    'session.revoke': 'Signed out a device',
    'session.revoke_all': 'Signed out all other devices',
    'data.export': `Exported ${activity.details?.format || 'data'}`,
    'billing.subscribe': 'Started subscription',
    'billing.cancel': 'Cancelled subscription'
  };

  return messages[activity.type] || activity.type;
}

// === WEBHOOK MANAGEMENT ===

export const WebhookEvents = {
  PAGEVIEW: 'pageview',
  EVENT: 'event',
  DAILY_SUMMARY: 'daily_summary',
  TRAFFIC_SPIKE: 'traffic_spike',
  GOAL_COMPLETED: 'goal_completed'
};

export async function createWebhook(siteId, userId, config) {
  const webhooks = store(STORES.WEBHOOKS);

  const webhookId = 'wh_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const secret = 'whsec_' + crypto.randomUUID().replace(/-/g, '');

  const webhook = {
    id: webhookId,
    siteId,
    userId,
    url: config.url,
    secret, // Used for signature verification
    events: config.events || [WebhookEvents.EVENT], // Which events to send
    name: config.name || 'Unnamed Webhook',
    isActive: true,
    createdAt: new Date().toISOString(),
    lastTriggeredAt: null,
    failureCount: 0,
    successCount: 0
  };

  await webhooks.setJSON(webhookId, webhook);

  // Add to site's webhook list
  const siteWebhooksKey = `site_webhooks_${siteId}`;
  let siteWebhooks = await webhooks.get(siteWebhooksKey, { type: 'json' }) || [];
  siteWebhooks.push(webhookId);
  await webhooks.setJSON(siteWebhooksKey, siteWebhooks);

  return webhook;
}

export async function getWebhook(webhookId) {
  const webhooks = store(STORES.WEBHOOKS);
  return await webhooks.get(webhookId, { type: 'json' });
}

export async function getSiteWebhooks(siteId) {
  const webhooks = store(STORES.WEBHOOKS);
  const siteWebhooksKey = `site_webhooks_${siteId}`;
  const webhookIds = await webhooks.get(siteWebhooksKey, { type: 'json' }) || [];

  const result = [];
  for (const id of webhookIds) {
    const webhook = await webhooks.get(id, { type: 'json' });
    if (webhook && webhook.isActive) {
      // Hide secret in listing
      const { secret, ...safeWebhook } = webhook;
      result.push(safeWebhook);
    }
  }

  return result;
}

export async function updateWebhook(webhookId, userId, updates) {
  const webhooks = store(STORES.WEBHOOKS);
  const webhook = await webhooks.get(webhookId, { type: 'json' });

  if (!webhook || webhook.userId !== userId) {
    return null;
  }

  // Only allow updating certain fields
  const allowedUpdates = ['url', 'events', 'name', 'isActive'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      webhook[key] = updates[key];
    }
  }

  await webhooks.setJSON(webhookId, webhook);

  const { secret, ...safeWebhook } = webhook;
  return safeWebhook;
}

export async function deleteWebhook(webhookId, userId) {
  const webhooks = store(STORES.WEBHOOKS);
  const webhook = await webhooks.get(webhookId, { type: 'json' });

  if (!webhook || webhook.userId !== userId) {
    return false;
  }

  webhook.isActive = false;
  webhook.deletedAt = new Date().toISOString();
  await webhooks.setJSON(webhookId, webhook);

  return true;
}

export async function recordWebhookDelivery(webhookId, success) {
  const webhooks = store(STORES.WEBHOOKS);
  const webhook = await webhooks.get(webhookId, { type: 'json' });

  if (!webhook) return;

  webhook.lastTriggeredAt = new Date().toISOString();
  if (success) {
    webhook.successCount++;
    webhook.failureCount = 0; // Reset on success
  } else {
    webhook.failureCount++;
    // Disable webhook after 10 consecutive failures
    if (webhook.failureCount >= 10) {
      webhook.isActive = false;
      webhook.disabledReason = 'Too many consecutive failures';
    }
  }

  await webhooks.setJSON(webhookId, webhook);
}

// Get webhooks that should receive a specific event type for a site
export async function getWebhooksForEvent(siteId, eventType) {
  const webhooks = store(STORES.WEBHOOKS);
  const siteWebhooksKey = `site_webhooks_${siteId}`;
  const webhookIds = await webhooks.get(siteWebhooksKey, { type: 'json' }) || [];

  const result = [];
  for (const id of webhookIds) {
    const webhook = await webhooks.get(id, { type: 'json' });
    if (webhook && webhook.isActive && webhook.events.includes(eventType)) {
      result.push(webhook);
    }
  }

  return result;
}

// === TRAFFIC SPIKE ALERTS ===

export async function createAlert(siteId, userId, config) {
  const alerts = store(STORES.ALERTS);

  const alertId = 'alert_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  const alert = {
    id: alertId,
    siteId,
    userId,
    type: config.type || 'traffic_spike', // traffic_spike, low_traffic, goal_reached
    name: config.name || 'Traffic Spike Alert',
    threshold: config.threshold || 200, // % increase from baseline
    timeWindow: config.timeWindow || 60, // minutes to check
    cooldown: config.cooldown || 60, // minutes between alerts
    notifyWebhook: config.notifyWebhook || false,
    notifyEmail: config.notifyEmail || true,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastTriggeredAt: null,
    triggerCount: 0
  };

  await alerts.setJSON(alertId, alert);

  // Add to site's alert list
  const siteAlertsKey = `site_alerts_${siteId}`;
  let siteAlerts = await alerts.get(siteAlertsKey, { type: 'json' }) || [];
  siteAlerts.push(alertId);
  await alerts.setJSON(siteAlertsKey, siteAlerts);

  return alert;
}

export async function getAlert(alertId) {
  const alerts = store(STORES.ALERTS);
  return await alerts.get(alertId, { type: 'json' });
}

export async function getSiteAlerts(siteId) {
  const alerts = store(STORES.ALERTS);
  const siteAlertsKey = `site_alerts_${siteId}`;
  const alertIds = await alerts.get(siteAlertsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of alertIds) {
    const alert = await alerts.get(id, { type: 'json' });
    if (alert && alert.isActive) {
      result.push(alert);
    }
  }

  return result;
}

export async function updateAlert(alertId, userId, updates) {
  const alerts = store(STORES.ALERTS);
  const alert = await alerts.get(alertId, { type: 'json' });

  if (!alert || alert.userId !== userId) {
    return null;
  }

  const allowedUpdates = ['name', 'threshold', 'timeWindow', 'cooldown', 'notifyWebhook', 'notifyEmail', 'isActive'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      alert[key] = updates[key];
    }
  }

  await alerts.setJSON(alertId, alert);
  return alert;
}

export async function deleteAlert(alertId, userId) {
  const alerts = store(STORES.ALERTS);
  const alert = await alerts.get(alertId, { type: 'json' });

  if (!alert || alert.userId !== userId) {
    return false;
  }

  alert.isActive = false;
  alert.deletedAt = new Date().toISOString();
  await alerts.setJSON(alertId, alert);

  return true;
}

export async function recordAlertTrigger(alertId) {
  const alerts = store(STORES.ALERTS);
  const alert = await alerts.get(alertId, { type: 'json' });

  if (!alert) return;

  alert.lastTriggeredAt = new Date().toISOString();
  alert.triggerCount++;
  await alerts.setJSON(alertId, alert);
}

// Check if an alert should fire based on cooldown
export function shouldAlertFire(alert) {
  if (!alert.lastTriggeredAt) return true;

  const lastTriggered = new Date(alert.lastTriggeredAt);
  const cooldownMs = alert.cooldown * 60 * 1000;
  const now = new Date();

  return (now - lastTriggered) >= cooldownMs;
}

// Get baseline traffic for comparison (hourly average from last 7 days)
export async function getTrafficBaseline(siteId) {
  const pageviews = store(STORES.PAGEVIEWS);

  // Get last 7 days of stats
  const dates = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  let totalPageviews = 0;
  let daysWithData = 0;

  for (const date of dates) {
    const stats = await pageviews.get(`${siteId}:${date}`, { type: 'json' });
    if (stats && stats.pageviews > 0) {
      totalPageviews += stats.pageviews;
      daysWithData++;
    }
  }

  if (daysWithData === 0) return null;

  // Calculate average hourly pageviews
  const avgDaily = totalPageviews / daysWithData;
  const avgHourly = avgDaily / 24;

  return {
    avgHourly: Math.round(avgHourly),
    avgDaily: Math.round(avgDaily),
    daysWithData
  };
}

// === CHART ANNOTATIONS ===

export async function createAnnotation(siteId, userId, config) {
  const annotations = store(STORES.ANNOTATIONS);

  const annotationId = 'ann_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  const annotation = {
    id: annotationId,
    siteId,
    userId,
    date: config.date, // YYYY-MM-DD format
    title: config.title || 'Event',
    description: config.description || '',
    color: config.color || '#0d6efd', // Bootstrap primary blue
    icon: config.icon || 'star', // star, rocket, megaphone, flag, bug, etc.
    createdAt: new Date().toISOString()
  };

  await annotations.setJSON(annotationId, annotation);

  // Add to site's annotation list
  const siteAnnotationsKey = `site_annotations_${siteId}`;
  let siteAnnotations = await annotations.get(siteAnnotationsKey, { type: 'json' }) || [];
  siteAnnotations.push(annotationId);
  await annotations.setJSON(siteAnnotationsKey, siteAnnotations);

  return annotation;
}

export async function getAnnotation(annotationId) {
  const annotations = store(STORES.ANNOTATIONS);
  return await annotations.get(annotationId, { type: 'json' });
}

export async function getSiteAnnotations(siteId, startDate = null, endDate = null) {
  const annotations = store(STORES.ANNOTATIONS);
  const siteAnnotationsKey = `site_annotations_${siteId}`;
  const annotationIds = await annotations.get(siteAnnotationsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of annotationIds) {
    const annotation = await annotations.get(id, { type: 'json' });
    if (annotation) {
      // Filter by date range if provided
      if (startDate && annotation.date < startDate) continue;
      if (endDate && annotation.date > endDate) continue;
      result.push(annotation);
    }
  }

  // Sort by date
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

export async function updateAnnotation(annotationId, userId, updates) {
  const annotations = store(STORES.ANNOTATIONS);
  const annotation = await annotations.get(annotationId, { type: 'json' });

  if (!annotation || annotation.userId !== userId) {
    return null;
  }

  const allowedUpdates = ['title', 'description', 'color', 'icon', 'date'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      annotation[key] = updates[key];
    }
  }

  await annotations.setJSON(annotationId, annotation);
  return annotation;
}

export async function deleteAnnotation(annotationId, userId) {
  const annotations = store(STORES.ANNOTATIONS);
  const annotation = await annotations.get(annotationId, { type: 'json' });

  if (!annotation || annotation.userId !== userId) {
    return false;
  }

  // Remove from site's list
  const siteAnnotationsKey = `site_annotations_${annotation.siteId}`;
  let siteAnnotations = await annotations.get(siteAnnotationsKey, { type: 'json' }) || [];
  siteAnnotations = siteAnnotations.filter(id => id !== annotationId);
  await annotations.setJSON(siteAnnotationsKey, siteAnnotations);

  // Delete the annotation
  await annotations.delete(annotationId);

  return true;
}

// === TEAM MANAGEMENT ===

export const TeamRoles = {
  OWNER: 'owner',       // Full access, can delete team, transfer ownership
  ADMIN: 'admin',       // Can manage members, sites, and settings
  EDITOR: 'editor',     // Can view/edit analytics, create annotations
  VIEWER: 'viewer'      // Read-only access to analytics
};

export const TeamInviteStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired'
};

// Create a new team (organization)
export async function createTeam(ownerId, ownerEmail, name) {
  const teams = store(STORES.TEAMS);

  const teamId = 'team_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  const team = {
    id: teamId,
    name: name || 'My Team',
    ownerId,
    createdAt: new Date().toISOString(),
    settings: {
      allowMemberInvites: false, // Only owner/admin can invite
      defaultRole: TeamRoles.VIEWER
    }
  };

  await teams.setJSON(teamId, team);

  // Add owner as first member
  const membersKey = `team_members_${teamId}`;
  const members = [{
    id: 'member_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8),
    userId: ownerId,
    email: ownerEmail,
    role: TeamRoles.OWNER,
    joinedAt: new Date().toISOString()
  }];
  await teams.setJSON(membersKey, members);

  // Add team to user's team list
  const userTeamsKey = `user_teams_${ownerId}`;
  let userTeams = await teams.get(userTeamsKey, { type: 'json' }) || [];
  userTeams.push(teamId);
  await teams.setJSON(userTeamsKey, userTeams);

  return team;
}

export async function getTeam(teamId) {
  const teams = store(STORES.TEAMS);
  return await teams.get(teamId, { type: 'json' });
}

export async function updateTeam(teamId, userId, updates) {
  const teams = store(STORES.TEAMS);
  const team = await teams.get(teamId, { type: 'json' });

  if (!team) return null;

  // Check if user has permission (owner or admin)
  const memberRole = await getTeamMemberRole(teamId, userId);
  if (memberRole !== TeamRoles.OWNER && memberRole !== TeamRoles.ADMIN) {
    return null;
  }

  const allowedUpdates = ['name', 'settings'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      team[key] = updates[key];
    }
  }

  await teams.setJSON(teamId, team);
  return team;
}

export async function getUserTeams(userId) {
  const teams = store(STORES.TEAMS);
  const userTeamsKey = `user_teams_${userId}`;
  const teamIds = await teams.get(userTeamsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of teamIds) {
    const team = await teams.get(id, { type: 'json' });
    if (team) {
      const role = await getTeamMemberRole(id, userId);
      result.push({ ...team, role });
    }
  }

  return result;
}

// Get user's role in a team
export async function getTeamMemberRole(teamId, userId) {
  const teams = store(STORES.TEAMS);
  const membersKey = `team_members_${teamId}`;
  const members = await teams.get(membersKey, { type: 'json' }) || [];

  const member = members.find(m => m.userId === userId);
  return member ? member.role : null;
}

// Get all members of a team
export async function getTeamMembers(teamId) {
  const teams = store(STORES.TEAMS);
  const membersKey = `team_members_${teamId}`;
  return await teams.get(membersKey, { type: 'json' }) || [];
}

// Create team invite
export async function createTeamInvite(teamId, inviterId, email, role = TeamRoles.VIEWER) {
  const teams = store(STORES.TEAMS);

  // Check if already a member
  const members = await getTeamMembers(teamId);
  if (members.some(m => m.email.toLowerCase() === email.toLowerCase())) {
    return { error: 'User is already a team member' };
  }

  // Check for existing pending invite
  const invitesKey = `team_invites_${teamId}`;
  let invites = await teams.get(invitesKey, { type: 'json' }) || [];
  const existingInvite = invites.find(i =>
    i.email.toLowerCase() === email.toLowerCase() && i.status === TeamInviteStatus.PENDING
  );

  if (existingInvite) {
    return { error: 'Pending invite already exists for this email' };
  }

  const inviteId = 'inv_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const inviteToken = crypto.randomUUID().replace(/-/g, '');

  const invite = {
    id: inviteId,
    token: inviteToken,
    teamId,
    email: email.toLowerCase(),
    role,
    inviterId,
    status: TeamInviteStatus.PENDING,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };

  // Store invite
  await teams.setJSON(inviteId, invite);
  await teams.setJSON(`invite_token_${inviteToken}`, inviteId);

  // Add to team's invite list
  invites.push(inviteId);
  await teams.setJSON(invitesKey, invites);

  return invite;
}

// Get invite by token
export async function getTeamInviteByToken(token) {
  const teams = store(STORES.TEAMS);
  const inviteId = await teams.get(`invite_token_${token}`, { type: 'json' });

  if (!inviteId) return null;

  const invite = await teams.get(inviteId, { type: 'json' });

  if (!invite) return null;

  // Check if expired
  if (new Date(invite.expiresAt) < new Date()) {
    invite.status = TeamInviteStatus.EXPIRED;
    await teams.setJSON(inviteId, invite);
    return null;
  }

  // Check if still pending
  if (invite.status !== TeamInviteStatus.PENDING) {
    return null;
  }

  return invite;
}

// Get team invites
export async function getTeamInvites(teamId) {
  const teams = store(STORES.TEAMS);
  const invitesKey = `team_invites_${teamId}`;
  const inviteIds = await teams.get(invitesKey, { type: 'json' }) || [];

  const result = [];
  for (const id of inviteIds) {
    const invite = await teams.get(id, { type: 'json' });
    if (invite && invite.status === TeamInviteStatus.PENDING) {
      // Check if expired
      if (new Date(invite.expiresAt) < new Date()) {
        invite.status = TeamInviteStatus.EXPIRED;
        await teams.setJSON(id, invite);
        continue;
      }
      // Hide token in listing
      const { token, ...safeInvite } = invite;
      result.push(safeInvite);
    }
  }

  return result;
}

// Accept team invite
export async function acceptTeamInvite(token, userId, userEmail) {
  const teams = store(STORES.TEAMS);
  const invite = await getTeamInviteByToken(token);

  if (!invite) {
    return { error: 'Invalid or expired invite' };
  }

  // Verify email matches
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return { error: 'Invite is for a different email address' };
  }

  // Add user as team member
  const membersKey = `team_members_${invite.teamId}`;
  const members = await teams.get(membersKey, { type: 'json' }) || [];

  members.push({
    id: 'member_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8),
    userId,
    email: userEmail,
    role: invite.role,
    joinedAt: new Date().toISOString(),
    invitedBy: invite.inviterId
  });

  await teams.setJSON(membersKey, members);

  // Add team to user's team list
  const userTeamsKey = `user_teams_${userId}`;
  let userTeams = await teams.get(userTeamsKey, { type: 'json' }) || [];
  if (!userTeams.includes(invite.teamId)) {
    userTeams.push(invite.teamId);
    await teams.setJSON(userTeamsKey, userTeams);
  }

  // Update invite status
  invite.status = TeamInviteStatus.ACCEPTED;
  invite.acceptedAt = new Date().toISOString();
  await teams.setJSON(invite.id, invite);

  const team = await getTeam(invite.teamId);
  return { success: true, team };
}

// Decline team invite
export async function declineTeamInvite(token, userEmail) {
  const teams = store(STORES.TEAMS);
  const invite = await getTeamInviteByToken(token);

  if (!invite) {
    return { error: 'Invalid or expired invite' };
  }

  // Verify email matches
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return { error: 'Invite is for a different email address' };
  }

  invite.status = TeamInviteStatus.DECLINED;
  invite.declinedAt = new Date().toISOString();
  await teams.setJSON(invite.id, invite);

  return { success: true };
}

// Revoke team invite (admin action)
export async function revokeTeamInvite(inviteId, userId) {
  const teams = store(STORES.TEAMS);
  const invite = await teams.get(inviteId, { type: 'json' });

  if (!invite) return false;

  // Check permission
  const role = await getTeamMemberRole(invite.teamId, userId);
  if (role !== TeamRoles.OWNER && role !== TeamRoles.ADMIN) {
    return false;
  }

  invite.status = TeamInviteStatus.EXPIRED;
  invite.revokedAt = new Date().toISOString();
  invite.revokedBy = userId;
  await teams.setJSON(inviteId, invite);

  return true;
}

// Update team member role
export async function updateTeamMemberRole(teamId, targetUserId, newRole, requesterId) {
  const teams = store(STORES.TEAMS);

  // Check requester permission
  const requesterRole = await getTeamMemberRole(teamId, requesterId);
  if (requesterRole !== TeamRoles.OWNER && requesterRole !== TeamRoles.ADMIN) {
    return { error: 'Insufficient permissions' };
  }

  // Can't change owner's role (must transfer ownership)
  const team = await getTeam(teamId);
  if (team.ownerId === targetUserId && newRole !== TeamRoles.OWNER) {
    return { error: 'Cannot change owner role. Transfer ownership instead.' };
  }

  // Admin can't promote to owner
  if (requesterRole === TeamRoles.ADMIN && newRole === TeamRoles.OWNER) {
    return { error: 'Only the owner can transfer ownership' };
  }

  const membersKey = `team_members_${teamId}`;
  const members = await teams.get(membersKey, { type: 'json' }) || [];

  const memberIndex = members.findIndex(m => m.userId === targetUserId);
  if (memberIndex === -1) {
    return { error: 'Member not found' };
  }

  members[memberIndex].role = newRole;
  members[memberIndex].roleUpdatedAt = new Date().toISOString();
  members[memberIndex].roleUpdatedBy = requesterId;

  await teams.setJSON(membersKey, members);

  return { success: true, member: members[memberIndex] };
}

// Remove team member
export async function removeTeamMember(teamId, targetUserId, requesterId) {
  const teams = store(STORES.TEAMS);

  // Check requester permission
  // Allow if requester is removing themselves (leaving) OR if they are owner/admin
  const requesterRole = await getTeamMemberRole(teamId, requesterId);
  const isSelfRemoval = targetUserId === requesterId;
  if (!isSelfRemoval && requesterRole !== TeamRoles.OWNER && requesterRole !== TeamRoles.ADMIN) {
    return { error: 'Insufficient permissions' };
  }

  // Can't remove the owner
  const team = await getTeam(teamId);
  if (team.ownerId === targetUserId) {
    return { error: 'Cannot remove the team owner' };
  }

  const membersKey = `team_members_${teamId}`;
  const members = await teams.get(membersKey, { type: 'json' }) || [];

  const updatedMembers = members.filter(m => m.userId !== targetUserId);

  if (updatedMembers.length === members.length) {
    return { error: 'Member not found' };
  }

  await teams.setJSON(membersKey, updatedMembers);

  // Remove team from user's team list
  const userTeamsKey = `user_teams_${targetUserId}`;
  let userTeams = await teams.get(userTeamsKey, { type: 'json' }) || [];
  userTeams = userTeams.filter(id => id !== teamId);
  await teams.setJSON(userTeamsKey, userTeams);

  return { success: true };
}

// Leave team (self-removal)
export async function leaveTeam(teamId, userId) {
  const teams = store(STORES.TEAMS);
  const team = await getTeam(teamId);

  if (!team) return { error: 'Team not found' };

  // Owner can't leave, must transfer ownership first
  if (team.ownerId === userId) {
    return { error: 'Owner cannot leave team. Transfer ownership first.' };
  }

  return await removeTeamMember(teamId, userId, userId);
}

// Add a site to a team
export async function addSiteToTeam(teamId, siteId, userId) {
  const teams = store(STORES.TEAMS);

  // Check permission
  const role = await getTeamMemberRole(teamId, userId);
  if (role !== TeamRoles.OWNER && role !== TeamRoles.ADMIN) {
    return { error: 'Insufficient permissions' };
  }

  const teamSitesKey = `team_sites_${teamId}`;
  let teamSites = await teams.get(teamSitesKey, { type: 'json' }) || [];

  if (!teamSites.includes(siteId)) {
    teamSites.push(siteId);
    await teams.setJSON(teamSitesKey, teamSites);
  }

  return { success: true };
}

// Get team sites
export async function getTeamSites(teamId) {
  const teams = store(STORES.TEAMS);
  const teamSitesKey = `team_sites_${teamId}`;
  return await teams.get(teamSitesKey, { type: 'json' }) || [];
}

// Check if user can access a site (either owns it or is in a team with it)
export async function canUserAccessSite(userId, siteId) {
  // Check direct ownership
  const userSites = await getUserSites(userId);
  if (userSites.includes(siteId)) {
    return { canAccess: true, role: TeamRoles.OWNER };
  }

  // Check team access
  const userTeams = await getUserTeams(userId);
  for (const team of userTeams) {
    const teamSites = await getTeamSites(team.id);
    if (teamSites.includes(siteId)) {
      return { canAccess: true, role: team.role, teamId: team.id };
    }
  }

  return { canAccess: false };
}

// === GOAL TRACKING ===

export const GoalMetrics = {
  PAGEVIEWS: 'pageviews',
  VISITORS: 'visitors',
  SESSIONS: 'sessions',
  EVENTS: 'events',
  BOUNCE_RATE: 'bounce_rate',
  SESSION_DURATION: 'session_duration'
};

export const GoalPeriods = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly'
};

export async function createGoal(siteId, userId, config) {
  const goals = store(STORES.GOALS);

  const goalId = 'goal_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  const goal = {
    id: goalId,
    siteId,
    userId,
    name: config.name || 'New Goal',
    metric: config.metric || GoalMetrics.PAGEVIEWS,
    target: parseInt(config.target) || 1000,
    period: config.period || GoalPeriods.MONTHLY,
    comparison: config.comparison || 'gte', // gte = greater than or equal, lte = less than or equal
    notifyOnComplete: config.notifyOnComplete !== false,
    isActive: true,
    createdAt: new Date().toISOString(),
    completedAt: null,
    currentValue: 0,
    lastUpdatedAt: null
  };

  await goals.setJSON(goalId, goal);

  // Add to site's goal list
  const siteGoalsKey = `site_goals_${siteId}`;
  let siteGoals = await goals.get(siteGoalsKey, { type: 'json' }) || [];
  siteGoals.push(goalId);
  await goals.setJSON(siteGoalsKey, siteGoals);

  return goal;
}

export async function getGoal(goalId) {
  const goals = store(STORES.GOALS);
  return await goals.get(goalId, { type: 'json' });
}

export async function getSiteGoals(siteId) {
  const goals = store(STORES.GOALS);
  const siteGoalsKey = `site_goals_${siteId}`;
  const goalIds = await goals.get(siteGoalsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of goalIds) {
    const goal = await goals.get(id, { type: 'json' });
    if (goal && goal.isActive) {
      result.push(goal);
    }
  }

  // Sort by created date (newest first)
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return result;
}

export async function updateGoal(goalId, userId, updates) {
  const goals = store(STORES.GOALS);
  const goal = await goals.get(goalId, { type: 'json' });

  if (!goal || goal.userId !== userId) {
    return null;
  }

  const allowedUpdates = ['name', 'target', 'period', 'comparison', 'notifyOnComplete', 'isActive'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      goal[key] = updates[key];
    }
  }

  await goals.setJSON(goalId, goal);
  return goal;
}

export async function deleteGoal(goalId, userId) {
  const goals = store(STORES.GOALS);
  const goal = await goals.get(goalId, { type: 'json' });

  if (!goal || goal.userId !== userId) {
    return false;
  }

  goal.isActive = false;
  goal.deletedAt = new Date().toISOString();
  await goals.setJSON(goalId, goal);

  return true;
}

// Update goal progress based on current stats
export async function updateGoalProgress(goalId, currentValue) {
  const goals = store(STORES.GOALS);
  const goal = await goals.get(goalId, { type: 'json' });

  if (!goal || !goal.isActive) return null;

  goal.currentValue = currentValue;
  goal.lastUpdatedAt = new Date().toISOString();

  // Check if goal is completed
  const isComplete = goal.comparison === 'gte'
    ? currentValue >= goal.target
    : currentValue <= goal.target;

  if (isComplete && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
  }

  await goals.setJSON(goalId, goal);
  return goal;
}

// Calculate current value for a goal metric
export function calculateGoalValue(stats, metric) {
  switch (metric) {
    case GoalMetrics.PAGEVIEWS:
      return stats.pageviews || 0;
    case GoalMetrics.VISITORS:
      return stats.uniqueVisitors || 0;
    case GoalMetrics.SESSIONS:
      return stats.uniqueSessions || 0;
    case GoalMetrics.EVENTS:
      return stats.totalEvents || 0;
    case GoalMetrics.BOUNCE_RATE:
      return stats.bounceRate || 0;
    case GoalMetrics.SESSION_DURATION:
      return stats.avgSessionDuration || 0;
    default:
      return 0;
  }
}

// Get date range for goal period
export function getGoalDateRange(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case GoalPeriods.DAILY:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case GoalPeriods.WEEKLY:
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    case GoalPeriods.MONTHLY:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case GoalPeriods.QUARTERLY:
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case GoalPeriods.YEARLY:
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0]
  };
}

// === FUNNEL ANALYSIS ===

export async function createFunnel(siteId, userId, config) {
  const funnels = store(STORES.FUNNELS);

  const funnelId = 'funnel_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  // Validate steps (minimum 2 steps)
  const steps = config.steps || [];
  if (steps.length < 2) {
    return { error: 'A funnel requires at least 2 steps' };
  }

  const funnel = {
    id: funnelId,
    siteId,
    userId,
    name: config.name || 'New Funnel',
    steps: steps.map((step, index) => ({
      order: index + 1,
      name: step.name || `Step ${index + 1}`,
      type: step.type || 'page', // page, event
      value: step.value || '/', // URL path or event name
      operator: step.operator || 'equals' // equals, contains, starts_with, regex
    })),
    isActive: true,
    createdAt: new Date().toISOString()
  };

  await funnels.setJSON(funnelId, funnel);

  // Add to site's funnel list
  const siteFunnelsKey = `site_funnels_${siteId}`;
  let siteFunnels = await funnels.get(siteFunnelsKey, { type: 'json' }) || [];
  siteFunnels.push(funnelId);
  await funnels.setJSON(siteFunnelsKey, siteFunnels);

  return { funnel };
}

export async function getFunnel(funnelId) {
  const funnels = store(STORES.FUNNELS);
  return await funnels.get(funnelId, { type: 'json' });
}

export async function getSiteFunnels(siteId) {
  const funnels = store(STORES.FUNNELS);
  const siteFunnelsKey = `site_funnels_${siteId}`;
  const funnelIds = await funnels.get(siteFunnelsKey, { type: 'json' }) || [];

  const result = [];
  for (const id of funnelIds) {
    const funnel = await funnels.get(id, { type: 'json' });
    if (funnel && funnel.isActive) {
      result.push(funnel);
    }
  }

  // Sort by created date (newest first)
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return result;
}

export async function updateFunnel(funnelId, userId, updates) {
  const funnels = store(STORES.FUNNELS);
  const funnel = await funnels.get(funnelId, { type: 'json' });

  if (!funnel || funnel.userId !== userId) {
    return null;
  }

  const allowedUpdates = ['name', 'steps', 'isActive'];
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      funnel[key] = updates[key];
    }
  }

  await funnels.setJSON(funnelId, funnel);
  return funnel;
}

export async function deleteFunnel(funnelId, userId) {
  const funnels = store(STORES.FUNNELS);
  const funnel = await funnels.get(funnelId, { type: 'json' });

  if (!funnel || funnel.userId !== userId) {
    return false;
  }

  funnel.isActive = false;
  funnel.deletedAt = new Date().toISOString();
  await funnels.setJSON(funnelId, funnel);

  return true;
}

// Calculate funnel metrics from stats
export function calculateFunnelData(funnel, stats) {
  const stepData = funnel.steps.map(step => {
    let count = 0;

    if (step.type === 'page') {
      // Count pageviews matching the step
      for (const [path, views] of Object.entries(stats.pages || {})) {
        if (matchesStep(path, step)) {
          count += views;
        }
      }
    } else if (step.type === 'event') {
      // Count events matching the step
      for (const [key, data] of Object.entries(stats.events || {})) {
        if (matchesStep(key, step)) {
          count += data.count;
        }
      }
    }

    return {
      ...step,
      count
    };
  });

  // Calculate conversion rates between steps
  const funnelData = stepData.map((step, index) => {
    const prevStep = index > 0 ? stepData[index - 1] : null;
    const conversionRate = prevStep && prevStep.count > 0
      ? Math.round((step.count / prevStep.count) * 100)
      : 100;

    const dropoff = prevStep
      ? prevStep.count - step.count
      : 0;

    const dropoffRate = prevStep && prevStep.count > 0
      ? Math.round((dropoff / prevStep.count) * 100)
      : 0;

    return {
      ...step,
      conversionRate,
      dropoff,
      dropoffRate
    };
  });

  // Overall conversion rate (first to last step)
  const overallConversion = stepData.length > 0 && stepData[0].count > 0
    ? Math.round((stepData[stepData.length - 1].count / stepData[0].count) * 100)
    : 0;

  return {
    steps: funnelData,
    overallConversion,
    totalEntered: stepData[0]?.count || 0,
    totalCompleted: stepData[stepData.length - 1]?.count || 0
  };
}

// Helper to match step criteria
function matchesStep(value, step) {
  const target = step.value || '';

  switch (step.operator) {
    case 'equals':
      return value === target;
    case 'contains':
      return value.includes(target);
    case 'starts_with':
      return value.startsWith(target);
    case 'regex':
      try {
        return new RegExp(target).test(value);
      } catch (e) {
        return false;
      }
    default:
      return value === target;
  }
}

// === HEATMAP DATA ===

// Record click data for heatmaps
export async function recordHeatmapClick(siteId, data) {
  const heatmaps = store(STORES.HEATMAPS);

  const today = new Date().toISOString().split('T')[0];
  const path = data.path || '/';
  const key = `${siteId}:clicks:${today}:${encodeURIComponent(path)}`;

  // Get or create daily click data for this page
  let clickData = await heatmaps.get(key, { type: 'json' });
  if (!clickData) {
    clickData = {
      siteId,
      path,
      date: today,
      clicks: [],
      totalClicks: 0,
      viewport: {} // Track viewport sizes
    };
  }

  // Store click position as percentage of viewport
  // This normalizes across different screen sizes
  const click = {
    x: Math.round(data.xPercent * 100) / 100, // Percentage from left (0-100)
    y: Math.round(data.yPercent * 100) / 100, // Percentage from top (0-100)
    element: data.element || null, // Optional element selector
    timestamp: Date.now()
  };

  // Store viewport dimensions for analysis
  const viewportKey = `${data.viewportWidth}x${data.viewportHeight}`;
  clickData.viewport[viewportKey] = (clickData.viewport[viewportKey] || 0) + 1;

  // Add click to array (limit to prevent excessive storage)
  clickData.clicks.push(click);
  if (clickData.clicks.length > 10000) {
    // Keep most recent 10000 clicks
    clickData.clicks = clickData.clicks.slice(-10000);
  }
  clickData.totalClicks++;

  await heatmaps.setJSON(key, clickData);

  return clickData;
}

// Record scroll depth data for heatmaps
export async function recordHeatmapScroll(siteId, data) {
  const heatmaps = store(STORES.HEATMAPS);

  const today = new Date().toISOString().split('T')[0];
  const path = data.path || '/';
  const key = `${siteId}:scroll:${today}:${encodeURIComponent(path)}`;

  // Get or create daily scroll data for this page
  let scrollData = await heatmaps.get(key, { type: 'json' });
  if (!scrollData) {
    scrollData = {
      siteId,
      path,
      date: today,
      depths: {}, // Buckets: 0-10%, 10-20%, etc.
      maxDepths: [], // Individual max scroll depths
      totalSessions: 0,
      avgFold: 0, // Average fold position
      foldCount: 0
    };
  }

  // Record max scroll depth
  const maxDepth = Math.min(100, Math.max(0, Math.round(data.maxScrollDepth)));
  scrollData.maxDepths.push(maxDepth);

  // Limit stored depths
  if (scrollData.maxDepths.length > 5000) {
    scrollData.maxDepths = scrollData.maxDepths.slice(-5000);
  }

  // Bucket the depth (0-10, 10-20, etc.)
  const bucket = Math.floor(maxDepth / 10) * 10;
  const bucketKey = `${bucket}-${bucket + 10}`;
  scrollData.depths[bucketKey] = (scrollData.depths[bucketKey] || 0) + 1;

  scrollData.totalSessions++;

  // Track fold position (where most users stop scrolling)
  if (data.foldPosition) {
    scrollData.avgFold = (scrollData.avgFold * scrollData.foldCount + data.foldPosition) / (scrollData.foldCount + 1);
    scrollData.foldCount++;
  }

  await heatmaps.setJSON(key, scrollData);

  return scrollData;
}

// Get heatmap click data for a page
export async function getHeatmapClicks(siteId, path, startDate, endDate) {
  const heatmaps = store(STORES.HEATMAPS);

  // Generate date range
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // Aggregate clicks across dates
  const aggregated = {
    path,
    clicks: [],
    totalClicks: 0,
    viewport: {},
    dateRange: { startDate, endDate }
  };

  for (const date of dates) {
    const key = `${siteId}:clicks:${date}:${encodeURIComponent(path)}`;
    const dayData = await heatmaps.get(key, { type: 'json' });

    if (dayData) {
      aggregated.clicks = aggregated.clicks.concat(dayData.clicks);
      aggregated.totalClicks += dayData.totalClicks;

      // Merge viewport counts
      for (const [vp, count] of Object.entries(dayData.viewport)) {
        aggregated.viewport[vp] = (aggregated.viewport[vp] || 0) + count;
      }
    }
  }

  // Generate density grid for visualization (100x100 grid)
  const gridSize = 100;
  const density = Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));

  for (const click of aggregated.clicks) {
    const gridX = Math.min(gridSize - 1, Math.floor(click.x));
    const gridY = Math.min(gridSize - 1, Math.floor(click.y));
    density[gridY][gridX]++;
  }

  // Find max density for normalization
  let maxDensity = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      maxDensity = Math.max(maxDensity, density[y][x]);
    }
  }

  // Normalize density to 0-1 range
  if (maxDensity > 0) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        density[y][x] = Math.round((density[y][x] / maxDensity) * 100) / 100;
      }
    }
  }

  return {
    ...aggregated,
    density,
    maxDensity
  };
}

// Get scroll depth data for a page
export async function getHeatmapScroll(siteId, path, startDate, endDate) {
  const heatmaps = store(STORES.HEATMAPS);

  // Generate date range
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // Aggregate scroll data across dates
  const aggregated = {
    path,
    depths: {},
    totalSessions: 0,
    avgMaxDepth: 0,
    avgFold: 0,
    dateRange: { startDate, endDate }
  };

  let allDepths = [];

  for (const date of dates) {
    const key = `${siteId}:scroll:${date}:${encodeURIComponent(path)}`;
    const dayData = await heatmaps.get(key, { type: 'json' });

    if (dayData) {
      allDepths = allDepths.concat(dayData.maxDepths || []);
      aggregated.totalSessions += dayData.totalSessions;

      // Merge depth buckets
      for (const [bucket, count] of Object.entries(dayData.depths)) {
        aggregated.depths[bucket] = (aggregated.depths[bucket] || 0) + count;
      }

      // Track average fold
      if (dayData.avgFold && dayData.foldCount) {
        aggregated.avgFold = (aggregated.avgFold * aggregated.totalSessions + dayData.avgFold * dayData.foldCount) / (aggregated.totalSessions + dayData.foldCount);
      }
    }
  }

  // Calculate average max depth
  if (allDepths.length > 0) {
    aggregated.avgMaxDepth = Math.round(allDepths.reduce((a, b) => a + b, 0) / allDepths.length);
  }

  // Calculate reach percentages (what % of users reached each depth)
  const reach = {};
  for (let depth = 10; depth <= 100; depth += 10) {
    const reachedCount = allDepths.filter(d => d >= depth).length;
    reach[depth] = allDepths.length > 0 ? Math.round((reachedCount / allDepths.length) * 100) : 0;
  }

  return {
    ...aggregated,
    reach
  };
}

// Get list of pages with heatmap data for a site
export async function getHeatmapPages(siteId, startDate, endDate) {
  const heatmaps = store(STORES.HEATMAPS);

  // Generate date range
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // Collect unique pages with data
  const pages = new Map();

  // List all keys in heatmaps store
  const { blobs } = await heatmaps.list();

  for (const blob of blobs) {
    // Parse key format: siteId:type:date:path
    const parts = blob.key.split(':');
    if (parts.length >= 4 && parts[0] === siteId) {
      const type = parts[1];
      const date = parts[2];
      const path = decodeURIComponent(parts.slice(3).join(':'));

      if (dates.includes(date)) {
        if (!pages.has(path)) {
          pages.set(path, { path, hasClicks: false, hasScroll: false });
        }

        if (type === 'clicks') {
          pages.get(path).hasClicks = true;
        } else if (type === 'scroll') {
          pages.get(path).hasScroll = true;
        }
      }
    }
  }

  return Array.from(pages.values());
}
