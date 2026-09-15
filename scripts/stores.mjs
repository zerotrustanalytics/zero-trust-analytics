/**
 * Authoritative list of Netlify Blobs store names used by ZTA.
 *
 * SOURCE OF TRUTH:
 *   - netlify/functions/lib/storage.js -> `STORES` object (users, sites, ...)
 *   - direct getStore({name}) call sites in: gsc.js (gsc-connections, oauth-states),
 *     import.js (imports), errors.js (errors), usage-metrics.js (historical),
 *     rate-limit.js (rate-limit).
 *
 * ⚠️ If a new store is added to storage.js `STORES` or a new getStore() call
 * site appears, add it here too, or the migration will silently skip it. The
 * export step also calls listStores() and warns about any store it finds that
 * is NOT in this list, as a safety net.
 *
 * Note: `oauth_states` (underscore, storage.js) and `oauth-states` (hyphen,
 * gsc.js) are DISTINCT stores — both are listed intentionally.
 */
export const BLOB_STORES = [
  // storage.js STORES
  'users',
  'sites',
  'pageviews',
  'visitors',
  'engagement',
  'events',
  'realtime',
  'password_reset_tokens',
  'public_shares',
  'sessions',
  'api_keys',
  'activity_log',
  'webhooks',
  'alerts',
  'annotations',
  'teams',
  'goals',
  'funnels',
  'heatmaps',
  'oauth_states',
  // direct getStore() call sites
  'gsc-connections',
  'oauth-states',
  'imports',
  'errors',
  'historical',
  // 'rate-limit' is intentionally OMITTED: it is ephemeral rate-limit counters
  // with an in-memory fallback (rate-limit.js) and must not be migrated.
]
