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
  WEBHOOKS: 'webhooks'
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
