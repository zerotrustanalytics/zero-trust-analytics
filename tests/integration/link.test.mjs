// Seed Clerk-era shapes, then exercise scripts/link-owner-ids.mjs (report + --apply).
import { execFileSync } from 'child_process';
const [repo, dbFile] = process.argv.slice(2);
const { createSite } = await import(`${repo}/netlify/functions/lib/storage.js`);
const { getStore } = await import(`${repo}/netlify/functions/lib/blob-store.js`);
const users = getStore({ name: 'users', consistency: 'strong' });
// carol: record id differs, sites owned by Clerk id via mapping -> FIX
await users.setJSON('carol@example.com', { id: 'user_legacy1', email: 'carol@example.com' });
await users.set('user_id_map_user_2clerkCarol', 'carol@example.com');
await createSite('user_2clerkCarol', 'site_carol0000000001', 'carol.example');
// dave: consistent -> ok
await users.setJSON('dave@example.com', { id: 'user_2clerkDave', email: 'dave@example.com' });
await createSite('user_2clerkDave', 'site_dave00000000001', 'dave.example');
// erin: data split across two ids -> SPLIT
await users.setJSON('erin@example.com', { id: 'user_erinA', email: 'erin@example.com' });
await users.set('user_id_map_user_erinB', 'erin@example.com');
await createSite('user_erinA', 'site_erin0000000000A', 'erin-a.example');
await createSite('user_erinB', 'site_erin0000000000B', 'erin-b.example');
const run = (...a) => execFileSync('node', [`${repo}/scripts/link-owner-ids.mjs`, ...a],
  { env: { ...process.env, TURSO_DATABASE_URL: `file:${dbFile}` }, cwd: `${repo}/scripts` }).toString();
console.log(run());
console.log(run('--apply'));
const carol = await users.get('carol@example.com', { type: 'json' });
const ok = carol.ownerId === 'user_2clerkCarol';
console.log(ok ? 'PASS' : 'FAIL', ' carol.ownerId =', carol.ownerId);
process.exit(ok ? 0 : 1);
