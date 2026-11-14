/**
 * Proof 2 of 2 for moving ZTA onto billing.config.mjs: `launchkit billing sync --adopt-only --dry-run` against an account holding
 * ZTA's CURRENT live products and prices (four hand-made monthly prices at $9 / $19 / $49 / $99, key-less, one webhook endpoint)
 * makes only GETs, creates nothing, archives nothing, reports no drift, and finds each price by the id in STRIPE_PRICE_*.
 *
 * It runs the real launchkit CLI (a child process) against a fake Stripe on localhost. The CLI is not vendored into the app: it is
 * found at $LAUNCHKIT_CLI or ../../launchkit/bin/launchkit.js (the kit checkout next to this repo's parent). Without it the tests
 * are skipped and say so. Nothing leaves the machine.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeStripe } from '../fixtures/launchkit/fake-stripe.js';
import { REQUIRED_EVENTS } from '../../vendor/launchkit/billing-config.js';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = process.env.LAUNCHKIT_CLI ? resolve(process.env.LAUNCHKIT_CLI) : resolve(REPO, '../../launchkit/bin/launchkit.js');
const have = existsSync(CLI);
if (!have) console.warn(`billing-config-adopt-only: launchkit CLI not found at ${CLI}; set LAUNCHKIT_CLI to run the adopt-only proof`);
const run = have ? describe : describe.skip;

const TIERS = [['starter', 'Starter', 900], ['growth', 'Growth', 1900], ['business', 'Business', 4900], ['scale', 'Scale', 9900]];
const WH = 'whsec_' + 'w'.repeat(40);
const BIND = 'b'.repeat(48);

let seq = 0;
const product = (id, name) => ({ id, object: 'product', name, active: true, metadata: {}, created: 1_700_000_000, livemode: false });
const price = (id, prod, amount) => ({ id, object: 'price', product: prod, currency: 'usd', active: true, nickname: null, metadata: {}, lookup_key: null, livemode: false, created: 1_700_000_000 + ++seq,
  type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', meter: null }, unit_amount: amount, unit_amount_decimal: String(amount), billing_scheme: 'per_unit' });
const endpoint = (url) => ({ id: `we_${++seq}`, object: 'webhook_endpoint', url, enabled_events: [...REQUIRED_EVENTS.stripe], status: 'enabled', description: null, metadata: {}, livemode: false });

const cli = (args, { cwd, env }) => new Promise((ok) => {
  const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (out += c));
  child.on('close', (status) => ok({ status, all: out }));
});

run('billing sync --adopt-only --dry-run against the app\'s live Stripe account', () => {
  let f;
  let dir;
  beforeAll(async () => {
    f = await fakeStripe();
    // a project dir holding exactly what ships: the config and the vendored kit
    dir = mkdtempSync(join(tmpdir(), 'zta-adopt-'));
    cpSync(join(REPO, 'billing.config.mjs'), join(dir, 'billing.config.mjs'));
    cpSync(join(REPO, 'vendor'), join(dir, 'vendor'), { recursive: true });
  });
  afterAll(async () => {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates nothing, archives nothing, drifts nothing: it adopts each STRIPE_PRICE_* by id and finds the webhook', async () => {
    const db = f.admin.db;
    db.products.push(...TIERS.map(([k, n]) => product(`prod_zta_${k}`, `Zero Trust Analytics ${n}`)));
    db.prices.push(...TIERS.map(([k, , c]) => price(`price_zta_${k}`, `prod_zta_${k}`, c)));
    db.webhook_endpoints.push(endpoint('https://zta.example.com/api/stripe/webhook'));
    const before = JSON.stringify(db);
    const from = f.calls.length;

    const env = { STRIPE_SECRET_KEY: 'sk_test_synctest1234abcd', STRIPE_API_BASE: f.url, STRIPE_WEBHOOK_SECRET: WH, BILLING_BINDING_SECRET: BIND, BILLING_PUBLIC_URL: 'https://zta.example.com',
      ...Object.fromEntries(TIERS.map(([k]) => [`STRIPE_PRICE_${k.toUpperCase()}`, `price_zta_${k}`])) };
    const r = await cli(['billing', 'sync', dir, '--dry-run', '--adopt-only'], { cwd: dir, env });

    expect(r.status).toBe(0);
    expect(f.calls.slice(from).filter((c) => c.method !== 'GET')).toEqual([]);   // GETs only
    expect(JSON.stringify(db)).toBe(before);                                       // the account is untouched
    const m = r.all.match(/Plan: (\d+) to create, (\d+) to update, (\d+) to archive, (\d+) unchanged(?:, (\d+) to do by hand)?(?:, (\d+) drift)?(?:, (\d+) deferred to a normal sync)?/);
    expect(m).not.toBeNull();
    const [create, update, archive, unchanged, manual, drift, deferred] = m.slice(1).map((x) => Number(x ?? 0));
    expect({ create, archive, manual, drift, deferred }).toEqual({ create: 0, archive: 0, manual: 0, drift: 0, deferred: 0 });
    expect(update).toBe(8);      // 4 products + 4 prices get their lk_ tags / lookup key; nothing else changes
    expect(unchanged).toBe(1);   // the webhook endpoint
    expect(r.all.split('\n').filter((l) => /\(adopted by id: sets the lookup key\)/.test(l))).toHaveLength(4);
    expect(r.all).not.toMatch(/^\s+\+ create/m);
    expect(r.all).not.toMatch(/env\s+STRIPE_PRICE_/);   // the ids in env are already right
  });
});
