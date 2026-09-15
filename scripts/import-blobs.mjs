#!/usr/bin/env node
/**
 * IMPORT NDJSON dump -> SR8 libSQL kv_blobs
 * =========================================
 * Phase 4 data migration, step 2 of 2. Run this on the SR8 (or anywhere the
 * target libSQL file is reachable) after export-blobs.mjs produced a dump.
 *
 * Usage:
 *   TURSO_DATABASE_URL=file:/app/data/analytics.db \
 *     node scripts/migrate/import-blobs.mjs backups/blobs-YYYYMMDD.ndjson
 *
 * Idempotent: rows are upserted (ON CONFLICT(store,key) DO UPDATE), so re-runs
 * are safe. The kv_blobs schema MUST match netlify/functions/lib/blob-store.js.
 * Prints per-store counts at the end for parity against the export summary.
 */
import { createClient } from '@libsql/client'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const dumpPath = process.argv[2]
const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN || ''

if (!dumpPath) {
  console.error('ERROR: pass the NDJSON dump path, e.g.\n  node import-blobs.mjs backups/blobs-YYYYMMDD.ndjson')
  process.exit(1)
}
if (!url) {
  console.error('ERROR: set TURSO_DATABASE_URL (e.g. file:/app/data/analytics.db)')
  process.exit(1)
}

const db = createClient({ url, authToken })

// Schema must match netlify/functions/lib/blob-store.js exactly.
async function ensureSchema() {
  try {
    await db.execute('PRAGMA journal_mode=WAL')
  } catch {
    /* not supported on this backend */
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kv_blobs (
      store TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      metadata TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (store, key)
    )
  `)
  await db.execute('CREATE INDEX IF NOT EXISTS idx_kv_blobs_store ON kv_blobs(store)')
}

const UPSERT = `INSERT INTO kv_blobs (store, key, value, metadata, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(store, key) DO UPDATE
    SET value = excluded.value,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`

async function main() {
  await ensureSchema()

  const rl = createInterface({ input: createReadStream(dumpPath), crlfDelay: Infinity })
  const perStore = new Map()
  let lineNo = 0
  let batch = []
  const BATCH = 200

  const flush = async () => {
    if (!batch.length) return
    await db.batch(
      batch.map((r) => ({
        sql: UPSERT,
        args: [r.store, r.key, r.value == null ? null : String(r.value), r.metadata ? JSON.stringify(r.metadata) : null],
      })),
      'write'
    )
    batch = []
  }

  for await (const raw of rl) {
    lineNo += 1
    const line = raw.trim()
    if (!line) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      console.error(`  skipping malformed line ${lineNo}`)
      continue
    }
    if (!rec.store || rec.key == null) {
      console.error(`  skipping line ${lineNo}: missing store/key`)
      continue
    }
    batch.push(rec)
    perStore.set(rec.store, (perStore.get(rec.store) || 0) + 1)
    if (batch.length >= BATCH) await flush()
  }
  await flush()

  // Parity check: report DB row counts per store (should match the export).
  console.error('Imported (rows now in kv_blobs per store):')
  const stores = [...perStore.keys()].sort()
  let total = 0
  for (const s of stores) {
    const { rows } = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM kv_blobs WHERE store = ?', args: [s] })
    const n = Number(rows[0].n)
    total += perStore.get(s)
    console.error(`  ${String(perStore.get(s)).padStart(6)} parsed / ${String(n).padStart(6)} in-db  ${s}`)
  }
  console.error('----------------------------------------')
  console.error(`Total parsed: ${total} across ${stores.length} stores`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('IMPORT FAILED:', err)
    process.exit(1)
  })
