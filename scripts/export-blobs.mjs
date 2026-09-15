#!/usr/bin/env node
/**
 * EXPORT NETLIFY BLOBS -> portable NDJSON dump
 * ============================================
 * Phase 4 data migration, step 1 of 2. Run this where the PRODUCTION Netlify
 * Blobs are reachable (locally with a Netlify personal/access token, or on
 * Netlify). It reads every known store and writes one JSON object per line:
 *     {"store":"users","key":"user@x.com","value":"<raw string>","metadata":{...}}
 *
 * Usage:
 *   NETLIFY_SITE_ID=... NETLIFY_BLOBS_TOKEN=... \
 *     node scripts/migrate/export-blobs.mjs > backups/blobs-YYYYMMDD.ndjson
 *
 *   (NETLIFY_BLOBS_TOKEN = a Netlify personal access token / API token.)
 *
 * The companion import-blobs.mjs loads this dump into the SR8 libSQL kv_blobs
 * table. Values are exported RAW (as stored) — storage.js writes JSON strings
 * via setJSON, so a value is typically a JSON string; we do not re-parse it,
 * so the round-trip into kv_blobs.value is byte-identical.
 *
 * All human-readable progress goes to stderr so stdout stays a clean dump.
 */
import { getStore, listStores } from '@netlify/blobs'
import { BLOB_STORES } from './stores.mjs'

const siteID = process.env.NETLIFY_SITE_ID
// NETLIFY_TOKEN matches the convention in scripts/migrate-sites-local.mjs;
// NETLIFY_BLOBS_TOKEN / NETLIFY_AUTH_TOKEN also accepted.
const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN

if (!siteID || !token) {
  console.error(
    'ERROR: set NETLIFY_SITE_ID and NETLIFY_TOKEN (Netlify API token).\n' +
      'These identify the production site whose Blobs are being exported.'
  )
  process.exit(1)
}

function openStore(name) {
  return getStore({ name, siteID, token, consistency: 'strong' })
}

const log = (...a) => console.error(...a)

async function main() {
  // Safety net: warn about any live store not in our authoritative list.
  try {
    const seen = new Set()
    // paginate: true -> async iterable over all pages (non-paginated returns
    // only the first page and no cursor).
    for await (const page of listStores({ siteID, token, paginate: true })) {
      for (const s of page.stores || []) seen.add(s)
    }
    const unknown = [...seen].filter((s) => !BLOB_STORES.includes(s) && s !== 'rate-limit')
    if (unknown.length) {
      log(`⚠️  listStores() found stores NOT in stores.mjs (NOT exported): ${unknown.join(', ')}`)
      log('   If any hold real data, add them to scripts/migrate/stores.mjs and re-run.')
    }
  } catch (e) {
    log(`(listStores unavailable: ${e.message} — proceeding with the explicit list)`)
  }

  let totalKeys = 0
  const summary = []

  for (const name of BLOB_STORES) {
    const store = openStore(name)
    const keys = []
    // paginate: true -> async iterable over every page. A plain list() returns
    // only the first page (no cursor field), which would silently truncate
    // large stores like `users`/`sites`.
    for await (const page of store.list({ paginate: true })) {
      for (const b of page.blobs || []) keys.push(b.key)
    }

    let exported = 0
    for (const key of keys) {
      const entry = await store.getWithMetadata(key, { type: 'text' })
      if (entry == null) continue // deleted between list and get
      const line = JSON.stringify({
        store: name,
        key,
        value: entry.data ?? null,
        metadata: entry.metadata && Object.keys(entry.metadata).length ? entry.metadata : null,
      })
      process.stdout.write(line + '\n')
      exported += 1
    }
    totalKeys += exported
    summary.push(`${name}: ${exported}`)
    log(`  exported ${String(exported).padStart(6)}  ${name}`)
  }

  log('----------------------------------------')
  log(`Total: ${totalKeys} blobs across ${BLOB_STORES.length} stores`)
  log('Per-store counts (record these for the import parity check):')
  log('  ' + summary.join('\n  '))
}

main().catch((err) => {
  log('EXPORT FAILED:', err)
  process.exit(1)
})
