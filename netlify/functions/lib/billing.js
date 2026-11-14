/**
 * BILLING (launchkit/billing over ZTA)
 * ====================================
 * The Stripe work itself (checkout, portal, verified + idempotent webhook, pull sync) is launchkit/billing,
 * vendored unchanged in vendor/launchkit. ZTA's plans, prices and checkout extras live in billing.config.mjs (repo root).
 * This file is the thin layer: a store for launchkit, and the adapter that keeps the user record (`user.plan`, `user.subscription`) in step with the subscription.
 *
 * The user record stays the app's entitlement: getUserStatus() and the plan limits read it exactly as before.
 * Billing's own state lives in the `billing` blob store (orgs/, customers/, events/, sessions/, pending/, ...).
 * The "org" for billing is the user's email, which is how users are keyed.
 */
import { createBillingFromConfig } from '../../../vendor/launchkit/billing-config.js';
import { keyPart } from '../../../vendor/launchkit/store.js';
import { getStore } from './blob-store.js';
import { getUser } from './storage.js';
import fullConfig, { configFor } from '../../../billing.config.mjs';

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

/** The plan ids billing sells (from billing.config.mjs): those with a price id set. */
export const ztaPlanIds = (source = process.env) => Object.keys(configFor(source).plans);

// Legacy `user.subscription.status` values the rest of the app reads.
const legacyStatus = (s) => (s === 'trialing' ? 'active' : s);

/**
 * The user record is the app's entitlement. `mirrorUser` writes `plan` and `subscription` on it in the shape the app
 * already reads, creating the user the way the old webhook did (a gatekeep/Clerk user who never existed in our DB).
 * Billing calls it (`entitlements.onChange`) after the new state is stored, when plan, status or the cancel flag change.
 */
export function userAccounts(kv) {
  const users = () => getStore({ name: USERS_STORE, consistency: 'strong' });
  return {
    /** Whether this account id is an email we could bill. */
    async exists(email) {
      return typeof email === 'string' && email.includes('@');
    },
    async mirrorUser({ orgId: email, customerRef, subscriptionRef, plan: planId, status: state, after }) {
      // An incomplete checkout (billing's `none`) has paid nothing yet.
      const status = legacyStatus(state === 'none' ? 'incomplete' : state);
      const now = new Date().toISOString();
      const existing = await getUser(email);
      const prev = existing?.subscription || {};
      const subscription = {
        ...prev,
        status,
        customerId: customerRef ?? prev.customerId ?? null,
        subscriptionId: subscriptionRef ?? prev.subscriptionId ?? null,
        plan: planId ?? prev.plan,
        createdAt: prev.createdAt || now,
        updatedAt: now,
        ...(after.currentPeriodEnd ? { currentPeriodEnd: new Date(after.currentPeriodEnd).toISOString() } : {}),
        cancelAtPeriodEnd: !!after.cancelAtPeriodEnd,
        ...(status === 'canceled' ? { canceledAt: prev.canceledAt || now } : {}),
      };
      // Canceled drops the account to free; every other state keeps the plan it is on.
      // (An incomplete checkout has paid nothing yet, so it leaves the plan alone.)
      const plan = status === 'canceled' ? 'free' : status === 'incomplete' ? (existing?.plan ?? 'free') : (planId ?? existing?.plan);

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
    /** A renewal changes only the period end, which `onChange` does not report: keep the user record's copy current. */
    async renewUser(email, periodEnd) {
      const user = await getUser(email);
      if (!user?.subscription || !periodEnd) return;
      await users().setJSON(email, { ...user, subscription: { ...user.subscription, currentPeriodEnd: new Date(periodEnd).toISOString(), updatedAt: new Date().toISOString() } });
    },
  };
}

/** Build ZTA's billing from billing.config.mjs. Everything injectable so tests run against a fake Stripe and a memory store. */
export function createZtaBilling({ kv = blobKv(), provider, env = process.env, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim(), bindingSecret = process.env.BILLING_BINDING_SECRET?.trim(), now } = {}) {
  const accounts = userAccounts(kv);
  const billing = createBillingFromConfig(configFor(env), {   // only plans whose STRIPE_PRICE_* is set are sold
    store: kv,
    env,
    ...(provider ? { provider } : {}),
    orgExists: (email) => accounts.exists(email),
    entitlements: { onChange: (change) => accounts.mirrorUser(change) },
    onPeriod: ({ orgId, period }) => accounts.renewUser(orgId, period.end),
    webhookSecret: webhookSecret || undefined,
    bindingSecret: bindingSecret || undefined,   // >= 32 chars: billing signs the account into each checkout it creates
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
 * that account (through `billing.adopt`), so existing customers keep their subscription and the next Stripe event
 * finds them. Idempotent: an account that already has billing state is left alone, and the users' own records are
 * never changed. The cancel-at-period-end flag is not carried: the next Stripe event restores it.
 */
export async function migrateUsers({ billing, usersStore = getStore({ name: USERS_STORE, consistency: 'strong' }), plans = ztaPlanIds() } = {}) {
  const migrated = [];
  const { blobs } = await usersStore.list();
  const fallbackPlan = plans[0];
  for (const { key: email } of blobs) {
    if (!email.includes('@')) continue; // user_id_map_* and friends
    let user;
    try { user = await usersStore.get(email, { type: 'json' }); } catch { continue; }
    const old = user?.subscription;
    if (!old || (!old.customerId && !old.subscriptionId)) continue;
    const have = await billing.status(email);
    if (have.status !== 'none' || have.plan) continue;   // billing already knows this account

    const live = ['active', 'trialing', 'past_due'].includes(old.status);
    const status = !old.subscriptionId || old.status === 'incomplete' ? 'none' : live ? old.status : 'canceled';
    // adopt wants a plan; one with no subscription (status none) never counts as subscribed.
    const wanted = old.plan || user.plan;
    await billing.adopt(email, {
      customerRef: old.customerId ?? null,
      subscriptionRef: old.subscriptionId ?? null,
      planId: plans.includes(wanted) ? wanted : fallbackPlan,
      status,
      periodEnd: old.currentPeriodEnd ? Date.parse(old.currentPeriodEnd) || null : null,
    });
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
      const done = await migrateUsers({ billing: billingCtx.billing });
      await billingCtx.kv.set('meta/users-migrated', { at: Date.now(), count: done.length });
      return done;
    })().catch((e) => { migrating = null; throw e; });
  }
  return migrating;
}
