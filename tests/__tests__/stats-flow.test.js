/**
 * getStats entry/exit pages, bounce rate and durations, against a real
 * libSQL file (not mocks): these are computed in SQL from raw events.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const dir = mkdtempSync(join(tmpdir(), 'zta-stats-flow-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'flow.db')}`;

let turso;
let getStats;
const SITE = 'site_flowtest';
const DAY = '2026-11-01';

async function pageview(session, visitor, time, path) {
  await turso.execute({
    sql: `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type, page_path)
          VALUES (?, ?, ?, ?, 'pageview', ?)`,
    args: [`${DAY} ${time}`, SITE, visitor, session, path]
  });
}

async function engagement(session, visitor, time, path, seconds) {
  await turso.execute({
    sql: `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type, page_path, meta_duration)
          VALUES (?, ?, ?, ?, 'engagement', ?, ?)`,
    args: [`${DAY} ${time}`, SITE, visitor, session, path, seconds]
  });
}

beforeAll(async () => {
  const mod = await import('../../netlify/functions/lib/turso.js');
  turso = mod.turso;
  getStats = mod.getStats;
  await mod.initSchema();

  // s1: three pages, all with engagement time from the tracker.
  await pageview('s1', 'v1', '10:00:00', '/');
  await engagement('s1', 'v1', '10:00:25', '/', 25);
  await pageview('s1', 'v1', '10:00:30', '/docs');
  await engagement('s1', 'v1', '10:01:50', '/docs', 80);
  await pageview('s1', 'v1', '10:02:00', '/blog');
  await engagement('s1', 'v1', '10:02:40', '/blog', 40);

  // s2: a bounce with no engagement event.
  await pageview('s2', 'v2', '11:00:00', '/');

  // s3: no engagement events (e.g. the core tracker) -> gap fallback.
  await pageview('s3', 'v1', '12:00:00', '/docs');
  await pageview('s3', 'v1', '12:00:45', '/pricing');
  await pageview('s3', 'v1', '12:01:00', '/blog');

  // Top pages come from rollups.
  await turso.execute({
    sql: `INSERT INTO page_rollups (site_id, date, page_path, views, visitors) VALUES (?, ?, '/pricing', 1, 1)`,
    args: [SITE, DAY]
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('getStats session flow', () => {
  let stats;
  beforeAll(async () => {
    stats = await getStats(SITE, `${DAY} 00:00:00`, `${DAY} 23:59:59`);
  });

  it('lists entry pages: the first pageview of each session', () => {
    expect(stats.entryPages).toEqual([
      { name: '/', views: 2, entries: 2, visitors: 2, duration: 25 },
      { name: '/docs', views: 1, entries: 1, visitors: 1, duration: 80 }
    ]);
  });

  it('lists exit pages with exit rate: the last pageview of each session', () => {
    expect(stats.exitPages).toEqual([
      { name: '/blog', views: 2, exits: 2, visitors: 1, exitRate: 100, duration: 40 },
      { name: '/', views: 2, exits: 1, visitors: 1, exitRate: 50, duration: 25 }
    ]);
  });

  it('counts single-pageview sessions as bounces', () => {
    expect(stats.summary.sessions).toBe(3);
    expect(stats.summary.bounce_rate).toBe(33);
  });

  it('averages visit duration: max(engaged time, first-to-last pageview span)', () => {
    // s1 = max(145, 120) = 145, s2 = 0, s3 = max(0, 60) = 60 -> 205 / 3
    expect(stats.summary.avg_duration).toBe(68);
  });

  it('falls back to time-until-next-pageview when no engagement was recorded', () => {
    expect(stats.topPages).toEqual([{ name: '/pricing', views: 1, visitors: 1, duration: 15 }]);
  });
});
