// Enforced retention purge: old raw rows deleted, recent rows + rollups kept.
// Run via run-test.sh with RETENTION_PURGE=enforce.
const { createClient } = await import(`${process.argv[2]}/netlify/functions/node_modules/@libsql/client/lib-esm/node.js`);

const [repo, dbFile] = process.argv.slice(2);
const fn = (p) => `${repo}/netlify/functions/${p}`;
const { createSite, createUser } = await import(fn('lib/storage.js'));
const db = createClient({ url: `file:${dbFile}` });
const SITE = 'site_test0000000002';
const n = async (sql) => Number((await db.execute({ sql, args: [SITE] })).rows[0].n);

const ownerId = (await createUser('o2@example.com', 'x', 'free')).id;
await createSite(ownerId, SITE, 'example.org');
for (const ts of ['2020-01-01 00:00:00', '2020-06-01 00:00:00', new Date().toISOString().replace('T', ' ').split('.')[0]]) {
  await db.execute({ sql: `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type, page_path)
    VALUES (?, ?, 'h', 's', 'pageview', '/p')`, args: [ts, SITE] });
}
await db.execute({ sql: `INSERT INTO daily_rollups (site_id, date, pageviews, unique_visitors, sessions) VALUES (?, '2020-01-01', 1, 1, 1)`, args: [SITE] });

const mod = await import(fn('retention-purge.js'));
const body = await (await mod.default(new Request('http://x/', { method: 'POST' }), { triggerType: 'scheduled' })).json();
const left = await n(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`);
const rollups = await n(`SELECT COUNT(*) n FROM daily_rollups WHERE site_id=?`);
const ok = body.enforce === true && body.rows === 2 && left === 1 && rollups === 1;
console.log(ok ? 'PASS' : 'FAIL', ' enforced purge', JSON.stringify({ enforce: body.enforce, deleted: body.rows, left, rollups }));
process.exit(ok ? 0 : 1);
