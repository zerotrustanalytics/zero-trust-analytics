/**
 * BLOB STORE ADAPTER
 * ==================
 * Drop-in replacement for `@netlify/blobs`' `getStore`.
 *
 *   - On Netlify (SELF_HOSTED !== 'true'): delegates to the real @netlify/blobs,
 *     so nothing changes for the current production deployment.
 *   - Self-hosted (SELF_HOSTED === 'true'): backs the same KV interface with the
 *     local libSQL/SQLite database (a `kv_blobs` table on the same file that
 *     holds pageviews). Netlify Blobs is a Netlify-platform-only service and is
 *     not available off-Netlify, so this is what lets users/sites/auth persist
 *     on the SR8 home server. All state ends up in one file — one thing to back
 *     up and migrate.
 *
 * Implements only the surface the codebase actually uses (verified):
 *   getStore(name | { name, consistency })
 *     -> { get(key, {type}), set(key, val, opts), setJSON(key, val, opts),
 *          delete(key), list({prefix?}) -> { blobs: [{key}], directories } }
 *
 * `getStore` is intentionally synchronous (call sites do not await it); only the
 * returned store methods are async, matching @netlify/blobs.
 */
import { getStore as netlifyGetStore } from '@netlify/blobs';
import { createClient } from '@libsql/client';
import { Config } from './config.js';

const SELF_HOSTED = process.env.SELF_HOSTED === 'true';

let _client = null;
let _schemaReady = null;

function client() {
  if (!_client) {
    _client = createClient({
      url: Config.database.url,
      authToken: Config.database.authToken,
    });
  }
  return _client;
}

function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const db = client();
      // WAL is a persistent, file-level mode: setting it once lets this
      // connection and turso.js's connection to the same file read/write
      // concurrently. Ignored on backends that don't support it (Turso cloud).
      try {
        await db.execute(`PRAGMA journal_mode=WAL`);
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
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_kv_blobs_store ON kv_blobs(store)`);
    })();
  }
  return _schemaReady;
}

function libsqlStore(name) {
  async function get(key, opts = {}) {
    await ensureSchema();
    const { rows } = await client().execute({
      sql: 'SELECT value FROM kv_blobs WHERE store = ? AND key = ?',
      args: [name, key],
    });
    if (rows.length === 0 || rows[0].value == null) return null;
    const value = rows[0].value;
    if (opts && opts.type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value; // 'text' / default
  }

  async function set(key, value, opts = {}) {
    await ensureSchema();
    await client().execute({
      sql: `INSERT INTO kv_blobs (store, key, value, metadata, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(store, key) DO UPDATE
              SET value = excluded.value,
                  metadata = excluded.metadata,
                  updated_at = excluded.updated_at`,
      args: [name, key, String(value), opts && opts.metadata ? JSON.stringify(opts.metadata) : null],
    });
  }

  async function setJSON(key, value, opts = {}) {
    return set(key, JSON.stringify(value), opts);
  }

  async function del(key) {
    await ensureSchema();
    await client().execute({
      sql: 'DELETE FROM kv_blobs WHERE store = ? AND key = ?',
      args: [name, key],
    });
  }

  async function list(opts = {}) {
    await ensureSchema();
    const prefix = opts && opts.prefix ? opts.prefix : '';
    const { rows } = await client().execute(
      prefix
        ? { sql: 'SELECT key FROM kv_blobs WHERE store = ? AND key LIKE ?', args: [name, `${prefix}%`] }
        : { sql: 'SELECT key FROM kv_blobs WHERE store = ?', args: [name] }
    );
    return { blobs: rows.map((r) => ({ key: r.key })), directories: [] };
  }

  return { get, set, setJSON, delete: del, list };
}

export function getStore(arg) {
  if (!SELF_HOSTED) return netlifyGetStore(arg);
  const name = typeof arg === 'string' ? arg : arg && arg.name;
  if (!name) throw new Error('getStore: a store name is required');
  return libsqlStore(name);
}

export default { getStore };
