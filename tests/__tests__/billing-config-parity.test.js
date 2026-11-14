import { jest } from '@jest/globals';
/**
 * Proof 1 of 2 for moving ZTA onto billing.config.mjs: NO PRICING OR BEHAVIOR CHANGE.
 *
 * The OLD setup (createBilling with a hand-built plan table and the per-call `extra`, exactly as on the base branch
 * launchkit-billing, commit a539eca) and the NEW one (createBillingFromConfig(billing.config.mjs)) run the same checkouts
 * against the same fake Stripe (the real createStripeRest, with a recording fetch). The provider must see identical requests,
 * classify the same subscriptions to the same plans, and fire the same hooks and entitlements.
 */
import { createBilling, createStripeRest, signWebhook } from '../../vendor/launchkit/billing.js';
import { createBillingFromConfig } from '../../vendor/launchkit/billing-config.js';
import billingConfig from '../../billing.config.mjs';

const WH = 'whsec_' + 'w'.repeat(40);
const BIND = 'b'.repeat(48);
const KEY = 'sk_test_parity1234';
const EMAIL = 'jo@example.com';
const TIERS = [['starter', 'Starter', 9], ['growth', 'Growth', 19], ['business', 'Business', 49], ['scale', 'Scale', 99]];
const ENV = { STRIPE_SECRET_KEY: KEY, ...Object.fromEntries(TIERS.map(([k]) => [`STRIPE_PRICE_${k.toUpperCase()}`, `price_zta_${k}`])) };
const now = () => Math.floor(Date.now() / 1000);

/** A Stripe that records every request and answers the few calls checkout, the webhook and sync make. */
function fakeStripeFetch() {
  const f = { calls: [], sessions: new Map(), subs: new Map(), n: 0 };
  f.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = typeof init.body === 'string' ? init.body : '';
    f.calls.push({ method: init.method ?? 'GET', path: u.pathname, body });
    const send = (obj, status = 200) => ({ ok: status < 300, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => obj, text: async () => JSON.stringify(obj) });
    if (init.method === 'POST' && u.pathname === '/v1/checkout/sessions') {
      const id = `cs_${++f.n}`;
      const form = Object.fromEntries(new URLSearchParams(body));
      f.sessions.set(id, { id, form });
      return send({ id, url: `https://checkout.stripe.test/${id}` });
    }
    let m;
    if ((m = u.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) return f.subs.has(m[1]) ? send(f.subs.get(m[1])) : send({ error: { message: 'no such subscription' } }, 404);
    return send({ error: { message: `unexpected ${init.method} ${u.pathname}` } }, 404);
  };
  return f;
}
/** The checkout request, normalised: path + every form field, sorted. */
const requestOf = (f, i) => ({ path: f.calls[i].path, form: [...new URLSearchParams(f.calls[i].body)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) });
const lastCheckout = (f) => requestOf(f, f.calls.map((c) => c.path).lastIndexOf('/v1/checkout/sessions'));

const memoryKv = () => {
  const m = new Map();
  return { get: async (k) => structuredClone(m.get(k) ?? null), set: async (k, v) => void m.set(k, structuredClone(v)), del: async (k) => void m.delete(k), list: async (p = '') => [...m.keys()].filter((k) => k.startsWith(p)).sort() };
};

const hooksOf = (seen) => ({
  orgExists: async (email) => typeof email === 'string' && email.includes('@'),
  entitlements: { onChange: (c) => seen.push(['change', c.orgId, c.plan, c.status, c.after.cancelAtPeriodEnd, c.after.currentPeriodEnd]) },
  onPeriod: ({ orgId, period }) => seen.push(['period', orgId, period.end]),
});

// ---- OLD: the base branch's setup, kept here as the fixture (ztaPlans + createBilling + the per-call extra) ----
const legacyPlans = (env) => Object.fromEntries(TIERS.map(([id, name]) => [id, { priceId: env[`STRIPE_PRICE_${id.toUpperCase()}`], name }]));
const legacyExtra = (email, planId) => ({ payment_method_types: ['card'], metadata: { email, plan: planId } });
function oldSide(f) {
  const seen = [];
  const billing = createBilling({ store: memoryKv(), stripe: createStripeRest({ secretKey: KEY, fetch: f.fetch }), plans: legacyPlans(ENV), webhookSecret: WH, bindingSecret: BIND, ...hooksOf(seen) });
  return { seen, billing, checkout: (plan) => billing.checkout(EMAIL, { planId: plan, customerEmail: EMAIL, extra: legacyExtra(EMAIL, plan), successUrl: 'https://zta.test/ok', cancelUrl: 'https://zta.test/no' }) };
}
// ---- NEW: billing.config.mjs, the call site without `extra` ----
function newSide(f) {
  const seen = [];
  const billing = createBillingFromConfig(billingConfig, { store: memoryKv(), env: ENV, fetch: f.fetch, webhookSecret: WH, bindingSecret: BIND, ...hooksOf(seen) });
  return { seen, billing, checkout: (plan) => billing.checkout(EMAIL, { plan, customerEmail: EMAIL, successUrl: 'https://zta.test/ok', cancelUrl: 'https://zta.test/no' }) };
}

/** The customer paid for `sessionId` on `priceId`: the subscription Stripe holds and the webhook it sends. */
function pay(f, sessionId, priceId, { status = 'active', start = now() } = {}) {
  const s = f.sessions.get(sessionId);
  const sub = { id: `sub_${sessionId}`, object: 'subscription', customer: `cus_${sessionId}`, status, created: start, current_period_start: start, current_period_end: start + 30 * 86400, cancel_at_period_end: false,
    items: { data: [{ id: `si_${sessionId}`, price: { id: priceId, product: 'prod_x', recurring: { interval: 'month', usage_type: 'licensed' } }, quantity: 1 }] },
    metadata: Object.fromEntries(Object.entries(s.form).filter(([k]) => k.startsWith('subscription_data[metadata][')).map(([k, v]) => [k.slice(28, -1), v])) };
  f.subs.set(sub.id, sub);
  return { id: sessionId, object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: s.form.client_reference_id, customer: sub.customer, subscription: sub.id, metadata: Object.fromEntries(Object.entries(s.form).filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])) };
}
let evt = 0;
async function deliver(billing, type, object, created = now()) {
  const body = JSON.stringify({ id: `evt_${++evt}`, object: 'event', type, created, data: { object } });
  return billing.handleWebhook(new TextEncoder().encode(body), await signWebhook(body, WH));
}

describe('billing.config.mjs changes nothing the old createBilling setup did', () => {
  it.each(TIERS)('%s: the provider sees the identical checkout request', async (plan, _name, price) => {
    const fa = fakeStripeFetch();
    const fb = fakeStripeFetch();
    const a = oldSide(fa);
    const b = newSide(fb);
    const urlA = await a.checkout(plan);
    const urlB = await b.checkout(plan);
    expect(urlB).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_/);
    expect(urlA).toBe(urlB);
    const A = lastCheckout(fa);
    const B = lastCheckout(fb);
    expect(B).toEqual(A);
    const form = Object.fromEntries(B.form);
    expect(form['line_items[0][price]']).toBe(`price_zta_${plan}`);   // the price id from env, not an inline price
    expect(form.payment_method_types ?? form['payment_method_types[0]']).toBe('card');
    expect(form['metadata[email]']).toBe(EMAIL);
    expect(form['metadata[plan]']).toBe(plan);
    expect(price).toBeGreaterThan(0);
  });

  it.each(TIERS)('%s: an existing subscriber is matched to the same plan, same hooks, same canUse', async (plan) => {
    const fa = fakeStripeFetch();
    const fb = fakeStripeFetch();
    const a = oldSide(fa);
    const b = newSide(fb);
    await a.checkout(plan);
    await b.checkout(plan);
    // the subscription made by the OLD checkout, delivered to both billings (a customer who subscribed before the move)
    const obj = pay(fa, 'cs_1', `price_zta_${plan}`);
    pay(fb, 'cs_1', `price_zta_${plan}`);
    await deliver(a.billing, 'checkout.session.completed', obj);
    await deliver(b.billing, 'checkout.session.completed', obj);
    const sa = await a.billing.status(EMAIL, { detail: true });
    const sb = await b.billing.status(EMAIL, { detail: true });
    expect(sa.plan).toBe(plan);
    expect(sb.plan).toBe(sa.plan);
    expect(sb.status).toBe(sa.status);
    expect(sb.items.map(({ role, quantity }) => ({ role, quantity }))).toEqual(sa.items.map(({ role, quantity }) => ({ role, quantity })));
    expect(await b.billing.canUse(EMAIL)).toBe(await a.billing.canUse(EMAIL));
    expect(await a.billing.canUse(EMAIL)).toBe(true);
    expect(b.seen).toEqual(a.seen);
    expect(a.seen.length).toBeGreaterThan(0);

    // a renewal: onPeriod fires the same; then a cancellation: entitlement and hooks agree
    const renewed = { ...fa.subs.get('sub_cs_1'), current_period_start: now() + 100, current_period_end: now() + 100 + 30 * 86400 };
    fa.subs.set('sub_cs_1', renewed);
    fb.subs.set('sub_cs_1', renewed);
    await deliver(a.billing, 'customer.subscription.updated', renewed, now() + 50);
    await deliver(b.billing, 'customer.subscription.updated', renewed, now() + 50);
    const gone = { ...renewed, status: 'canceled' };
    fa.subs.set('sub_cs_1', gone);
    fb.subs.set('sub_cs_1', gone);
    await deliver(a.billing, 'customer.subscription.deleted', gone, now() + 60);
    await deliver(b.billing, 'customer.subscription.deleted', gone, now() + 60);
    expect((await b.billing.status(EMAIL)).status).toBe((await a.billing.status(EMAIL)).status);
    expect(await b.billing.canUse(EMAIL)).toBe(await a.billing.canUse(EMAIL));
    expect(await a.billing.canUse(EMAIL)).toBe(false);
    expect(b.seen).toEqual(a.seen);
  });

  it('a subscription on a price that is not one of the plans matches no plan in either', async () => {
    const fa = fakeStripeFetch();
    const fb = fakeStripeFetch();
    const a = oldSide(fa);
    const b = newSide(fb);
    await a.checkout('starter');
    await b.checkout('starter');
    const obj = pay(fa, 'cs_1', 'price_unrelated');
    pay(fb, 'cs_1', 'price_unrelated');
    await deliver(a.billing, 'checkout.session.completed', obj);
    await deliver(b.billing, 'checkout.session.completed', obj);
    expect((await b.billing.status(EMAIL)).plan).toBe((await a.billing.status(EMAIL)).plan);
    expect(b.seen).toEqual(a.seen);
  });

  it('sells the same four plans at the same amounts: $9 / $19 / $49 / $99 on the env price ids', () => {
    expect(Object.keys(billingConfig.plans)).toEqual(['starter', 'growth', 'business', 'scale']);
    expect(Object.fromEntries(Object.entries(billingConfig.plans).map(([k, p]) => [k, p.price.monthly]))).toEqual({ starter: 9, growth: 19, business: 49, scale: 99 });
    expect(Object.keys(billingConfig.items)).toEqual([]);
  });
});
