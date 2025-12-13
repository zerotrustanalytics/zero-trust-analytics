/**
 * STATS API - Public API for External Integrations
 *
 * Authentication: API Key (Bearer token)
 *
 * Query Parameters:
 * - site_id (required): Site identifier
 * - period: realtime, day, 7d, 30d, 6mo, 12mo, custom (default: 7d)
 * - date_from, date_to: For custom period
 * - metrics: Comma-separated list (visitors, pageviews, bounce_rate, visit_duration, views_per_visit)
 * - property: Breakdown by page, source, country, device, browser, os
 * - filters: Property filters (e.g., page==/blog/*;country==US)
 *
 * Response Format:
 * {
 *   results: [{ date: "2024-12-01", visitors: 150, pageviews: 420 }, ...],
 *   query: { site_id: "xxx", period: "7d", metrics: ["visitors", "pageviews"] }
 * }
 */

import { validateApiKey, getUserSites } from './lib/storage.js';
import { getStats, getRealtime } from './lib/turso.js';
import { checkRateLimit, rateLimitHeaders, rateLimitResponse, hashIP } from './lib/rate-limit.js';

// Supported periods
const VALID_PERIODS = ['realtime', 'day', '7d', '30d', '6mo', '12mo', 'custom'];

// Supported metrics
const VALID_METRICS = ['visitors', 'pageviews', 'bounce_rate', 'visit_duration', 'views_per_visit'];

// Supported properties for breakdowns
const VALID_PROPERTIES = ['page', 'source', 'country', 'device', 'browser', 'os'];

// Rate limit: 100 requests per minute per API key
const RATE_LIMIT = 100;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

/**
 * Extract and validate API key from Authorization header
 */
function extractApiKey(headers) {
  const auth = headers.authorization || headers.Authorization;
  if (!auth) {
    return null;
  }

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Parse and validate metrics parameter
 */
function parseMetrics(metricsParam) {
  if (!metricsParam) {
    // Default metrics
    return ['visitors', 'pageviews'];
  }

  const metrics = metricsParam.split(',').map(m => m.trim()).filter(m => m);
  const validMetrics = metrics.filter(m => VALID_METRICS.includes(m));

  return validMetrics.length > 0 ? validMetrics : ['visitors', 'pageviews'];
}

/**
 * Parse filters parameter
 * Format: page==/blog/*;country==US
 */
function parseFilters(filtersParam) {
  if (!filtersParam) {
    return [];
  }

  return filtersParam.split(';').map(filter => {
    const [property, value] = filter.split('==');
    return {
      property: property.trim(),
      operator: '==',
      value: value.trim()
    };
  });
}

/**
 * Calculate date range based on period
 */
function calculateDateRange(period, dateFrom, dateTo) {
  const endDate = new Date();
  let startDate = new Date();

  if (period === 'custom') {
    if (!dateFrom || !dateTo) {
      throw new Error('date_from and date_to are required for custom period');
    }
    startDate = new Date(dateFrom);
    return {
      startDate: startDate.toISOString().replace('T', ' ').split('.')[0],
      endDate: new Date(dateTo).toISOString().replace('T', ' ').split('.')[0]
    };
  }

  switch (period) {
    case 'realtime':
      startDate.setMinutes(startDate.getMinutes() - 5);
      break;
    case 'day':
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '6mo':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '12mo':
      startDate.setMonth(startDate.getMonth() - 12);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return {
    startDate: startDate.toISOString().replace('T', ' ').split('.')[0],
    endDate: endDate.toISOString().replace('T', ' ').split('.')[0]
  };
}

/**
 * Transform stats data based on requested metrics and properties
 */
function transformStatsData(stats, metrics, property, filters) {
  // If property breakdown is requested
  if (property) {
    return transformPropertyBreakdown(stats, property, metrics, filters);
  }

  // Time-series data (daily breakdown)
  if (!stats.daily || stats.daily.length === 0) {
    return [];
  }

  return stats.daily.map(day => {
    const result = { date: day.date };

    metrics.forEach(metric => {
      switch (metric) {
        case 'visitors':
          result.visitors = day.unique_visitors || 0;
          break;
        case 'pageviews':
          result.pageviews = day.pageviews || 0;
          break;
        case 'bounce_rate':
          const bounces = day.bounces || 0;
          const views = day.pageviews || 1;
          result.bounce_rate = Math.round((bounces / views) * 100);
          break;
        case 'visit_duration':
          result.visit_duration = day.avg_duration || 0;
          break;
        case 'views_per_visit':
          const totalViews = day.pageviews || 0;
          const totalVisitors = day.unique_visitors || 1;
          result.views_per_visit = totalViews > 0 ? (totalViews / totalVisitors).toFixed(2) : 0;
          break;
      }
    });

    return result;
  });
}

/**
 * Transform property breakdown data
 */
function transformPropertyBreakdown(stats, property, metrics, filters) {
  let data = {};

  // Map property to stats field
  switch (property) {
    case 'page':
      data = stats.pages || {};
      break;
    case 'source':
      data = stats.referrers || {};
      break;
    case 'country':
      data = stats.countries || {};
      break;
    case 'device':
      data = stats.devices || {};
      break;
    case 'browser':
      data = stats.browsers || {};
      break;
    case 'os':
      data = stats.countries || {}; // Note: OS data might need separate field
      break;
    default:
      data = {};
  }

  // Apply filters if specified
  if (filters && filters.length > 0) {
    data = applyFilters(data, filters);
  }

  // Convert to array format
  return Object.entries(data).map(([key, value]) => {
    const result = {};
    result[property] = key;

    metrics.forEach(metric => {
      if (metric === 'visitors' || metric === 'pageviews') {
        result[metric] = value;
      }
    });

    return result;
  }).sort((a, b) => {
    // Sort by the first metric value
    const firstMetric = metrics[0] || 'pageviews';
    return (b[firstMetric] || 0) - (a[firstMetric] || 0);
  });
}

/**
 * Apply filters to data
 */
function applyFilters(data, filters) {
  if (!filters || filters.length === 0) {
    return data;
  }

  const filtered = {};

  for (const [key, value] of Object.entries(data)) {
    let matches = true;

    for (const filter of filters) {
      if (filter.operator === '==' && filter.value.includes('*')) {
        // Wildcard match
        const pattern = filter.value.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (!regex.test(key)) {
          matches = false;
          break;
        }
      } else if (filter.operator === '==') {
        // Exact match
        if (key !== filter.value) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Main handler
 */
export default async function handler(req, context) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Only GET requests allowed
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    // Extract and validate API key
    const apiKey = extractApiKey(Object.fromEntries(req.headers));
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key required. Use Authorization: Bearer <api_key>' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Validate API key
    const validatedKey = await validateApiKey(apiKey);
    if (!validatedKey) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive API key' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Rate limiting by API key
    const identifier = `api_${validatedKey.id}`;
    const rateLimitResult = checkRateLimit(identifier, {
      limit: RATE_LIMIT,
      windowMs: RATE_LIMIT_WINDOW
    });

    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Parse query parameters
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const period = url.searchParams.get('period') || '7d';
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const metricsParam = url.searchParams.get('metrics');
    const property = url.searchParams.get('property');
    const filtersParam = url.searchParams.get('filters');

    // Validate required parameters
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'site_id parameter is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
        }
      });
    }

    // Validate period
    if (!VALID_PERIODS.includes(period)) {
      return new Response(JSON.stringify({
        error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
        }
      });
    }

    // Validate property if specified
    if (property && !VALID_PROPERTIES.includes(property)) {
      return new Response(JSON.stringify({
        error: `Invalid property. Must be one of: ${VALID_PROPERTIES.join(', ')}`
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
        }
      });
    }

    // Verify user has access to this site
    const userSites = await getUserSites(validatedKey.userId);
    if (!userSites.includes(siteId)) {
      return new Response(JSON.stringify({ error: 'Access denied. Site not found or unauthorized.' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
        }
      });
    }

    // Parse metrics and filters
    const metrics = parseMetrics(metricsParam);
    const filters = parseFilters(filtersParam);

    // Calculate date range
    let dateRange;
    try {
      dateRange = calculateDateRange(period, dateFrom, dateTo);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
        }
      });
    }

    // Fetch stats from database
    let stats;
    if (period === 'realtime') {
      stats = await getRealtime(siteId);
      // Transform realtime data to match expected format
      stats = {
        daily: [],
        pages: {},
        referrers: {},
        devices: {},
        browsers: {},
        countries: {}
      };
    } else {
      stats = await getStats(siteId, dateRange.startDate, dateRange.endDate);
    }

    // Transform data based on requested metrics and properties
    const results = transformStatsData(stats, metrics, property, filters);

    // Build query object for response
    const query = {
      site_id: siteId,
      period,
      metrics
    };

    if (period === 'custom') {
      query.date_from = dateFrom;
      query.date_to = dateTo;
    }

    if (property) {
      query.property = property;
    }

    if (filters.length > 0) {
      query.filters = filtersParam;
    }

    // Return response
    return new Response(JSON.stringify({
      results,
      query
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
      }
    });

  } catch (err) {
    console.error('Stats API error:', err.message, err.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export const config = {
  path: '/api/stats-api'
};
