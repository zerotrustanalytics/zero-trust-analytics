/**
 * TINYBIRD CLIENT
 * ================
 * Wrapper for Tinybird API interactions.
 */

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || 'api.us-west-2.tinybird.co';
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

/**
 * Send events to Tinybird Events API
 *
 * @param {string} datasource - Name of the datasource (e.g., 'pageviews')
 * @param {object|array} events - Single event or array of events
 * @returns {Promise<object>}
 */
async function ingestEvents(datasource, events, retries = 2) {
  const eventsArray = Array.isArray(events) ? events : [events];

  // Use CSV format - doesn't require JSONPaths in datasource schema
  const columns = [
    'timestamp', 'site_id', 'identity_hash', 'session_hash', 'event_type',
    'payload', 'context_device', 'context_browser', 'context_os',
    'context_country', 'context_region', 'meta_is_bounce', 'meta_duration'
  ];

  const csvRows = eventsArray.map(e =>
    columns.map(col => {
      const val = e[col];
      if (val === null || val === undefined) return '';
      // Escape quotes and wrap strings in quotes
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');

  const response = await fetch(
    `https://${TINYBIRD_HOST}/v0/datasources?name=${datasource}&mode=append&format=csv`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TINYBIRD_TOKEN}`,
        'Content-Type': 'text/csv'
      },
      body: csvRows
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Handle rate limiting with retry
    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(errorText.match(/retry after (\d+)/)?.[1] || '2');
      await new Promise(resolve => setTimeout(resolve, (retryAfter + 1) * 1000));
      return ingestEvents(datasource, events, retries - 1);
    }

    throw new Error(`Tinybird ingest failed: ${errorText}`);
  }

  return response.json();
}

/**
 * Query a Tinybird pipe endpoint
 *
 * @param {string} pipeName - Name of the pipe
 * @param {object} params - Query parameters
 * @returns {Promise<object>}
 */
async function queryPipe(pipeName, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `https://${TINYBIRD_HOST}/v0/pipes/${pipeName}.json?${queryString}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TINYBIRD_TOKEN}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tinybird query failed: ${error}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Query multiple pipe nodes in parallel
 *
 * @param {string} pipeName - Base pipe name
 * @param {array} nodes - Array of node names to query
 * @param {object} params - Shared query parameters
 * @returns {Promise<object>} - Object with node names as keys
 */
async function queryMultipleNodes(pipeName, nodes, params = {}) {
  const queries = nodes.map(async (node) => {
    const data = await queryPipe(`${pipeName}__${node}`, params);
    return [node, data];
  });

  const results = await Promise.all(queries);
  return Object.fromEntries(results);
}

/**
 * Run a raw SQL query against Tinybird
 */
async function querySQL(sql) {
  const response = await fetch(
    `https://${TINYBIRD_HOST}/v0/sql?q=${encodeURIComponent(sql)}`,
    {
      headers: {
        'Authorization': `Bearer ${TINYBIRD_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tinybird SQL failed: ${error}`);
  }

  const data = await response.json();
  return data.data || [];
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
  // Query raw datasource directly with SQL
  const [dailyStats, topPages, topReferrers, devices, browsers, countries] = await Promise.all([
    // Daily stats
    querySQL(`
      SELECT
        toDate(timestamp) as date,
        count() as pageviews,
        uniqExact(identity_hash) as unique_visitors,
        countIf(meta_is_bounce = 1) as bounces,
        round(avg(meta_duration), 0) as avg_duration
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY date
      ORDER BY date DESC
    `),
    // Top pages
    querySQL(`
      SELECT
        JSONExtractString(payload, 'page_path') as page,
        count() as views,
        uniqExact(identity_hash) as visitors
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY page
      ORDER BY views DESC
      LIMIT 10
    `),
    // Top referrers
    querySQL(`
      SELECT
        JSONExtractString(payload, 'referrer_domain') as referrer,
        count() as views
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
        AND referrer != ''
      GROUP BY referrer
      ORDER BY views DESC
      LIMIT 10
    `),
    // Devices
    querySQL(`
      SELECT context_device as device, count() as count
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY device
      ORDER BY count DESC
    `),
    // Browsers
    querySQL(`
      SELECT context_browser as browser, count() as count
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY browser
      ORDER BY count DESC
    `),
    // Countries
    querySQL(`
      SELECT context_country as country, count() as count
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY country
      ORDER BY count DESC
    `)
  ]);

  // Calculate totals from daily stats
  const totals = dailyStats.reduce(
    (acc, day) => ({
      pageviews: acc.pageviews + (day.pageviews || 0),
      unique_visitors: acc.unique_visitors + (day.unique_visitors || 0),
      bounces: acc.bounces + (day.bounces || 0),
      total_duration: acc.total_duration + ((day.avg_duration || 0) * (day.pageviews || 0))
    }),
    { pageviews: 0, unique_visitors: 0, bounces: 0, total_duration: 0 }
  );

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
    daily: dailyStats,
    pages: topPages,
    referrers: topReferrers,
    devices,
    browsers,
    countries
  };
}

/**
 * Get realtime stats for a site
 *
 * @param {string} siteId
 * @returns {Promise<object>}
 */
async function getRealtime(siteId) {
  try {
    const [activeResult, recentResult] = await Promise.all([
      // Active visitors in last 5 minutes
      querySQL(`
        SELECT
          uniqExact(identity_hash) as active_visitors,
          count() as pageviews_last_5min
        FROM pageviews
        WHERE site_id = '${siteId}'
          AND timestamp >= now() - INTERVAL 5 MINUTE
          AND event_type = 'pageview'
      `),
      // Recent pageviews
      querySQL(`
        SELECT
          timestamp,
          JSONExtractString(payload, 'page_path') as page
        FROM pageviews
        WHERE site_id = '${siteId}'
          AND event_type = 'pageview'
        ORDER BY timestamp DESC
        LIMIT 10
      `)
    ]);

    return {
      active_visitors: activeResult[0]?.active_visitors || 0,
      pageviews_last_5min: activeResult[0]?.pageviews_last_5min || 0,
      recent_pageviews: recentResult,
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
    pageviews: `
      SELECT
        timestamp,
        JSONExtractString(payload, 'page_path') as page_path,
        JSONExtractString(payload, 'referrer_domain') as referrer,
        context_device as device,
        context_browser as browser,
        context_country as country,
        meta_duration as time_on_page,
        meta_is_bounce as is_bounce
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `,
    events: `
      SELECT
        timestamp,
        event_type,
        payload,
        context_device as device,
        context_browser as browser,
        context_country as country
      FROM pageviews
      WHERE event_type != 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `,
    summary: `
      SELECT
        toDate(timestamp) as date,
        count() as pageviews,
        uniqExact(identity_hash) as unique_visitors,
        countIf(meta_is_bounce = 1) as bounces
      FROM pageviews
      WHERE event_type = 'pageview'
        AND site_id = '${siteId}'
        AND timestamp >= '${startDate}'
        AND timestamp <= '${endDate}'
      GROUP BY date
      ORDER BY date DESC
    `
  };

  return querySQL(queries[type] || queries.pageviews);
}

export {
  ingestEvents,
  queryPipe,
  querySQL,
  queryMultipleNodes,
  getStats,
  getRealtime,
  exportData,
  TINYBIRD_HOST
};
