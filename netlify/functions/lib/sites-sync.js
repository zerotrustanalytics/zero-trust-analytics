/**
 * SITES SYNC TO TURSO
 * ===================
 * Keeps sites_config table in sync with Netlify Blobs.
 * Called whenever a site is created, updated, or deleted.
 */

import { createClient } from '@libsql/client';
import { Config } from './config.js';

const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

/**
 * Sync a single site to Turso (upsert)
 * Call this after creating or updating a site
 */
export async function syncSiteToTurso(site) {
  if (!site || !site.id) return;

  const now = new Date().toISOString();

  try {
    await turso.execute({
      sql: `INSERT INTO sites_config (id, domain, user_id, conversion_rules, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              domain = excluded.domain,
              user_id = excluded.user_id,
              conversion_rules = excluded.conversion_rules,
              updated_at = excluded.updated_at`,
      args: [
        site.id,
        site.domain || '',
        site.userId || null,
        site.conversionRules ? JSON.stringify(site.conversionRules) : null,
        site.createdAt || now,
        now
      ]
    });
    console.log(`[sites-sync] Synced site to Turso: ${site.id}`);
  } catch (err) {
    console.error(`[sites-sync] Failed to sync site ${site.id}:`, err.message);
    // Don't throw - sync failure shouldn't break the main operation
  }
}

/**
 * Remove a site from Turso
 * Call this when a site is deleted
 */
export async function removeSiteFromTurso(siteId) {
  if (!siteId) return;

  try {
    await turso.execute({
      sql: `DELETE FROM sites_config WHERE id = ?`,
      args: [siteId]
    });
    console.log(`[sites-sync] Removed site from Turso: ${siteId}`);
  } catch (err) {
    console.error(`[sites-sync] Failed to remove site ${siteId}:`, err.message);
  }
}
