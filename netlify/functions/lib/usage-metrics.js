/**
 * USAGE METRICS FOR PRICING LEVERAGE
 * ===================================
 * Granular tracking for:
 * - Pageviews/day per site
 * - API writes/day per site
 * - Storage growth per site
 * - Pilot customer tagging
 *
 * This data lets you say: "Most Growth customers use under X - this one is an outlier."
 */

import { createClient } from '@libsql/client';
import { Config } from './config.js';

const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

/**
 * Initialize usage metrics schema
 */
export async function initUsageMetricsSchema() {
  // Daily usage by site (granular tracking)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      pageviews INTEGER DEFAULT 0,
      api_reads INTEGER DEFAULT 0,
      api_writes INTEGER DEFAULT 0,
      events INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(date, site_id)
    )
  `);

  // Storage metrics per site
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS storage_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      estimated_bytes INTEGER DEFAULT 0,
      updated_at TEXT,
      UNIQUE(date, site_id)
    )
  `);

  // Pilot customer / internal tags
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      is_pilot INTEGER DEFAULT 0,
      is_internal INTEGER DEFAULT 0,
      customer_type TEXT DEFAULT 'standard',
      notes TEXT,
      support_hours_mtd REAL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // Support time tracking
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS support_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      category TEXT,
      notes TEXT,
      created_at TEXT
    )
  `);

  // Indexes
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_daily_usage_site ON daily_usage(site_id, date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_daily_usage_user ON daily_usage(user_id, date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_storage_site ON storage_metrics(site_id, date DESC)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_customer_tags_user ON customer_tags(user_id)`);
  await turso.execute(`CREATE INDEX IF NOT EXISTS idx_support_log_user ON support_log(user_id, date DESC)`);

  console.log('[usage-metrics] Schema initialized');
}

// ============================================
// DAILY USAGE TRACKING
// ============================================

/**
 * Increment daily usage counter
 */
export async function incrementDailyUsage(siteId, userId, type = 'pageview') {
  const date = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const columnMap = {
    pageview: 'pageviews',
    api_read: 'api_reads',
    api_write: 'api_writes',
    event: 'events',
    visitor: 'unique_visitors'
  };

  const column = columnMap[type] || 'pageviews';

  await turso.execute({
    sql: `INSERT INTO daily_usage (date, site_id, user_id, ${column}, updated_at)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(date, site_id) DO UPDATE SET
            ${column} = ${column} + 1,
            updated_at = ?`,
    args: [date, siteId, userId, now, now]
  });
}

/**
 * Get daily usage for a site
 */
export async function getDailyUsage(siteId, days = 30) {
  const result = await turso.execute({
    sql: `SELECT date, pageviews, api_reads, api_writes, events, unique_visitors
          FROM daily_usage
          WHERE site_id = ?
          ORDER BY date DESC
          LIMIT ?`,
    args: [siteId, days]
  });

  return normalizeRows(result.rows);
}

/**
 * Get daily usage for a user (all their sites)
 */
export async function getUserDailyUsage(userId, days = 30) {
  const result = await turso.execute({
    sql: `SELECT date, site_id, pageviews, api_reads, api_writes, events, unique_visitors
          FROM daily_usage
          WHERE user_id = ?
          ORDER BY date DESC
          LIMIT ?`,
    args: [userId, days * 10] // More rows since multiple sites
  });

  return normalizeRows(result.rows);
}

/**
 * Get aggregated usage stats for admin dashboard
 */
export async function getUsageOverview(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const result = await turso.execute({
    sql: `SELECT
            date,
            COUNT(DISTINCT site_id) as active_sites,
            COUNT(DISTINCT user_id) as active_users,
            SUM(pageviews) as total_pageviews,
            SUM(api_reads) as total_api_reads,
            SUM(api_writes) as total_api_writes,
            SUM(events) as total_events
          FROM daily_usage
          WHERE date >= ?
          GROUP BY date
          ORDER BY date DESC`,
    args: [startDateStr]
  });

  return normalizeRows(result.rows);
}

/**
 * Get top sites by usage
 */
export async function getTopSitesByUsage(days = 30, limit = 20) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const result = await turso.execute({
    sql: `SELECT
            site_id,
            user_id,
            SUM(pageviews) as total_pageviews,
            SUM(api_reads) as total_api_reads,
            SUM(api_writes) as total_api_writes,
            AVG(pageviews) as avg_daily_pageviews,
            COUNT(DISTINCT date) as active_days
          FROM daily_usage
          WHERE date >= ?
          GROUP BY site_id
          ORDER BY total_pageviews DESC
          LIMIT ?`,
    args: [startDateStr, limit]
  });

  return normalizeRows(result.rows);
}

// ============================================
// STORAGE METRICS
// ============================================

/**
 * Update storage metrics for a site
 */
export async function updateStorageMetrics(siteId, userId) {
  const date = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Count rows for this site
  const countResult = await turso.execute({
    sql: `SELECT COUNT(*) as row_count FROM pageviews WHERE site_id = ?`,
    args: [siteId]
  });

  const rowCount = normalizeRows(countResult.rows)[0]?.row_count || 0;

  // Estimate storage (rough: ~200 bytes per row average)
  const estimatedBytes = rowCount * 200;

  await turso.execute({
    sql: `INSERT INTO storage_metrics (date, site_id, user_id, row_count, estimated_bytes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, site_id) DO UPDATE SET
            row_count = ?,
            estimated_bytes = ?,
            updated_at = ?`,
    args: [date, siteId, userId, rowCount, estimatedBytes, now, rowCount, estimatedBytes, now]
  });

  return { rowCount, estimatedBytes };
}

/**
 * Get storage growth for a site
 */
export async function getStorageGrowth(siteId, weeks = 4) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (weeks * 7));
  const startDateStr = startDate.toISOString().split('T')[0];

  const result = await turso.execute({
    sql: `SELECT date, row_count, estimated_bytes
          FROM storage_metrics
          WHERE site_id = ? AND date >= ?
          ORDER BY date ASC`,
    args: [siteId, startDateStr]
  });

  const rows = normalizeRows(result.rows);

  // Calculate weekly growth
  if (rows.length >= 2) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const growthRows = last.row_count - first.row_count;
    const growthBytes = last.estimated_bytes - first.estimated_bytes;
    const daysDiff = Math.max(1, (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24));
    const weeklyGrowthRows = Math.round((growthRows / daysDiff) * 7);
    const weeklyGrowthBytes = Math.round((growthBytes / daysDiff) * 7);

    return {
      current: last,
      history: rows,
      weeklyGrowth: {
        rows: weeklyGrowthRows,
        bytes: weeklyGrowthBytes,
        bytesFormatted: formatBytes(weeklyGrowthBytes)
      }
    };
  }

  return { current: rows[0] || null, history: rows, weeklyGrowth: null };
}

/**
 * Get total storage across all sites
 */
export async function getTotalStorage() {
  // Get latest storage metrics for each site
  const result = await turso.execute({
    sql: `SELECT site_id, user_id, row_count, estimated_bytes, date
          FROM storage_metrics sm1
          WHERE date = (
            SELECT MAX(date) FROM storage_metrics sm2 WHERE sm2.site_id = sm1.site_id
          )
          ORDER BY estimated_bytes DESC`
  });

  const sites = normalizeRows(result.rows);
  const totalRows = sites.reduce((sum, s) => sum + s.row_count, 0);
  const totalBytes = sites.reduce((sum, s) => sum + s.estimated_bytes, 0);

  return {
    totalRows,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
    siteCount: sites.length,
    bySite: sites.map(s => ({
      ...s,
      estimatedBytesFormatted: formatBytes(s.estimated_bytes)
    }))
  };
}

// ============================================
// CUSTOMER TAGGING (Pilot, Internal, etc.)
// ============================================

/**
 * Tag a customer (pilot, internal, etc.)
 */
export async function tagCustomer(userId, tags) {
  const now = new Date().toISOString();

  const existing = await getCustomerTags(userId);

  if (existing) {
    // Update existing
    const updates = [];
    const args = [];

    if (tags.isPilot !== undefined) {
      updates.push('is_pilot = ?');
      args.push(tags.isPilot ? 1 : 0);
    }
    if (tags.isInternal !== undefined) {
      updates.push('is_internal = ?');
      args.push(tags.isInternal ? 1 : 0);
    }
    if (tags.customerType !== undefined) {
      updates.push('customer_type = ?');
      args.push(tags.customerType);
    }
    if (tags.notes !== undefined) {
      updates.push('notes = ?');
      args.push(tags.notes);
    }

    updates.push('updated_at = ?');
    args.push(now);
    args.push(userId);

    await turso.execute({
      sql: `UPDATE customer_tags SET ${updates.join(', ')} WHERE user_id = ?`,
      args
    });
  } else {
    // Insert new
    await turso.execute({
      sql: `INSERT INTO customer_tags (user_id, is_pilot, is_internal, customer_type, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        tags.isPilot ? 1 : 0,
        tags.isInternal ? 1 : 0,
        tags.customerType || 'standard',
        tags.notes || null,
        now,
        now
      ]
    });
  }

  return getCustomerTags(userId);
}

/**
 * Get customer tags
 */
export async function getCustomerTags(userId) {
  const result = await turso.execute({
    sql: `SELECT * FROM customer_tags WHERE user_id = ?`,
    args: [userId]
  });

  const row = normalizeRows(result.rows)[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    isPilot: row.is_pilot === 1,
    isInternal: row.is_internal === 1,
    customerType: row.customer_type,
    notes: row.notes,
    supportHoursMtd: row.support_hours_mtd,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Get all pilot customers
 */
export async function getPilotCustomers() {
  const result = await turso.execute({
    sql: `SELECT * FROM customer_tags WHERE is_pilot = 1 ORDER BY created_at DESC`
  });

  return normalizeRows(result.rows).map(row => ({
    userId: row.user_id,
    isPilot: true,
    isInternal: row.is_internal === 1,
    customerType: row.customer_type,
    notes: row.notes,
    supportHoursMtd: row.support_hours_mtd
  }));
}

// ============================================
// SUPPORT TIME TRACKING
// ============================================

/**
 * Log support time for a customer
 */
export async function logSupportTime(userId, durationMinutes, category = 'general', notes = null) {
  const date = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Insert support log entry
  await turso.execute({
    sql: `INSERT INTO support_log (user_id, date, duration_minutes, category, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [userId, date, durationMinutes, category, notes, now]
  });

  // Update MTD hours in customer_tags
  const monthStart = date.substring(0, 7) + '-01';
  const mtdResult = await turso.execute({
    sql: `SELECT SUM(duration_minutes) as total FROM support_log
          WHERE user_id = ? AND date >= ?`,
    args: [userId, monthStart]
  });

  const mtdMinutes = normalizeRows(mtdResult.rows)[0]?.total || 0;
  const mtdHours = mtdMinutes / 60;

  await turso.execute({
    sql: `INSERT INTO customer_tags (user_id, support_hours_mtd, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            support_hours_mtd = ?,
            updated_at = ?`,
    args: [userId, mtdHours, now, now, mtdHours, now]
  });

  return { mtdHours, mtdMinutes };
}

/**
 * Get support time for a customer
 */
export async function getSupportTime(userId, months = 3) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startDateStr = startDate.toISOString().split('T')[0];

  const result = await turso.execute({
    sql: `SELECT date, duration_minutes, category, notes
          FROM support_log
          WHERE user_id = ? AND date >= ?
          ORDER BY date DESC`,
    args: [userId, startDateStr]
  });

  const entries = normalizeRows(result.rows);
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  return {
    entries,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    avgMinutesPerMonth: Math.round(totalMinutes / months)
  };
}

/**
 * Get customers exceeding support threshold
 */
export async function getHighSupportCustomers(thresholdHours = 2) {
  const result = await turso.execute({
    sql: `SELECT * FROM customer_tags WHERE support_hours_mtd >= ? ORDER BY support_hours_mtd DESC`,
    args: [thresholdHours]
  });

  return normalizeRows(result.rows).map(row => ({
    userId: row.user_id,
    supportHoursMtd: row.support_hours_mtd,
    customerType: row.customer_type,
    isPilot: row.is_pilot === 1,
    notes: row.notes
  }));
}

// ============================================
// ADMIN REPORTS
// ============================================

/**
 * Get comprehensive usage report for admin
 */
export async function getAdminUsageReport(days = 30) {
  const [
    overview,
    topSites,
    storage,
    pilotCustomers,
    highSupportCustomers
  ] = await Promise.all([
    getUsageOverview(days),
    getTopSitesByUsage(days, 20),
    getTotalStorage(),
    getPilotCustomers(),
    getHighSupportCustomers(2)
  ]);

  // Calculate totals
  const totalPageviews = overview.reduce((sum, d) => sum + (d.total_pageviews || 0), 0);
  const totalApiReads = overview.reduce((sum, d) => sum + (d.total_api_reads || 0), 0);
  const totalApiWrites = overview.reduce((sum, d) => sum + (d.total_api_writes || 0), 0);
  const avgDailyPageviews = overview.length > 0 ? Math.round(totalPageviews / overview.length) : 0;

  return {
    period: { days, startDate: overview[overview.length - 1]?.date, endDate: overview[0]?.date },
    summary: {
      totalPageviews,
      totalApiReads,
      totalApiWrites,
      avgDailyPageviews,
      activeSites: new Set(topSites.map(s => s.site_id)).size,
      activeUsers: new Set(topSites.map(s => s.user_id)).size
    },
    daily: overview,
    topSites,
    storage,
    pilotCustomers,
    highSupportCustomers,
    alerts: {
      overLimitSites: topSites.filter(s => s.total_pageviews > 200000).length,
      highGrowthSites: topSites.filter(s => s.avg_daily_pageviews > 5000).length,
      highSupportCount: highSupportCustomers.length
    }
  };
}

// ============================================
// HELPERS
// ============================================

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return normalized;
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================
// BACKFILL FROM EXISTING PAGEVIEWS
// ============================================

/**
 * Backfill daily_usage from existing pageviews table
 * This aggregates all historical pageviews into daily_usage
 */
export async function backfillUsageFromPageviews() {
  console.log('[backfill] Starting backfill from pageviews table...');

  // First, get site -> user_id mapping from sites table in Turso
  // or we can get it from the pageviews join

  // Aggregate pageviews by date and site_id
  const result = await turso.execute({
    sql: `
      SELECT
        DATE(timestamp) as date,
        site_id,
        COUNT(*) as pageviews,
        COUNT(DISTINCT identity_hash) as unique_visitors,
        SUM(CASE WHEN event_type = 'event' THEN 1 ELSE 0 END) as events
      FROM pageviews
      GROUP BY DATE(timestamp), site_id
      ORDER BY date DESC
    `
  });

  const rows = normalizeRows(result.rows);
  console.log(`[backfill] Found ${rows.length} daily records to backfill`);

  // Get unique site IDs to fetch user mappings
  const siteIds = [...new Set(rows.map(r => r.site_id))];
  console.log(`[backfill] Found ${siteIds.length} unique sites`);

  // Try to get user_id for each site from the sites store
  const { getStore } = await import('@netlify/blobs');
  const sitesStore = getStore({ name: 'sites', consistency: 'strong' });

  const siteUserMap = {};
  for (const siteId of siteIds) {
    try {
      const site = await sitesStore.get(siteId, { type: 'json' });
      if (site && site.userId) {
        siteUserMap[siteId] = site.userId;
      } else {
        siteUserMap[siteId] = 'unknown';
      }
    } catch (e) {
      siteUserMap[siteId] = 'unknown';
    }
  }

  console.log('[backfill] Site to user mapping:', siteUserMap);

  // Insert/update daily_usage records
  let inserted = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const userId = siteUserMap[row.site_id] || 'unknown';

    try {
      await turso.execute({
        sql: `INSERT INTO daily_usage (date, site_id, user_id, pageviews, unique_visitors, events, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(date, site_id) DO UPDATE SET
                pageviews = ?,
                unique_visitors = ?,
                events = ?,
                user_id = ?,
                updated_at = ?`,
        args: [
          row.date, row.site_id, userId, row.pageviews, row.unique_visitors, row.events, now,
          row.pageviews, row.unique_visitors, row.events, userId, now
        ]
      });
      inserted++;
    } catch (e) {
      console.error(`[backfill] Error inserting row for ${row.site_id}/${row.date}:`, e.message);
    }
  }

  console.log(`[backfill] Completed: ${inserted} records processed`);

  // Also update storage metrics for each site
  for (const siteId of siteIds) {
    const userId = siteUserMap[siteId] || 'unknown';
    try {
      await updateStorageMetrics(siteId, userId);
    } catch (e) {
      console.error(`[backfill] Error updating storage for ${siteId}:`, e.message);
    }
  }

  return {
    success: true,
    dailyRecords: inserted,
    sites: siteIds.length,
    siteUserMap
  };
}

export default {
  initUsageMetricsSchema,
  incrementDailyUsage,
  getDailyUsage,
  getUserDailyUsage,
  getUsageOverview,
  getTopSitesByUsage,
  updateStorageMetrics,
  getStorageGrowth,
  getTotalStorage,
  tagCustomer,
  getCustomerTags,
  getPilotCustomers,
  logSupportTime,
  getSupportTime,
  getHighSupportCustomers,
  getAdminUsageReport,
  backfillUsageFromPageviews
};
