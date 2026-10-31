// Account erasure + expired-site cleanup must remove ALL data for the sites
// involved (analytics tables + KV records) and nothing belonging to others.
const { createClient } = await import(`${process.argv[2]}/netlify/functions/node_modules/@libsql/client/lib-esm/node.js`);

const [repo, dbFile] = process.argv.slice(2);
const fn = (p) => `${repo}/netlify/functions/${p}`;
const st = await import(fn('lib/storage.js'));
const db = createClient({ url: `file:${dbFile}` });

const A1 = 'site_aaaa000000000001', A2 = 'site_aaaa000000000002', B1 = 'site_bbbb000000000001';
const userA = await st.createUser('a@example.com', 'x', 'free');
const userB = await st.createUser('b@example.com', 'x', 'free');
await st.createSite(userA.id, A1, 'a1.example');
await st.createSite(userA.id, A2, 'a2.example');
await st.createSite(userB.id, B1, 'b1.example');
await st.deleteSite(A2, userA.id); // A2 is soft-deleted, still restorable

const now = new Date().toISOString().replace('T', ' ').split('.')[0];
for (const s of [A1, A2, B1]) {
  await db.execute({ sql: `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type, page_path) VALUES (?, ?, 'h', 's', 'pageview', '/')`, args: [now, s] });
  await db.execute({ sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions) VALUES (?, '2026-10-01', 1, 1, 1)`, args: [s] });
  await db.execute({ sql: `INSERT INTO kv_blobs (store, key, value) VALUES ('goals', ?, '[]')`, args: [`site_goals_${s}`] });
  await db.execute({ sql: `INSERT INTO kv_blobs (store, key, value) VALUES ('goals', ?, ?)`, args: [`goal_${s}`, JSON.stringify({ id: `goal_${s}`, siteId: s })] });
}

const count = async (s) => {
  const q = async (sql, args) => Number((await db.execute({ sql, args })).rows[0].n);
  return {
    pv: await q('SELECT COUNT(*) n FROM pageviews WHERE site_id=?', [s]),
    roll: await q('SELECT COUNT(*) n FROM daily_rollups WHERE site_id=?', [s]),
    kv: await q('SELECT COUNT(*) n FROM kv_blobs WHERE instr(key, ?) > 0 OR instr(value, ?) > 0', [s, `"siteId":"${s}"`]),
  };
};
const empty = (c) => c.pv === 0 && c.roll === 0 && c.kv === 0;
let ok = true;
const check = (label, cond, detail) => { console.log(cond ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : ''); ok &&= cond; };

// 1. Account erasure of A
const erased = await st.purgeAllUserSites(userA.id);
await st.deleteUser('a@example.com');
const a1 = await count(A1), a2 = await count(A2), b1 = await count(B1);
check('erase: purged both of A\'s sites (active + soft-deleted)', erased === 2, { erased });
check('erase: A1 fully gone', empty(a1), a1);
check('erase: A2 (soft-deleted) fully gone', empty(a2), a2);
check('erase: B1 untouched', b1.pv === 1 && b1.roll === 1 && b1.kv >= 3, b1);
const mapLeft = Number((await db.execute({ sql: `SELECT COUNT(*) n FROM kv_blobs WHERE key=?`, args: [`user_id_map_${userA.id}`] })).rows[0].n);
const listsLeft = Number((await db.execute({ sql: `SELECT COUNT(*) n FROM kv_blobs WHERE key IN (?, ?)`, args: [`user_sites_${userA.id}`, `user_deleted_sites_${userA.id}`] })).rows[0].n);
check('erase: id->email index removed', mapLeft === 0, { mapLeft });
check('erase: site lists removed', listsLeft === 0, { listsLeft });
check('erase: user B still exists', !!(await st.getUser('b@example.com')));

// 2. Expired soft-deleted site cleanup purges analytics too
await st.deleteSite(B1, userB.id);
const rec = JSON.parse((await db.execute({ sql: `SELECT value FROM kv_blobs WHERE store='sites' AND key=?`, args: [B1] })).rows[0].value);
rec.expiresAt = '2020-01-01T00:00:00.000Z';
await db.execute({ sql: `UPDATE kv_blobs SET value=? WHERE store='sites' AND key=?`, args: [JSON.stringify(rec), B1] });
const res = await st.cleanupExpiredSites();
const b1after = await count(B1);
check('cleanup: expired site + its analytics gone', res.cleaned === 1 && empty(b1after), { cleaned: res.cleaned, ...b1after });

// 3. Guard: refuses malformed IDs (would otherwise match broadly)
const { purgeSiteData } = await import(fn('lib/turso.js'));
let threw = false;
try { await purgeSiteData(''); } catch { threw = true; }
check('guard: empty site id rejected', threw);

console.log(ok ? 'ALL PASSED' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
