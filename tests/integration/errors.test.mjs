// /api/errors: sanitized fields, type whitelist, origin check, no raw UA.
const { createClient } = await import(`${process.argv[2]}/netlify/functions/node_modules/@libsql/client/lib-esm/node.js`);

const [repo, dbFile] = process.argv.slice(2);
const { createSite, createUser } = await import(`${repo}/netlify/functions/lib/storage.js`);
const db = createClient({ url: `file:${dbFile}` });
const SITE = 'site_errors000000001';
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) failures++; };
const post = (body, origin = 'https://example.com') => fetch(`http://localhost:${process.env.PORT || 3999}/api/errors`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ site_id: SITE, ...body }) });

await createSite((await createUser('e@example.com', 'x', 'free')).id, SITE, 'example.com');

let r = await post({ type: '404', url: 'https://example.com/reset?token=abc&e=a@b.com', referrer: 'https://google.com/search?q=secret',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', message: 'x'.repeat(5000), stack: 'at user jane@x.com' });
check('valid error accepted', r.status === 201, String(r.status));
const row = (await db.execute(`SELECT value FROM kv_blobs WHERE store='errors' AND key LIKE '${SITE}_404%'`)).rows[0];
const rec = JSON.parse(row.value);
check('url reduced to path', rec.url === '/reset', rec.url);
check('referrer reduced to origin', rec.referrer === 'https://google.com', rec.referrer);
check('raw user agent not stored', !('user_agent' in rec) && rec.client.browser === 'chrome', JSON.stringify(rec.client));
check('message capped', rec.message.length === 500, String(rec.message.length));
check('email in stack redacted', rec.stack === 'at user [redacted]', rec.stack);

r = await post({ type: 'anything', url: '/x' });
check('unknown type rejected', r.status === 400, String(r.status));
r = await post({ type: '404', url: '/x' }, 'https://evil.test');
check('foreign origin rejected', r.status === 403, String(r.status));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
