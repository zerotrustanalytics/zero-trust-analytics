/**
 * BILLING (launchkit/billing over ZTA)
 * ====================================
 * The Stripe work itself (checkout, portal, verified + idempotent webhook, pull sync) is launchkit/billing,
 * vendored unchanged in vendor/launchkit. This file is the thin layer: ZTA's plans, a store for launchkit,
 * and the adapter that keeps the user record (`user.plan`, `user.subscription`) in step with the subscription.
 *
 * The user record stays the app's entitlement: getUserStatus() and the plan limits read it exactly as before.
 * Billing's own state lives in the `billing` blob store (orgs/, customers/, events/, sessions/, pending/, ...).
 * The "org" for billing is the user's email, which is how users are keyed.
 */
import { createBilling, createStripeRest } from '../../../vendor/launchkit/billing.js';
import { keyPart } from '../../../vendor/launchkit/store.js';
import { getStore } from './blob-store.js';
import { Config } from './config.js';
import { getUser } from './storage.js';

export const BILLING_STORE = 'billing';
const USERS_STORE = 'users';

/** launchkit's 4-method store (get/set/del/list) over a blob store. */
export function blobKv(name = BILLING_STORE) {
  const s = () => getStore({ name, consistency: 'strong' });
  return {
    async get(k) { return (await s().get(k, { type: 'json' })) ?? null; },
    async set(k, v) { await s().setJSON(k, v); },
    async del(k) { await s().delete(k); },
    async list(prefix = '') { const { blobs } = await s().list({ prefix }); return blobs.map((b) => b.key).sort(); },
  };
}

/** Plans for launchkit: every paid tier that has a Stripe price. No seats: ZTA plans are priced on events. */
export function ztaPlans(tiers = Config.pricing.tiers) {
  const plans = {};
  for (const [id, t] of Object.entries(tiers)) if (t.stripePriceId) plans[id] = { priceId: t.stripePriceId, name: t.name };
  return plans;
}

// Legacy `user.subscription.status` values the rest of the app reads.
const legacyStatus = (s) => (s === 'trialing' ? 'active' : s);

/**
 * The "seats" side of launchkit, for an account with no seats: whether it exists, and where billing writes the
 * result. Writes `plan` and `subscription` on the user record in the shape the app already reads, creating the
 * user the way the old webhook did (a gatekeep/Clerk user who never existed in our DB).
 */
export function userAccounts(kv) {
  const users = () => getStore({ name: USERS_STORE, consistency: 'strong' });
  return {
    async getOrg(email) {
      if (typeof email !== 'string' || !email.includes('@')) return null;
      const user = await getUser(email);
      return { id: email, status: user?.subscription?.status ?? null };
    },
    async updateOrg(email, patch) {
      const rec = await kv.get(`orgs/${keyPart(email)}`); // billing wrote this just before calling us
      const status = legacyStatus(patch.status);
      const now = new Date().toISOString();
      const existing = await getUser(email);
      const prev = existing?.subscription || {};
      const subscription = {
        ...prev,
        status,
        customerId: patch.billing?.customerId ?? prev.customerId ?? null,
        subscriptionId: patch.billing?.subscriptionId ?? prev.subscriptionId ?? null,
        plan: patch.plan ?? prev.plan,
        createdAt: prev.createdAt || now,
        updatedAt: now,
        ...(rec?.currentPeriodEnd ? { currentPeriodEnd: new Date(rec.currentPeriodEnd).toISOString() } : {}),
        ...(rec ? { cancelAtPeriodEnd: !!rec.cancelAtPeriodEnd } : {}),
        ...(status === 'canceled' ? { canceledAt: prev.canceledAt || now } : {}),
      };
      // Canceled drops the account to free; every other state keeps the plan it is on.
      // (An incomplete checkout has paid nothing yet, so it leaves the plan alone.)
      const plan = status === 'canceled' ? 'free' : status === 'incomplete' ? (existing?.plan ?? 'free') : (patch.plan ?? existing?.plan);

      if (existing) {
        await users().setJSON(email, { ...existing, plan, subscription });
        return existing;
      }
      const profile = await kv.get(`profiles/${keyPart(email)}`);
      const userId = profile?.userId || 'user_' + Date.now();
      const created = { id: userId, email, createdAt: now, plan, subscription, provider: 'clerk' };
      await users().setJSON(email, created);
      if (profile?.userId) await users().set(`user_id_map_${profile.userId}`, email);
      return created;
    },
  };
}

/** Card-only checkout with the same metadata the old code sent, added on the way to Stripe. */
export function withZtaCheckout(raw, plans) {
  const byPrice = Object.fromEntries(Object.entries(plans).map(([id, p]) => [p.priceId, id]));
  return {
    createCheckoutSession(p, o) {
      const plan = byPrice[p.line_items?.[0]?.price];
      return raw.createCheckoutSession({
        ...p,
        payment_method_types: ['card'],
        metadata: { ...(p.metadata || {}), email: p.client_reference_id, ...(plan ? { plan } : {}) },
      }, o);
    },
    createPortalSession: (p, o) => raw.createPortalSession(p, o),
    retrieveSubscription: (id) => raw.retrieveSubscription(id),
    retrieveCheckoutSession: (id) => raw.retrieveCheckoutSession(id),
  };
}

/** Build ZTA's billing. Everything injectable so tests run against a fake Stripe and a memory store. */
export function createZtaBilling({ kv = blobKv(), stripe, secretKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim(), plans = ztaPlans(), now } = {}) {
  const raw = stripe || createStripeRest({ secretKey });
  const accounts = userAccounts(kv);
  const billing = createBilling({
    store: kv,
    stripe: withZtaCheckout(raw, plans),
    seats: accounts,
    plans,
    webhookSecret: webhookSecret || null,
    ...(now ? { now } : {}),
  });
  return { billing, kv, accounts };
}

let shared = null;
/** The process-wide billing for the functions. Null until STRIPE_SECRET_KEY is set. */
export function getBilling() {
  if (!shared) {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    shared = createZtaBilling();
  }
  return shared;
}
export function resetBilling() { shared = null; migrating = null; }

// ---- migration of stored billing state

/**
 * Every user's old `subscription` ({ customerId, subscriptionId, plan, status }) becomes launchkit's record for
 * that account, so existing customers keep their subscription and the next Stripe event finds them. Idempotent:
 * an account that already has a billing record is left alone, and the users' own records are never changed.
 */
export async function migrateUsers({ kv = blobKv(), usersStore = getStore({ name: USERS_STORE, consistency: 'strong' }), now = () => Date.now() } = {}) {
  const migrated = [];
  const { blobs } = await usersStore.list();
  for (const { key: email } of blobs) {
    if (!email.includes('@')) continue; // user_id_map_* and friends
    let user;
    try { user = await usersStore.get(email, { type: 'json' }); } catch { continue; }
    const old = user?.subscription;
    if (!old || (!old.customerId && !old.subscriptionId)) continue;
    if (await kv.get(`orgs/${keyPart(email)}`)) continue;

    const live = ['active', 'trialing', 'past_due'].includes(old.status);
    const status = !old.subscriptionId || old.status === 'incomplete' ? 'none' : live ? old.status : 'canceled';
    await kv.set(`orgs/${keyPart(email)}`, {
      orgId: email,
      customerId: old.customerId ?? null,
      subscriptionId: old.subscriptionId ?? null,
      subCreated: null,
      plan: old.subscriptionId ? (old.plan || user.plan || null) : null,
      status,
      seats: old.subscriptionId ? null : 0,
      currentPeriodEnd: old.currentPeriodEnd ? Date.parse(old.currentPeriodEnd) || null : null,
      cancelAtPeriodEnd: !!old.cancelAtPeriodEnd && status !== 'canceled',
      pastDueSince: status === 'past_due' ? (Date.parse(old.updatedAt) || now()) : null,
      stamp: 0,
      migrated: now(),
    });
    if (old.customerId && !(await kv.get(`customers/${keyPart(old.customerId)}`))) await kv.set(`customers/${keyPart(old.customerId)}`, email);
    migrated.push(email);
  }
  return migrated;
}

let migrating = null;
/** Run the migration once per process, and once overall (a marker in the billing store). */
export function ensureMigrated(billingCtx = getBilling()) {
  if (!billingCtx) return Promise.resolve([]);
  if (!migrating) {
    migrating = (async () => {
      if (await billingCtx.kv.get('meta/users-migrated')) return [];
      const done = await migrateUsers({ kv: billingCtx.kv });
      await billingCtx.kv.set('meta/users-migrated', { at: Date.now(), count: done.length });
      return done;
    })().catch((e) => { migrating = null; throw e; });
  }
  return migrating;
}
