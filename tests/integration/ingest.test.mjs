// End-to-end ingest test against a running self-host server (PORT 3999) and
// its DB file. Usage: node ingest-test.mjs <repo> <db-file>
const { createClient } = await import(`${process.argv[2]}/netlify/functions/node_modules/@libsql/client/lib-esm/node.js`);

const [repo, dbFile] = process.argv.slice(2);
const fn = (p) => `${repo}/netlify/functions/${p}`;
const { createSite, createUser } = await import(fn('lib/storage.js'));
const db = createClient({ url: `file:${dbFile}` });

const BASE = `http://localhost:${process.env.PORT || 3999}`;
const SITE = 'site_test0000000001';
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const track = (events, { ua = 'Mozilla/5.0 Chrome/120', ip = '203.0.113.7', origin = 'https://example.com', extra = {} } = {}) =>
  fetch(`${BASE}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua, 'cf-connecting-ip': ip, origin },
    body: JSON.stringify({ batch: true, siteId: SITE, events, ...extra }),
  });

const ownerId = (await createUser('owner@example.com', 'x', 'free')).id;
await createSite(ownerId, SITE, 'example.com');

// 1. Two pageviews from one visitor in ONE batch -> counted once (old code: 0)
let r = await track([{ type: 'pageview', path: '/a' }, { type: 'pageview', path: '/b' }]);
check('batch accepted', r.status === 200, `${r.status} ${await r.text()}`);
let day = (await q(`SELECT * FROM daily_rollups WHERE site_id=?`, [SITE]))[0];
check('same-batch visitor counted once', day && day.unique_visitors === 1 && day.pageviews === 2 && day.sessions === 1,
  JSON.stringify(day));

// 2. Later batch, same visitor -> same server-side session, still 1 visitor
r = await track([{ type: 'pageview', path: '/c' }]);
day = (await q(`SELECT * FROM daily_rollups WHERE site_id=?`, [SITE]))[0];
const sessions = await q(`SELECT DISTINCT session_hash FROM pageviews WHERE site_id=?`, [SITE]);
check('session continued server-side', sessions.length === 1 && day.sessions === 1 && day.unique_visitors === 1,
  `sessions=${sessions.length} rollup=${JSON.stringify(day)}`);

// 3. Different visitor (UA) -> 2 visitors, 2 sessions
await track([{ type: 'pageview', path: '/a' }], { ua: 'Mozilla/5.0 Firefox/130' });
day = (await q(`SELECT * FROM daily_rollups WHERE site_id=?`, [SITE]))[0];
check('second visitor counted', day.unique_visitors === 2 && day.sessions === 2, JSON.stringify(day));
const pageA = (await q(`SELECT visitors, views FROM page_rollups WHERE site_id=? AND page_path='/a'`, [SITE]))[0];
check('per-page visitors correct', pageA.visitors === 2 && pageA.views === 2, JSON.stringify(pageA));

// 4. Event types: unknown + heartbeat dropped, reserved custom name renamed
const before = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`, [SITE]))[0].n;
await track([
  { type: 'bogus', path: '/x' },
  { type: 'heartbeat', path: '/x' },
  { type: 'event', action: 'pageview', path: '/x' },
  { type: 'event', action: 'signup', label: 'hero', value: '42', path: '/x' },
]);
const types = (await q(`SELECT event_type FROM pageviews WHERE site_id=? AND page_path='/x' ORDER BY id`, [SITE])).map(r => r.event_type);
check('unknown + heartbeat dropped, reserved renamed', JSON.stringify(types) === '["custom_pageview","signup"]', JSON.stringify(types));
day = (await q(`SELECT pageviews FROM daily_rollups WHERE site_id=?`, [SITE]))[0];
check('custom "pageview" not counted as pageview', day.pageviews === 4, `pageviews=${day.pageviews}`);

// 5. Sanitizing: query string stripped, PII redacted instead of dropping event
await track([
  { type: 'pageview', path: '/reset?token=abc123&email=a@b.com' },
  { type: 'pageview', path: '/orders/5551234567' },
  { type: 'pageview', path: '/u/jane@example.com/profile' },
  { type: 'pageview', path: '/' + 'x'.repeat(5000) },
]);
const paths = (await q(`SELECT page_path FROM pageviews WHERE site_id=? ORDER BY id DESC LIMIT 4`, [SITE])).map(r => r.page_path).reverse();
check('query string stripped', paths[0] === '/reset', paths[0]);
check('phone-like segment redacted, event kept', paths[1] === '/orders/[redacted]', paths[1]);
check('email redacted, event kept', paths[2] === '/u/[redacted]/profile', paths[2]);
check('path length capped', paths[3].length === 500, `len=${paths[3].length}`);

// 6. Oversized batch truncated to 50
const n0 = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`, [SITE]))[0].n;
await track(Array.from({ length: 80 }, (_, i) => ({ type: 'event', action: 'bulk', path: `/bulk` })), { ua: 'Mozilla/5.0 Safari/17' });
const n1 = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`, [SITE]))[0].n;
check('batch truncated to 50', n1 - n0 === 50, `stored=${n1 - n0}`);

// 7. Origins: subdomain allowed, foreign rejected
r = await track([{ type: 'pageview', path: '/sub' }], { origin: 'https://app.example.com' });
check('subdomain origin allowed', r.status === 200, String(r.status));
r = await track([{ type: 'pageview', path: '/evil' }], { origin: 'https://evil-example.com' });
check('foreign origin rejected', r.status === 403, String(r.status));

// 8. Sampling: rate 0 stores nothing
const s0 = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`, [SITE]))[0].n;
r = await track([{ type: 'pageview', path: '/sampled' }], { extra: { sampleRate: 0 }, ua: 'Mozilla/5.0 Edg/120' });
const s1 = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=?`, [SITE]))[0].n;
check('sampleRate 0 stores nothing', s1 === s0, await r.text());

// 9. Quota metering counts events, not just pageviews
await new Promise(res => setTimeout(res, 300)); // usage increments are fire-and-forget
const usage = (await q(`SELECT pageviews, events FROM monthly_usage WHERE site_id=?`, [SITE]))[0];
check('monthly usage meters custom events', usage && usage.events >= 52, JSON.stringify(usage));

// 10. Retention: free plan = 30 days. Seed an old row, dry run, then enforce.
await db.execute({
  sql: `INSERT INTO pageviews (timestamp, site_id, identity_hash, session_hash, event_type, page_path)
        VALUES ('2020-01-01 00:00:00', ?, 'old', 'old', 'pageview', '/old')`, args: [SITE] });
const rollupsBefore = (await q(`SELECT COUNT(*) n FROM daily_rollups WHERE site_id=?`, [SITE]))[0].n;
process.env.CLEANUP_SECRET = 'k';
const purgeMod = await import(fn('retention-purge.js'));
let res = await purgeMod.default(new Request('http://x/', { method: 'POST' }), { triggerType: 'scheduled' });
let body = await res.json();
const oldStill = (await q(`SELECT COUNT(*) n FROM pageviews WHERE site_id=? AND page_path='/old'`, [SITE]))[0].n;
check('dry run reports, deletes nothing', body.enforce === false && body.rows === 1 && oldStill === 1, JSON.stringify(body));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
