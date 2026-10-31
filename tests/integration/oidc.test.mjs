// Phase 2 end-to-end: gatekeep-style OIDC tokens against the self-host server.
// Run via run-test.sh with AUTH_MODE=oidc GATEKEEP_ISSUER=http://localhost:3997
//   GATEKEEP_CLIENT_ID=zta ADMIN_SECRET=adm1n
import http from 'http';
const [repo] = process.argv.slice(2);
const FN = `${repo}/netlify/functions/node_modules`;
const { generateKeyPair, exportJWK, SignJWT } = await import(`${FN}/jose/dist/node/esm/index.js`).catch(() => import(`${FN}/jose/dist/webapi/index.js`));
const { createSite, getStore } = {
  ...(await import(`${repo}/netlify/functions/lib/storage.js`)),
  ...(await import(`${repo}/netlify/functions/lib/blob-store.js`)),
};

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) failures++; };

// Local "gatekeep": EdDSA key published at <issuer>/jwks.json
const ISSUER = 'http://localhost:3997';
const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'EdDSA', use: 'sig' };
const jwks = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [jwk] }));
}).listen(3997);

const mint = ({ email, verified = true, aud = 'zta', exp = '10m', sub = `sub_${email}` }) =>
  new SignJWT({ email, email_verified: verified })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setIssuer(ISSUER).setAudience(aud).setSubject(sub).setIssuedAt()
    .setExpirationTime(exp).sign(privateKey);
const api = (path, token, opts = {}) => fetch(`http://localhost:${process.env.PORT || 3999}${path}`, {
  ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } });

// 1. Verified sign-in: JIT-provisions the account, lists (no) sites
const alice = await mint({ email: 'alice@example.com' });
let r = await api('/api/sites/list', alice);
check('verified token accepted', r.status === 200, `${r.status} ${await r.text()}`);

// 2. Write without any CSRF token (the gatekeep dashboard never has one)
r = await api('/api/sites/create', alice, { method: 'POST', body: JSON.stringify({ domain: 'alice.example', name: 'Alice' }) });
const created = await r.text();
check('site create works without CSRF token', r.status === 200 || r.status === 201, `${r.status} ${created}`);
r = await api('/api/sites/list', alice);
const listed = await r.json();
check('created site is listed', listed.sites?.length === 1 && listed.sites[0].domain === 'alice.example', JSON.stringify(listed));

// 3. Rejections
r = await api('/api/sites/list', await mint({ email: 'alice@example.com', verified: false }));
check('unverified email rejected', r.status === 403, String(r.status));
r = await api('/api/sites/list', await mint({ email: 'alice@example.com', aud: 'other-app' }));
check('wrong audience rejected', r.status === 401, String(r.status));
r = await api('/api/sites/list', await mint({ email: 'alice@example.com', exp: Math.floor(Date.now() / 1000) - 60 }));
check('expired token rejected', r.status === 401, String(r.status));
r = await api('/api/sites/list', null);
check('no token rejected', r.status === 401, String(r.status));

// 4. Clerk-era continuity: account whose data lives under its old (Clerk) id
const users = getStore({ name: 'users', consistency: 'strong' });
await users.setJSON('bob@example.com', { id: 'user_new123', ownerId: 'user_2clerkBob', email: 'bob@example.com', plan: 'growth' });
await createSite('user_2clerkBob', 'site_bobsoldsite0001', 'bob.example');
r = await api('/api/sites/list', await mint({ email: 'bob@example.com' }));
const bob = await r.json();
check('ownerId maps to Clerk-era sites', bob.sites?.length === 1 && bob.sites[0].id === 'site_bobsoldsite0001', JSON.stringify(bob));

// 5. Admin key works even when a gatekeep Bearer token is also present
r = await api('/api/admin/usage/cache', alice, { headers: { 'x-admin-key': 'adm1n' } });
check('admin key wins over Bearer', r.status === 200, String(r.status));
r = await api('/api/admin/usage/cache', alice, { headers: { 'x-admin-key': 'wrong' } });
check('wrong admin key rejected', r.status === 401, String(r.status));

// 6. Account settings flows over Bearer (no CSRF): export, then erase
r = await api('/api/user/export', alice);
const exp = await r.text();
check('export my data works', r.status === 200 && exp.includes('alice.example'), `${r.status} ${exp.slice(0, 120)}`);
r = await api('/api/user/delete', alice, { method: 'POST', body: JSON.stringify({ confirmEmail: 'wrong@example.com', confirmDelete: 'DELETE_MY_ACCOUNT' }) });
check('delete refuses mismatched email', r.status === 400, String(r.status));
r = await api('/api/user/delete', alice, { method: 'POST', body: JSON.stringify({ confirmEmail: 'alice@example.com', confirmDelete: 'DELETE_MY_ACCOUNT' }) });
const del = await r.json().catch(() => ({}));
check('delete account works', r.status === 200 && del.summary?.sitesDeleted === 1, `${r.status} ${JSON.stringify(del)}`);
r = await api('/api/sites/list', alice);
const after = await r.json().catch(() => ({}));
check('after delete: next sign-in starts empty', r.status === 200 && after.sites?.length === 0, `${r.status} ${JSON.stringify(after)}`);
r = await api('/api/sites/list', await mint({ email: 'bob@example.com' }));
check('after delete: other accounts untouched', (await r.json()).sites?.length === 1);

jwks.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
