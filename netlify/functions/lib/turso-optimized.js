/**
 * TURSO CLIENT - OPTIMIZED
 * ========================
 * Refactored for minimal row reads:
 * - Denormalized columns (no JSON_EXTRACT at read time)
 * - Rollup tables for pre-aggregated stats
 * - Single-pass queries where possible
 */

import { createClient } from '@libsql/client';
import { Config } from './config.js';

const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

/**
 * Convert BigInt values to numbers
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
 * Initialize optimized schema
 * - Denormalized columns for common queries
 * - Rollup tables for aggregates
 */
async function initSchema() {
  // Pageviews table - DENORMALIZED (no JSON parsing needed at read time)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      site_id TEXT NOT NULL,
      identity_hash TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,

      -- Denormalized from payload (extracted at write time)
      page_path TEXT,
      referrer_domain TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      city TEXT,

      -- Context fields (already denormalized)
      context_device TEXT,
      context_browser TEXT,
      context_os TEXT,
      context_country TEXT,
      context_region TEXT,

      -- Meta fields
      meta_is_bounce INTEGER DEFAULT 0,
      meta_duration INTEGER DEFAULT 0,

      -- Keep original payload for edge cases (but rarely read)
      payload TEXT
    )
  `);

  // === ROLLUP TABLES ===

  // Daily rollups (updated on each pageview or hourly batch)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS daily_rollups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      pageviews INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      sessions INTEGER DEFAULT 0,
      bounces INTEGER DEFAULT 0,
      total_duration INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(site_id, date)
    )
  `);

  // Page-level rollups
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS page_rollups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      page_path TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      visitors INTEGER DEFAULT 0,
      entries INTEGER DEFAULT 0,
      exits INTEGER DEFAULT 0,
      total_duration INTEGER DEFAULT 0,
      UNIQUE(site_id, date, page_path)
    )
  `);

  // Dimension rollups (devices, browsers, countries, etc.)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS dimension_rollups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      dimension_type TEXT NOT NULL,  -- 'device', 'browser', 'os', 'country', 'region', 'city', 'referrer'
      dimension_value TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      visitors INTEGER DEFAULT 0,
      UNIQUE(site_id, date, dimension_type, dimension_value)
    )
  `);

  // UTM rollups
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS utm_rollups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      utm_type TEXT NOT NULL,  -- 'source', 'medium', 'campaign', 'content', 'term'
      utm_value TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      visitors INTEGER DEFAULT 0,
      UNIQUE(site_id, date, utm_type, utm_value)
    )
  `);

  // === INDEXES ===

  // Pageviews - optimized for common access patterns
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pv_site_ts ON pageviews(site_id, timestamp DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pv_site_date ON pageviews(site_id, DATE(timestamp))`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pv_site_event_ts ON pageviews(site_id, event_type, timestamp DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_pv_session ON pageviews(session_hash)`);

  // Rollups - fast lookups
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_daily_site_date ON daily_rollups(site_id, date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_page_site_date ON page_rollups(site_id, date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_dim_site_date_type ON dimension_rollups(site_id, date DESC, dimension_type)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_utm_site_date_type ON utm_rollups(site_id, date DESC, utm_type)`);

  // Teams (unchanged)
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

  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`);
}

/**
 * Ingest events - extracts JSON fields at write time
 */
async function ingestEvents(tableName, events) {
  const eventsArray = Array.isArray(events) ? events : [events];
  const now = new Date();
  const date = now.toISOString().split('T')[0];

  // Prepare batch insert with denormalized fields
  const insertStatements = eventsArray.map(e => {
    // Parse payload once at write time
    let payload = {};
    try {
      payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : (e.payload || {});
    } catch {}

    return {
      sql: `INSERT INTO ${tableName} (
        timestamp, site_id, identity_hash, session_hash, event_type,
        page_path, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, city,
        context_device, context_browser, context_os, context_country, context_region,
        meta_is_bounce, meta_duration, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        e.timestamp,
        e.site_id,
        e.identity_hash,
        e.session_hash,
        e.event_type,
        // Denormalized fields - extracted from payload
        payload.page_path || null,
        payload.referrer_domain || null,
        payload.utm_source || null,
        payload.utm_medium || null,
        payload.utm_campaign || null,
        payload.utm_content || null,
        payload.utm_term || null,
        payload.city || null,
        // Context
        e.context_device,
        e.context_browser,
        e.context_os,
        e.context_country,
        e.context_region,
        // Meta
        e.meta_is_bounce || 0,
        e.meta_duration || 0,
        // Original payload (for edge cases)
        typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload || {})
      ]
    };
  });

  // Update rollups for pageview events
  const pageviewEvents = eventsArray.filter(e => e.event_type === 'pageview');
  const rollupStatements = [];

  for (const e of pageviewEvents) {
    let payload = {};
    try {
      payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : (e.payload || {});
    } catch {}

    const eventDate = e.timestamp.split('T')[0].split(' ')[0];

    // Daily rollup upsert
    rollupStatements.push({
      sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions, updated_at)
            VALUES (?, ?, 1, 1, 1, ?)
            ON CONFLICT(site_id, date) DO UPDATE SET
              pageviews = pageviews + 1,
              unique_visitors = unique_visitors + CASE
                WHEN (SELECT COUNT(*) FROM pageviews WHERE site_id = ? AND DATE(timestamp) = ? AND identity_hash = ? AND event_type = 'pageview') = 1 THEN 1 ELSE 0 END,
              sessions = sessions + CASE
                WHEN (SELECT COUNT(*) FROM pageviews WHERE site_id = ? AND DATE(timestamp) = ? AND session_hash = ? AND event_type = 'pageview') = 1 THEN 1 ELSE 0 END,
              updated_at = ?`,
      args: [e.site_id, eventDate, now.toISOString(), e.site_id, eventDate, e.identity_hash, e.site_id, eventDate, e.session_hash, now.toISOString()]
    });

    // Page rollup upsert
    if (payload.page_path) {
      rollupStatements.push({
        sql: `INSERT INTO page_rollups (site_id, date, page_path, views, visitors)
              VALUES (?, ?, ?, 1, 1)
              ON CONFLICT(site_id, date, page_path) DO UPDATE SET
                views = views + 1,
                visitors = visitors + CASE
                  WHEN (SELECT COUNT(*) FROM pageviews WHERE site_id = ? AND DATE(timestamp) = ? AND page_path = ? AND identity_hash = ? AND event_type = 'pageview') = 1 THEN 1 ELSE 0 END`,
        args: [e.site_id, eventDate, payload.page_path, e.site_id, eventDate, payload.page_path, e.identity_hash]
      });
    }

    // Dimension rollups
    const dimColMap = { device: 'context_device', browser: 'context_browser', os: 'context_os', country: 'context_country', region: 'context_region', city: 'city', referrer: 'referrer_domain' };
    const dimensions = [
      ['device', e.context_device],
      ['browser', e.context_browser],
      ['os', e.context_os],
      ['country', e.context_country],
      ['region', e.context_region],
      ['city', payload.city],
      ['referrer', payload.referrer_domain]
    ];

    for (const [dimType, dimValue] of dimensions) {
      if (dimValue) {
        const col = dimColMap[dimType];
        rollupStatements.push({
          sql: `INSERT INTO dimension_rollups (site_id, date, dimension_type, dimension_value, views, visitors)
                VALUES (?, ?, ?, ?, 1, 1)
                ON CONFLICT(site_id, date, dimension_type, dimension_value) DO UPDATE SET
                  views = views + 1,
                  visitors = visitors + CASE
                    WHEN (SELECT COUNT(*) FROM pageviews WHERE site_id = ? AND DATE(timestamp) = ? AND ${col} = ? AND identity_hash = ? AND event_type = 'pageview') = 1 THEN 1 ELSE 0 END`,
          args: [e.site_id, eventDate, dimType, dimValue, e.site_id, eventDate, dimValue, e.identity_hash]
        });
      }
    }

    // UTM rollups
    const utmColMap = { source: 'utm_source', medium: 'utm_medium', campaign: 'utm_campaign', content: 'utm_content', term: 'utm_term' };
    const utms = [
      ['source', payload.utm_source],
      ['medium', payload.utm_medium],
      ['campaign', payload.utm_campaign],
      ['content', payload.utm_content],
      ['term', payload.utm_term]
    ];

    for (const [utmType, utmValue] of utms) {
      if (utmValue) {
        const col = utmColMap[utmType];
        rollupStatements.push({
          sql: `INSERT INTO utm_rollups (site_id, date, utm_type, utm_value, views, visitors)
                VALUES (?, ?, ?, ?, 1, 1)
                ON CONFLICT(site_id, date, utm_type, utm_value) DO UPDATE SET
                  views = views + 1,
                  visitors = visitors + CASE
                    WHEN (SELECT COUNT(*) FROM pageviews WHERE site_id = ? AND DATE(timestamp) = ? AND ${col} = ? AND identity_hash = ? AND event_type = 'pageview') = 1 THEN 1 ELSE 0 END`,
          args: [e.site_id, eventDate, utmType, utmValue, e.site_id, eventDate, utmValue, e.identity_hash]
        });
      }
    }
  }

  // Execute all in a single batch
  await turso.batch([...insertStatements, ...rollupStatements]);

  return { success: true, inserted: eventsArray.length };
}

/**
 * Get stats - OPTIMIZED
 * Reads from rollup tables instead of scanning raw pageviews
 *
 * Before: 17 queries scanning all rows
 * After: 5 queries reading pre-aggregated rollups
 */
async function getStats(siteId, startDate, endDate) {
  const [
    dailyStats,
    pageStats,
    dimensionStats,
    utmStats,
    sessionStats
  ] = await Promise.all([
    // 1. Daily rollups (already aggregated)
    turso.execute({
      sql: `SELECT date, pageviews, unique_visitors, sessions, bounces, total_duration
            FROM daily_rollups
            WHERE site_id = ? AND date >= ? AND date <= ?
            ORDER BY date DESC`,
      args: [siteId, startDate.split(' ')[0], endDate.split(' ')[0]]
    }),

    // 2. Page rollups (top pages, entries, exits)
    turso.execute({
      sql: `SELECT page_path, SUM(views) as views, SUM(visitors) as visitors,
                   SUM(entries) as entries, SUM(exits) as exits, SUM(total_duration) as duration
            FROM page_rollups
            WHERE site_id = ? AND date >= ? AND date <= ?
            GROUP BY page_path
            ORDER BY views DESC
            LIMIT 100`,
      args: [siteId, startDate.split(' ')[0], endDate.split(' ')[0]]
    }),

    // 3. All dimensions in one query
    turso.execute({
      sql: `SELECT dimension_type, dimension_value, SUM(views) as views, SUM(visitors) as visitors
            FROM dimension_rollups
            WHERE site_id = ? AND date >= ? AND date <= ?
            GROUP BY dimension_type, dimension_value
            ORDER BY dimension_type, views DESC`,
      args: [siteId, startDate.split(' ')[0], endDate.split(' ')[0]]
    }),

    // 4. All UTM params in one query
    turso.execute({
      sql: `SELECT utm_type, utm_value, SUM(views) as views, SUM(visitors) as visitors
            FROM utm_rollups
            WHERE site_id = ? AND date >= ? AND date <= ?
            GROUP BY utm_type, utm_value
            ORDER BY utm_type, views DESC`,
      args: [siteId, startDate.split(' ')[0], endDate.split(' ')[0]]
    }),

    // 5. Session/bounce calculation (only query that touches pageviews, but optimized)
    turso.execute({
      sql: `SELECT COUNT(DISTINCT session_hash) as total_sessions,
                   SUM(CASE WHEN pv_count = 1 THEN 1 ELSE 0 END) as bounced_sessions
            FROM (
              SELECT session_hash, COUNT(*) as pv_count
              FROM pageviews
              WHERE site_id = ? AND event_type = 'pageview'
                AND timestamp >= ? AND timestamp <= ?
              GROUP BY session_hash
            )`,
      args: [siteId, startDate, endDate]
    })
  ]);

  // Process results
  const daily = normalizeRows(dailyStats.rows);
  const pages = normalizeRows(pageStats.rows);
  const dimensions = normalizeRows(dimensionStats.rows);
  const utms = normalizeRows(utmStats.rows);
  const sessions = normalizeRows(sessionStats.rows)[0] || { total_sessions: 0, bounced_sessions: 0 };

  // Calculate totals from daily rollups
  const totals = daily.reduce((acc, day) => ({
    pageviews: acc.pageviews + (day.pageviews || 0),
    unique_visitors: acc.unique_visitors + (day.unique_visitors || 0),
    sessions: acc.sessions + (day.sessions || 0),
    bounces: acc.bounces + (day.bounces || 0),
    total_duration: acc.total_duration + (day.total_duration || 0)
  }), { pageviews: 0, unique_visitors: 0, sessions: 0, bounces: 0, total_duration: 0 });

  // Group dimensions by type
  const groupByType = (rows, typeField, valueField) => {
    const grouped = {};
    for (const row of rows) {
      const type = row[typeField];
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({
        name: row[valueField],
        views: row.views || 0,
        visitors: row.visitors || 0
      });
    }
    return grouped;
  };

  const dimensionsByType = groupByType(dimensions, 'dimension_type', 'dimension_value');
  const utmsByType = groupByType(utms, 'utm_type', 'utm_value');

  // Build response (same format as before for compatibility)
  const totalSessions = sessions.total_sessions || 0;
  const bouncedSessions = sessions.bounced_sessions || 0;

  return {
    summary: {
      pageviews: totals.pageviews,
      unique_visitors: totals.unique_visitors,
      sessions: totalSessions,
      bounce_rate: totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0,
      avg_duration: totals.pageviews > 0 ? Math.round(totals.total_duration / totals.pageviews) : 0,
      views_per_visit: totalSessions > 0 ? Math.round((totals.pageviews / totalSessions) * 10) / 10 : 0
    },
    daily,
    // New array format
    topPages: pages.map(p => ({ name: p.page_path, views: p.views, visitors: p.visitors, duration: p.duration || 0 })),
    entryPages: pages.filter(p => p.entries > 0).map(p => ({ name: p.page_path, visits: p.entries, visitors: p.visitors })),
    exitPages: pages.filter(p => p.exits > 0).map(p => ({ name: p.page_path, exits: p.exits, visitors: p.visitors })),
    // Dimensions
    sources: dimensionsByType.referrer || [],
    devicesList: dimensionsByType.device || [],
    browsersList: dimensionsByType.browser || [],
    operatingSystems: dimensionsByType.os || [],
    countriesList: dimensionsByType.country || [],
    regions: dimensionsByType.region || [],
    cities: dimensionsByType.city || [],
    // UTM
    utm: {
      sources: utmsByType.source || [],
      mediums: utmsByType.medium || [],
      campaigns: utmsByType.campaign || [],
      contents: utmsByType.content || [],
      terms: utmsByType.term || []
    },
    // Legacy object format (for backward compatibility)
    pages: Object.fromEntries(pages.slice(0, 10).map(p => [p.page_path, p.views])),
    referrers: Object.fromEntries((dimensionsByType.referrer || []).slice(0, 10).map(r => [r.name, r.views])),
    devices: Object.fromEntries((dimensionsByType.device || []).map(d => [d.name, d.visitors])),
    browsers: Object.fromEntries((dimensionsByType.browser || []).slice(0, 10).map(b => [b.name, b.visitors])),
    countries: Object.fromEntries((dimensionsByType.country || []).slice(0, 10).map(c => [c.name, c.visitors]))
  };
}

/**
 * Get realtime stats - OPTIMIZED
 * Uses denormalized columns, no JSON_EXTRACT
 */
async function getRealtime(siteId) {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().replace('T', ' ').split('.')[0];

  // Single query for all realtime metrics
  const [activeResult, recentResult] = await Promise.all([
    turso.execute({
      sql: `SELECT
              SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as pageviews_5min,
              COUNT(DISTINCT CASE WHEN timestamp >= ? THEN identity_hash END) as active_5min,
              COUNT(DISTINCT CASE WHEN timestamp >= ? THEN identity_hash END) as visitors_30min,
              COUNT(DISTINCT CASE WHEN timestamp >= ? THEN identity_hash END) as visitors_today
            FROM pageviews
            WHERE site_id = ? AND event_type = 'pageview' AND timestamp >= ?`,
      args: [fiveMinutesAgo, fiveMinutesAgo, thirtyMinutesAgo, todayStart, siteId, todayStart]
    }),
    // Recent pageviews - uses denormalized columns
    turso.execute({
      sql: `SELECT identity_hash as id, timestamp, page_path as page, referrer_domain as referrer,
                   context_country as country, context_device as device
            FROM pageviews
            WHERE site_id = ? AND event_type = 'pageview'
            ORDER BY timestamp DESC LIMIT 20`,
      args: [siteId]
    })
  ]);

  const active = normalizeRows(activeResult.rows)[0] || {};
  const recent = normalizeRows(recentResult.rows);

  return {
    active_visitors: active.active_5min || 0,
    pageviews_last_5min: active.pageviews_5min || 0,
    last_30_minutes: active.visitors_30min || 0,
    today: active.visitors_today || 0,
    recent_pageviews: recent,
    visitors_per_minute: [],
    traffic_sources: []
  };
}

/**
 * Export data - uses denormalized columns
 */
async function exportData(siteId, startDate, endDate, type = 'pageviews', limit = 10000) {
  const queries = {
    pageviews: {
      sql: `SELECT timestamp, page_path, referrer_domain as referrer, context_device as device,
                   context_browser as browser, context_country as country, meta_duration as time_on_page
            FROM pageviews
            WHERE event_type = 'pageview' AND site_id = ? AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp DESC LIMIT ?`,
      args: [siteId, startDate, endDate, limit]
    },
    summary: {
      sql: `SELECT date, pageviews, unique_visitors, sessions, bounces
            FROM daily_rollups
            WHERE site_id = ? AND date >= ? AND date <= ?
            ORDER BY date DESC`,
      args: [siteId, startDate.split(' ')[0], endDate.split(' ')[0]]
    }
  };

  const query = queries[type] || queries.pageviews;
  const result = await turso.execute(query);
  return normalizeRows(result.rows);
}

// === MIGRATION HELPER ===

/**
 * Migrate existing data to new schema
 * Run once to populate denormalized columns and rollups
 */
async function migrateExistingData(siteId = null) {
  console.log('[turso] Starting migration...');

  const whereClause = siteId ? 'WHERE site_id = ?' : '';
  const whereArgs = siteId ? [siteId] : [];

  // 1. Add new columns if they don't exist (safe to run multiple times)
  const newColumns = [
    'page_path TEXT',
    'referrer_domain TEXT',
    'utm_source TEXT',
    'utm_medium TEXT',
    'utm_campaign TEXT',
    'utm_content TEXT',
    'utm_term TEXT',
    'city TEXT'
  ];

  for (const col of newColumns) {
    const colName = col.split(' ')[0];
    try {
      await turso.execute(`ALTER TABLE pageviews ADD COLUMN ${col}`);
      console.log(`[turso] Added column: ${colName}`);
    } catch (e) {
      // Column likely already exists
    }
  }

  // 2. Populate denormalized columns from existing payload
  await turso.execute({
    sql: `UPDATE pageviews SET
      page_path = JSON_EXTRACT(payload, '$.page_path'),
      referrer_domain = JSON_EXTRACT(payload, '$.referrer_domain'),
      utm_source = JSON_EXTRACT(payload, '$.utm_source'),
      utm_medium = JSON_EXTRACT(payload, '$.utm_medium'),
      utm_campaign = JSON_EXTRACT(payload, '$.utm_campaign'),
      utm_content = JSON_EXTRACT(payload, '$.utm_content'),
      utm_term = JSON_EXTRACT(payload, '$.utm_term'),
      city = JSON_EXTRACT(payload, '$.city')
    ${whereClause}`,
    args: whereArgs
  });
  console.log('[turso] Updated denormalized columns');

  // 3. Rebuild rollup tables
  await rebuildRollups(siteId);

  console.log('[turso] Migration complete');
}

/**
 * Rebuild rollup tables from pageviews data
 */
async function rebuildRollups(siteId = null) {
  const whereClause = siteId ? 'AND site_id = ?' : '';
  const whereArgs = siteId ? [siteId] : [];

  // Clear existing rollups for this site
  if (siteId) {
    await turso.batch([
      { sql: `DELETE FROM daily_rollups WHERE site_id = ?`, args: [siteId] },
      { sql: `DELETE FROM page_rollups WHERE site_id = ?`, args: [siteId] },
      { sql: `DELETE FROM dimension_rollups WHERE site_id = ?`, args: [siteId] },
      { sql: `DELETE FROM utm_rollups WHERE site_id = ?`, args: [siteId] }
    ]);
  }

  // Rebuild daily rollups
  await turso.execute({
    sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions, updated_at)
    SELECT site_id, DATE(timestamp) as date,
           COUNT(*) as pageviews,
           COUNT(DISTINCT identity_hash) as unique_visitors,
           COUNT(DISTINCT session_hash) as sessions,
           datetime('now')
    FROM pageviews
    WHERE event_type = 'pageview' ${whereClause}
    GROUP BY site_id, DATE(timestamp)
    ON CONFLICT(site_id, date) DO UPDATE SET
      pageviews = excluded.pageviews,
      unique_visitors = excluded.unique_visitors,
      sessions = excluded.sessions,
      updated_at = excluded.updated_at`,
    args: [...whereArgs]
  });

  // Rebuild page rollups
  await turso.execute({
    sql: `INSERT INTO page_rollups (site_id, date, page_path, views, visitors)
    SELECT site_id, DATE(timestamp) as date, page_path,
           COUNT(*) as views,
           COUNT(DISTINCT identity_hash) as visitors
    FROM pageviews
    WHERE event_type = 'pageview' AND page_path IS NOT NULL ${whereClause}
    GROUP BY site_id, DATE(timestamp), page_path
    ON CONFLICT(site_id, date, page_path) DO UPDATE SET
      views = excluded.views,
      visitors = excluded.visitors`,
    args: [...whereArgs]
  });

  // Rebuild dimension rollups
  // Note: dimension/column names are hardcoded constants, not user input
  const dimensions = ['context_device:device', 'context_browser:browser', 'context_os:os',
                      'context_country:country', 'context_region:region', 'city:city', 'referrer_domain:referrer'];

  for (const dim of dimensions) {
    const [col, type] = dim.split(':');
    await turso.execute({
      sql: `INSERT INTO dimension_rollups (site_id, date, dimension_type, dimension_value, views, visitors)
      SELECT site_id, DATE(timestamp) as date, ?, ${col},
             COUNT(*) as views,
             COUNT(DISTINCT identity_hash) as visitors
      FROM pageviews
      WHERE event_type = 'pageview' AND ${col} IS NOT NULL AND ${col} != '' ${whereClause}
      GROUP BY site_id, DATE(timestamp), ${col}
      ON CONFLICT(site_id, date, dimension_type, dimension_value) DO UPDATE SET
        views = excluded.views,
        visitors = excluded.visitors`,
      args: [type, ...whereArgs]
    });
  }

  // Rebuild UTM rollups
  // Note: utm column/type names are hardcoded constants, not user input
  const utmFields = ['utm_source:source', 'utm_medium:medium', 'utm_campaign:campaign',
                     'utm_content:content', 'utm_term:term'];

  for (const utm of utmFields) {
    const [col, type] = utm.split(':');
    await turso.execute({
      sql: `INSERT INTO utm_rollups (site_id, date, utm_type, utm_value, views, visitors)
      SELECT site_id, DATE(timestamp) as date, ?, ${col},
             COUNT(*) as views,
             COUNT(DISTINCT identity_hash) as visitors
      FROM pageviews
      WHERE event_type = 'pageview' AND ${col} IS NOT NULL AND ${col} != '' ${whereClause}
      GROUP BY site_id, DATE(timestamp), ${col}
      ON CONFLICT(site_id, date, utm_type, utm_value) DO UPDATE SET
        views = excluded.views,
        visitors = excluded.visitors`,
      args: [type, ...whereArgs]
    });
  }

  console.log('[turso] Rollups rebuilt');
}

// Debug functions (unchanged)
async function debugGetCount(siteId) {
  const result = await turso.execute({
    sql: `SELECT COUNT(*) as count, MAX(timestamp) as latest FROM pageviews WHERE site_id = ?`,
    args: [siteId]
  });
  return normalizeRows(result.rows)[0] || { count: 0, latest: null };
}

async function debugGetRecent(siteId, limit = 5) {
  const result = await turso.execute({
    sql: `SELECT * FROM pageviews WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?`,
    args: [siteId, limit]
  });
  return normalizeRows(result.rows);
}

// ============================================
// TEAM FUNCTIONS (unchanged - already efficient)
// ============================================

async function createTeam(name, ownerId, ownerEmail, plan = 'free') {
  const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const memberId = 'member_' + Date.now();
  const now = new Date().toISOString();

  await turso.batch([
    { sql: `INSERT INTO teams (id, name, owner_id, plan, created_at) VALUES (?, ?, ?, ?, ?)`, args: [teamId, name, ownerId, plan, now] },
    { sql: `INSERT INTO team_members (id, team_id, user_id, email, role, joined_at, status) VALUES (?, ?, ?, ?, 'admin', ?, 'active')`, args: [memberId, teamId, ownerId, ownerEmail, now] }
  ]);

  return { id: teamId, name, ownerId, plan, createdAt: now };
}

async function getTeam(teamId) {
  const result = await turso.execute({ sql: `SELECT * FROM teams WHERE id = ?`, args: [teamId] });
  return normalizeRows(result.rows)[0] || null;
}

async function getTeamsForUser(userId) {
  const result = await turso.execute({
    sql: `SELECT DISTINCT t.*, tm.role as user_role FROM teams t
          JOIN team_members tm ON t.id = tm.team_id
          WHERE tm.user_id = ? AND tm.status = 'active' ORDER BY t.created_at DESC`,
    args: [userId]
  });
  return normalizeRows(result.rows);
}

async function updateTeam(teamId, updates) {
  const ALLOWED_COLUMNS = ['name', 'plan', 'status', 'stripe_customer_id', 'stripe_subscription_id', 'monthly_limit'];
  const fields = [];
  const args = [];
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!ALLOWED_COLUMNS.includes(snakeKey)) {
      console.warn(`[turso] updateTeam: rejected invalid column "${snakeKey}"`);
      continue;
    }
    fields.push(`${snakeKey} = ?`);
    args.push(value);
  }
  if (fields.length === 0) return;
  fields.push('updated_at = ?');
  args.push(new Date().toISOString());
  args.push(teamId);
  await turso.execute({ sql: `UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, args });
}

async function deleteTeam(teamId) {
  await turso.batch([
    { sql: `DELETE FROM team_members WHERE team_id = ?`, args: [teamId] },
    { sql: `DELETE FROM monthly_usage WHERE team_id = ?`, args: [teamId] },
    { sql: `DELETE FROM teams WHERE id = ?`, args: [teamId] }
  ]);
}

async function inviteTeamMember(teamId, email, role, invitedBy) {
  const memberId = 'member_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  await turso.execute({
    sql: `INSERT INTO team_members (id, team_id, user_id, email, role, invited_by, invited_at, status) VALUES (?, ?, '', ?, ?, ?, ?, 'pending')`,
    args: [memberId, teamId, email, role, invitedBy, now]
  });
  return { id: memberId, teamId, email, role, status: 'pending', invitedAt: now };
}

async function acceptTeamInvitation(email, userId) {
  await turso.execute({
    sql: `UPDATE team_members SET user_id = ?, status = 'active', joined_at = ? WHERE email = ? AND status = 'pending'`,
    args: [userId, new Date().toISOString(), email]
  });
}

async function getTeamMembers(teamId) {
  const result = await turso.execute({ sql: `SELECT * FROM team_members WHERE team_id = ? ORDER BY joined_at ASC`, args: [teamId] });
  return normalizeRows(result.rows);
}

async function getPendingInvitations(email) {
  const result = await turso.execute({
    sql: `SELECT tm.*, t.name as team_name FROM team_members tm JOIN teams t ON tm.team_id = t.id WHERE tm.email = ? AND tm.status = 'pending'`,
    args: [email]
  });
  return normalizeRows(result.rows);
}

async function updateTeamMemberRole(memberId, role) {
  await turso.execute({ sql: `UPDATE team_members SET role = ? WHERE id = ?`, args: [role, memberId] });
}

async function removeTeamMember(memberId) {
  await turso.execute({ sql: `DELETE FROM team_members WHERE id = ?`, args: [memberId] });
}

async function isTeamAdmin(teamId, userId) {
  const result = await turso.execute({
    sql: `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`,
    args: [teamId, userId]
  });
  return normalizeRows(result.rows)[0]?.role === 'admin';
}

async function isTeamMember(teamId, userId) {
  const result = await turso.execute({
    sql: `SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'`,
    args: [teamId, userId]
  });
  return result.rows.length > 0;
}

// Usage functions
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function incrementUsage(teamId, siteId, type = 'pageview') {
  const month = getCurrentMonth();
  const now = new Date().toISOString();
  const column = type === 'pageview' ? 'pageviews' : type === 'visitor' ? 'unique_visitors' : 'events';

  await turso.execute({
    sql: `INSERT INTO monthly_usage (team_id, site_id, month, ${column}, updated_at) VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(team_id, site_id, month) DO UPDATE SET ${column} = ${column} + 1, updated_at = ?`,
    args: [teamId, siteId, month, now, now]
  });
}

async function getTeamUsage(teamId, month = null) {
  const targetMonth = month || getCurrentMonth();
  const result = await turso.execute({
    sql: `SELECT SUM(pageviews) as total_pageviews, SUM(unique_visitors) as total_visitors, SUM(events) as total_events
          FROM monthly_usage WHERE team_id = ? AND month = ?`,
    args: [teamId, targetMonth]
  });
  const row = normalizeRows(result.rows)[0];
  return { month: targetMonth, pageviews: row?.total_pageviews || 0, visitors: row?.total_visitors || 0, events: row?.total_events || 0 };
}

async function getTeamUsageBySite(teamId, month = null) {
  const targetMonth = month || getCurrentMonth();
  const result = await turso.execute({
    sql: `SELECT site_id, pageviews, unique_visitors, events, updated_at FROM monthly_usage WHERE team_id = ? AND month = ? ORDER BY pageviews DESC`,
    args: [teamId, targetMonth]
  });
  return normalizeRows(result.rows);
}

async function getTeamUsageHistory(teamId, months = 6) {
  const result = await turso.execute({
    sql: `SELECT month, SUM(pageviews) as total_pageviews, SUM(unique_visitors) as total_visitors, SUM(events) as total_events
          FROM monthly_usage WHERE team_id = ? GROUP BY month ORDER BY month DESC LIMIT ?`,
    args: [teamId, months]
  });
  return normalizeRows(result.rows);
}

async function checkUsageLimit(teamId, limit) {
  const usage = await getTeamUsage(teamId);
  return {
    isWithinLimit: usage.pageviews < limit,
    currentUsage: usage.pageviews,
    limit,
    percentUsed: limit > 0 ? Math.round((usage.pageviews / limit) * 100) : 0,
    remaining: Math.max(0, limit - usage.pageviews)
  };
}

async function getActualUsageFromPageviews(siteIds, month = null) {
  if (!siteIds || siteIds.length === 0) return { month: getCurrentMonth(), pageviews: 0, visitors: 0 };

  const targetMonth = month || getCurrentMonth();
  const startDate = `${targetMonth}-01`;
  const [year, monthNum] = targetMonth.split('-').map(Number);
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  // Use daily_rollups instead of scanning pageviews!
  const placeholders = siteIds.map(() => '?').join(', ');
  const result = await turso.execute({
    sql: `SELECT SUM(pageviews) as total_pageviews, SUM(unique_visitors) as unique_visitors
          FROM daily_rollups WHERE site_id IN (${placeholders}) AND date >= ? AND date <= ?`,
    args: [...siteIds, startDate, endDate]
  });

  const row = normalizeRows(result.rows)[0];
  return { month: targetMonth, pageviews: row?.total_pageviews || 0, visitors: row?.unique_visitors || 0 };
}

async function getUsageLimitHitDate(siteIds, limit, month = null) {
  if (!siteIds || siteIds.length === 0 || !limit) return null;

  const targetMonth = month || getCurrentMonth();
  const startDate = `${targetMonth}-01`;
  const [year, monthNum] = targetMonth.split('-').map(Number);
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];
  const placeholders = siteIds.map(() => '?').join(', ');

  // Use daily_rollups instead of pageviews!
  const result = await turso.execute({
    sql: `SELECT date, SUM(pageviews) as daily_count FROM daily_rollups
          WHERE site_id IN (${placeholders}) AND date >= ? AND date <= ?
          GROUP BY date ORDER BY date ASC`,
    args: [...siteIds, startDate, endDate]
  });

  let cumulative = 0;
  for (const row of normalizeRows(result.rows)) {
    cumulative += row.daily_count || 0;
    if (cumulative >= limit) return row.date;
  }
  return null;
}

export {
  turso,
  initSchema,
  ingestEvents,
  getStats,
  getRealtime,
  exportData,
  debugGetCount,
  debugGetRecent,
  // Migration
  migrateExistingData,
  rebuildRollups,
  // Teams
  createTeam,
  getTeam,
  getTeamsForUser,
  updateTeam,
  deleteTeam,
  inviteTeamMember,
  acceptTeamInvitation,
  getTeamMembers,
  getPendingInvitations,
  updateTeamMemberRole,
  removeTeamMember,
  isTeamAdmin,
  isTeamMember,
  // Usage
  getCurrentMonth,
  incrementUsage,
  getTeamUsage,
  getTeamUsageBySite,
  getTeamUsageHistory,
  checkUsageLimit,
  getActualUsageFromPageviews,
  getUsageLimitHitDate
};
