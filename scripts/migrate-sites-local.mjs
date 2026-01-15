/**
 * Local migration script - run without Netlify
 * Copies sites from Netlify Blobs to Turso sites_config table
 */

import { getStore } from '@netlify/blobs';
import { createClient } from '@libsql/client';

// Netlify credentials (set these before running)
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

// Turso credentials (set these before running)
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!NETLIFY_SITE_ID || !NETLIFY_TOKEN || !TURSO_URL || !TURSO_TOKEN) {
  console.error('Missing required env vars: NETLIFY_SITE_ID, NETLIFY_TOKEN, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN');
  process.exit(1);
}

const turso = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN
});

async function migrate() {
  console.log('[migrate] Starting migration...');

  // Step 1: Create sites_config table
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

  // Step 2: Get sites from Netlify Blobs
  const sitesStore = getStore({
    name: 'sites',
    siteID: NETLIFY_SITE_ID,
    token: NETLIFY_TOKEN
  });

  const { blobs } = await sitesStore.list();
  console.log(`[migrate] Found ${blobs.length} blobs in sites store`);

  // Step 3: Migrate each site
  let migrated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const blob of blobs) {
    try {
      const site = await sitesStore.get(blob.key, { type: 'json' });

      if (!site || !site.id) {
        console.log(`[migrate] Skipping blob: ${blob.key} (no site data)`);
        skipped++;
        continue;
      }

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

      console.log(`[migrate] ✓ ${site.id} (${site.domain})`);
      migrated++;
    } catch (err) {
      console.error(`[migrate] ✗ ${blob.key}: ${err.message}`);
    }
  }

  // Step 4: Verify
  const countResult = await turso.execute('SELECT COUNT(*) as count FROM sites_config');
  const total = Number(countResult.rows[0]?.count || 0);

  console.log('\n[migrate] Complete!');
  console.log(`  Blobs found: ${blobs.length}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total in Turso: ${total}`);
}

migrate().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
