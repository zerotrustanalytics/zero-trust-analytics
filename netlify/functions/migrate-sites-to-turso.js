/**
 * MIGRATE SITES TO TURSO
 * ======================
 * One-time migration to copy site configs from Netlify Blobs to Turso.
 * This enables the DO Functions to look up sites without calling Netlify.
 *
 * Run via: /api/migrate-sites-to-turso?secret=YOUR_INIT_DB_SECRET
 */

import { getStore } from '@netlify/blobs';
import { createClient } from '@libsql/client';
import { Config } from './lib/config.js';

const turso = createClient({
  url: Config.database.url,
  authToken: Config.database.authToken
});

export default async function handler(req, context) {
  // Require secret for security
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');

  if (secret !== process.env.INIT_DB_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Step 1: Create sites_config table if it doesn't exist
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS sites_config (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        user_id TEXT,
        conversion_rules TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_sites_config_user ON sites_config(user_id)`);

    console.log('[migrate] Created sites_config table');

    // Step 2: Get all sites from Netlify Blobs
    const sitesStore = getStore({ name: 'sites', consistency: 'strong' });
    const { blobs } = await sitesStore.list();

    console.log(`[migrate] Found ${blobs.length} blobs in sites store`);

    // Step 3: Migrate each site
    let migrated = 0;
    let skipped = 0;
    let errors = [];
    const now = new Date().toISOString();

    for (const blob of blobs) {
      try {
        const site = await sitesStore.get(blob.key, { type: 'json' });

        if (!site || !site.id) {
          skipped++;
          continue;
        }

        // Upsert into Turso
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

        migrated++;
        console.log(`[migrate] Migrated site: ${site.id} (${site.domain})`);

      } catch (err) {
        errors.push({ key: blob.key, error: err.message });
        console.error(`[migrate] Error migrating ${blob.key}:`, err.message);
      }
    }

    // Step 4: Verify migration
    const countResult = await turso.execute('SELECT COUNT(*) as count FROM sites_config');
    const totalInTurso = Number(countResult.rows[0]?.count || 0);

    return new Response(JSON.stringify({
      success: true,
      message: 'Migration complete',
      stats: {
        blobsFound: blobs.length,
        migrated,
        skipped,
        errors: errors.length,
        totalInTurso
      },
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    return new Response(JSON.stringify({
      error: 'Migration failed',
      details: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/migrate-sites-to-turso'
};
