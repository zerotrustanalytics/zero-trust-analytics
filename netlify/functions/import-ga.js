import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { getUserSites, getSite } from './lib/storage.js';
import { ingestEvents } from './lib/turso.js';
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
  'Average session duration': 'avg_duration'
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

    // Parse the data
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
