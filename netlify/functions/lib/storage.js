import { getStore } from '@netlify/blobs';

// Store names
const STORES = {
  USERS: 'users',
  SITES: 'sites',
  PAGEVIEWS: 'pageviews',
  VISITORS: 'visitors',
  ENGAGEMENT: 'engagement',
  EVENTS: 'events',
  REALTIME: 'realtime'
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
  } else {
    // Convert arrays back to Sets for processing
    stats.visitors = new Set(stats.visitors);
    stats.sessions = new Set(stats.sessions);
  }

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
