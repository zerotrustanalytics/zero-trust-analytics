/**
 * Zero Trust Analytics - Google Analytics Import
 *
 * Allows users to import historical data from Google Analytics
 * to provide seamless continuity when switching to ZTA.
 */

import { authenticateRequest } from './lib/auth.js';
import { getStore } from '@netlify/blobs';

// Supported import formats
const SUPPORTED_FORMATS = ['csv', 'json', 'ga4-api', 'ua-csv'];

// GA field mappings to ZTA fields
const GA_FIELD_MAP = {
  // GA4 fields
  'date': 'date',
  'pagePath': 'page',
  'pageTitle': 'title',
  'screenPageViews': 'pageviews',
  'sessions': 'sessions',
  'totalUsers': 'visitors',
  'newUsers': 'new_visitors',
  'bounceRate': 'bounce_rate',
  'averageSessionDuration': 'avg_duration',
  'sessionSource': 'source',
  'sessionMedium': 'medium',
  'country': 'country',
  'region': 'region',
  'city': 'city',
  'deviceCategory': 'device',
  'browser': 'browser',
  'operatingSystem': 'os',

  // Universal Analytics fields (legacy)
  'ga:date': 'date',
  'ga:pagePath': 'page',
  'ga:pageTitle': 'title',
  'ga:pageviews': 'pageviews',
  'ga:sessions': 'sessions',
  'ga:users': 'visitors',
  'ga:newUsers': 'new_visitors',
  'ga:bounceRate': 'bounce_rate',
  'ga:avgSessionDuration': 'avg_duration',
  'ga:source': 'source',
  'ga:medium': 'medium',
  'ga:country': 'country',
  'ga:region': 'region',
  'ga:city': 'city',
  'ga:deviceCategory': 'device',
  'ga:browser': 'browser',
  'ga:operatingSystem': 'os'
};

export default async function handler(req, context) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Authenticate
  const auth = authenticateRequest(req.headers);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userId = auth.user.id;

  // GET - Get import history/status
  if (req.method === 'GET') {
    try {
      const importStore = getStore({ name: 'imports' });
      const imports = await importStore.get(`user_${userId}_imports`, { type: 'json' });

      return new Response(JSON.stringify({
        imports: imports || [],
        supportedFormats: SUPPORTED_FORMATS
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to get import history' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // POST - Import data
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { siteId, format, data, source = 'google-analytics', dateRange } = body;

      // Validate required fields
      if (!siteId) {
        return new Response(JSON.stringify({ error: 'siteId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!data) {
        return new Response(JSON.stringify({ error: 'data is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!format || !SUPPORTED_FORMATS.includes(format)) {
        return new Response(JSON.stringify({
          error: `Invalid format. Supported: ${SUPPORTED_FORMATS.join(', ')}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify user owns this site
      const sitesStore = getStore({ name: 'sites' });
      const site = await sitesStore.get(siteId, { type: 'json' });

      if (!site || site.userId !== userId) {
        return new Response(JSON.stringify({ error: 'Site not found or access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Parse and transform the data
      let parsedData;
      try {
        parsedData = parseGAData(data, format);
      } catch (parseErr) {
        return new Response(JSON.stringify({
          error: 'Failed to parse data',
          details: parseErr.message
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Store the imported data
      const importStore = getStore({ name: 'imports' });
      const historicalStore = getStore({ name: 'historical' });

      const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const importRecord = {
        id: importId,
        siteId,
        userId,
        source,
        format,
        recordCount: parsedData.length,
        dateRange: dateRange || detectDateRange(parsedData),
        importedAt: new Date().toISOString(),
        status: 'completed'
      };

      // Store each day's data
      let storedCount = 0;
      for (const record of parsedData) {
        const dateKey = record.date || 'unknown';
        const key = `${siteId}_${dateKey}_imported`;

        // Get existing data for this date (in case of multiple imports)
        const existing = await historicalStore.get(key, { type: 'json' }) || {};

        // Merge the data
        const merged = mergeHistoricalData(existing, record);
        merged._imported = true;
        merged._importId = importId;
        merged._source = source;

        await historicalStore.setJSON(key, merged);
        storedCount++;
      }

      // Update import record with actual stored count
      importRecord.storedCount = storedCount;

      // Save import record
      await importStore.setJSON(importId, importRecord);

      // Update user's import history
      const userImports = await importStore.get(`user_${userId}_imports`, { type: 'json' }) || [];
      userImports.unshift({
        id: importId,
        siteId,
        source,
        recordCount: parsedData.length,
        importedAt: importRecord.importedAt
      });
      await importStore.setJSON(`user_${userId}_imports`, userImports.slice(0, 50)); // Keep last 50

      return new Response(JSON.stringify({
        success: true,
        importId,
        recordsProcessed: parsedData.length,
        recordsStored: storedCount,
        dateRange: importRecord.dateRange,
        message: `Successfully imported ${storedCount} days of historical data`
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Import error:', err);
      return new Response(JSON.stringify({
        error: 'Import failed',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // DELETE - Remove imported data
  if (req.method === 'DELETE') {
    try {
      const url = new URL(req.url);
      const importId = url.searchParams.get('importId');

      if (!importId) {
        return new Response(JSON.stringify({ error: 'importId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const importStore = getStore({ name: 'imports' });
      const importRecord = await importStore.get(importId, { type: 'json' });

      if (!importRecord) {
        return new Response(JSON.stringify({ error: 'Import not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (importRecord.userId !== userId) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete the historical data for this import
      const historicalStore = getStore({ name: 'historical' });
      const { blobs } = await historicalStore.list();

      let deletedCount = 0;
      for (const blob of blobs) {
        if (blob.key.includes('_imported')) {
          const data = await historicalStore.get(blob.key, { type: 'json' });
          if (data && data._importId === importId) {
            await historicalStore.delete(blob.key);
            deletedCount++;
          }
        }
      }

      // Delete the import record
      await importStore.delete(importId);

      // Update user's import history
      const userImports = await importStore.get(`user_${userId}_imports`, { type: 'json' }) || [];
      const updatedImports = userImports.filter(i => i.id !== importId);
      await importStore.setJSON(`user_${userId}_imports`, updatedImports);

      return new Response(JSON.stringify({
        success: true,
        deletedRecords: deletedCount,
        message: `Successfully deleted import and ${deletedCount} historical records`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Delete failed', details: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Parse Google Analytics data based on format
 */
function parseGAData(data, format) {
  switch (format) {
    case 'json':
    case 'ga4-api':
      return parseGA4JSON(data);
    case 'csv':
    case 'ua-csv':
      return parseGACSV(data);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Parse GA4 API JSON format
 */
function parseGA4JSON(data) {
  // Handle array of records or GA4 API response format
  if (Array.isArray(data)) {
    return data.map(row => mapGAFields(row));
  }

  // GA4 API response format with rows and dimensionHeaders
  if (data.rows && data.dimensionHeaders) {
    const dimensions = data.dimensionHeaders.map(h => h.name);
    const metrics = data.metricHeaders.map(h => h.name);

    return data.rows.map(row => {
      const record = {};

      row.dimensionValues.forEach((val, i) => {
        const gaField = dimensions[i];
        const ztaField = GA_FIELD_MAP[gaField] || gaField;
        record[ztaField] = val.value;
      });

      row.metricValues.forEach((val, i) => {
        const gaField = metrics[i];
        const ztaField = GA_FIELD_MAP[gaField] || gaField;
        record[ztaField] = parseFloat(val.value) || 0;
      });

      return record;
    });
  }

  // Simple object format
  if (typeof data === 'object') {
    return [mapGAFields(data)];
  }

  throw new Error('Unrecognized JSON format');
}

/**
 * Parse CSV format (both UA and GA4 exports)
 */
function parseGACSV(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const record = {};

    headers.forEach((header, idx) => {
      const gaField = header.trim();
      const ztaField = GA_FIELD_MAP[gaField] || gaField.toLowerCase().replace(/\s+/g, '_');
      const value = values[idx] || '';

      // Don't parse date as number - keep as string for normalization
      if (ztaField === 'date') {
        record[ztaField] = value;
      } else {
        // Try to parse as number
        const numValue = parseFloat(value.replace(/,/g, ''));
        record[ztaField] = isNaN(numValue) ? value : numValue;
      }
    });

    // Normalize date format
    if (record.date) {
      record.date = normalizeDate(record.date);
    }

    records.push(record);
  }

  return records;
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
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

/**
 * Map GA fields to ZTA fields
 */
function mapGAFields(record) {
  const mapped = {};

  for (const [key, value] of Object.entries(record)) {
    const ztaField = GA_FIELD_MAP[key] || key.toLowerCase().replace(/\s+/g, '_');
    mapped[ztaField] = value;
  }

  // Normalize date format
  if (mapped.date) {
    mapped.date = normalizeDate(mapped.date);
  }

  return mapped;
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(dateStr) {
  // Handle YYYYMMDD format (GA default)
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }

  // Handle MM/DD/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Already in YYYY-MM-DD format or other
  return dateStr;
}

/**
 * Detect date range from parsed data
 */
function detectDateRange(records) {
  const dates = records
    .map(r => r.date)
    .filter(d => d)
    .sort();

  if (dates.length === 0) {
    return null;
  }

  return {
    start: dates[0],
    end: dates[dates.length - 1],
    days: dates.length
  };
}

/**
 * Merge historical data (in case of multiple imports for same date)
 */
function mergeHistoricalData(existing, newData) {
  const merged = { ...existing };

  for (const [key, value] of Object.entries(newData)) {
    if (key.startsWith('_')) continue; // Skip metadata

    if (typeof value === 'number' && typeof merged[key] === 'number') {
      // Sum numeric values
      merged[key] = (merged[key] || 0) + value;
    } else {
      // Overwrite non-numeric values
      merged[key] = value;
    }
  }

  return merged;
}
