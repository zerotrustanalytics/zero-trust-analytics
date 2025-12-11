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
async function ingestEvents(datasource, events) {
  const eventsArray = Array.isArray(events) ? events : [events];
  const ndjson = eventsArray.map(e => JSON.stringify(e)).join('\n');

  const response = await fetch(
    `https://${TINYBIRD_HOST}/v0/events?name=${datasource}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TINYBIRD_TOKEN}`,
        'Content-Type': 'application/x-ndjson'
      },
      body: ndjson
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tinybird ingest failed: ${error}`);
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
 * Get stats for a site
 *
 * @param {string} siteId
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<object>}
 */
async function getStats(siteId, startDate, endDate) {
  const params = {
    site_id: siteId,
    start_date: startDate,
    end_date: endDate
  };

  // Query all stat nodes in parallel
  const [
    dailyStats,
    topPages,
    topReferrers,
    devices,
    browsers,
    countries
  ] = await Promise.all([
    queryPipe('stats__stats_aggregation', params),
    queryPipe('stats__top_pages', params),
    queryPipe('stats__top_referrers', params),
    queryPipe('stats__device_breakdown', params),
    queryPipe('stats__browser_breakdown', params),
    queryPipe('stats__country_breakdown', params)
  ]);

  // Calculate totals from daily stats
  const totals = dailyStats.reduce(
    (acc, day) => ({
      pageviews: acc.pageviews + day.pageviews,
      unique_visitors: acc.unique_visitors + day.unique_visitors,
      bounces: acc.bounces + day.bounces,
      total_duration: acc.total_duration + (day.avg_duration * day.pageviews)
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
  const params = { site_id: siteId };

  // Try to get traffic sources if the pipe exists, otherwise skip
  let trafficSources = [];
  try {
    const [active, recent, perMinute, sources] = await Promise.all([
      queryPipe('realtime__active_visitors', params),
      queryPipe('realtime__recent_pageviews', params),
      queryPipe('realtime__visitors_per_minute', params),
      queryPipe('realtime__traffic_sources', params).catch(() => [])
    ]);

    trafficSources = sources;

    return {
      active_visitors: active[0]?.active_visitors || 0,
      pageviews_last_5min: active[0]?.pageviews_last_5min || 0,
      recent_pageviews: recent,
      visitors_per_minute: perMinute,
      traffic_sources: trafficSources
    };
  } catch (err) {
    // Fallback without traffic sources
    const [active, recent, perMinute] = await Promise.all([
      queryPipe('realtime__active_visitors', params),
      queryPipe('realtime__recent_pageviews', params),
      queryPipe('realtime__visitors_per_minute', params)
    ]);

    return {
      active_visitors: active[0]?.active_visitors || 0,
      pageviews_last_5min: active[0]?.pageviews_last_5min || 0,
      recent_pageviews: recent,
      visitors_per_minute: perMinute,
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
  const params = {
    site_id: siteId,
    start_date: startDate,
    end_date: endDate,
    limit
  };

  const pipeMap = {
    pageviews: 'export__export_pageviews',
    events: 'export__export_events',
    summary: 'export__export_daily_summary'
  };

  return queryPipe(pipeMap[type] || pipeMap.pageviews, params);
}

export {
  ingestEvents,
  queryPipe,
  queryMultipleNodes,
  getStats,
  getRealtime,
  exportData,
  TINYBIRD_HOST
};
