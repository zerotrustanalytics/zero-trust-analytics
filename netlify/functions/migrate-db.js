/**
 * DATABASE MIGRATION ENDPOINT
 * ===========================
 * One-time migration to populate denormalized columns and rollup tables.
 *
 * Call this endpoint once after deploying the optimized turso.js:
 * POST /api/migrate-db
 *
 * Headers:
 *   Authorization: Bearer <admin-token>
 *   X-Migration-Key: <MIGRATION_SECRET from env>
 */

import { turso, migrateExistingData, rebuildRollups, initSchema } from './lib/turso.js';

export default async function handler(req, context) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify migration key (add MIGRATION_SECRET to your env vars)
  const migrationKey = req.headers.get('x-migration-key');
  const expectedKey = process.env.MIGRATION_SECRET || 'migrate-ztas-2024';

  if (migrationKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized - invalid migration key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'full';
    const siteId = url.searchParams.get('siteId') || null;

    console.log('[migrate-db] Starting migration', { action, siteId });

    const results = {
      action,
      siteId,
      steps: [],
      startedAt: new Date().toISOString()
    };

    // Step 1: Ensure schema is up to date (creates new tables/columns)
    if (action === 'full' || action === 'schema') {
      console.log('[migrate-db] Step 1: Initializing schema...');
      await initSchema();
      results.steps.push({ step: 'schema', status: 'completed' });
    }

    // Step 2: Add denormalized columns if they don't exist
    if (action === 'full' || action === 'columns') {
      console.log('[migrate-db] Step 2: Adding denormalized columns...');
      const newColumns = [
        'page_path TEXT',
        'referrer_domain TEXT',
        'utm_source TEXT',
        'utm_medium TEXT',
        'utm_campaign TEXT',
        'utm_content TEXT',
        'utm_term TEXT',
        'city TEXT'
      ];

      for (const col of newColumns) {
        const colName = col.split(' ')[0];
        try {
          await turso.execute(`ALTER TABLE pageviews ADD COLUMN ${col}`);
          results.steps.push({ step: `add_column_${colName}`, status: 'added' });
        } catch (e) {
          results.steps.push({ step: `add_column_${colName}`, status: 'exists' });
        }
      }
    }

    // Step 3: Populate denormalized columns from payload JSON
    if (action === 'full' || action === 'denormalize') {
      console.log('[migrate-db] Step 3: Populating denormalized columns...');

      const whereClause = siteId ? `WHERE site_id = '${siteId}'` : '';

      await turso.execute(`
        UPDATE pageviews SET
          page_path = COALESCE(page_path, JSON_EXTRACT(payload, '$.page_path')),
          referrer_domain = COALESCE(referrer_domain, JSON_EXTRACT(payload, '$.referrer_domain')),
          utm_source = COALESCE(utm_source, JSON_EXTRACT(payload, '$.utm_source')),
          utm_medium = COALESCE(utm_medium, JSON_EXTRACT(payload, '$.utm_medium')),
          utm_campaign = COALESCE(utm_campaign, JSON_EXTRACT(payload, '$.utm_campaign')),
          utm_content = COALESCE(utm_content, JSON_EXTRACT(payload, '$.utm_content')),
          utm_term = COALESCE(utm_term, JSON_EXTRACT(payload, '$.utm_term')),
          city = COALESCE(city, JSON_EXTRACT(payload, '$.city'))
        ${whereClause}
      `);
      results.steps.push({ step: 'denormalize', status: 'completed' });
    }

    // Step 4: Rebuild rollup tables
    if (action === 'full' || action === 'rollups') {
      console.log('[migrate-db] Step 4: Rebuilding rollup tables...');
      await rebuildRollups(siteId);
      results.steps.push({ step: 'rollups', status: 'completed' });
    }

    // Get stats for verification
    const statsResult = await turso.execute(`
      SELECT
        (SELECT COUNT(*) FROM pageviews) as total_pageviews,
        (SELECT COUNT(*) FROM daily_rollups) as daily_rollup_rows,
        (SELECT COUNT(*) FROM page_rollups) as page_rollup_rows,
        (SELECT COUNT(*) FROM dimension_rollups) as dimension_rollup_rows,
        (SELECT COUNT(*) FROM utm_rollups) as utm_rollup_rows
    `);

    results.stats = statsResult.rows[0];
    results.completedAt = new Date().toISOString();
    results.success = true;

    console.log('[migrate-db] Migration completed', results);

    return new Response(JSON.stringify(results, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[migrate-db] Migration failed:', error);

    return new Response(JSON.stringify({
      error: 'Migration failed',
      message: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/api/migrate-db'
};
