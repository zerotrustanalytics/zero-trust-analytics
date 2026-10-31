#!/usr/bin/env node
/**
 * Clerk -> gatekeep account continuity check (run AFTER import-blobs.mjs).
 *
 * Under Clerk, a request's user id was the Clerk id (user_2ab...), and sites,
 * API keys and teams were owned by whatever id was current when they were
 * created — the Clerk id, or an older ZTA id linked through a
 * `user_id_map_<id> -> email` entry. gatekeep resolves users by email, so the
 * dashboard acts as the user record's own `id`. When the data lives under a
 * different id, the customer would sign in and see nothing.
 *
 * For each user this collects every id that resolves to their email (record id
 * + user_id_map entries), counts what each id owns, and reports mismatches.
 * With --apply it writes `ownerId` (the id that owns the data) into the user
 * record; lib/auth.js uses ownerId in place of id when present.
 *
 * Usage:
 *   TURSO_DATABASE_URL="file:../backups/analytics.db" node link-owner-ids.mjs           # report
 *   TURSO_DATABASE_URL="file:../backups/analytics.db" node link-owner-ids.mjs --apply   # write ownerId
 */
import { createRequire } from 'module';

// The libSQL client is a dependency of netlify/functions (the code that owns this
// database), not of the repo root; load it from there so a clean checkout works.
const require = createRequire(new URL('../netlify/functions/package.json', import.meta.url));
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is required (e.g. file:../backups/analytics.db)');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const tableExists = async (name) =>
  (await rows(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [name])).length > 0;

// Per-user aux keys in the users store (storage.js) — not user records.
const AUX_PREFIXES = ['user_id_map_', 'user_sites_', 'user_deleted_sites_', 'user_teams_',
  'user_log_', 'user_sessions_', 'user_keys_'];

const userRows = await rows(`SELECT key, value FROM kv_blobs WHERE store = 'users'`);
const users = new Map(); // email -> record
const idMap = new Map(); // email -> Set(ids)
const auxValues = new Map();
for (const { key, value } of userRows) {
  if (key.startsWith('user_id_map_')) {
    const email = String(value);
    if (!idMap.has(email)) idMap.set(email, new Set());
    idMap.get(email).add(key.slice('user_id_map_'.length));
  } else if (AUX_PREFIXES.some((p) => key.startsWith(p))) {
    auxValues.set(key, value);
  } else {
    try {
      users.set(key, JSON.parse(value));
    } catch {
      /* not a user record */
    }
  }
}

// What does an id own?
const siteRows = await rows(`SELECT value FROM kv_blobs WHERE store = 'sites'`);
const sitesByOwner = new Map();
for (const { value } of siteRows) {
  try {
    const site = JSON.parse(value);
    if (site && site.userId) sitesByOwner.set(site.userId, (sitesByOwner.get(site.userId) || 0) + 1);
  } catch {
    /* index entries etc. */
  }
}
const hasTeams = await tableExists('teams');
async function owned(id) {
  const listed = auxValues.get(`user_sites_${id}`);
  let siteList = 0;
  try { siteList = listed ? JSON.parse(listed).length : 0; } catch { /* ignore */ }
  const keys = auxValues.get(`user_keys_${id}`);
  let keyCount = 0;
  try { keyCount = keys ? JSON.parse(keys).length : 0; } catch { /* ignore */ }
  const teams = hasTeams ? Number((await rows(`SELECT COUNT(*) n FROM teams WHERE owner_id = ?`, [id]))[0].n) : 0;
  return { sites: sitesByOwner.get(id) || 0, siteList, apiKeys: keyCount, teams };
}
const weight = (o) => o.sites + o.siteList + o.apiKeys + o.teams;

let ok = 0;
let fixable = 0;
let ambiguous = 0;
for (const [email, user] of users) {
  const ids = new Set([user.id, ...(idMap.get(email) || [])].filter(Boolean));
  const report = [];
  for (const id of ids) report.push({ id, ...(await owned(id)) });
  const withData = report.filter((r) => weight(r) > 0);
  const current = user.ownerId || user.id;

  if (withData.length === 0 || (withData.length === 1 && withData[0].id === current)) {
    ok++;
    continue;
  }
  if (withData.length === 1) {
    fixable++;
    console.log(`FIX   ${email}: data owned by ${withData[0].id}, record id is ${user.id}`, JSON.stringify(withData[0]));
    if (APPLY) {
      await db.execute({
        sql: `UPDATE kv_blobs SET value = ?, updated_at = datetime('now') WHERE store = 'users' AND key = ?`,
        args: [JSON.stringify({ ...user, ownerId: withData[0].id }), email],
      });
    }
  } else {
    ambiguous++;
    console.log(`SPLIT ${email}: data under several ids — needs a manual merge`, JSON.stringify(withData));
  }
}

console.log(`\n${users.size} users: ${ok} ok, ${fixable} ${APPLY ? 'fixed' : 'fixable (re-run with --apply)'}, ${ambiguous} need manual review`);
