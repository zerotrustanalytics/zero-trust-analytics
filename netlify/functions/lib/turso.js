/**
 * TURSO CLIENT
 * =============
 * Wrapper for Turso (libSQL) database interactions.
 * Replaces Tinybird for analytics storage.
 */

import { createClient } from '@libsql/client';

// Initialize Turso client
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
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

  // Create indexes for common queries
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_site_timestamp ON pageviews(site_id, timestamp)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_site_event ON pageviews(site_id, event_type)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pageviews_identity ON pageviews(identity_hash)`);
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
  // Run all queries in parallel
  const [dailyStats, topPages, topReferrers, devices, browsers, countries] = await Promise.all([
    // Daily stats
    turso.execute({
      sql: `
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as pageviews,
          COUNT(DISTINCT identity_hash) as unique_visitors,
          SUM(CASE WHEN meta_is_bounce = 1 THEN 1 ELSE 0 END) as bounces,
          ROUND(AVG(meta_duration), 0) as avg_duration
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `,
      args: [siteId, startDate, endDate]
    }),

    // Top pages
    turso.execute({
      sql: `
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
        ORDER BY views DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Top referrers
    turso.execute({
      sql: `
        SELECT
          JSON_EXTRACT(payload, '$.referrer_domain') as referrer,
          COUNT(*) as views
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
          AND JSON_EXTRACT(payload, '$.referrer_domain') != ''
          AND JSON_EXTRACT(payload, '$.referrer_domain') IS NOT NULL
        GROUP BY referrer
        ORDER BY views DESC
        LIMIT 10
      `,
      args: [siteId, startDate, endDate]
    }),

    // Devices
    turso.execute({
      sql: `
        SELECT context_device as device, COUNT(*) as count
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY device
        ORDER BY count DESC
      `,
      args: [siteId, startDate, endDate]
    }),

    // Browsers
    turso.execute({
      sql: `
        SELECT context_browser as browser, COUNT(*) as count
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY browser
        ORDER BY count DESC
      `,
      args: [siteId, startDate, endDate]
    }),

    // Countries
    turso.execute({
      sql: `
        SELECT context_country as country, COUNT(*) as count
        FROM pageviews
        WHERE event_type = 'pageview'
          AND site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY country
        ORDER BY count DESC
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
      bounces: acc.bounces + (day.bounces || 0),
      total_duration: acc.total_duration + ((day.avg_duration || 0) * (day.pageviews || 0))
    }),
    { pageviews: 0, unique_visitors: 0, bounces: 0, total_duration: 0 }
  );

  // Convert arrays to objects for frontend compatibility
  // Frontend expects: { "/path": 5, "/other": 3 }
  const pagesToObj = rowsToObject(normalizeRows(topPages.rows), 'page', 'views');
  const referrersToObj = rowsToObject(normalizeRows(topReferrers.rows), 'referrer', 'views');
  const devicesToObj = rowsToObject(normalizeRows(devices.rows), 'device', 'count');
  const browsersToObj = rowsToObject(normalizeRows(browsers.rows), 'browser', 'count');
  const countriesToObj = rowsToObject(normalizeRows(countries.rows), 'country', 'count');

  return {
    summary: {
      pageviews: totals.pageviews,
      unique_visitors: totals.unique_visitors,
      bounce_rate: totals.pageviews > 0
        ? Math.round((totals.bounces / totals.pageviews) * 100)
        : 0,
      avg_duration: totals.pageviews > 0
        ? Math.round(totals.total_duration / totals.pageviews)
        : 0
    },
    daily,
    pages: pagesToObj,
    referrers: referrersToObj,
    devices: devicesToObj,
    browsers: browsersToObj,
    countries: countriesToObj
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

export {
  turso,
  initSchema,
  ingestEvents,
  debugGetCount,
  debugGetRecent,
  getStats,
  getRealtime,
  exportData
};
