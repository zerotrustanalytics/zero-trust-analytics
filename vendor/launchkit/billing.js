// Stripe subscriptions for an organization: checkout, the customer portal, a verified idempotent webhook,
// and plan → seat count through launchkit/seats. Contract: docs/billing/CONTRACT.md.
//
// Stripe is reached through an adapter the caller passes (createStripeRest is a fetch-based one), so there is
// no SDK. Nothing here logs, and no secret ever goes into an error message.
//
// The plan and seat count come from the subscription's price id and quantity, never from metadata or URLs.
// State is applied by timestamp, not by arrival order, so retries, replays and out-of-order delivery are safe.

import { randomId, sha256, safeEqual, toHex, requireSecret } from './crypto.js';
import { keyPart } from './store.js';

export class BillingError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- webhook signature (Stripe's documented scheme) ------------------------------------------------------

function rawBytes(rawBody) {
  if (typeof rawBody === 'string' && rawBody.length) return enc.encode(rawBody);
  if (rawBody instanceof Uint8Array && rawBody.length) return rawBody;
  if (rawBody instanceof ArrayBuffer && rawBody.byteLength) return new Uint8Array(rawBody);
  throw new BillingError('The webhook needs the raw request body as a string or bytes (not parsed JSON).', 'no-raw-body');
}

async function expectedSignature(secret, t, bytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const head = enc.encode(`${t}.`);
  const msg = new Uint8Array(head.length + bytes.length);
  msg.set(head);
  msg.set(bytes, head.length);
  return toHex(await crypto.subtle.sign('HMAC', key, msg));
}

/** Check a `Stripe-Signature` header against the exact raw body. Throws BillingError; returns nothing. */
export async function verifySignature(rawBody, header, secret, { toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const bytes = rawBytes(rawBody);
  let t = null;
  const sigs = [];
  for (const part of String(header ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't' && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (t === null || !sigs.length) throw new BillingError('Missing or malformed Stripe-Signature header.', 'bad-signature');
  const expected = await expectedSignature(secret, t, bytes);
  let match = false;
  for (const s of sigs) if (safeEqual(s, expected)) match = true; // no early exit
  if (!match) throw new BillingError('Webhook signature does not match.', 'bad-signature');
  // Timestamp last, and only for a genuine signature, so errors don't leak anything to a forger
  if (Math.abs(nowSec - t) > toleranceSec) throw new BillingError('Webhook timestamp is outside the tolerance window.', 'stale-timestamp');
}

/** A valid header for a body (tests, the squawk, replaying an event locally). */
export async function signWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await expectedSignature(secret, t, rawBytes(rawBody))}`;
}

// ---- Stripe over REST ------------------------------------------------------------------------------------

/** Stripe's nested form encoding: a[b][0][c]=v. */
export function formEncode(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item !== null && typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/** A tiny Stripe adapter over fetch. No SDK. The key is only ever sent in the Authorization header. */
export function createStripeRest({ secretKey, fetch: fetchImpl = globalThis.fetch, baseUrl = 'https://api.stripe.com', apiVersion = null, timeoutMs = 20_000 } = {}) {
  if (typeof secretKey !== 'string' || !/^(sk|rk)_/.test(secretKey)) throw new BillingError('createStripeRest needs a Stripe secret or restricted key (sk_… or rk_…).', 'invalid');

  async function request(method, path, params, idempotencyKey) {
    const body = formEncode(params).toString();
    const headers = { Authorization: `Bearer ${secretKey}` };
    if (apiVersion) headers['Stripe-Version'] = apiVersion;
    let url = baseUrl.replace(/\/$/, '') + path;
    const init = { method, headers };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      init.body = body;
    } else if (body) url += `?${body}`;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new BillingError('Could not reach Stripe.', 'stripe-error', 502);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new BillingError(`Stripe: ${String(json?.error?.message ?? res.status).slice(0, 200)}`, 'stripe-error', 502);
      e.stripeStatus = res.status;
      e.stripeCode = json?.error?.code ?? null;
      throw e;
    }
    return json;
  }

  return {
    createCheckoutSession: (params, { idempotencyKey } = {}) => request('POST', '/v1/checkout/sessions', params, idempotencyKey),
    createPortalSession: (params, { idempotencyKey } = {}) => request('POST', '/v1/billing_portal/sessions', params, idempotencyKey),
    retrieveSubscription: (id) => request('GET', `/v1/subscriptions/${encodeURIComponent(id)}`),
    retrieveCheckoutSession: (id) => request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`),
  };
}

// ---- billing ---------------------------------------------------------------------------------------------

const LIVE = ['trialing', 'active', 'past_due'];
const DAY = 86_400_000;

/** Stripe subscription status → ours. */
function mapStatus(s) {
  if (s === 'trialing' || s === 'active' || s === 'past_due') return s;
  if (s === 'incomplete') return 'none';
  return 'canceled'; // canceled, unpaid, paused, incomplete_expired, anything new
}

const idOf = (x) => (x && typeof x === 'object' ? x.id : x) ?? null;
const priceIdOf = (item) => idOf(item?.price) ?? null;

export function createBilling({ store, stripe, seats, plans = {}, items = {}, onPeriod = null, onPurchase = null, webhookSecret = null, toleranceSec = 300, graceMs = 3 * DAY, now = () => Date.now() }) {
  if (!store || !stripe || !seats) throw new BillingError('createBilling needs store, stripe and seats.', 'invalid');
  if (webhookSecret) requireSecret(webhookSecret, 'billing webhookSecret');

  const planByPrice = new Map();
  for (const [id, p] of Object.entries(plans)) {
    if (!p?.priceId) throw new BillingError(`Plan "${id}" needs a priceId.`, 'invalid');
    planByPrice.set(p.priceId, id);
  }
  for (const [id, it] of Object.entries(items)) if (!it?.priceId) throw new BillingError(`Item "${id}" needs a priceId.`, 'invalid');

  const orgKey = (id) => `orgs/${keyPart(id)}`;
  const customerKey = (id) => `customers/${keyPart(id)}`;
  const eventKey = (id) => `events/${keyPart(id)}`;
  const periodKey = (subId, start) => `periods/${keyPart(subId)}/${start}`;
  const sessionKey = (id) => `sessions/${keyPart(id)}`;
  const pendingKey = (orgId) => `pending/${keyPart(orgId)}`;
  const getRec = (orgId) => store.get(orgKey(orgId));
  const isLive = (rec) => !!rec && LIVE.includes(rec.status);

  function seatCount(planId, item) {
    const p = plans[planId];
    if (!p.perSeat && p.seats == null) return null; // a plan with no seats leaves seats alone
    if (!p.perSeat) return Math.max(1, p.seats);
    const q = Math.max(1, Number(item?.quantity ?? 1) | 0);
    return Math.min(p.maxSeats ?? Infinity, Math.max(p.minSeats ?? 1, q));
  }

  /** Org for a subscription: stored customer mapping first, then the orgId we put in its metadata. */
  async function resolveOrg(sub, hint) {
    const customerId = idOf(sub.customer);
    const candidates = [customerId && (await store.get(customerKey(customerId))), hint, sub.metadata?.orgId].filter(Boolean);
    for (const orgId of candidates) if (await seats.getOrg(orgId)) return orgId;
    return null;
  }

  /** Once per paid period (subscription + period start), however it was noticed: webhook, sync or a late event. */
  async function grantPeriod(orgId, planId, sub, item, status) {
    const startSec = sub.current_period_start ?? item.current_period_start;
    if (status !== 'active' || !startSec) return false;
    const key = periodKey(sub.id, startSec);
    if (await store.get(key)) return false;
    const endSec = sub.current_period_end ?? item.current_period_end ?? null;
    if (onPeriod) {
      await onPeriod({ key: `period:${sub.id}:${startSec}`, orgId, planId, plan: plans[planId], subscriptionId: sub.id, period: { start: startSec * 1000, end: endSec ? endSec * 1000 : null } });
    }
    await store.set(key, { at: now() });
    return true;
  }

  /** Apply a subscription's state to the org. `stamp` (unix seconds) says how fresh that state is. */
  async function applySubscription(sub, stamp, { hint = null, ended = false } = {}) {
    const orgId = await resolveOrg(sub, hint);
    if (!orgId) return { handled: false, ignored: 'unknown-org' };

    const item = (sub.items?.data ?? []).find((i) => planByPrice.has(priceIdOf(i)));
    if (!item) return { handled: false, ignored: 'unknown-plan' };
    const planId = planByPrice.get(priceIdOf(item));
    const status = ended ? 'canceled' : mapStatus(sub.status);

    const rec = await getRec(orgId);
    if (rec && rec.subscriptionId !== sub.id) {
      if (status === 'canceled') return { handled: false, ignored: 'other-subscription' }; // an old one ending
      if (isLive(rec) && (rec.subCreated ?? 0) > (sub.created ?? 0)) return { handled: false, ignored: 'older-subscription' };
    } else if (rec && stamp < rec.stamp) {
      await grantPeriod(orgId, planId, sub, item, status); // an old paid period is still owed, once
      return { handled: false, ignored: 'stale' };
    }

    const customerId = idOf(sub.customer);
    const sameSub = rec?.subscriptionId === sub.id;
    const periodEndSec = sub.current_period_end ?? item.current_period_end ?? null;
    const next = {
      orgId,
      customerId,
      subscriptionId: sub.id,
      subCreated: sub.created ?? null,
      plan: planId,
      status,
      seats: seatCount(planId, item),
      currentPeriodEnd: periodEndSec ? periodEndSec * 1000 : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end && status !== 'canceled',
      pastDueSince: status === 'past_due' ? (sameSub && rec.status === 'past_due' ? rec.pastDueSince : stamp * 1000) : null,
      stamp,
    };
    await store.set(orgKey(orgId), next);
    if (customerId && !(await store.get(customerKey(customerId)))) await store.set(customerKey(customerId), orgId);
    await seats.updateOrg(orgId, {
      ...(next.seats == null ? {} : { seats: next.seats }),
      plan: planId,
      status: status === 'none' ? 'incomplete' : status,
      billing: { customerId, subscriptionId: sub.id },
    });
    const granted = await grantPeriod(orgId, planId, sub, item, status);
    return { handled: true, orgId, ...(granted ? { periodGranted: true } : {}) };
  }

  /** A completed checkout session, from a webhook, sync or confirm. Subscriptions are read back from Stripe. */
  async function applySession(session, stamp) {
    if (!session || !['paid', 'no_payment_required'].includes(session.payment_status)) return { handled: false, ignored: 'unpaid' };
    const orgId = session.client_reference_id;
    if (session.mode === 'subscription') {
      if (!session.subscription) return { handled: false };
      if (await store.get(sessionKey(session.id))) return { handled: false, duplicate: true };
      const r = await applySubscription(await stripe.retrieveSubscription(idOf(session.subscription)), stamp, { hint: orgId });
      if (r.orgId) await store.set(sessionKey(session.id), { orgId: r.orgId, at: now() });
      return r;
    }
    if (session.mode !== 'payment') return { handled: false };
    if (!orgId || !(await seats.getOrg(orgId))) return { handled: false, ignored: 'unknown-org' };
    const itemId = session.metadata?.itemId;
    const item = items[itemId];
    if (!item) return { handled: false, ignored: 'unknown-item' };
    if (await store.get(sessionKey(session.id))) return { handled: false, duplicate: true, orgId };
    const customerId = idOf(session.customer);
    if (onPurchase) await onPurchase({ key: `session:${session.id}`, orgId, itemId, item, session });
    await store.set(sessionKey(session.id), { orgId, itemId, at: now() });
    if (customerId) {
      if (!(await store.get(customerKey(customerId)))) await store.set(customerKey(customerId), orgId);
      const rec = await getRec(orgId);
      if (!rec) await store.set(orgKey(orgId), { orgId, customerId, subscriptionId: null, plan: null, status: 'none', seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, stamp: 0 });
    }
    return { handled: true, orgId, purchased: itemId };
  }

  /** Past-due beyond the grace period blocks access; seats is told once so `seats.access` agrees. */
  async function graceOver(rec) {
    return rec.status === 'past_due' && now() >= (rec.pastDueSince ?? 0) + graceMs;
  }

  const nowSec = () => Math.floor(now() / 1000);

  const api = {
    async checkout(orgId, { planId, itemId, seats: wanted, quantity: qty, successUrl, cancelUrl, customerEmail } = {}) {
      const oneTime = itemId != null;
      const plan = oneTime ? items[itemId] : plans[planId];
      if (!plan) throw new BillingError(`No such ${oneTime ? 'item' : 'plan'}: ${oneTime ? itemId : planId}`, 'plan-not-found');
      if (!(await seats.getOrg(orgId))) throw new BillingError('No such organization.', 'no-org', 404);
      for (const u of [successUrl, cancelUrl]) {
        try {
          new URL(u);
        } catch {
          throw new BillingError('successUrl and cancelUrl must be absolute URLs.', 'invalid');
        }
      }
      const rec = await getRec(orgId);
      if (!oneTime && isLive(rec)) throw new BillingError('This organization already has a subscription. Change it in the billing portal.', 'already-subscribed', 409);
      const quantity = oneTime
        ? Math.max(1, Math.floor(Number(qty) || 1))
        : plan.perSeat ? Math.min(plan.maxSeats ?? Infinity, Math.max(plan.minSeats ?? 1, Math.floor(Number(wanted) || plan.minSeats || 1))) : 1;
      const what = oneTime ? `item:${itemId}` : planId;
      const idempotencyKey = `lk-${(await sha256(`${orgId}|${what}|${quantity}|${Math.floor(now() / 600_000)}`)).slice(0, 40)}`;
      const params = {
        mode: oneTime ? 'payment' : 'subscription',
        line_items: [{ price: plan.priceId, quantity }],
        client_reference_id: orgId,
        ...(oneTime ? { metadata: { orgId, itemId } } : { subscription_data: { metadata: { orgId } } }),
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(rec?.customerId ? { customer: rec.customerId } : customerEmail ? { customer_email: customerEmail } : {}),
      };
      const session = await stripe.createCheckoutSession(params, { idempotencyKey });
      if (!session?.url) throw new BillingError('Stripe returned no checkout URL.', 'stripe-error', 502);
      if (session.id) await store.set(pendingKey(orgId), [...((await store.get(pendingKey(orgId))) ?? []), session.id].slice(-20));
      return session.url;
    },

    async portal(orgId, { returnUrl } = {}) {
      const rec = await getRec(orgId);
      if (!rec?.customerId) throw new BillingError('This organization has no billing account yet.', 'no-customer', 409);
      const session = await stripe.createPortalSession({ customer: rec.customerId, return_url: returnUrl }, { idempotencyKey: `lk-portal-${randomId()}` });
      if (!session?.url) throw new BillingError('Stripe returned no portal URL.', 'stripe-error', 502);
      return session.url;
    },

    async handleWebhook(rawBody, signatureHeader) {
      if (!webhookSecret) throw new BillingError('webhookSecret is not configured.', 'no-webhook-secret', 500);
      await verifySignature(rawBody, signatureHeader, webhookSecret, { toleranceSec, nowSec: nowSec() });
      let event;
      try {
        event = JSON.parse(dec.decode(rawBytes(rawBody)));
      } catch {
        throw new BillingError('Webhook body is not JSON.', 'bad-payload');
      }
      if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) throw new BillingError('Webhook body is not a Stripe event.', 'bad-payload');

      if (await store.get(eventKey(event.id))) return { ok: true, type: event.type, handled: false, duplicate: true };

      const obj = event.data.object;
      const created = Number(event.created) || nowSec();
      let result = { handled: false };

      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          result = await applySession(obj, Math.max(created, nowSec()));
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          result = await applySubscription(obj, created);
          break;
        case 'customer.subscription.deleted':
          result = await applySubscription(obj, created, { ended: true });
          break;
        case 'invoice.payment_failed':
        case 'invoice.paid': {
          // The invoice only says something happened; the subscription itself says what state we're in
          const subId = idOf(obj.subscription ?? obj.parent?.subscription_details?.subscription);
          if (!subId) break;
          const sub = await stripe.retrieveSubscription(subId);
          result = await applySubscription(sub, Math.max(created, nowSec()));
          break;
        }
        default:
          return { ok: true, type: event.type, handled: false };
      }

      // Marked only after it worked, so a failure above is retried by Stripe. Unknown orgs are not marked
      // (another product on the same Stripe account, or an event that arrived before we knew the customer).
      if (result.ignored !== 'unknown-org') await store.set(eventKey(event.id), { type: event.type, at: now() });
      return { ok: true, type: event.type, ...result };
    },

    /** Pull: ask Stripe about this org and apply it the way the webhook would. For servers Stripe can't reach. */
    async sync(orgId) {
      const rec = await getRec(orgId);
      const pending = (await store.get(pendingKey(orgId))) ?? [];
      const applied = [];
      const stamp = nowSec();
      const open = [];
      for (const id of pending) {
        if (await store.get(sessionKey(id))) continue;
        const session = await stripe.retrieveCheckoutSession(id);
        const r = await applySession(session, stamp);
        if (r.handled) applied.push({ session: id, ...r });
        if (!r.handled && !r.duplicate && session?.status !== 'expired') open.push(id); // still waiting for payment
      }
      if (open.length !== pending.length) await store.set(pendingKey(orgId), open);
      const fresh = (await getRec(orgId)) ?? rec;
      if (fresh?.subscriptionId) {
        const r = await applySubscription(await stripe.retrieveSubscription(fresh.subscriptionId), stamp, { hint: orgId });
        if (r.handled || r.periodGranted) applied.push({ subscription: fresh.subscriptionId, ...r });
      }
      return { status: await api.status(orgId), applied };
    },

    /** Sync every org that has billing state. A failing org is reported, not thrown. */
    async syncAll() {
      const ids = new Set([...(await store.list('orgs/')), ...(await store.list('pending/'))].map((k) => k.split('/')[1]));
      const out = { synced: [], failed: [] };
      for (const key of ids) {
        const rec = await store.get(`orgs/${key}`);
        const orgId = rec?.orgId ?? key;
        try {
          await api.sync(orgId);
          out.synced.push(orgId);
        } catch (e) {
          out.failed.push({ orgId, error: e.code ?? 'error' });
        }
      }
      return out;
    },

    /** The return-from-checkout page: don't trust the URL, ask Stripe about the session. */
    async confirm(orgId, sessionId) {
      const session = await stripe.retrieveCheckoutSession(sessionId);
      if (!session || session.client_reference_id !== orgId) throw new BillingError('That checkout belongs to another organization.', 'wrong-org', 403);
      const r = await applySession(session, nowSec());
      return { status: await api.status(orgId), applied: r.handled || !!r.duplicate };
    },

    async status(orgId) {
      const rec = await getRec(orgId);
      if (!rec) return { plan: null, status: 'none', seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false };
      return { plan: rec.plan, status: rec.status, seats: rec.seats ?? null, currentPeriodEnd: rec.currentPeriodEnd, cancelAtPeriodEnd: rec.cancelAtPeriodEnd };
    },

    async canUse(orgId) {
      const rec = await getRec(orgId);
      if (!rec) return false;
      if (rec.status === 'trialing' || rec.status === 'active') return true;
      if (rec.status === 'past_due') {
        if (!(await graceOver(rec))) return true;
        // Tell seats too, so seats.access() blocks without the app having to ask billing
        const org = await seats.getOrg(orgId);
        if (org && org.status === 'past_due') await seats.updateOrg(orgId, { status: 'unpaid' });
      }
      return false;
    },
  };
  return api;
}
