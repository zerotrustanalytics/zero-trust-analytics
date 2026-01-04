/**
 * DATABASE ADAPTER
 * ================
 * Provides unified interface for both Turso (cloud) and SQLite (self-hosted).
 * Automatically detects which database to use based on environment variables.
 */

import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';

// Detect database type from environment
const USE_SQLITE = !process.env.TURSO_DATABASE_URL && process.env.DATABASE_PATH;

let db = null;

/**
 * Initialize database connection
 */
function initDatabase() {
  if (db) return db;

  if (USE_SQLITE) {
    // Self-hosted: Use SQLite
    const dbPath = process.env.DATABASE_PATH || './data/analytics.db';
    console.log(`Using SQLite database at: ${dbPath}`);

    db = new Database(dbPath, { verbose: console.log });
    db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    db.pragma('foreign_keys = ON');

    return createSQLiteAdapter(db);
  } else {
    // Cloud: Use Turso
    console.log('Using Turso (libSQL) database');

    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    return createTursoAdapter(db);
  }
}

/**
 * SQLite adapter - wraps better-sqlite3 to match Turso API
 */
function createSQLiteAdapter(sqlite) {
  return {
    execute: async ({ sql, args = [] }) => {
      try {
        // Handle SELECT queries
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          const rows = sqlite.prepare(sql).all(...args);
          return { rows };
        }

        // Handle CREATE/INSERT/UPDATE/DELETE
        const stmt = sqlite.prepare(sql);
        const result = stmt.run(...args);

        return {
          rows: [],
          rowsAffected: result.changes,
          lastInsertRowid: result.lastInsertRowid
        };
      } catch (error) {
        console.error('SQLite query error:', error);
        throw error;
      }
    },

    batch: async (statements) => {
      const transaction = sqlite.transaction((stmts) => {
        const results = [];
        for (const { sql, args = [] } of stmts) {
          const stmt = sqlite.prepare(sql);
          const result = stmt.run(...args);
          results.push({
            rows: [],
            rowsAffected: result.changes,
            lastInsertRowid: result.lastInsertRowid
          });
        }
        return results;
      });

      try {
        return transaction(statements);
      } catch (error) {
        console.error('SQLite batch error:', error);
        throw error;
      }
    },

    close: () => {
      if (sqlite) {
        sqlite.close();
      }
    }
  };
}

/**
 * Turso adapter - wraps libSQL client (already compatible, but for consistency)
 */
function createTursoAdapter(turso) {
  return {
    execute: async ({ sql, args = [] }) => {
      return await turso.execute({ sql, args });
    },

    batch: async (statements) => {
      return await turso.batch(statements);
    },

    close: async () => {
      if (turso && turso.close) {
        await turso.close();
      }
    }
  };
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    db = initDatabase();
  }
  return db;
}

/**
 * Initialize database schema
 */
export async function initSchema() {
  const database = getDatabase();

  // Create pageviews table
  await database.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS pageviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        site_id TEXT NOT NULL,
        identity_hash TEXT NOT NULL,
        session_hash TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT,
        context_device TEXT,
        context_browser TEXT,
        context_os TEXT,
        context_country TEXT,
        context_region TEXT,
        meta_is_bounce INTEGER DEFAULT 0,
        meta_duration INTEGER DEFAULT 0
      )
    `,
    args: []
  });

  // Create indexes for optimal query performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_pageviews_site_timestamp ON pageviews(site_id, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_site_event ON pageviews(site_id, event_type)',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_identity ON pageviews(identity_hash)',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_site_event_ts ON pageviews(site_id, event_type, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_session ON pageviews(site_id, session_hash)',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_device ON pageviews(site_id, context_device) WHERE event_type = \'pageview\'',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_browser ON pageviews(site_id, context_browser) WHERE event_type = \'pageview\'',
    'CREATE INDEX IF NOT EXISTS idx_pageviews_country ON pageviews(site_id, context_country) WHERE event_type = \'pageview\''
  ];

  for (const indexSql of indexes) {
    await database.execute({ sql: indexSql, args: [] });
  }

  console.log('Database schema initialized');
}

/**
 * Normalize rows - convert BigInt to Number
 */
export function normalizeRows(rows) {
  if (!Array.isArray(rows)) return rows;

  return rows.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = typeof value === 'bigint' ? Number(value) : value;
    }
    return normalized;
  });
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db && db.close) {
    db.close();
    db = null;
  }
}

// Clean up on process exit
process.on('exit', closeDatabase);
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

export default {
  getDatabase,
  initSchema,
  normalizeRows,
  closeDatabase
};
