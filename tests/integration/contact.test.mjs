let failures = 0;
const check = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) failures++; };
const post = (body, origin = 'https://ztas.io') => fetch(`http://localhost:${process.env.PORT || 3999}/api/contact`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
const ok = { name: 'Jo', email: 'jo@example.com', message: 'Hello there, a question about plans.' };
let r = await post(ok, 'https://evil.test'); check('foreign origin rejected', r.status === 403, String(r.status));
r = await post({ ...ok, website: 'http://spam' }); check('honeypot silently accepted', r.status === 200, String(r.status));
r = await post({ ...ok, email: 'nope' }); check('bad email rejected', r.status === 400, (await r.json()).error);
r = await post({ ...ok, message: 'x' }); check('empty message rejected', r.status === 400, String(r.status));
r = await post(ok); check('no mail provider -> clean 503', r.status === 503, (await r.json()).error);
r = await post(ok); check('CORS header for ztas.io', r.headers.get('access-control-allow-origin') === 'https://ztas.io', r.headers.get('access-control-allow-origin'));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0);
