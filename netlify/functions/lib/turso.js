/**
 * TURSO CLIENT
 * =============
 * Wrapper for Turso (libSQL) database interactions.
 * Primary analytics storage layer.
 */

import { createClient } from '@libsql/client';
import { Config } from './config.js';

// Initialize Turso client with validated configuration
const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

/**
 * Convert BigInt values to numbers in row objects
 * libSQL returns BigInt for INTEGER columns which don't serialize to JSON
 */
function normalizeRows(rows) {
  return rows.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return normalized;
  });
}

/**
 * Initialize the database schema
 * Run this once to set up tables
 */
async function initSchema() {
  // Pageviews table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      identity_hash TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      context_device TEXT,
      context_browser TEXT,
      context_os TEXT,
      context_country TEXT,
      context_region TEXT,
      meta_is_bounce INTEGER DEFAULT 0,
      meta_duration INTEGER DEFAULT 0
    )
  `);

  // Teams table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);

  // Team members table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      invited_by TEXT,
      invited_at TEXT,
      joined_at TEXT,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  // Monthly usage tracking table
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS monthly_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      month TEXT NOT NULL,
      pageviews INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      events INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(team_id, site_id, month)
    )
  `);

  // Create indexes for common queries
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_site_timestamp ON pageviews(site_id, timestamp)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_site_event ON pageviews(site_id, event_type)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_identity ON pageviews(identity_hash)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_site_event_ts ON pageviews(site_id, event_type, timestamp)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_session ON pageviews(site_id, session_hash)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_device ON pageviews(site_id, context_device) WHERE event_type = 'pageview'`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_browser ON pageviews(site_id, context_browser) WHERE event_type = 'pageview'`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_country ON pageviews(site_id, context_country) WHERE event_type = 'pageview'`);

  // Team indexes
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_monthly_usage_team_month ON monthly_usage(team_id, month)`);
}

/**
 * Ingest events into Turso
 *
 * @param {string} tableName - Table name (e.g., 'pageviews')
 * @param {object|array} events - Single event or array of events
 * @returns {Promise<object>}
 */
async function ingestEvents(tableName, events) {
  const eventsArray = Array.isArray(events) ? events : [events];

  // Use a transaction for batch inserts
  const statements = eventsArray.map(e => ({
    sql: `INSERT INTO ${tableName} (
      timestamp, site_id, identity_hash, session_hash, event_type,
      payload, context_device, context_browser, context_os,
      context_country, context_region, meta_is_bounce, meta_duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      e.timestamp,
      e.site_id,
      e.identity_hash,
      e.session_hash,
      e.event_type,
      e.payload,
      e.context_device,
      e.context_browser,
      e.context_os,
      e.context_country,
      e.context_region,
      e.meta_is_bounce,
      e.meta_duration
    ]
  }));

  const result = await turso.batch(statements);
  return { success: true, inserted: eventsArray.length };
}

/**
 * Get stats for a site
 *
 * @param {string} siteId
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<object>}
 */
async function getStats(siteId, startDate, endDate) {
  // Run all queries in parallel - comprehensive Plausible/Fathom parity
  const [
    dailyStats,
    topPages,
    entryPages,
    exitPages,
    topReferrers,
    devices,
    browsers,
    operatingSystems,
    countries,
    regions,
    cities,
    utmSources,
    utmMediums,
    utmCampaigns,
    utmContents,
    utmTerms,
    sessionCounts
  ] = await Promise.all([
    // Daily stats - pageviews from 'pageview' events, bounce/duration from 'engagement' events
    turso.execute({
      sql: `
        SELECT
          DATE(timestamp) as date,
          SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) as pageviews,
          COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN identity_hash END) as unique_visitors,
          COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN session_hash END) as sessions,
          SUM(CASE WHEN event_type = 'engagement' AND meta_is_bounce = 1 THEN 1 ELSE 0 END) as bounces,
          COALESCE(ROUND(AVG(CASE WHEN event_type = 'engagement' AND meta_duration > 0 THEN meta_duration END), 0), 0) as avg_duration
        FROM pageviews
        WHERE event_type IN ('pageview', 'engagement')
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `,
      args: [siteId, startDate, endDate]
    }),

    // Top pages (all pages with views and duration from engagement events)
    turso.execute({
      sql: `
        SELECT
          pv.page,
          pv.views,
          pv.visitors,
          COALESCE(eng.avg_duration, 0) as duration
        FROM (
          SELECT
            JSON_EXTRACT(payload, '$.page_path') as page,
            COUNT(*) as views,
            COUNT(DISTINCT identity_hash) as visitors
          FROM pageviews
          WHERE event_type = 'pageview'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
          GROUP BY page
        ) pv
        LEFT JOIN (
          SELECT
            JSON_EXTRACT(payload, '$.page_path') as page,
            ROUND(AVG(meta_duration), 0) as avg_duration
          FROM pageviews
          WHERE event_type = 'engagement'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
            AND meta_duration > 0
          GROUP BY page
        ) eng ON pv.page = eng.page
        ORDER BY pv.views DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate, siteId, startDate, endDate]
    }),

    // Entry pages (first page of session) with duration from engagement events
    turso.execute({
      sql: `
        WITH first_pages AS (
          SELECT session_hash, MIN(timestamp) as first_ts
          FROM pageviews
          WHERE event_type = 'pageview'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
          GROUP BY session_hash
        )
        SELECT
          ep.page,
          ep.visits,
          ep.visitors,
          COALESCE(eng.avg_duration, 0) as duration
        FROM (
          SELECT
            JSON_EXTRACT(p.payload, '$.page_path') as page,
            COUNT(*) as visits,
            COUNT(DISTINCT p.identity_hash) as visitors
          FROM pageviews p
          JOIN first_pages fp ON p.session_hash = fp.session_hash AND p.timestamp = fp.first_ts
          WHERE p.site_id = ?
          GROUP BY page
        ) ep
        LEFT JOIN (
          SELECT
            JSON_EXTRACT(payload, '$.page_path') as page,
            ROUND(AVG(meta_duration), 0) as avg_duration
          FROM pageviews
          WHERE event_type = 'engagement'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
            AND meta_duration > 0
          GROUP BY page
        ) eng ON ep.page = eng.page
        ORDER BY ep.visits DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate, siteId, siteId, startDate, endDate]
    }),

    // Exit pages (last page of session) with duration from engagement events
    turso.execute({
      sql: `
        WITH last_pages AS (
          SELECT session_hash, MAX(timestamp) as last_ts
          FROM pageviews
          WHERE event_type = 'pageview'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
          GROUP BY session_hash
        )
        SELECT
          xp.page,
          xp.exits,
          xp.visitors,
          COALESCE(eng.avg_duration, 0) as duration
        FROM (
          SELECT
            JSON_EXTRACT(p.payload, '$.page_path') as page,
            COUNT(*) as exits,
            COUNT(DISTINCT p.identity_hash) as visitors
          FROM pageviews p
          JOIN last_pages lp ON p.session_hash = lp.session_hash AND p.timestamp = lp.last_ts
          WHERE p.site_id = ?
          GROUP BY page
        ) xp
        LEFT JOIN (
          SELECT
            JSON_EXTRACT(payload, '$.page_path') as page,
            ROUND(AVG(meta_duration), 0) as avg_duration
          FROM pageviews
          WHERE event_type = 'engagement'
            AND site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
            AND meta_duration > 0
          GROUP BY page
        ) eng ON xp.page = eng.page
        ORDER BY xp.exits DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate, siteId, siteId, startDate, endDate]
    }),

    // Top referrers
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.referrer_domain') as referrer,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.referrer_domain') != ''
          AND JSON_EXTRACT(payload, '$.referrer_domain') IS NOT NULL
        GROUP BY referrer
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Devices
    turso.execute({
      sql: `
        SELECT
          context_device as device,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY device
        ORDER BY visitors DESC
      `,
      args: [siteId, startDate, endDate]
    }),

    // Browsers
    turso.execute({
      sql: `
        SELECT
          context_browser as browser,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY browser
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Operating Systems
    turso.execute({
      sql: `
        SELECT
          context_os as os,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY os
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Countries
    turso.execute({
      sql: `
        SELECT
          context_country as country,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY country
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Regions
    turso.execute({
      sql: `
        SELECT
          context_region as region,
          context_country as country,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND context_region IS NOT NULL
          AND context_region != ''
        GROUP BY region, country
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Cities
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.city') as city,
          context_country as country,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.city') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.city') != ''
        GROUP BY city, country
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // UTM Sources
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.utm_source') as utm_source,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.utm_source') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.utm_source') != ''
        GROUP BY utm_source
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // UTM Mediums
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.utm_medium') as utm_medium,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.utm_medium') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.utm_medium') != ''
        GROUP BY utm_medium
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // UTM Campaigns
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.utm_campaign') as utm_campaign,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.utm_campaign') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.utm_campaign') != ''
        GROUP BY utm_campaign
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // UTM Contents
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.utm_content') as utm_content,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.utm_content') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.utm_content') != ''
        GROUP BY utm_content
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // UTM Terms
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.utm_term') as utm_term,
          COUNT(*) as views,
          COUNT(DISTINCT identity_hash) as visitors
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.utm_term') IS NOT NULL
          AND JSON_EXTRACT(payload, '$.utm_term') != ''
        GROUP BY utm_term
        ORDER BY visitors DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Session counts and bounce rate calculation
    // A session is NOT a bounce if:
    //   - It has more than 1 pageview, OR
    //   - It has an outbound click event (user clicked to leave, e.g., to app.ztas.io)
    turso.execute({
      sql: `
        SELECT
          COUNT(*) as total_sessions,
          SUM(CASE WHEN pv_count = 1 AND has_outbound = 0 THEN 1 ELSE 0 END) as bounced_sessions
        FROM (
          SELECT
            session_hash,
            SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) as pv_count,
            MAX(CASE WHEN event_type = 'event' AND JSON_EXTRACT(payload, '$.category') = 'outbound' THEN 1 ELSE 0 END) as has_outbound
          FROM pageviews
          WHERE site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
          GROUP BY session_hash
          HAVING pv_count > 0
        )
      `,
      args: [siteId, startDate, endDate]
    })
  ]);

  // Calculate totals from daily stats
  const daily = normalizeRows(dailyStats.rows);
  const totals = daily.reduce(
    (acc, day) => ({
      pageviews: acc.pageviews + (day.pageviews || 0),
      unique_visitors: acc.unique_visitors + (day.unique_visitors || 0),
      sessions: acc.sessions + (day.sessions || 0),
      bounces: acc.bounces + (day.bounces || 0),
      total_duration: acc.total_duration + ((day.avg_duration || 0) * (day.pageviews || 0))
    }),
    { pageviews: 0, unique_visitors: 0, sessions: 0, bounces: 0, total_duration: 0 }
  );

  // Get session and bounce data
  const sessionData = normalizeRows(sessionCounts.rows)[0] || { total_sessions: 0, bounced_sessions: 0 };
  const totalSessions = sessionData.total_sessions || 0;
  const bouncedSessions = sessionData.bounced_sessions || 0;

  // Helper to convert rows to array format with visitors and duration
  const rowsToArrayWithVisitors = (rows, keyField) => {
    return normalizeRows(rows).map(row => ({
      name: row[keyField] || 'Unknown',
      visitors: row.visitors || 0,
      views: row.views || row.visits || row.exits || 0,
      duration: row.duration || row.avg_duration || 0,
      ...(row.country ? { country: row.country } : {}),
      ...(row.exitRate ? { exitRate: row.exitRate } : {})
    }));
  };

  // Convert arrays to objects for frontend compatibility (legacy format)
  const pagesToObj = rowsToObject(normalizeRows(topPages.rows), 'page', 'views');
  const referrersToObj = rowsToObject(normalizeRows(topReferrers.rows), 'referrer', 'views');
  const devicesToObj = rowsToObject(normalizeRows(devices.rows), 'device', 'visitors');
  const browsersToObj = rowsToObject(normalizeRows(browsers.rows), 'browser', 'visitors');
  const countriesToObj = rowsToObject(normalizeRows(countries.rows), 'country', 'visitors');

  return {
    summary: {
      pageviews: totals.pageviews,
      unique_visitors: totals.unique_visitors,
      sessions: totalSessions,
      bounce_rate: totalSessions > 0
        ? Math.round((bouncedSessions / totalSessions) * 100)
        : 0,
      avg_duration: totals.pageviews > 0
        ? Math.round(totals.total_duration / totals.pageviews)
        : 0,
      views_per_visit: totalSessions > 0
        ? Math.round((totals.pageviews / totalSessions) * 10) / 10
        : 0
    },
    daily,
    // Legacy object format
    pages: pagesToObj,
    referrers: referrersToObj,
    devices: devicesToObj,
    browsers: browsersToObj,
    countries: countriesToObj,
    // New detailed array format with visitor counts
    topPages: rowsToArrayWithVisitors(topPages.rows, 'page'),
    entryPages: rowsToArrayWithVisitors(entryPages.rows, 'page'),
    exitPages: rowsToArrayWithVisitors(exitPages.rows, 'page'),
    sources: rowsToArrayWithVisitors(topReferrers.rows, 'referrer'),
    devicesList: rowsToArrayWithVisitors(devices.rows, 'device'),
    browsersList: rowsToArrayWithVisitors(browsers.rows, 'browser'),
    operatingSystems: rowsToArrayWithVisitors(operatingSystems.rows, 'os'),
    countriesList: rowsToArrayWithVisitors(countries.rows, 'country'),
    regions: rowsToArrayWithVisitors(regions.rows, 'region'),
    cities: rowsToArrayWithVisitors(cities.rows, 'city'),
    // UTM parameters
    utm: {
      sources: rowsToArrayWithVisitors(utmSources.rows, 'utm_source'),
      mediums: rowsToArrayWithVisitors(utmMediums.rows, 'utm_medium'),
      campaigns: rowsToArrayWithVisitors(utmCampaigns.rows, 'utm_campaign'),
      contents: rowsToArrayWithVisitors(utmContents.rows, 'utm_content'),
      terms: rowsToArrayWithVisitors(utmTerms.rows, 'utm_term')
    }
  };
}

/**
 * Convert array of rows to object format
 * e.g., [{ page: "/", views: 5 }] -> { "/": 5 }
 */
function rowsToObject(rows, keyField, valueField) {
  const obj = {};
  for (const row of rows) {
    const key = row[keyField];
    if (key !== null && key !== undefined && key !== '') {
      obj[key] = row[valueField];
    }
  }
  return obj;
}

/**
 * Get realtime stats for a site
 *
 * @param {string} siteId
 * @returns {Promise<object>}
 */
async function getRealtime(siteId) {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .split('.')[0];

    const [activeResult, recentResult] = await Promise.all([
      // Active visitors in last 5 minutes
      turso.execute({
        sql: `
          SELECT
            COUNT(DISTINCT identity_hash) as active_visitors,
            COUNT(*) as pageviews_last_5min
          FROM pageviews
          WHERE site_id = ?
            AND timestamp >= ?
            AND event_type = 'pageview'
        `,
        args: [siteId, fiveMinutesAgo]
      }),

      // Recent pageviews
      turso.execute({
        sql: `
          SELECT
            timestamp,
            JSON_EXTRACT(payload, '$.page_path') as page
          FROM pageviews
          WHERE site_id = ?
            AND event_type = 'pageview'
          ORDER BY timestamp DESC
          LIMIT 10
        `,
        args: [siteId]
      })
    ]);

    const activeRows = normalizeRows(activeResult.rows);
    const active = activeRows[0] || {};

    return {
      active_visitors: active.active_visitors || 0,
      pageviews_last_5min: active.pageviews_last_5min || 0,
      recent_pageviews: normalizeRows(recentResult.rows),
      visitors_per_minute: [],
      traffic_sources: []
    };
  } catch (err) {
    console.error('Realtime query error:', err);
    return {
      active_visitors: 0,
      pageviews_last_5min: 0,
      recent_pageviews: [],
      visitors_per_minute: [],
      traffic_sources: []
    };
  }
}

/**
 * Export data for a site
 *
 * @param {string} siteId
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} type - 'pageviews', 'events', or 'summary'
 * @param {number} limit
 * @returns {Promise<array>}
 */
async function exportData(siteId, startDate, endDate, type = 'pageviews', limit = 10000) {
  const queries = {
    pageviews: {
      sql: `
        SELECT
          timestamp,
          JSON_EXTRACT(payload, '$.page_path') as page_path,
          JSON_EXTRACT(payload, '$.referrer_domain') as referrer,
          context_device as device,
          context_browser as browser,
          context_country as country,
          meta_duration as time_on_page,
          meta_is_bounce as is_bounce
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      args: [siteId, startDate, endDate, limit]
    },
    events: {
      sql: `
        SELECT
          timestamp,
          event_type,
          payload,
          context_device as device,
          context_browser as browser,
          context_country as country
        FROM pageviews
        WHERE event_type != 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      args: [siteId, startDate, endDate, limit]
    },
    summary: {
      sql: `
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as pageviews,
          COUNT(DISTINCT identity_hash) as unique_visitors,
          SUM(CASE WHEN meta_is_bounce = 1 THEN 1 ELSE 0 END) as bounces
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `,
      args: [siteId, startDate, endDate]
    }
  };

  const query = queries[type] || queries.pageviews;
  const result = await turso.execute(query);
  return normalizeRows(result.rows);
}

/**
 * Debug: Get row count for a site
 */
async function debugGetCount(siteId) {
  const result = await turso.execute({
    sql: `SELECT COUNT(*) as count, MAX(timestamp) as latest FROM pageviews WHERE site_id = ?`,
    args: [siteId]
  });
  return normalizeRows(result.rows)[0] || { count: 0, latest: null };
}

/**
 * Debug: Get recent rows
 */
async function debugGetRecent(siteId, limit = 5) {
  const result = await turso.execute({
    sql: `SELECT * FROM pageviews WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?`,
    args: [siteId, limit]
  });
  return normalizeRows(result.rows);
}

// ============================================
// TEAM FUNCTIONS
// ============================================

/**
 * Create a new team
 */
async function createTeam(name, ownerId, ownerEmail, plan = 'free') {
  const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const memberId = 'member_' + Date.now();
  const now = new Date().toISOString();

  await turso.batch([
    {
      sql: `INSERT INTO teams (id, name, owner_id, plan, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [teamId, name, ownerId, plan, now]
    },
    {
      sql: `INSERT INTO team_members (id, team_id, user_id, email, role, joined_at, status) VALUES (?, ?, ?, ?, 'admin', ?, 'active')`,
      args: [memberId, teamId, ownerId, ownerEmail, now]
    }
  ]);

  return { id: teamId, name, ownerId, plan, createdAt: now };
}

/**
 * Get team by ID
 */
async function getTeam(teamId) {
  const result = await turso.execute({
    sql: `SELECT * FROM teams WHERE id = ?`,
    args: [teamId]
  });
  return normalizeRows(result.rows)[0] || null;
}

/**
 * Get teams for a user (as owner or member)
 */
async function getTeamsForUser(userId) {
  const result = await turso.execute({
    sql: `
      SELECT DISTINCT t.*, tm.role as user_role
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ? AND tm.status = 'active'
      ORDER BY t.created_at DESC
    `,
    args: [userId]
  });
  return normalizeRows(result.rows);
}

/**
 * Update team
 */
async function updateTeam(teamId, updates) {
  const fields = [];
  const args = [];

  for (const [key, value] of Object.entries(updates)) {
    // Map camelCase to snake_case
    const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    fields.push(`${dbField} = ?`);
    args.push(value);
  }

  fields.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(teamId);

  await turso.execute({
    sql: `UPDATE teams SET ${fields.join(', ')} WHERE id = ?`,
    args
  });
}

/**
 * Delete team
 */
async function deleteTeam(teamId) {
  await turso.batch([
    { sql: `DELETE FROM team_members WHERE team_id = ?`, args: [teamId] },
    { sql: `DELETE FROM monthly_usage WHERE team_id = ?`, args: [teamId] },
    { sql: `DELETE FROM teams WHERE id = ?`, args: [teamId] }
  ]);
}

// ============================================
// TEAM MEMBER FUNCTIONS
// ============================================

/**
 * Invite a member to a team
 */
async function inviteTeamMember(teamId, email, role, invitedBy) {
  const memberId = 'member_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();

  await turso.execute({
    sql: `INSERT INTO team_members (id, team_id, user_id, email, role, invited_by, invited_at, status)
          VALUES (?, ?, '', ?, ?, ?, ?, 'pending')`,
    args: [memberId, teamId, email, role, invitedBy, now]
  });

  return { id: memberId, teamId, email, role, status: 'pending', invitedAt: now };
}

/**
 * Accept team invitation
 */
async function acceptTeamInvitation(email, userId) {
  const now = new Date().toISOString();
  await turso.execute({
    sql: `UPDATE team_members SET user_id = ?, status = 'active', joined_at = ? WHERE email = ? AND status = 'pending'`,
    args: [userId, now, email]
  });
}

/**
 * Get team members
 */
async function getTeamMembers(teamId) {
  const result = await turso.execute({
    sql: `SELECT * FROM team_members WHERE team_id = ? ORDER BY joined_at ASC`,
    args: [teamId]
  });
  return normalizeRows(result.rows);
}

/**
 * Get pending invitations for an email
 */
async function getPendingInvitations(email) {
  const result = await turso.execute({
    sql: `
      SELECT tm.*, t.name as team_name
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.email = ? AND tm.status = 'pending'
    `,
    args: [email]
  });
  return normalizeRows(result.rows);
}

/**
 * Update team member role
 */
async function updateTeamMemberRole(memberId, role) {
  await turso.execute({
    sql: `UPDATE team_members SET role = ? WHERE id = ?`,
    args: [role, memberId]
  });
}

/**
 * Remove team member
 */
async function removeTeamMember(memberId) {
  await turso.execute({
    sql: `DELETE FROM team_members WHERE id = ?`,
    args: [memberId]
  });
}

/**
 * Check if user is team admin
 */
async function isTeamAdmin(teamId, userId) {
  const result = await turso.execute({
    sql: `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`,
    args: [teamId, userId]
  });
  const member = normalizeRows(result.rows)[0];
  return member?.role === 'admin';
}

/**
 * Check if user is team member
 */
async function isTeamMember(teamId, userId) {
  const result = await turso.execute({
    sql: `SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`,
    args: [teamId, userId]
  });
  return result.rows.length > 0;
}

// ============================================
// USAGE TRACKING FUNCTIONS
// ============================================

/**
 * Get current month key (YYYY-MM format)
 */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Increment pageview count for a site
 */
async function incrementUsage(teamId, siteId, type = 'pageview') {
  const month = getCurrentMonth();
  const now = new Date().toISOString();

  // Use upsert pattern
  const column = type === 'pageview' ? 'pageviews' : type === 'visitor' ? 'unique_visitors' : 'events';

  await turso.execute({
    sql: `
      INSERT INTO monthly_usage (team_id, site_id, month, ${column}, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(team_id, site_id, month) DO UPDATE SET
        ${column} = ${column} + 1,
        updated_at = ?
    `,
    args: [teamId, siteId, month, now, now]
  });
}

/**
 * Get usage for a team for current month
 */
async function getTeamUsage(teamId, month = null) {
  const targetMonth = month || getCurrentMonth();

  const result = await turso.execute({
    sql: `
      SELECT
        SUM(pageviews) as total_pageviews,
        SUM(unique_visitors) as total_visitors,
        SUM(events) as total_events
      FROM monthly_usage
      WHERE team_id = ? AND month = ?
    `,
    args: [teamId, targetMonth]
  });

  const row = normalizeRows(result.rows)[0];
  return {
    month: targetMonth,
    pageviews: row?.total_pageviews || 0,
    visitors: row?.total_visitors || 0,
    events: row?.total_events || 0
  };
}

/**
 * Get usage breakdown by site for a team
 */
async function getTeamUsageBySite(teamId, month = null) {
  const targetMonth = month || getCurrentMonth();

  const result = await turso.execute({
    sql: `
      SELECT site_id, pageviews, unique_visitors, events, updated_at
      FROM monthly_usage
      WHERE team_id = ? AND month = ?
      ORDER BY pageviews DESC
    `,
    args: [teamId, targetMonth]
  });

  return normalizeRows(result.rows);
}

/**
 * Get usage history for a team (last N months)
 */
async function getTeamUsageHistory(teamId, months = 6) {
  const result = await turso.execute({
    sql: `
      SELECT
        month,
        SUM(pageviews) as total_pageviews,
        SUM(unique_visitors) as total_visitors,
        SUM(events) as total_events
      FROM monthly_usage
      WHERE team_id = ?
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `,
    args: [teamId, months]
  });

  return normalizeRows(result.rows);
}

/**
 * Check if team is within usage limits
 */
async function checkUsageLimit(teamId, limit) {
  const usage = await getTeamUsage(teamId);
  const isWithinLimit = usage.pageviews < limit;
  const percentUsed = limit > 0 ? Math.round((usage.pageviews / limit) * 100) : 0;

  return {
    isWithinLimit,
    currentUsage: usage.pageviews,
    limit,
    percentUsed,
    remaining: Math.max(0, limit - usage.pageviews)
  };
}

/**
 * Get team ID for a site
 */
async function getTeamForSite(siteId) {
  // This requires sites to have team_id - for now return from site metadata
  // Will be updated when sites table is modified
  return null;
}

export {
  turso,
  initSchema,
  ingestEvents,
  debugGetCount,
  debugGetRecent,
  getStats,
  getRealtime,
  exportData,
  // Team functions
  createTeam,
  getTeam,
  getTeamsForUser,
  updateTeam,
  deleteTeam,
  // Team member functions
  inviteTeamMember,
  acceptTeamInvitation,
  getTeamMembers,
  getPendingInvitations,
  updateTeamMemberRole,
  removeTeamMember,
  isTeamAdmin,
  isTeamMember,
  // Usage functions
  getCurrentMonth,
  incrementUsage,
  getTeamUsage,
  getTeamUsageBySite,
  getTeamUsageHistory,
  checkUsageLimit,
  getTeamForSite
};
