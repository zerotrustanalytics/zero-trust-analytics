import { jest } from '@jest/globals';
// Real modules, loaded before the mocks below are registered.
import * as realAuth from '../../netlify/functions/lib/http.js';
import * as realBilling from '../../vendor/launchkit/billing.js';

const { signWebhook } = realBilling;

// ---- blob store with list() and set(), the surface billing and storage use
jest.unstable_mockModule('@netlify/blobs', () => {
  const stores = new Map();
  function createMockStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      async get(key, options = {}) {
        const value = data.get(key);
        if (value === undefined) return null;
        return options.type === 'json' ? JSON.parse(value) : value;
      },
      async set(key, value) { data.set(key, String(value)); },
      async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
      async delete(key) { data.delete(key); },
      async list({ prefix = '' } = {}) {
        return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), directories: [] };
      },
    };
  }
  return { getStore: ({ name }) => createMockStore(name), __clearAllStores: () => stores.clear() };
});

// ---- a fake Stripe behind launchkit's REST adapter (the same four methods; nothing leaves the process)
const fake = { subs: new Map(), sessions: new Map(), calls: { portal: [], retrieveSub: 0 }, n: 0, fail: false };
const fakeStripe = {
  async createCheckoutSession(params) {
    const id = `cs_test_${++fake.n}`;
    const s = { id, url: `https://checkout.stripe.com/c/${id}`, params, status: 'open', payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id, metadata: params.metadata };
    fake.sessions.set(id, s);
    return s;
  },
  async createPortalSession(params) { fake.calls.portal.push(params); return { id: 'bps_1', url: 'https://billing.stripe.com/p/session_1' }; },
  async retrieveSubscription(id) {
    if (fake.fail) throw new realBilling.BillingError('Stripe is down', 'stripe-error', 502);
    fake.calls.retrieveSub++;
    return structuredClone(fake.subs.get(id));
  },
  async retrieveCheckoutSession(id) { return structuredClone(fake.sessions.get(id)); },
};
jest.unstable_mockModule('../../vendor/launchkit/billing.js', () => ({ ...realBilling, // billing-config builds its provider from createStripeRest: hand it the fake wrapped as a provider (the same wrap createBilling({ stripe }) does)
  createStripeRest: () => realBilling.stripeProvider(fakeStripe) }));

// ---- auth
let authResult = { user: { id: 'user_123', email: 'buyer@example.com' } };
jest.unstable_mockModule('../../netlify/functions/lib/auth.js', () => ({
  ...realAuth,
  authenticateRequest: jest.fn(() => authResult),
}));

const SECRET = 'whsec_' + 'a'.repeat(32);
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.BILLING_BINDING_SECRET = "b".repeat(40);
process.env.URL = 'https://zta.test';

const { __clearAllStores } = await import('@netlify/blobs');
const { getStore } = await import('../../netlify/functions/lib/blob-store.js');
const { getUser, getUserStatus } = await import('../../netlify/functions/lib/storage.js');
const { effectivePlan } = await import('../../netlify/functions/lib/config.js');
const billingLib = await import('../../netlify/functions/lib/billing.js');
const { migrateUsers, getBilling, resetBilling } = billingLib;
const checkoutFn = (await import('../../netlify/functions/stripe-checkout.js')).default;
const portalFn = (await import('../../netlify/functions/stripe-portal.js')).default;
const webhookFn = (await import('../../netlify/functions/stripe-webhook.js')).default;
const confirmFn = (await import('../../netlify/functions/stripe-confirm.js')).default;
const syncFn = (await import('../../netlify/functions/stripe-sync.js')).default;

const EMAIL = 'buyer@example.com';
const now = () => Math.floor(Date.now() / 1000);
const post = (path, body, headers = {}) => new Request(`https://zta.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const callCheckout = (plan) => checkoutFn(post('/api/stripe/checkout', plan ? { plan } : {}), {});
const users = () => getStore({ name: 'users', consistency: 'strong' });

/** The customer pays on Stripe's page: the session completes and a subscription exists. */
function pay(sessionId, { price = 'price_test_starter', status = 'active', start = now() } = {}) {
  const s = fake.sessions.get(sessionId);
  const subId = `sub_${sessionId}`;
  const sub = { id: subId, customer: `cus_${sessionId}`, status, created: start, current_period_start: start, current_period_end: start + 30 * 86400, cancel_at_period_end: false,
    items: { data: [{ price: { id: price }, quantity: 1 }] }, metadata: s.params.subscription_data.metadata };
  fake.subs.set(subId, sub);
  Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: subId, customer: sub.customer });
  return sub;
}

let evtN = 0;
const event = (type, object, created = now()) => ({ id: `evt_${++evtN}`, type, created, data: { object } });
async function deliver(evt, { secret = SECRET, header } = {}) {
  const body = JSON.stringify(evt);
  const sig = header ?? await signWebhook(body, secret);
  return webhookFn(post('/api/stripe/webhook', body, { 'stripe-signature': sig }), {});
}
const completed = (sessionId) => event('checkout.session.completed', structuredClone(fake.sessions.get(sessionId)));

async function buy(plan = 'starter', opts) {
  const res = await callCheckout(plan);
  expect(res.status).toBe(200);
  const sessionId = [...fake.sessions.keys()].pop();
  return { sessionId, sub: pay(sessionId, { price: `price_test_${plan}`, ...opts }) };
}

describe('billing over launchkit', () => {
  beforeEach(() => {
    __clearAllStores();
    resetBilling();
    fake.subs.clear(); fake.sessions.clear(); fake.calls = { portal: [], retrieveSub: 0 }; fake.fail = false;
    authResult = { user: { id: 'user_123', email: EMAIL } };
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  describe('checkout', () => {
    it('opens a card-only subscription checkout on the plan\'s price, tied to the buyer', async () => {
      const res = await callCheckout('growth');
      expect(res.status).toBe(200);
      expect((await res.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/cs_test_/);
      const p = [...fake.sessions.values()][0].params;
      expect(p).toMatchObject({
        mode: 'subscription', payment_method_types: ['card'], customer_email: EMAIL, client_reference_id: EMAIL,
        line_items: [{ price: 'price_test_growth', quantity: 1 }],
        cancel_url: 'https://zta.test/dashboard/billing?canceled=true',
        metadata: { email: EMAIL, plan: 'growth' },
      });
      expect(p.success_url).toBe('https://zta.test/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}');
    });

    it('defaults to starter, rejects unknown and unpriced plans, wants auth and POST', async () => {
      await callCheckout();
      expect([...fake.sessions.values()][0].params.line_items[0].price).toBe('price_test_starter');
      expect((await callCheckout('nope')).status).toBe(400);
      const free = await callCheckout('free');
      expect(free.status).toBe(400);
      expect((await free.json()).error).toMatch(/not available for purchase/);

      authResult = { error: 'Unauthorized', status: 401 };
      expect((await callCheckout('starter')).status).toBe(401);
      authResult = { user: { id: 'u', email: EMAIL } };
      expect((await checkoutFn(new Request('https://zta.test/api/stripe/checkout'), {})).status).toBe(405);
    });

    it('is a 503 when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect((await callCheckout('starter')).status).toBe(503);
    });

    it('refuses a second subscription: same plan or another', async () => {
      const { sessionId } = await buy('starter');
      expect((await deliver(completed(sessionId))).status).toBe(200);
      const same = await callCheckout('starter');
      expect(same.status).toBe(400);
      expect((await same.json()).error).toMatch(/Already subscribed to this plan/);
      const other = await callCheckout('growth');
      expect(other.status).toBe(400);
      expect((await other.json()).error).toMatch(/billing portal/);
      expect(fake.sessions.size).toBe(1);
    });
  });

  describe('webhook', () => {
    it('checkout.session.completed activates the plan on the user record, once', async () => {
      const { sessionId, sub } = await buy('growth');
      const res = await deliver(completed(sessionId));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

      const user = await getUser(EMAIL);
      expect(user).toMatchObject({ id: 'user_123', email: EMAIL, plan: 'growth', provider: 'clerk' });
      expect(user.subscription).toMatchObject({ status: 'active', plan: 'growth', customerId: sub.customer, subscriptionId: sub.id, cancelAtPeriodEnd: false });
      expect(user.subscription.currentPeriodEnd).toBe(new Date(sub.current_period_end * 1000).toISOString());
      expect(await users().get('user_id_map_user_123')).toBe(EMAIL); // lookups by id keep working
    });

    it('updates an existing user in place', async () => {
      await users().setJSON(EMAIL, { id: 'user_123', email: EMAIL, plan: 'free', trialEndsAt: '2030-01-01T00:00:00.000Z', subscription: null });
      const { sessionId } = await buy('starter');
      await deliver(completed(sessionId));
      expect(await getUser(EMAIL)).toMatchObject({ plan: 'starter', trialEndsAt: '2030-01-01T00:00:00.000Z', subscription: { status: 'active' } });
    });

    it('a replayed webhook does nothing', async () => {
      const { sessionId } = await buy();
      const evt = completed(sessionId);
      await deliver(evt);
      const before = JSON.stringify(await getUser(EMAIL));
      const reads = fake.calls.retrieveSub;
      expect((await deliver(evt)).status).toBe(200);
      expect(JSON.stringify(await getUser(EMAIL))).toBe(before);
      expect(fake.calls.retrieveSub).toBe(reads); // not even looked at again
    });

    it('rejects a bad signature and changes nothing', async () => {
      const { sessionId } = await buy();
      const evt = completed(sessionId);
      const bad = await deliver(evt, { secret: 'whsec_' + 'b'.repeat(32) });
      expect(bad.status).toBe(400);
      expect(await getUser(EMAIL)).toBeNull();

      const body = JSON.stringify(evt);
      const sig = await signWebhook(body, SECRET);
      const tampered = await webhookFn(post('/api/stripe/webhook', body.replace('cs_test', 'cs_evil'), { 'stripe-signature': sig }), {});
      expect(tampered.status).toBe(400);
      expect((await webhookFn(post('/api/stripe/webhook', body), {})).status).toBe(400); // no signature header
      expect((await deliver(evt, { header: `t=${now() - 3600},v1=${'0'.repeat(64)}` })).status).toBe(400); // stale
      expect(await getUser(EMAIL)).toBeNull();
    });

    it('is a 500 without a webhook secret (never accepts unsigned events) and 405 for GET', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      resetBilling();
      expect((await deliver(event('invoice.paid', {}))).status).toBe(500);
      expect((await webhookFn(new Request('https://zta.test/api/stripe/webhook'), {})).status).toBe(405);
    });

    it('answers non-2xx when Stripe is unreachable (so Stripe retries), and the retry then succeeds', async () => {
      const { sessionId } = await buy();
      const evt = completed(sessionId);
      fake.fail = true;
      expect((await deliver(evt)).status).toBe(502);
      expect(await getUser(EMAIL)).toBeNull();
      fake.fail = false;
      expect((await deliver(evt)).status).toBe(200);
      expect((await getUser(EMAIL)).subscription.status).toBe('active');
    });

    it('past_due keeps the plan, cancel-at-period-end is recorded, deletion drops to free', async () => {
      const { sessionId, sub } = await buy('business');
      await deliver(completed(sessionId));

      const later = now() + 10;
      await deliver(event('customer.subscription.updated', { ...sub, status: 'past_due' }, later));
      expect(await getUser(EMAIL)).toMatchObject({ plan: 'business', subscription: { status: 'past_due' } });

      await deliver(event('customer.subscription.updated', { ...sub, status: 'active', cancel_at_period_end: true }, later + 10));
      expect((await getUser(EMAIL)).subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });

      await deliver(event('customer.subscription.deleted', { ...sub, status: 'canceled' }, later + 20));
      const user = await getUser(EMAIL);
      expect(user.plan).toBe('free');
      expect(user.subscription.status).toBe('canceled');
      expect(user.subscription.canceledAt).toBeTruthy();
    });

    it('invoice.payment_failed marks past_due and invoice.paid restores active', async () => {
      const { sessionId, sub } = await buy('starter');
      await deliver(completed(sessionId));
      fake.subs.get(sub.id).status = 'past_due';
      await deliver(event('invoice.payment_failed', { id: 'in_1', subscription: sub.id }, now() + 10));
      expect((await getUser(EMAIL)).subscription.status).toBe('past_due');
      fake.subs.get(sub.id).status = 'active';
      await deliver(event('invoice.paid', { id: 'in_2', subscription: sub.id }, now() + 20));
      expect((await getUser(EMAIL)).subscription.status).toBe('active');
    });

    it('ignores unknown event types and events for customers it does not know', async () => {
      expect((await deliver(event('customer.created', { id: 'cus_x' }))).status).toBe(200);
      const stranger = { id: 'sub_x', customer: 'cus_stranger', status: 'active', created: now(), items: { data: [{ price: { id: 'price_test_starter' } }] }, metadata: {} };
      expect((await deliver(event('customer.subscription.updated', stranger))).status).toBe(200);
      expect(await getUser(EMAIL)).toBeNull();
    });

    it('a sub with a price outside our plans changes nothing', async () => {
      const { sessionId, sub } = await buy('starter');
      await deliver(completed(sessionId));
      const other = { ...sub, items: { data: [{ price: { id: 'price_someone_elses' } }] } };
      await deliver(event('customer.subscription.updated', other, now() + 30));
      expect(await getUser(EMAIL)).toMatchObject({ plan: 'starter', subscription: { status: 'active' } });
    });
  });

  describe('the app\'s own entitlement follows the subscription', () => {
    it('plan limits and access: subscribe, lapse, cancel', async () => {
      await users().setJSON(EMAIL, { id: 'user_123', email: EMAIL, plan: 'free', subscription: null });
      expect(getUserStatus(await getUser(EMAIL)).canAccess).toBe(false);
      expect(effectivePlan(await getUser(EMAIL))).toBe('free');

      const { sessionId, sub } = await buy('scale');
      await deliver(completed(sessionId));
      expect(effectivePlan(await getUser(EMAIL))).toBe('scale');
      expect(getUserStatus(await getUser(EMAIL))).toMatchObject({ status: 'active', plan: 'scale', canAccess: true });
      expect(await getBilling().billing.canUse(EMAIL)).toBe(true);

      await deliver(event('customer.subscription.updated', { ...sub, status: 'past_due' }, now() + 10));
      expect(getUserStatus(await getUser(EMAIL)).canAccess).toBe(false); // same as before: only 'active' passes

      await deliver(event('customer.subscription.deleted', { ...sub, status: 'canceled' }, now() + 20));
      expect(effectivePlan(await getUser(EMAIL))).toBe('free');
      expect(await getBilling().billing.canUse(EMAIL)).toBe(false);
    });

    it('a plan change in the portal moves the user to the new plan', async () => {
      const { sessionId, sub } = await buy('starter');
      await deliver(completed(sessionId));
      const upgraded = { ...sub, items: { data: [{ price: { id: 'price_test_growth' }, quantity: 1 }] } };
      await deliver(event('customer.subscription.updated', upgraded, now() + 10));
      expect(effectivePlan(await getUser(EMAIL))).toBe('growth');
    });
  });

  describe('sync and webhook converge', () => {
    it('syncAll (no webhook at all) gives the same user as the webhook does', async () => {
      const { sessionId } = await buy('growth');
      const sync = await syncFn(post('/x', {}), { triggerType: 'scheduled' });
      expect(await sync.json()).toEqual({ synced: 1, failed: 0 });
      const viaSync = await getUser(EMAIL);
      expect(viaSync).toMatchObject({ plan: 'growth', subscription: { status: 'active' } });

      // the webhook then arrives: same state, nothing new
      await deliver(completed(sessionId));
      const after = await getUser(EMAIL);
      expect({ ...after.subscription, updatedAt: 0 }).toEqual({ ...viaSync.subscription, updatedAt: 0 });
      expect(after.plan).toBe('growth');
    });

    it('webhook first, then sync: unchanged', async () => {
      const { sessionId } = await buy('starter');
      await deliver(completed(sessionId));
      const before = await getUser(EMAIL);
      await syncFn(post('/x', {}), { triggerType: 'scheduled' });
      const after = await getUser(EMAIL);
      expect({ ...after.subscription, updatedAt: 0 }).toEqual({ ...before.subscription, updatedAt: 0 });
    });

    it('sync is not callable without the secret, and says so when Stripe is off', async () => {
      expect((await syncFn(post('/x', {}), {})).status).toBe(401);
      delete process.env.STRIPE_SECRET_KEY;
      resetBilling();
      const res = await syncFn(post('/x', {}), { triggerType: 'scheduled' });
      expect(await res.json()).toEqual({ skipped: 'STRIPE_SECRET_KEY not set' });
    });
  });

  describe('return page (confirm)', () => {
    it('applies the paid session before the webhook lands', async () => {
      const { sessionId } = await buy('starter');
      const res = await confirmFn(post('/api/stripe/confirm', { sessionId }), {});
      expect(await res.json()).toMatchObject({ status: 'active', plan: 'starter', applied: true });
      expect(effectivePlan(await getUser(EMAIL))).toBe('starter');
      expect((await deliver(completed(sessionId))).status).toBe(200); // late webhook: no harm
      expect((await getUser(EMAIL)).subscription.status).toBe('active');
    });

    it('refuses another buyer\'s session and malformed ids', async () => {
      const { sessionId } = await buy('starter');
      authResult = { user: { id: 'other', email: 'other@example.com' } };
      expect((await confirmFn(post('/api/stripe/confirm', { sessionId }), {})).status).toBe(403);
      expect((await confirmFn(post('/api/stripe/confirm', { sessionId: '../x' }), {})).status).toBe(400);
      expect(await getUser(EMAIL)).toBeNull();
    });
  });

  describe('portal', () => {
    it('needs a subscription first, then returns Stripe\'s portal', async () => {
      const none = await portalFn(post('/api/stripe/portal', {}), {});
      expect(none.status).toBe(400);
      expect((await none.json()).error).toBe('No active subscription');

      const { sessionId, sub } = await buy('starter');
      await deliver(completed(sessionId));
      const res = await portalFn(post('/api/stripe/portal', {}), {});
      expect((await res.json()).url).toBe('https://billing.stripe.com/p/session_1');
      expect(fake.calls.portal[0]).toMatchObject({ customer: sub.customer, return_url: 'https://zta.test/dashboard/' });
    });
  });

  describe('migration of stored billing state', () => {
    const seed = async () => {
      await users().setJSON('old@example.com', { id: 'user_old', email: 'old@example.com', plan: 'growth',
        subscription: { status: 'active', plan: 'growth', customerId: 'cus_old', subscriptionId: 'sub_old', createdAt: '2026-01-01T00:00:00.000Z', currentPeriodEnd: '2026-12-01T00:00:00.000Z', cancelAtPeriodEnd: false } });
      await users().setJSON('lapsed@example.com', { id: 'user_lapsed', email: 'lapsed@example.com', plan: 'free', subscription: { status: 'canceled', plan: 'starter', customerId: 'cus_lapsed', subscriptionId: 'sub_lapsed' } });
      await users().setJSON('never@example.com', { id: 'user_never', email: 'never@example.com', plan: 'free', subscription: null });
      await users().set('user_id_map_user_old', 'old@example.com');
    };
    const oldSub = (over = {}) => ({ id: 'sub_old', customer: 'cus_old', status: 'active', created: 1700000000, current_period_start: now(), current_period_end: now() + 86400 * 30, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_test_growth' }, quantity: 1 }] }, metadata: {}, ...over });

    it('moves existing subscriptions into billing, leaves users alone, and is idempotent', async () => {
      await seed();
      const kv = billingLib.blobKv();
      const before = JSON.stringify(await getUser('old@example.com'));
      expect((await migrateUsers({ billing: getBilling().billing })).sort()).toEqual(['lapsed@example.com', 'old@example.com']);
      expect(await kv.get('orgs/old@example.com')).toMatchObject({ orgId: 'old@example.com', customerId: 'cus_old', subscriptionId: 'sub_old', plan: 'growth', status: 'active' });
      expect(await kv.get('customers/cus_old')).toBe('old@example.com');
      expect(await kv.get('orgs/lapsed@example.com')).toMatchObject({ status: 'canceled' });
      expect(await kv.get('orgs/never@example.com')).toBeNull();
      expect(JSON.stringify(await getUser('old@example.com'))).toBe(before);
      expect(await migrateUsers({ billing: getBilling().billing })).toEqual([]);
      expect(await getBilling().billing.status('old@example.com')).toMatchObject({ plan: 'growth', status: 'active' });
    });

    it('an existing customer keeps their subscription: the next webhook finds them, with no grants twice', async () => {
      await seed();
      fake.subs.set('sub_old', oldSub({ status: 'past_due' }));
      // No explicit migrate call: the webhook path migrates on first use.
      expect((await deliver(event('customer.subscription.updated', oldSub({ status: 'past_due' })))).status).toBe(200);
      expect(await getUser('old@example.com')).toMatchObject({ plan: 'growth', subscription: { status: 'past_due', customerId: 'cus_old', subscriptionId: 'sub_old' } });

      // portal works for a migrated customer straight away
      authResult = { user: { id: 'user_old', email: 'old@example.com' } };
      fake.sessions.clear();
      expect((await (await portalFn(post('/api/stripe/portal', {}), {})).json()).url).toMatch(/billing\.stripe\.com/);
      // and so does a second event with the same id (replay)
      const evt = event('customer.subscription.updated', oldSub({ status: 'active' }), now() + 50);
      fake.subs.set('sub_old', oldSub());
      await deliver(evt);
      const once = JSON.stringify(await getUser('old@example.com'));
      await deliver(evt);
      expect(JSON.stringify(await getUser('old@example.com'))).toBe(once);
    });

    it('a migrated live subscriber cannot start a second subscription', async () => {
      await seed();
      authResult = { user: { id: 'user_old', email: 'old@example.com' } };
      const res = await callCheckout('scale');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/billing portal/);
      expect(fake.sessions.size).toBe(0);
    });

    it('a lapsed customer can buy again, reusing their Stripe customer', async () => {
      await seed();
      authResult = { user: { id: 'user_lapsed', email: 'lapsed@example.com' } };
      expect((await callCheckout('starter')).status).toBe(200);
      const p = [...fake.sessions.values()][0].params;
      expect(p.customer).toBe('cus_lapsed');
      expect(p.customer_email).toBeUndefined();
    });
  });
});
