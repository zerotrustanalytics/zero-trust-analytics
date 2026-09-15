# Phase 4 data migration — Netlify → SR8 libSQL

Production state lives in **two** backends; both must land in the single SR8
libSQL file (`/app/data/analytics.db`, the `zta-data` Docker volume):

| Source | Holds | Target table(s) |
|---|---|---|
| **Turso** (cloud libSQL) | pageviews / analytics | native tables (via `.dump`) |
| **Netlify Blobs** | users, sites, auth, rules, GSC, imports, errors | `kv_blobs` (see `lib/blob-store.js`) |

The clean approach: **assemble `analytics.db` offline** (dev machine or SR8
host), then drop it into the volume before the container's first start. That
avoids writing to the DB while the container holds it open.

## 0. Install deps for these scripts (once)
```bash
cd scripts && npm install
```

## 1. Export Turso (pageviews)
```bash
# Uses your production Turso creds. Produces a SQL dump.
turso db shell <db-name> .dump > ../backups/turso-$(date +%Y%m%d).sql
```

## 2. Export Netlify Blobs (users/sites/auth/…)
Needs the production site id + a Netlify API token (read access to Blobs):
```bash
NETLIFY_SITE_ID=<prod-site-id> NETLIFY_TOKEN=<netlify-api-token> \
  node export-blobs.mjs > ../backups/blobs-$(date +%Y%m%d).ndjson
```
Record the per-store counts it prints to stderr — used for the parity check.
It also runs `listStores()` and warns about any live store missing from
`stores.mjs` (add it there and re-run if that happens).

## 3. Assemble analytics.db
```bash
DB=../backups/analytics.db
rm -f "$DB"*
# 3a. pageviews from the Turso dump
sqlite3 "$DB" < ../backups/turso-YYYYMMDD.sql
# 3b. blobs into kv_blobs (idempotent upsert; creates the table if needed)
TURSO_DATABASE_URL="file:$DB" node import-blobs.mjs ../backups/blobs-YYYYMMDD.ndjson
```
`import-blobs.mjs` prints parsed-vs-in-db counts per store — confirm they match
the export summary from step 2 (parity check).

## 4. Place it on the SR8 and start
```bash
# container must be DOWN so the file isn't open twice
docker compose down
docker cp ../backups/analytics.db zero-trust-analytics:/app/data/analytics.db   # or copy into the volume
docker compose up -d
```

## Notes
- `rate-limit` is intentionally NOT migrated (ephemeral counters, in-memory fallback).
- `oauth_states` (underscore, storage.js) and `oauth-states` (hyphen, gsc.js)
  are distinct stores — both are carried across.
- Values are exported raw; `storage.js` writes JSON strings via `setJSON`, so
  the round-trip into `kv_blobs.value` is byte-identical.
- Re-running `import-blobs.mjs` is safe (upsert on `(store, key)`).
