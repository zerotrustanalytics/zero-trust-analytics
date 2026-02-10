import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites, getSite } from './lib/storage.js';
import { turso, ingestEvents } from './lib/turso.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, ForbiddenError } from './lib/error-handler.js';

/**
 * Import Google Analytics data into ZTA
 *
 * Supports:
 * - GA4 CSV exports (from standard reports)
 * - GA4 JSON exports (from API)
 * - Universal Analytics CSV exports
 *
 * Maps GA fields to ZTA schema
 */

// Field mapping from GA to ZTA
const GA_FIELD_MAPPINGS = {
  // Date fields
  'date': 'date',
  'dateHour': 'dateHour',
  'dateHourMinute': 'dateHourMinute',
  'ga:date': 'date',
  'ga:dateHour': 'dateHour',

  // Page fields
  'pagePath': 'page_path',
  'pageTitle': 'page_title',
  'landingPage': 'landing_page',
  'ga:pagePath': 'page_path',
  'ga:pageTitle': 'page_title',
  'ga:landingPagePath': 'landing_page',
  'Page path and screen class': 'page_path',
  'Page title': 'page_title',

  // Traffic source fields
  'sessionSource': 'source',
  'sessionMedium': 'medium',
  'sessionCampaign': 'campaign',
  'firstUserSource': 'source',
  'ga:source': 'source',
  'ga:medium': 'medium',
  'ga:campaign': 'campaign',
  'Session source': 'source',
  'Session medium': 'medium',

  // Device fields
  'deviceCategory': 'device',
  'browser': 'browser',
  'operatingSystem': 'os',
  'ga:deviceCategory': 'device',
  'ga:browser': 'browser',
  'ga:operatingSystem': 'os',
  'Device category': 'device',
  'Browser': 'browser',
  'Operating system': 'os',

  // Geography
  'country': 'country',
  'region': 'region',
  'city': 'city',
  'ga:country': 'country',
  'ga:region': 'region',
  'Country': 'country',
  'Region': 'region',

  // Metrics
  'sessions': 'sessions',
  'screenPageViews': 'pageviews',
  'totalUsers': 'users',
  'newUsers': 'new_users',
  'bounceRate': 'bounce_rate',
  'averageSessionDuration': 'avg_duration',
  'ga:sessions': 'sessions',
  'ga:pageviews': 'pageviews',
  'ga:users': 'users',
  'ga:bounceRate': 'bounce_rate',
  'ga:avgSessionDuration': 'avg_duration',
  'Sessions': 'sessions',
  'Views': 'pageviews',
  'Total users': 'users',
  'Bounce rate': 'bounce_rate',
  'Average session duration': 'avg_duration',

  // GA4 aggregate CSV fields
  'Active users': 'users',
  'Landing page + query string': 'landing_page',
  'Event count': 'pageviews',
  'New users': 'new_users',
  'Engaged sessions': 'sessions',
  'Session primary channel group (Default Channel Group)': 'source',
  'First user primary channel group (Default Channel Group)': 'source'
};

// Parse CSV data
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new ValidationError('CSV file must have header row and at least one data row');
  }

  // Handle potential BOM
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }

  // Parse header - handle quoted fields
  const headers = parseCSVRow(headerLine);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVRow(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Parse a single CSV row (handling quoted fields)
function parseCSVRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

// Map GA headers to ZTA fields
function mapHeaders(headers) {
  const mapping = {};
  const unmapped = [];

  for (const header of headers) {
    const cleanHeader = header.trim();
    const ztaField = GA_FIELD_MAPPINGS[cleanHeader];

    if (ztaField) {
      mapping[cleanHeader] = ztaField;
    } else {
      unmapped.push(cleanHeader);
    }
  }

  return { mapping, unmapped };
}

// Generate a deterministic hash for identity (privacy-preserving)
function generateIdentityHash(row, date) {
  // Create a semi-unique identity based on available dimensions
  const parts = [
    date,
    row.device || 'unknown',
    row.browser || 'unknown',
    row.country || 'unknown',
    row.page_path || '/'
  ];

  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `ga_import_${Math.abs(hash).toString(36)}`;
}

// Convert GA row to ZTA event format
function convertRowToEvent(row, siteId) {
  // Parse date
  let timestamp;
  if (row.date) {
    // GA date format: YYYYMMDD
    const dateStr = row.date.toString();
    if (dateStr.length === 8) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      timestamp = new Date(`${year}-${month}-${day}T12:00:00Z`);
    } else {
      timestamp = new Date(row.date);
    }
  } else if (row.dateHour) {
    // GA dateHour format: YYYYMMDDHH
    const dateStr = row.dateHour.toString();
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(8, 10) || '12';
    timestamp = new Date(`${year}-${month}-${day}T${hour}:00:00Z`);
  } else {
    timestamp = new Date();
  }

  if (isNaN(timestamp.getTime())) {
    timestamp = new Date();
  }

  // Get metrics
  const pageviews = parseInt(row.pageviews) || parseInt(row.sessions) || 1;
  const bounceRate = parseFloat(row.bounce_rate) || 0;
  const avgDuration = parseFloat(row.avg_duration) || 0;

  // Generate events based on pageview count
  const events = [];
  const identityHash = generateIdentityHash(row, timestamp.toISOString().split('T')[0]);

  // For aggregated data, create synthetic events
  // We distribute pageviews across the day
  for (let i = 0; i < Math.min(pageviews, 100); i++) { // Cap at 100 per row
    const eventTime = new Date(timestamp);
    eventTime.setMinutes(eventTime.getMinutes() + (i * 5)); // Spread 5 min apart

    events.push({
      site_id: siteId,
      timestamp: eventTime.toISOString(),
      identity_hash: `${identityHash}_${i}`,
      session_hash: `${identityHash}_session`,
      event_type: 'pageview',
      payload: JSON.stringify({
        page_path: row.page_path || '/',
        page_title: row.page_title || '',
        referrer_domain: row.source || '',
        utm_source: row.source || '',
        utm_medium: row.medium || '',
        utm_campaign: row.campaign || '',
        imported: true,
        import_source: 'google_analytics'
      }),
      context_device: normalizeDevice(row.device),
      context_browser: row.browser || 'Unknown',
      context_os: row.os || 'Unknown',
      context_country: row.country || '',
      context_region: row.region || '',
      meta_is_bounce: bounceRate > 50 && i === 0 ? 1 : 0,
      meta_duration: Math.round(avgDuration)
    });
  }

  return events;
}

// Normalize device category
function normalizeDevice(device) {
  if (!device) return 'desktop';
  const d = device.toLowerCase();
  if (d.includes('mobile') || d.includes('phone')) return 'mobile';
  if (d.includes('tablet')) return 'tablet';
  return 'desktop';
}

// =====================================================
// GA4 Aggregate CSV Support
// =====================================================

// Detect if CSV starts with # comment lines (GA4 aggregate report format)
function isGA4AggregateCSV(data) {
  if (typeof data !== 'string') return false;
  const firstLine = data.trimStart().split('\n')[0].trim();
  return firstLine.startsWith('#');
}

// Parse GA4 CSV with # comment headers, returning metadata + parsed rows
function parseGA4CSV(content) {
  const lines = content.split('\n');
  const metadata = {
    reportName: '',
    account: '',
    property: '',
    startDate: null,
    endDate: null
  };

  let dataStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#')) {
      if (line.includes('Start date:')) {
        const match = line.match(/Start date:\s*(\d{8})/);
        if (match) metadata.startDate = match[1];
      } else if (line.includes('End date:')) {
        const match = line.match(/End date:\s*(\d{8})/);
        if (match) metadata.endDate = match[1];
      } else if (line.includes('Account:')) {
        metadata.account = line.replace(/^#\s*Account:\s*/, '').trim();
      } else if (line.includes('Property:')) {
        metadata.property = line.replace(/^#\s*Property:\s*/, '').trim();
      } else if (!line.includes('---') && !line.includes('All Users') && line.length > 2) {
        if (!metadata.reportName) {
          metadata.reportName = line.replace(/^#\s*/, '').trim();
        }
      }
      continue;
    }

    if (!line) continue;

    dataStartIndex = i;
    break;
  }

  const dataLines = lines.slice(dataStartIndex).filter(l => l.trim());
  if (dataLines.length < 2) {
    return { metadata, headers: [], rows: [] };
  }

  // Handle BOM on first data line
  let headerLine = dataLines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }

  const headers = parseCSVRow(headerLine);
  const rows = [];

  for (let i = 1; i < dataLines.length; i++) {
    const values = parseCSVRow(dataLines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return { metadata, headers, rows };
}

// Parse GA date format (YYYYMMDD) to Date object
function parseGADate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return new Date(`${year}-${month}-${day}T12:00:00Z`);
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Get all dates between start and end (inclusive)
function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// Distribute a value evenly across N buckets
function distributeValue(total, numDates) {
  const perDay = Math.floor(total / numDates);
  const remainder = total % numDates;

  return Array(numDates).fill(0).map((_, i) =>
    perDay + (i < remainder ? 1 : 0)
  );
}

// Identify CSV file type from headers
function identifyFileType(headers) {
  const headerSet = new Set(headers.map(h => h.toLowerCase()));

  if (headerSet.has('landing page + query string')) return 'landing_page';
  if (headerSet.has('page path and screen class')) return 'pages';
  if (headerSet.has('browser')) return 'browser';
  if (headerSet.has('device category')) return 'device';
  if (headerSet.has('region')) return 'region';
  if (headerSet.has('session primary channel group (default channel group)') ||
      headers.some(h => h.toLowerCase().includes('channel'))) {
    return 'traffic_source';
  }
  if (headerSet.has('first user primary channel group (default channel group)')) {
    return 'user_acquisition';
  }

  return 'unknown';
}

// --- Per-type processors ---

function processLandingPage(rows, dates, siteId) {
  const aggregated = new Map();

  for (const row of rows) {
    let pagePath = row['Landing page + query string'] || row['Landing page'] || '/';
    const qIndex = pagePath.indexOf('?');
    if (qIndex > 0) pagePath = pagePath.substring(0, qIndex);

    const totalViews = parseInt(row['Views']) || 0;
    const totalVisitors = parseInt(row['Active users']) || 0;

    if (totalViews === 0) continue;

    if (aggregated.has(pagePath)) {
      const existing = aggregated.get(pagePath);
      existing.views += totalViews;
      existing.visitors += totalVisitors;
    } else {
      aggregated.set(pagePath, { views: totalViews, visitors: totalVisitors });
    }
  }

  const pageRollups = [];
  for (const [pagePath, totals] of aggregated) {
    const viewsPerDay = distributeValue(totals.views, dates.length);
    const visitorsPerDay = distributeValue(totals.visitors, dates.length);

    for (let i = 0; i < dates.length; i++) {
      if (viewsPerDay[i] > 0) {
        pageRollups.push({
          site_id: siteId, date: dates[i], page_path: pagePath,
          views: viewsPerDay[i], visitors: visitorsPerDay[i],
          entries: viewsPerDay[i], exits: 0
        });
      }
    }
  }

  return { pageRollups };
}

function processPagesAndScreens(rows, dates, siteId) {
  const aggregated = new Map();

  for (const row of rows) {
    let pagePath = row['Page path and screen class'] || '/';
    const qIndex = pagePath.indexOf('?');
    if (qIndex > 0) pagePath = pagePath.substring(0, qIndex);

    const totalViews = parseInt(row['Views']) || 0;
    const totalVisitors = parseInt(row['Active users']) || parseInt(row['Users']) || 0;

    if (totalViews === 0) continue;

    if (aggregated.has(pagePath)) {
      const existing = aggregated.get(pagePath);
      existing.views += totalViews;
      existing.visitors += totalVisitors;
    } else {
      aggregated.set(pagePath, { views: totalViews, visitors: totalVisitors });
    }
  }

  const pageRollups = [];
  for (const [pagePath, totals] of aggregated) {
    const viewsPerDay = distributeValue(totals.views, dates.length);
    const visitorsPerDay = distributeValue(totals.visitors, dates.length);

    for (let i = 0; i < dates.length; i++) {
      if (viewsPerDay[i] > 0) {
        pageRollups.push({
          site_id: siteId, date: dates[i], page_path: pagePath,
          views: viewsPerDay[i], visitors: visitorsPerDay[i],
          entries: 0, exits: 0
        });
      }
    }
  }

  return { pageRollups };
}

function processBrowser(rows, dates, siteId) {
  const dimensionRollups = [];

  for (const row of rows) {
    const browser = row['Browser'] || 'Unknown';
    const totalVisitors = parseInt(row['Active users']) || 0;
    const totalViews = parseInt(row['Event count']) || totalVisitors;

    if (totalVisitors === 0) continue;

    const viewsPerDay = distributeValue(totalViews, dates.length);
    const visitorsPerDay = distributeValue(totalVisitors, dates.length);

    dates.forEach((date, i) => {
      if (visitorsPerDay[i] > 0) {
        dimensionRollups.push({
          site_id: siteId, date, dimension_type: 'browser',
          dimension_value: browser, views: viewsPerDay[i], visitors: visitorsPerDay[i]
        });
      }
    });
  }

  return { dimensionRollups };
}

function processDevice(rows, dates, siteId) {
  const dimensionRollups = [];

  for (const row of rows) {
    const device = row['Device category'] || 'desktop';
    const totalVisitors = parseInt(row['Active users']) || 0;
    const totalViews = parseInt(row['Event count']) || totalVisitors;

    if (totalVisitors === 0) continue;

    const viewsPerDay = distributeValue(totalViews, dates.length);
    const visitorsPerDay = distributeValue(totalVisitors, dates.length);

    dates.forEach((date, i) => {
      if (visitorsPerDay[i] > 0) {
        dimensionRollups.push({
          site_id: siteId, date, dimension_type: 'device',
          dimension_value: device, views: viewsPerDay[i], visitors: visitorsPerDay[i]
        });
      }
    });
  }

  return { dimensionRollups };
}

function processRegion(rows, dates, siteId) {
  const dimensionRollups = [];

  for (const row of rows) {
    const region = row['Region'] || 'Unknown';
    const totalVisitors = parseInt(row['Active users']) || 0;
    const totalViews = parseInt(row['Event count']) || totalVisitors;

    if (totalVisitors === 0 || region === '(not set)') continue;

    const viewsPerDay = distributeValue(totalViews, dates.length);
    const visitorsPerDay = distributeValue(totalVisitors, dates.length);

    dates.forEach((date, i) => {
      if (visitorsPerDay[i] > 0) {
        dimensionRollups.push({
          site_id: siteId, date, dimension_type: 'region',
          dimension_value: region, views: viewsPerDay[i], visitors: visitorsPerDay[i]
        });
      }
    });
  }

  return { dimensionRollups };
}

function processTrafficSource(rows, dates, siteId) {
  const dimensionRollups = [];
  const utmRollups = [];

  const channelColumn = Object.keys(rows[0] || {}).find(k =>
    k.toLowerCase().includes('channel') ||
    k.toLowerCase().includes('session primary') ||
    k.toLowerCase().includes('first user primary')
  ) || 'Session primary channel group (Default Channel Group)';

  for (const row of rows) {
    const channel = row[channelColumn] || 'Direct';
    const totalSessions = parseInt(row['Sessions']) || parseInt(row['Total users']) || 0;
    const totalVisitors = parseInt(row['Active users']) || parseInt(row['Total users']) || totalSessions;

    if (totalSessions === 0) continue;

    const sessionsPerDay = distributeValue(totalSessions, dates.length);
    const visitorsPerDay = distributeValue(totalVisitors, dates.length);

    for (let i = 0; i < dates.length; i++) {
      if (sessionsPerDay[i] > 0) {
        dimensionRollups.push({
          site_id: siteId, date: dates[i], dimension_type: 'referrer',
          dimension_value: channel, views: sessionsPerDay[i], visitors: visitorsPerDay[i]
        });

        utmRollups.push({
          site_id: siteId, date: dates[i], utm_type: 'source',
          utm_value: channel, views: sessionsPerDay[i], visitors: visitorsPerDay[i]
        });
      }
    }
  }

  return { dimensionRollups, utmRollups };
}

// --- Rollup insertion functions ---

async function insertPageRollups(rollups) {
  if (rollups.length === 0) return 0;

  const statements = rollups.map(r => ({
    sql: `INSERT INTO page_rollups (site_id, date, page_path, views, visitors, entries, exits)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date, page_path) DO UPDATE SET
            views = views + excluded.views,
            visitors = visitors + excluded.visitors,
            entries = entries + excluded.entries,
            exits = exits + excluded.exits`,
    args: [r.site_id, r.date, r.page_path, r.views, r.visitors, r.entries || 0, r.exits || 0]
  }));

  for (let i = 0; i < statements.length; i += 100) {
    await turso.batch(statements.slice(i, i + 100));
  }

  return rollups.length;
}

async function insertDimensionRollups(rollups) {
  if (rollups.length === 0) return 0;

  const statements = rollups.map(r => ({
    sql: `INSERT INTO dimension_rollups (site_id, date, dimension_type, dimension_value, views, visitors)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date, dimension_type, dimension_value) DO UPDATE SET
            views = views + excluded.views,
            visitors = visitors + excluded.visitors`,
    args: [r.site_id, r.date, r.dimension_type, r.dimension_value, r.views, r.visitors]
  }));

  for (let i = 0; i < statements.length; i += 100) {
    await turso.batch(statements.slice(i, i + 100));
  }

  return rollups.length;
}

async function insertUtmRollups(rollups) {
  if (rollups.length === 0) return 0;

  const statements = rollups.map(r => ({
    sql: `INSERT INTO utm_rollups (site_id, date, utm_type, utm_value, views, visitors)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date, utm_type, utm_value) DO UPDATE SET
            views = views + excluded.views,
            visitors = visitors + excluded.visitors`,
    args: [r.site_id, r.date, r.utm_type, r.utm_value, r.views, r.visitors]
  }));

  for (let i = 0; i < statements.length; i += 100) {
    await turso.batch(statements.slice(i, i + 100));
  }

  return rollups.length;
}

async function insertDailyRollups(siteId, dates, totalPageviews, totalVisitors) {
  if (dates.length === 0) return 0;

  const viewsPerDay = distributeValue(totalPageviews, dates.length);
  const visitorsPerDay = distributeValue(totalVisitors, dates.length);

  const statements = dates.map((date, i) => ({
    sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(site_id, date) DO UPDATE SET
            pageviews = pageviews + excluded.pageviews,
            unique_visitors = unique_visitors + excluded.unique_visitors,
            sessions = sessions + excluded.unique_visitors,
            updated_at = datetime('now')`,
    args: [siteId, date, viewsPerDay[i], visitorsPerDay[i], visitorsPerDay[i]]
  }));

  for (let i = 0; i < statements.length; i += 100) {
    await turso.batch(statements.slice(i, i + 100));
  }

  return dates.length;
}

// Handle GA4 aggregate CSV import (direct rollup insertion)
async function handleGA4AggregateImport(data, siteId, dryRun, logger) {
  const { metadata, headers, rows } = parseGA4CSV(data);

  logger.info('GA4 aggregate CSV detected', {
    report: metadata.reportName,
    dateRange: `${metadata.startDate} - ${metadata.endDate}`,
    rowCount: rows.length
  });

  if (rows.length === 0) {
    throw new ValidationError('No data rows found in CSV');
  }

  if (!metadata.startDate || !metadata.endDate) {
    throw new ValidationError('Could not extract date range from CSV metadata (missing # Start date / # End date lines)');
  }

  const startDate = parseGADate(metadata.startDate);
  const endDate = parseGADate(metadata.endDate);

  if (!startDate || !endDate) {
    throw new ValidationError(`Invalid date range: ${metadata.startDate} - ${metadata.endDate}`);
  }

  const dates = getDateRange(startDate, endDate);
  const fileType = identifyFileType(headers);

  logger.info('GA4 file type identified', { fileType, dateCount: dates.length });

  // Build header mapping for preview
  const headerMapping = mapHeaders(headers);

  // Process based on file type
  let result = { pageRollups: [], dimensionRollups: [], utmRollups: [] };
  let totalPageviews = 0;
  let totalVisitors = 0;

  switch (fileType) {
    case 'landing_page':
      result = processLandingPage(rows, dates, siteId);
      break;
    case 'pages':
      result = processPagesAndScreens(rows, dates, siteId);
      for (const row of rows) {
        totalPageviews += parseInt(row['Views']) || 0;
        totalVisitors += parseInt(row['Active users']) || 0;
      }
      break;
    case 'browser':
      result = processBrowser(rows, dates, siteId);
      break;
    case 'device':
      result = processDevice(rows, dates, siteId);
      break;
    case 'region':
      result = processRegion(rows, dates, siteId);
      break;
    case 'traffic_source':
    case 'user_acquisition':
      result = processTrafficSource(rows, dates, siteId);
      break;
    default:
      throw new ValidationError(`Unrecognized GA4 report type. Headers: ${headers.join(', ')}`);
  }

  const allPageRollups = result.pageRollups || [];
  const allDimensionRollups = result.dimensionRollups || [];
  const allUtmRollups = result.utmRollups || [];
  const totalRollups = allPageRollups.length + allDimensionRollups.length + allUtmRollups.length;

  // Build sample records for preview
  const sampleRecords = [
    ...allPageRollups.slice(0, 2).map(r => ({ type: 'page_rollup', ...r })),
    ...allDimensionRollups.slice(0, 2).map(r => ({ type: 'dimension_rollup', ...r })),
    ...allUtmRollups.slice(0, 2).map(r => ({ type: 'utm_rollup', ...r }))
  ].slice(0, 5);

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      preview: {
        totalRows: rows.length,
        skippedRows: 0,
        eventsToInsert: totalRollups,
        headerMapping: headerMapping.mapping,
        unmappedHeaders: headerMapping.unmapped,
        sampleEvents: sampleRecords,
        ga4Aggregate: {
          fileType,
          dateRange: `${formatDate(startDate)} to ${formatDate(endDate)}`,
          days: dates.length,
          pageRollups: allPageRollups.length,
          dimensionRollups: allDimensionRollups.length,
          utmRollups: allUtmRollups.length
        }
      }
    };
  }

  // Insert rollups
  logger.info('Inserting GA4 rollups', {
    pages: allPageRollups.length,
    dimensions: allDimensionRollups.length,
    utm: allUtmRollups.length
  });

  let insertedCount = 0;

  if (totalPageviews > 0 || totalVisitors > 0) {
    const dailyCount = await insertDailyRollups(siteId, dates, totalPageviews, totalVisitors);
    insertedCount += dailyCount;
    logger.debug('Daily rollups inserted', { count: dailyCount });
  }

  if (allPageRollups.length > 0) {
    const pageCount = await insertPageRollups(allPageRollups);
    insertedCount += pageCount;
    logger.debug('Page rollups inserted', { count: pageCount });
  }

  if (allDimensionRollups.length > 0) {
    const dimCount = await insertDimensionRollups(allDimensionRollups);
    insertedCount += dimCount;
    logger.debug('Dimension rollups inserted', { count: dimCount });
  }

  if (allUtmRollups.length > 0) {
    const utmCount = await insertUtmRollups(allUtmRollups);
    insertedCount += utmCount;
    logger.debug('UTM rollups inserted', { count: utmCount });
  }

  return {
    success: true,
    imported: {
      totalRows: rows.length,
      skippedRows: 0,
      eventsInserted: insertedCount,
      headerMapping: headerMapping.mapping,
      unmappedHeaders: headerMapping.unmapped,
      ga4Aggregate: {
        fileType,
        dateRange: `${formatDate(startDate)} to ${formatDate(endDate)}`,
        days: dates.length
      }
    }
  };
}

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('import-ga', req, context);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate
  const auth = await authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed', { error: auth.error });
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  logger.info('GA import request authenticated', { userId: auth.user.id });

  try {
    const body = await req.json();
    const { siteId, data, format, dryRun } = body;

    if (!siteId) {
      throw new ValidationError('siteId is required');
    }

    if (!data) {
      throw new ValidationError('data is required (CSV string or JSON array)');
    }

    // Verify user owns this site
    const userSites = await getUserSites(auth.user.id);
    if (!userSites.includes(siteId)) {
      logger.warn('Access denied - user does not own site', {
        userId: auth.user.id,
        siteId
      });
      throw new ForbiddenError('Access denied');
    }

    // Get site info
    const site = await getSite(siteId);
    if (!site) {
      throw new ValidationError('Site not found');
    }

    logger.info('Starting GA import', {
      siteId,
      siteDomain: site.domain,
      format: format || 'auto',
      dryRun: !!dryRun
    });

    // Check for GA4 aggregate CSV (starts with # comment lines)
    if (typeof data === 'string' && isGA4AggregateCSV(data)) {
      const result = await handleGA4AggregateImport(data, siteId, dryRun, logger);

      logger.info('GA4 aggregate import completed', {
        siteId,
        dryRun: !!dryRun,
        fileType: result.preview?.ga4Aggregate?.fileType || result.imported?.ga4Aggregate?.fileType
      });

      return successResponse(result, 200, origin);
    }

    // Parse the data (existing path for per-row date CSVs and JSON)
    let parsedData;
    let headerMapping;

    if (format === 'json' || (typeof data === 'object' && Array.isArray(data))) {
      // JSON array format
      parsedData = { rows: Array.isArray(data) ? data : [data], headers: [] };
      if (parsedData.rows.length > 0) {
        parsedData.headers = Object.keys(parsedData.rows[0]);
      }
    } else {
      // CSV format
      parsedData = parseCSV(data);
    }

    logger.info('Data parsed', {
      rowCount: parsedData.rows.length,
      headers: parsedData.headers
    });

    // Map headers
    headerMapping = mapHeaders(parsedData.headers);

    logger.info('Headers mapped', {
      mappedCount: Object.keys(headerMapping.mapping).length,
      unmappedCount: headerMapping.unmapped.length,
      unmapped: headerMapping.unmapped.slice(0, 10)
    });

    // Convert rows to ZTA events
    const allEvents = [];
    let skippedRows = 0;

    for (const row of parsedData.rows) {
      // Map the row using our header mapping
      const mappedRow = {};
      for (const [gaField, ztaField] of Object.entries(headerMapping.mapping)) {
        mappedRow[ztaField] = row[gaField];
      }

      // Skip rows without date or meaningful data
      if (!mappedRow.date && !mappedRow.dateHour) {
        skippedRows++;
        continue;
      }

      const events = convertRowToEvent(mappedRow, siteId);
      allEvents.push(...events);
    }

    logger.info('Events generated', {
      totalEvents: allEvents.length,
      skippedRows
    });

    // Dry run - return preview without inserting
    if (dryRun) {
      return successResponse({
        success: true,
        dryRun: true,
        preview: {
          totalRows: parsedData.rows.length,
          skippedRows,
          eventsToInsert: allEvents.length,
          headerMapping: headerMapping.mapping,
          unmappedHeaders: headerMapping.unmapped,
          sampleEvents: allEvents.slice(0, 5)
        }
      }, 200, origin);
    }

    // Insert events in batches
    const BATCH_SIZE = 500;
    let insertedCount = 0;

    for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
      const batch = allEvents.slice(i, i + BATCH_SIZE);
      await ingestEvents('pageviews', batch);
      insertedCount += batch.length;

      logger.debug('Batch inserted', {
        batchNumber: Math.floor(i / BATCH_SIZE) + 1,
        batchSize: batch.length,
        totalInserted: insertedCount
      });
    }

    logger.info('GA import completed', {
      siteId,
      insertedEvents: insertedCount,
      skippedRows
    });

    return successResponse({
      success: true,
      imported: {
        totalRows: parsedData.rows.length,
        skippedRows,
        eventsInserted: insertedCount,
        headerMapping: headerMapping.mapping,
        unmappedHeaders: headerMapping.unmapped
      }
    }, 200, origin);

  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/import/ga'
};
