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

const notConfigured = () => new BillingError('This provider has no API key (webhook-only mode): that call is not available.', 'not-configured', 500);
const unsupported = (what) => new BillingError(`${what} is not supported by this provider.`, 'unsupported', 501);

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Deep merge; plain objects merge, anything else (arrays, scalars) from `b` replaces. `b` wins. */
export function deepMerge(a, b) {
  if (!isPlain(a) || !isPlain(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v;
  return out;
}

const BLOCKED_EXTRA = new Set(['customer', 'customer_email', 'line_items', 'mode', 'success_url', 'cancel_url', 'client_reference_id']);
/** Check checkout `extra` against a provider allow-list tree (`true` = any value, object = nested allow-list). */
export function validateExtra(extra, allow, path = '') {
  if (extra == null) return;
  if (!isPlain(extra)) throw new BillingError('extra must be an object.', 'invalid');
  for (const [k, v] of Object.entries(extra)) {
    const p = path ? `${path}.${k}` : k;
    if (!path && BLOCKED_EXTRA.has(k)) throw new BillingError(`extra.${k} cannot be overridden.`, 'invalid');
    if ((k === 'metadata' || k === 'custom') && isPlain(v) && ('orgId' in v || 'planRef' in v || 'orgSig' in v)) throw new BillingError(`extra.${p}.orgId is set by billing and cannot be overridden.`, 'invalid');
    const rule = allow?.[k];
    if (rule === true) continue;
    if (isPlain(rule) && isPlain(v)) { validateExtra(v, rule, p); continue; }
    throw new BillingError(`extra.${p} is not allowed.`, 'invalid');
  }
}

const STRIPE_EXTRA = {
  metadata: true, payment_method_types: true, payment_method_collection: true, payment_method_options: true, allow_promotion_codes: true,
  automatic_tax: true, tax_id_collection: true, billing_address_collection: true, phone_number_collection: true, consent_collection: true,
  custom_fields: true, custom_text: true, customer_update: true, customer_creation: true, discounts: true, locale: true, submit_type: true,
  integration_identifier: true,
  subscription_data: { metadata: true, billing_cycle_anchor: true, proration_behavior: true, description: true, trial_period_days: true, trial_settings: true, trial_end: true },
  payment_intent_data: { metadata: true, description: true, setup_future_usage: true },
};
const LEMON_EXTRA = {
  checkout_options: true, expires_at: true,
  checkout_data: { discount_code: true, billing_address: true, tax_number: true, custom: true },
  product_options: { name: true, description: true, media: true, receipt_button_text: true, receipt_link_url: true, receipt_thank_you_note: true },
};

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
export function createStripeRest({ secretKey, webhookOnly = false, fetch: fetchImpl = globalThis.fetch, baseUrl = 'https://api.stripe.com', apiVersion = null, timeoutMs = 20_000 } = {}) {
  // Webhook-only (Payment Links, no secret key): verify, parse and apply; every API call throws not-configured.
  // An explicit flag is required: a missing key without it stays an error, so a lost env var is not silently a mode.
  if (webhookOnly) return stripeProvider(undefined);
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

  const adapter = {
    createCheckoutSession: (params, { idempotencyKey } = {}) => request('POST', '/v1/checkout/sessions', params, idempotencyKey),
    createPortalSession: (params, { idempotencyKey } = {}) => request('POST', '/v1/billing_portal/sessions', params, idempotencyKey),
    retrieveSubscription: (id) => request('GET', `/v1/subscriptions/${encodeURIComponent(id)}`),
    retrieveCheckoutSession: (id) => request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`),
    listPrices: (params) => request('GET', '/v1/prices', params),
    updateSubscription: (id, params, { idempotencyKey } = {}) => request('POST', `/v1/subscriptions/${encodeURIComponent(id)}`, params, idempotencyKey),
    createMeterEvent: (params, { idempotencyKey } = {}) => request('POST', '/v1/billing/meter_events', params, idempotencyKey),
  };
  // The returned object is also the Stripe provider (pass it as `stripe:` or `provider:`). The provider's
  // updateSubscription({ subscriptionRef, ops, proration }) would collide with the REST call of the same name, so the
  // provider wraps a private copy and the REST call is exposed as updateSubscriptionRaw(id, params).
  const { updateSubscription: rawUpdate, ...rest } = adapter;
  const provider = stripeProvider({ ...rest, updateSubscription: rawUpdate });
  return { ...rest, updateSubscriptionRaw: rawUpdate, ...provider };
}

// ---- provider interface ---------------------------------------------------------------------------------
// The core only talks to a provider: contract section "Providers". Stripe's is below, Lemon Squeezy's after it.

const idOf = (x) => (x && typeof x === 'object' ? x.id : x) ?? null;
const priceIdOf = (item) => idOf(item?.price) ?? null;
const toSec = (iso) => {
  const ms = typeof iso === 'number' ? iso * 1000 : Date.parse(iso ?? '');
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

/** The value of a header given a string, a Headers, or a plain object. */
function headerValue(h, name) {
  if (h == null || typeof h === 'string') return h;
  if (typeof h.get === 'function') return h.get(name);
  return h[name] ?? h[name.toLowerCase()] ?? null;
}

/** Stripe subscription status → ours. */
function mapStatus(s) {
  if (s === 'trialing' || s === 'active' || s === 'past_due') return s;
  if (s === 'incomplete') return 'none';
  return 'canceled'; // canceled, unpaid, paused, incomplete_expired, anything new
}

function stripeSnapshot(sub) {
  const planRefMeta = sub.metadata?.planRef;
  const items = (sub.items?.data ?? []).map((i, n) => {
    const metered = i.price?.recurring?.usage_type === 'metered' || !!i.price?.recurring?.meter;
    return {
    id: i.id ?? null,
    ref: n === 0 && planRefMeta ? planRefMeta : priceIdOf(i),
    productRef: idOf(i.price?.product) ?? null,
    lookupKey: i.price?.lookup_key ?? null,
    metered,
    quantity: i.quantity ?? (metered ? 0 : 1),
    periodStart: sub.current_period_start ?? i.current_period_start ?? null,
    periodEnd: sub.current_period_end ?? i.current_period_end ?? null,
    };
  });
  return {
    id: sub.id, status: sub.pause_collection && ['active', 'trialing'].includes(sub.status) ? 'past_due' : mapStatus(sub.status), planRef: items[0]?.ref ?? null, quantity: items[0]?.quantity ?? 1,
    periodStart: items[0]?.periodStart ?? null, periodEnd: items[0]?.periodEnd ?? null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end, customerRef: idOf(sub.customer), created: sub.created ?? null,
    orgId: sub.metadata?.orgId ?? null, bindingSig: sub.metadata?.orgSig ?? null, items, endsAt: sub.ended_at ?? sub.canceled_at ?? sub.cancel_at ?? null, trialEnd: sub.trial_end ?? null, portalUrl: null, raw: sub,
  };
}

function stripeOrder(s) {
  return {
    id: s.id,
    kind: s.mode === 'subscription' ? 'subscription' : s.mode === 'payment' ? 'payment' : null,
    paid: ['paid', 'no_payment_required'].includes(s.payment_status),
    expired: s.status === 'expired',
    orgId: s.client_reference_id ?? null,
    itemId: s.metadata?.itemId ?? null,
    itemRef: null,
    subscriptionRef: idOf(s.subscription),
    customerRef: idOf(s.customer),
    email: s.customer_details?.email ?? s.customer_email ?? null,
    raw: s,
  };
}

/** One checkout line for Stripe: a price id or inline price_data (optionally on an existing product); no quantity when metered. */
function stripeLine({ ref, inlinePrice: inline, quantity, metered }, oneTime, fallbackName) {
  const base = inline
    ? { price_data: { currency: inline.currency ?? 'usd', unit_amount: inline.unitAmount, ...(inline.productId ? { product: inline.productId } : { product_data: { name: inline.name ?? fallbackName ?? ref } }), ...(!oneTime && inline.interval ? { recurring: { interval: inline.interval } } : {}) } }
    : { price: ref };
  return metered || quantity === undefined ? base : { ...base, quantity };
}

/** Wrap a four-method Stripe adapter (createStripeRest, a fake, Quarry's withInlinePrices…) as a provider.
 *  With no adapter it is the webhook-only provider: verify and parse work, every API call throws not-configured. */
export function stripeProvider(stripe) {
  if (typeof stripe?.parseWebhook === 'function') return stripe;
  const api = () => {
    if (!stripe) throw notConfigured();
    return stripe;
  };
  const opt = (name) => {
    const s = api();
    if (typeof s[name] !== 'function') throw unsupported(`Stripe adapter method ${name}`);
    return s[name].bind(s);
  };
  return {
    name: 'stripe',
    errorCode: 'stripe-error',
    webhookOnly: !stripe,
    extraAllow: STRIPE_EXTRA,
    async verifyWebhook(rawBody, signature, { secret, toleranceSec, nowSec }) {
      await verifySignature(rawBody, headerValue(signature, 'stripe-signature'), secret, { toleranceSec, nowSec });
    },
    async parseWebhook(rawBody, { nowSec }) {
      let event;
      try {
        event = JSON.parse(dec.decode(rawBytes(rawBody)));
      } catch {
        throw new BillingError('Webhook body is not JSON.', 'bad-payload');
      }
      if (!event || (event.id != null && typeof event.id !== 'string') || typeof event.type !== 'string' || !event.data?.object) throw new BillingError('Webhook body is not a Stripe event.', 'bad-payload');
      const obj = event.data.object;
      const base = { id: event.id ?? null, rawType: event.type, at: Number(event.created) || nowSec(), customerRef: idOf(obj.customer), type: null, raw: event };
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const order = stripeOrder(obj);
          return { ...base, type: 'checkout.completed', fresh: true, email: order.email, order };
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          return { ...base, type: 'subscription.updated', subscription: stripeSnapshot(obj) };
        case 'customer.subscription.deleted':
          return { ...base, type: 'subscription.deleted', subscription: stripeSnapshot(obj) };
        case 'invoice.payment_failed':
        case 'invoice.paid': {
          const id = idOf(obj.subscription ?? obj.parent?.subscription_details?.subscription);
          return { ...base, type: event.type === 'invoice.paid' ? 'payment.succeeded' : 'payment.failed', fresh: true, subscription: id ? { id } : undefined };
        }
        default:
          return base;
      }
    },
    async createCheckout({ orgId, kind, planId, itemId, plan, lineItems, quantity, successUrl, cancelUrl, customerEmail, customerRef, idempotencyKey, extra, trialDays, bindingSig }) {
      const oneTime = kind === 'payment';
      const inline = plan.inlinePrice;
      const lines = lineItems ? lineItems.map((l) => stripeLine(l, oneTime, plan.ref)) : [stripeLine({ ref: plan.ref, inlinePrice: inline, quantity }, oneTime)];
      const params = {
        mode: oneTime ? 'payment' : 'subscription',
        line_items: lines,
        client_reference_id: orgId,
        ...(oneTime ? { metadata: { orgId, itemId } } : { subscription_data: { metadata: { orgId, ...(bindingSig ? { orgSig: bindingSig } : {}), ...(inline && !lineItems ? { planRef: plan.ref } : {}) } } }),
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(customerRef ? { customer: customerRef } : customerEmail ? { customer_email: customerEmail } : {}),
      };
      // Billing's own fields always win over the caller's `extra`; trialDays wins over extra's trial
      const merged = deepMerge(deepMerge(extra ?? {}, trialDays ? { subscription_data: { trial_period_days: trialDays } } : {}), params);
      return api().createCheckoutSession(merged, { idempotencyKey });
    },
    createPortal: ({ customerRef, returnUrl, idempotencyKey }) => api().createPortalSession({ customer: customerRef, return_url: returnUrl }, { idempotencyKey }),
    async fetchSubscription(ref) {
      return stripeSnapshot(await api().retrieveSubscription(ref));
    },
    async fetchCheckout(entry) {
      const s = await api().retrieveCheckoutSession(entry.id);
      return s ? stripeOrder(s) : null;
    },
    /** lookup key -> price id (null when there is none) */
    async resolveLookupKey(key) {
      const r = await opt('listPrices')({ lookup_keys: [key], active: true, limit: 1 });
      return r?.data?.[0]?.id ?? null;
    },
    /** ops: [{ id?, price?, priceData?, quantity?, deleted?, clearUsage? }] on the live subscription, in place */
    async updateSubscription({ subscriptionRef, ops, proration, idempotencyKey }) {
      const items = ops.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        ...(o.deleted ? { deleted: true, ...(o.clearUsage ? { clear_usage: true } : {}) } : {}),
        ...(o.price ? { price: o.price } : {}),
        ...(o.inlinePrice ? { price_data: { currency: o.inlinePrice.currency ?? 'usd', product: o.inlinePrice.productId, unit_amount: o.inlinePrice.unitAmount, recurring: { interval: o.inlinePrice.interval ?? 'month' } } } : {}),
        ...(o.quantity !== undefined && !o.deleted ? { quantity: o.quantity } : {}),
      }));
      await opt('updateSubscription')(subscriptionRef, { items, proration_behavior: proration }, { idempotencyKey });
    },
    /** one meter event: POST /v1/billing/meter_events */
    reportUsage({ eventName, customerRef, value, timestamp, identifier, idempotencyKey }) {
      return opt('createMeterEvent')({ event_name: eventName, payload: { stripe_customer_id: customerRef, value: String(value) }, identifier, timestamp }, { idempotencyKey });
    },
  };
}

// ---- Lemon Squeezy ---------------------------------------------------------------------------------------

/** Lemon Squeezy's signature for a body (tests, the squawk, local replays): hex HMAC-SHA256 of the raw bytes. */
export async function signLemonSqueezy(rawBody, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, rawBytes(rawBody)));
}

/** Lemon Squeezy subscription attributes → status and cancel flag. `cancelled` runs until `ends_at`. */
export function mapLemonStatus(a, nowSec) {
  switch (a.status) {
    case 'on_trial': return { status: 'trialing', cancelAtPeriodEnd: false };
    case 'active': return { status: 'active', cancelAtPeriodEnd: false };
    case 'past_due':
    case 'unpaid':
    case 'paused': return { status: 'past_due', cancelAtPeriodEnd: false }; // paused: not collecting, so access ends after the grace period
    case 'cancelled': {
      const ends = toSec(a.ends_at);
      return ends && ends > nowSec ? { status: 'active', cancelAtPeriodEnd: true } : { status: 'canceled', cancelAtPeriodEnd: false };
    }
    default: return { status: 'canceled', cancelAtPeriodEnd: false }; // expired and anything new
  }
}

function lemonSnapshot(data, nowSec, orgId = null, bindingSig = null) {
  const a = data.attributes ?? {};
  const { status, cancelAtPeriodEnd } = mapLemonStatus(a, nowSec);
  const quantity = a.first_subscription_item?.quantity ?? 1;
  const periodEnd = toSec(a.renews_at) ?? toSec(a.ends_at) ?? toSec(a.trial_ends_at);
  const ref = a.variant_id == null ? null : String(a.variant_id);
  const itemId = a.first_subscription_item?.id;
  return {
    id: String(data.id), status, planRef: ref, quantity, periodStart: null, periodEnd, cancelAtPeriodEnd,
    customerRef: a.customer_id == null ? null : String(a.customer_id), created: toSec(a.created_at), orgId, bindingSig,
    items: [{ id: itemId == null ? null : String(itemId), ref, productRef: a.product_id == null ? null : String(a.product_id), lookupKey: null, metered: false, quantity, periodStart: null, periodEnd }],
    endsAt: toSec(a.ends_at), trialEnd: status === 'trialing' ? toSec(a.trial_ends_at) : null, portalUrl: a.urls?.customer_portal ?? null, email: a.user_email ?? null, raw: data,
  };
}

function lemonOrder(data, orgId = null) {
  const a = data.attributes ?? {};
  const v = a.first_order_item?.variant_id;
  return {
    id: String(data.id), kind: 'payment', paid: a.status === 'paid', orgId, itemId: null, itemRef: v == null ? null : String(v),
    subscriptionRef: null, customerRef: a.customer_id == null ? null : String(a.customer_id), licenseKey: null, email: a.user_email ?? null, raw: data,
  };
}

/** Lemon Squeezy over its JSON:API REST. No SDK. The key is only ever sent in the Authorization header. */
export function createLemonSqueezy({ apiKey, storeId, webhookSecret = null, webhookOnly = false, fetch: fetchImpl = globalThis.fetch, baseUrl = 'https://api.lemonsqueezy.com/v1', timeoutMs = 20_000, testMode = false, licenseKeys = false } = {}) {
  // Webhook-only needs the explicit flag (a lost API key env var must not silently become a mode); then apiKey is not needed
  // and storeId is optional (given: events from other stores are ignored).
  if (!webhookOnly && (typeof apiKey !== 'string' || apiKey.length < 8)) throw new BillingError('createLemonSqueezy needs an API key.', 'invalid');
  if (!(webhookOnly && storeId == null) && (storeId == null || !/^\d+$/.test(String(storeId)))) throw new BillingError('createLemonSqueezy needs the numeric storeId.', 'invalid');
  if (webhookSecret != null && (typeof webhookSecret !== 'string' || webhookSecret.length < 6)) throw new BillingError('webhookSecret is the signing secret you set on the webhook.', 'invalid');
  storeId = storeId == null ? null : String(storeId);

  async function request(method, path, { query, body } = {}) {
    if (webhookOnly) throw notConfigured();
    let url = baseUrl.replace(/\/$/, '') + path;
    if (query) url += `?${new URLSearchParams(query)}`;
    const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/vnd.api+json' };
    const init = { method, headers };
    if (body) {
      headers['Content-Type'] = 'application/vnd.api+json';
      init.body = JSON.stringify(body);
    }
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new BillingError('Could not reach Lemon Squeezy.', 'provider-error', 502);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new BillingError(`Lemon Squeezy: ${String(json?.errors?.[0]?.detail ?? res.status).slice(0, 200)}`, 'provider-error', 502);
      e.providerStatus = res.status;
      throw e;
    }
    return json;
  }

  const provider = {
    name: 'lemonsqueezy',
    errorCode: 'provider-error',
    webhookSecret,
    webhookOnly,
    extraAllow: LEMON_EXTRA,

    async verifyWebhook(rawBody, signature, { secret }) {
      const bytes = rawBytes(rawBody);
      const sig = String(headerValue(signature, 'x-signature') ?? '').trim();
      if (!/^[0-9a-fA-F]{64}$/.test(sig)) throw new BillingError('Missing or malformed X-Signature header.', 'bad-signature');
      if (!safeEqual(sig.toLowerCase(), await signLemonSqueezy(bytes, secret))) throw new BillingError('Webhook signature does not match.', 'bad-signature');
    },

    async parseWebhook(rawBody, { nowSec }) {
      let event;
      try {
        event = JSON.parse(dec.decode(rawBytes(rawBody)));
      } catch {
        throw new BillingError('Webhook body is not JSON.', 'bad-payload');
      }
      const name = event?.meta?.event_name;
      const data = event?.data;
      if (typeof name !== 'string' || !data || data.id == null || typeof data.attributes !== 'object') throw new BillingError('Webhook body is not a Lemon Squeezy event.', 'bad-payload');
      const a = data.attributes;
      const updated = a.updated_at;
      const id = updated ? `${name}:${data.type}:${data.id}:${updated}` : `sha256:${await sha256(dec.decode(rawBytes(rawBody)))}`;
      const base = { id, rawType: name, at: toSec(updated) ?? nowSec(), customerRef: a.customer_id == null ? null : String(a.customer_id), type: null, raw: event };
      if (storeId && a.store_id != null && String(a.store_id) !== storeId) return base; // another store on the same account
      const orgId = event.meta?.custom_data?.orgId ?? null;
      const orgSig = event.meta?.custom_data?.orgSig ?? null;
      switch (name) {
        case 'subscription_created':
        case 'subscription_updated':
        case 'subscription_cancelled':
        case 'subscription_resumed':
        case 'subscription_paused':
        case 'subscription_unpaused':
          return { ...base, type: 'subscription.updated', email: a.user_email ?? null, subscription: lemonSnapshot(data, nowSec(), orgId, orgSig) };
        case 'subscription_expired':
          return { ...base, type: 'subscription.deleted', subscription: lemonSnapshot(data, nowSec(), orgId, orgSig) };
        case 'subscription_payment_failed':
        case 'subscription_payment_success':
        case 'subscription_payment_recovered':
          return { ...base, type: name === 'subscription_payment_failed' ? 'payment.failed' : 'payment.succeeded', fresh: true, subscription: a.subscription_id == null ? undefined : { id: String(a.subscription_id) } };
        case 'order_created':
          return { ...base, type: 'order.paid', fresh: true, email: a.user_email ?? null, order: lemonOrder(data, orgId) };
        default:
          return base;
      }
    },

    async createCheckout({ orgId, plan, lineItems, quantity, successUrl, customerEmail, nowMs, extra, bindingSig }) {
      if (lineItems) throw unsupported('Multi-line-item plans');
      const variant = String(plan.ref);
      const attributes = deepMerge(extra ?? {}, {
        checkout_data: { ...(customerEmail ? { email: customerEmail } : {}), custom: { orgId, ...(bindingSig ? { orgSig: bindingSig } : {}) }, variant_quantities: [{ variant_id: Number(variant), quantity }] },
        product_options: { redirect_url: successUrl, enabled_variants: [Number(variant)] },
        ...(testMode ? { test_mode: true } : {}),
      });
      const json = await request('POST', '/checkouts', {
        body: {
          data: {
            type: 'checkouts',
            attributes,
            relationships: { store: { data: { type: 'stores', id: storeId } }, variant: { data: { type: 'variants', id: variant } } },
          },
        },
      });
      const url = json?.data?.attributes?.url;
      const id = json?.data?.id;
      return { id: id == null ? null : String(id), url, pending: id == null ? null : { id: String(id), ref: variant, kind: plan.kind, email: customerEmail ?? null, at: nowMs } };
    },

    async createPortal({ customerRef, subscriptionRef }) {
      const json = subscriptionRef
        ? await request('GET', `/subscriptions/${encodeURIComponent(subscriptionRef)}`)
        : await request('GET', `/customers/${encodeURIComponent(customerRef)}`);
      return { url: json?.data?.attributes?.urls?.customer_portal };
    },

    /** ops from billing: a price op is a variant change (PATCH /subscriptions/:id); a quantity-only op is PATCH /subscription-items/:id */
    async updateSubscription({ subscriptionRef, ops, proration }) {
      const flags = { ...(proration === 'none' ? { disable_prorations: true } : {}), ...(proration === 'always_invoice' ? { invoice_immediately: true } : {}) };
      if (ops.some((o) => o.deleted || o.inlinePrice || (!o.id && !o.price))) throw unsupported('Multi-item changes');
      const priceOp = ops.find((o) => o.price);
      if (ops.filter((o) => o.price).length > 1) throw unsupported('Multi-item changes');
      if (priceOp) await request('PATCH', `/subscriptions/${encodeURIComponent(subscriptionRef)}`, { body: { data: { type: 'subscriptions', id: String(subscriptionRef), attributes: { variant_id: Number(priceOp.price), ...flags } } } });
      for (const o of ops.filter((x) => x.quantity !== undefined && x.id)) {
        await request('PATCH', `/subscription-items/${encodeURIComponent(o.id)}`, { body: { data: { type: 'subscription-items', id: String(o.id), attributes: { quantity: o.quantity, ...flags } } } });
      }
    },

    /** Lemon Squeezy usage records: one usage-based item per subscription, so the meter name is not sent. */
    async reportUsage({ itemId, value }) {
      if (!itemId) throw new BillingError('No subscription item to report usage on.', 'no-subscription', 409);
      if (!Number.isInteger(value) || value < 0) throw new BillingError('Lemon Squeezy usage must be a whole number.', 'invalid');
      await request('POST', '/usage-records', { body: { data: { type: 'usage-records', attributes: { quantity: value, action: 'increment' }, relationships: { 'subscription-item': { data: { type: 'subscription-items', id: String(itemId) } } } } } });
    },

    async fetchSubscription(ref, { nowSec }) {
      const json = await request('GET', `/subscriptions/${encodeURIComponent(ref)}`);
      if (!json?.data) throw new BillingError('Lemon Squeezy returned no subscription.', 'provider-error', 502);
      return lemonSnapshot(json.data, nowSec());
    },

    /** Reads carry no custom data, so a first purchase is found by buyer email + variant + time. */
    async fetchCheckout(entry) {
      if (!entry.email || !entry.ref) return null;
      const since = Math.floor((entry.at ?? 0) / 1000) - 120;
      const query = { 'filter[store_id]': storeId, 'filter[user_email]': entry.email };
      if (entry.kind === 'subscription') {
        const json = await request('GET', '/subscriptions', { query: { ...query, 'filter[variant_id]': entry.ref } });
        const sub = (json?.data ?? []).find((s) => (toSec(s.attributes?.created_at) ?? 0) >= since);
        if (!sub) return null;
        return { id: `subscription:${sub.id}`, kind: 'subscription', paid: true, orgId: null, subscriptionRef: String(sub.id), customerRef: String(sub.attributes.customer_id), raw: sub };
      }
      const json = await request('GET', '/orders', { query });
      const o = (json?.data ?? []).find((x) => String(x.attributes?.first_order_item?.variant_id) === entry.ref && x.attributes?.status === 'paid' && (toSec(x.attributes.created_at) ?? 0) >= since);
      return o ? lemonOrder(o) : null;
    },
  };
  if (licenseKeys) {
    provider.licenseKeyFor = async (order) => {
      const json = await request('GET', '/license-keys', { query: { 'filter[store_id]': storeId, 'filter[order_id]': order.id } });
      return json?.data?.[0]?.attributes?.key ?? null;
    };
  }
  return provider;
}

// ---- billing ---------------------------------------------------------------------------------------------

const LIVE = ['trialing', 'active', 'past_due'];
const DAY = 86_400_000;
const PRORATIONS = ['create_prorations', 'none', 'always_invoice'];
const refOf = (p) => p?.ref ?? p?.priceId ?? p?.variantId ?? null;
const arr = (v) => (v == null ? [] : [].concat(v).filter((x) => x != null));
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** What a plan or line item says it is: refs (price/variant ids), products, lookup keys, a match function. */
function matchersOf(spec) {
  return {
    refs: new Set([...arr(spec.ref), ...arr(spec.priceId), ...arr(spec.variantId)].map(String)),
    products: new Set([...arr(spec.productId), ...arr(spec.inlinePrice?.productId)].map(String)),
    keys: arr(spec.lookupKey).map(String),
    match: typeof spec.match === 'function' ? spec.match : null,
  };
}
const hasMatcher = (m) => m.refs.size || m.products.size || m.keys.length || m.match;

const NONE_STATUS = () => ({ plan: null, status: 'none', seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false });
const DETAIL = () => ({ endsAt: null, trialEndsAt: null, portalUrl: null, items: [] });
const publicItems = (items) => (items ?? []).map((i) => ({ role: i.role, quantity: i.quantity, ref: i.ref }));

export function createBilling({
  store, stripe, provider: given, seats = null, plans = {}, items = {}, onPeriod = null, onPurchase = null, entitlements = null, orgExists = null, parseReference = null,
  onUnclaimed = null, onEvent = null, canBind = null, onConflict = null, bindingSecret = null, meters = {}, usage: usageOpts = {}, webhookSecret = null, toleranceSec = 300, graceMs = 3 * DAY, now = () => Date.now(),
}) {
  if (!store || !(given || stripe)) throw new BillingError('createBilling needs store and a provider (or stripe).', 'invalid');
  const provider = given ?? stripeProvider(stripe);
  if (webhookSecret) requireSecret(webhookSecret, 'billing webhookSecret');
  if (bindingSecret) requireSecret(bindingSecret, 'billing bindingSecret');
  /** The server's proof that billing itself bound this org into a checkout: hex HMAC-SHA256(bindingSecret, prefix + orgId). */
  const bindSig = async (orgId) => (bindingSecret ? toHex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode(bindingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(`launchkit-billing-bind:${orgId}`))) : null);
  const signedFor = async (orgId, sub) => !!(bindingSecret && typeof sub?.bindingSig === 'string' && safeEqual(sub.bindingSig, await bindSig(orgId)));
  const secret = webhookSecret ?? provider.webhookSecret ?? null;
  const errCode = provider.errorCode ?? 'provider-error';
  const webhookOnly = !!provider.webhookOnly;
  const needApi = () => {
    if (webhookOnly) throw notConfigured();
  };

  // Plans: each is identified by its own matchers, or by its base line item's
  const defs = [];
  for (const [id, plan] of Object.entries(plans)) {
    const lines = (plan.lineItems ?? []).map((l) => ({ role: l.role ?? 'base', spec: l, m: matchersOf(l) }));
    if (plan.lineItems && (!lines.length || lines.some((l) => !['base', 'seat', 'usage'].includes(l.role)))) throw new BillingError(`Plan "${id}" lineItems need a role of base, seat or usage.`, 'invalid');
    const own = matchersOf(plan);
    const base = hasMatcher(own) ? own : (lines.find((l) => l.role === 'base') ?? lines[0])?.m;
    if (!base || !hasMatcher(base)) throw new BillingError(`Plan "${id}" needs a ref (priceId, variantId, productId, lookupKey or match).`, 'invalid');
    defs.push({ id, plan, lines, base });
  }
  const defById = new Map(defs.map((d) => [d.id, d]));
  const itemByRef = new Map();
  for (const [id, it] of Object.entries(items)) {
    if (!refOf(it)) throw new BillingError(`Item "${id}" needs a ref (priceId or variantId).`, 'invalid');
    itemByRef.set(refOf(it), id);
  }

  // lookup keys resolve through the provider once per process
  const lookups = new Map();
  async function resolveLookup(key) {
    if (lookups.has(key)) return lookups.get(key);
    if (typeof provider.resolveLookupKey !== 'function') throw unsupported('lookupKey');
    const ref = await provider.resolveLookupKey(key);
    if (ref) lookups.set(key, String(ref));
    return ref ? String(ref) : null;
  }
  async function specMatches(m, item) {
    if (m.refs.has(String(item.ref))) return true;
    if (item.productRef != null && m.products.has(String(item.productRef))) return true;
    if (item.lookupKey != null && m.keys.includes(String(item.lookupKey))) return true;
    if (m.match && m.match(item)) return true;
    if (!webhookOnly && item.ref != null && typeof provider.resolveLookupKey === 'function') {
      for (const k of m.keys) if ((await resolveLookup(k)) === String(item.ref)) return true;
    }
    return false;
  }
  /** The price/variant id a plan or line item sells (resolving its lookup key), or undefined. */
  async function refFor(spec) {
    const direct = refOf(spec);
    if (direct) return String(direct);
    const key = arr(spec.lookupKey)[0];
    if (key != null) {
      const r = await resolveLookup(String(key));
      if (!r) throw new BillingError(`No price has the lookup key "${key}".`, 'invalid');
      return r;
    }
    return undefined;
  }
  /** Find the plan a subscription's items belong to, and give each item a role. */
  async function classify(subItems) {
    for (const item of subItems ?? []) {
      for (const def of defs) {
        if (!(await specMatches(def.base, item))) continue;
        const claimed = new Set();
        const out = [];
        for (const it of subItems) {
          let role = null;
          for (const l of def.lines) {
            if (claimed.has(l) || !(await specMatches(l.m, it))) continue;
            claimed.add(l);
            role = l.role;
            break;
          }
          if (!role) role = it === item ? 'base' : it.metered ? 'usage' : 'other';
          out.push({ ...it, role });
        }
        return { def, planId: def.id, planItem: item, items: out };
      }
    }
    return null;
  }

  const orgKey = (id) => `orgs/${keyPart(id)}`;
  const customerKey = (id) => `customers/${keyPart(id)}`;
  const eventKey = (id) => `events/${keyPart(id)}`;
  const periodKey = (subId, start) => `periods/${keyPart(subId)}/${start}`;
  const sessionKey = (id) => `sessions/${keyPart(id)}`;
  const pendingKey = (orgId) => `pending/${keyPart(orgId)}`;
  const heldKey = (id) => `held/${keyPart(id)}`;
  const subKey = (id) => `subscriptions/${keyPart(id)}`;
  const conflictKey = (id) => `conflicts/${keyPart(id)}`;
  const usageKey = (id) => `usage/${keyPart(id)}`;
  const getRec = (orgId) => store.get(orgKey(orgId));
  const isLive = (rec) => !!rec && LIVE.includes(rec.status);
  const nowSec = () => Math.floor(now() / 1000);
  const ctx = () => ({ nowSec });
  const getPending = async (orgId) => ((await store.get(pendingKey(orgId))) ?? []).map((e) => (typeof e === 'string' ? { id: e } : e));
  const packPending = (list) => list.map((e) => (Object.keys(e).length === 1 ? e.id : e));
  // Without seats an org is known unless the app's own orgExists says otherwise
  const knows = async (orgId) => {
    if (typeof orgId !== 'string' || !orgId) return false;
    if (seats) return !!(await seats.getOrg(orgId));
    return orgExists ? !!(await orgExists(orgId)) : true;
  };
  const refToOrg = (ref) => (ref == null ? null : parseReference ? parseReference(ref) ?? null : ref);

  /** The v1 shape; `detail` adds endsAt, trialEndsAt, portalUrl and items (a separate opt-in so v1 callers see the exact v1 shape). */
  function statusOf(rec, detail = false) {
    const base = !rec ? NONE_STATUS() : { plan: rec.plan, status: rec.status, seats: rec.seats ?? null, currentPeriodEnd: rec.currentPeriodEnd, cancelAtPeriodEnd: rec.cancelAtPeriodEnd };
    if (!detail) return base;
    return !rec ? { ...base, ...DETAIL() } : { ...base, endsAt: rec.endsAt ?? null, trialEndsAt: rec.trialEndsAt ?? null, portalUrl: rec.portalUrl ?? null, items: publicItems(rec.items) };
  }
  const entitlementKey = (st) => JSON.stringify([st.plan, st.status, st.seats, st.cancelAtPeriodEnd, st.items]);
  /** Store the new org record (remembering what the app's entitlements were last told), then seats. The hook is fired by
   *  fireChange AFTER this, so it may call billing methods and sees stored state. */
  async function commit(orgId, rec, next, seatsPatch) {
    if (entitlements?.onChange) next.mirrored = rec?.mirrored ?? statusOf(rec, true);
    await store.set(orgKey(orgId), next);
    if (seats && seatsPatch) await seats.updateOrg(orgId, seatsPatch);
  }
  /** Tell the app's own source of truth, after the new state is recorded. A hook that throws leaves `mirrored` behind,
   *  so the redelivered event fires it again. */
  async function fireChange(orgId, next) {
    if (!entitlements?.onChange) return;
    const before = next.mirrored ?? statusOf(null, true);
    const after = statusOf(next, true);
    if (entitlementKey(before) === entitlementKey(after)) return;
    await entitlements.onChange({ orgId, before, after, customerRef: next.customerId ?? null, subscriptionRef: next.subscriptionId ?? null, plan: next.plan, status: next.status, items: after.items });
    const cur = await getRec(orgId); // the hook may have changed things (setQuantity): only acknowledge if nobody else did
    if (cur?.mirrored && entitlementKey(cur.mirrored) === entitlementKey(before)) await store.set(orgKey(orgId), { ...cur, mirrored: after });
  }

  /** A cap on seats may be a number or (orgId) => number. */
  async function capOf(v, orgId) {
    if (typeof v !== 'function') return v;
    const n = Number(await v(orgId));
    if (!Number.isFinite(n) || n < 0) throw new BillingError('A seat cap function must return a number, 0 or more.', 'invalid');
    return n;
  }
  async function seatCount(planId, item, orgId) {
    const p = plans[planId];
    if (!p.perSeat && p.seats == null) return null; // a plan with no seats leaves seats alone
    if (!p.perSeat) return Math.max(1, p.seats);
    const q = Math.max(1, Number(item?.quantity ?? 1) | 0);
    return Math.min((await capOf(p.maxSeats, orgId)) ?? Infinity, Math.max(p.minSeats ?? 1, q));
  }

  /** Org for a subscription and how we know it: the stored customer mapping or subscription index (already ours), then the
   *  reference an order carried (`hint`), then the orgId in the subscription's metadata. Those last two come from a URL or
   *  metadata somebody may have written, so they are checked by bindCheck. */
  async function resolveOrg(sub, hint) {
    const customerId = sub.customerRef;
    const candidates = [
      [customerId && (await store.get(customerKey(customerId))), 'customer'],
      [sub.id && (await store.get(subKey(sub.id))), 'customer'],
      [hint, 'hint'],
      [sub.orgId, 'metadata'],
    ];
    for (const [orgId, via] of candidates) if (orgId && (await knows(orgId))) return { orgId, via };
    return { orgId: null, via: null };
  }

  /** The org whose record names this subscription (a deleted event with no customer or metadata). */
  async function orgOfSubscription(subId) {
    const known = await store.get(subKey(subId));
    if (known) return known;
    for (const k of await store.list('orgs/')) {
      const rec = await store.get(k);
      if (rec?.subscriptionId === subId) return rec.orgId;
    }
    return null;
  }

  /** May this customer be bound to this org? null = yes, otherwise the conflict result (and the hook has been told).
   *  `via` 'customer' means the customer or subscription is already ours. server-checkout (our signature, or the
   *  caller says billing made the checkout) always binds; reference and metadata sources go through canBind, and
   *  by default may not re-point an org that is live on another customer. */
  async function bindCheck({ orgId, rec, customerRef, subscriptionRef, planId = null, status = null, via, sub, trusted = false, event = null }) {
    if (!customerRef || via === 'customer') return null;
    if (rec?.customerId === customerRef || (await store.get(customerKey(customerRef))) === orgId) return null;
    const source = trusted || (await signedFor(orgId, sub)) ? 'server-checkout' : via === 'hint' ? 'reference' : 'metadata';
    if (source === 'server-checkout') return null;
    const live = isLive(rec) && !!rec.customerId && rec.customerId !== customerRef;
    const ok = canBind ? !!(await canBind({ orgId, customerRef, subscriptionRef, event, source })) : !live;
    if (ok) return null;
    const existing = rec ? { customerRef: rec.customerId ?? null, subscriptionRef: rec.subscriptionId ?? null, plan: rec.plan, status: rec.status } : null;
    const incoming = { customerRef, subscriptionRef: subscriptionRef ?? null, plan: planId, status };
    if (event?.id) await store.set(conflictKey(event.id), { id: event.id, orgId, existing, incoming, source, at: now() });
    if (onConflict) await onConflict({ orgId, existing, incoming, event });
    return { handled: false, ignored: 'conflict', orgId };
  }

  /** Once per paid period, however it was noticed: webhook, sync or a late event. A period is keyed by its start,
   *  or by its end for a provider that has no start (Lemon Squeezy). */
  async function grantPeriod(orgId, planId, sub, item, status) {
    const startSec = item.periodStart ?? null;
    const idSec = startSec ?? item.periodEnd ?? null;
    if (status !== 'active' || !idSec) return false;
    const key = periodKey(sub.id, idSec);
    if (await store.get(key)) return false;
    const endSec = item.periodEnd ?? null;
    if (onPeriod) {
      await onPeriod({ key: `period:${sub.id}:${idSec}`, orgId, planId, plan: plans[planId], subscriptionId: sub.id, period: { start: startSec ? startSec * 1000 : null, end: endSec ? endSec * 1000 : null } });
    }
    await store.set(key, { at: now() });
    return true;
  }

  /** Link a customer to an org (first one wins) and bring in anything held for that customer. */
  async function linkCustomer(customerId, orgId) {
    if (!customerId || (await store.get(customerKey(customerId)))) return;
    await store.set(customerKey(customerId), orgId);
    await replayHeld((h) => h.customerRef === customerId, orgId);
  }

  /** A deleted event with no items: cancel what the org has under that subscription, never anything else. */
  async function applyEnded(sub, stamp, orgId) {
    const rec = orgId && (await getRec(orgId));
    if (!rec || rec.subscriptionId !== sub.id) return { handled: false, ignored: orgId ? 'other-subscription' : 'unknown-org' };
    if (stamp < rec.stamp) return { handled: false, ignored: 'stale' };
    const next = { ...rec, status: 'canceled', cancelAtPeriodEnd: false, endsAt: (sub.endsAt ?? stamp) * 1000, trialEndsAt: null, pastDueSince: null, ended: true, stamp };
    await commit(orgId, rec, next, { status: 'canceled' });
    await fireChange(orgId, next);
    return { handled: true, orgId };
  }

  /** Apply a subscription's state to the org. `stamp` (unix seconds) says how fresh that state is. */
  async function applySubscription(sub, stamp, { hint = null, ended = false, event = null, trusted = false } = {}) {
    const cls = await classify(sub.items);
    const found = await resolveOrg(sub, hint);
    let orgId = found.orgId;
    if (!cls && ended) return applyEnded(sub, stamp, orgId ?? (await orgOfSubscription(sub.id)));
    if (!orgId) return { handled: false, ignored: 'unknown-org', hold: !!cls };
    if (!cls) return { handled: false, ignored: 'unknown-plan' };
    const { planId, planItem: item } = cls;
    const status = ended ? 'canceled' : sub.status;

    const rec = await getRec(orgId);
    if (rec && rec.subscriptionId !== sub.id) {
      if (status === 'canceled') return { handled: false, ignored: 'other-subscription' }; // an old one ending
      if (isLive(rec) && (rec.subCreated ?? 0) > (sub.created ?? 0)) return { handled: false, ignored: 'older-subscription' };
    } else if (rec && stamp < rec.stamp) {
      await grantPeriod(orgId, planId, sub, item, status); // an old paid period is still owed, once
      return { handled: false, ignored: 'stale' };
    } else if (rec?.ended && !ended) {
      return { handled: false, ignored: 'deleted-subscription' }; // a deleted subscription stays deleted
    }
    if (status !== 'canceled') {
      const conflict = await bindCheck({ orgId, rec, customerRef: sub.customerRef, subscriptionRef: sub.id, planId, status, via: found.via, sub, trusted, event });
      if (conflict) return conflict;
    }

    const customerId = sub.customerRef;
    const sameSub = rec?.subscriptionId === sub.id;
    const periodEndSec = item.periodEnd ?? null;
    const seatItem = cls.items.find((i) => i.role === 'seat');
    const cancelAtPeriodEnd = !!sub.cancelAtPeriodEnd && status !== 'canceled';
    const endsSec = status === 'canceled' ? (sub.endsAt ?? stamp) : cancelAtPeriodEnd ? (sub.endsAt ?? periodEndSec) : null;
    const seatsNow = seatItem ? seatItem.quantity : await seatCount(planId, item, orgId);
    const next = {
      orgId,
      customerId,
      subscriptionId: sub.id,
      subCreated: sub.created ?? null,
      plan: planId,
      status,
      seats: seatsNow,
      currentPeriodEnd: periodEndSec ? periodEndSec * 1000 : null,
      cancelAtPeriodEnd,
      endsAt: endsSec ? endsSec * 1000 : null,
      trialEndsAt: status === 'trialing' && sub.trialEnd ? sub.trialEnd * 1000 : null,
      portalUrl: sub.portalUrl ?? null,
      items: cls.items.map((i) => ({ id: i.id ?? null, role: i.role, quantity: i.quantity, ref: i.ref })),
      pastDueSince: status === 'past_due' ? (sameSub && rec.status === 'past_due' ? rec.pastDueSince : stamp * 1000) : null,
      stamp,
      ...(ended || (sameSub && rec.ended) ? { ended: true } : {}),
    };
    await commit(orgId, rec, next, seats ? {
      ...(seatItem || next.seats == null ? {} : { seats: next.seats }),
      plan: planId,
      status: status === 'none' ? 'incomplete' : status,
      billing: { customerId, subscriptionId: sub.id },
    } : null);
    await store.set(subKey(sub.id), orgId);
    await linkCustomer(customerId, orgId);
    await fireChange(orgId, next);
    const granted = await grantPeriod(orgId, planId, sub, item, status);
    return { handled: true, orgId, ...(granted ? { periodGranted: true } : {}) };
  }

  /** Webhook-only: a payment event can't be read back, so it moves the stored subscription's state directly. */
  async function applyPaymentSignal(ev, stamp, { hint = null } = {}) {
    const subId = ev.subscription?.id;
    const orgId = (ev.customerRef && (await store.get(customerKey(ev.customerRef)))) || hint;
    const rec = orgId && (await getRec(orgId));
    if (!rec || !subId || rec.subscriptionId !== subId) return { handled: false, ignored: 'unknown-org' };
    if (stamp < rec.stamp) return { handled: false, ignored: 'stale' };
    const failed = ev.type === 'payment.failed';
    if (!failed && rec.status !== 'past_due') return { handled: true, orgId };
    const status = failed ? 'past_due' : 'active';
    const next = { ...rec, status, pastDueSince: failed ? (rec.status === 'past_due' ? rec.pastDueSince : stamp * 1000) : null, stamp };
    await commit(orgId, rec, next, { status });
    await fireChange(orgId, next);
    return { handled: true, orgId };
  }

  /** A subscription from an event: a full snapshot is used as is, a bare `{ id }` is read back from the provider. */
  const fullSubscription = (s) => (s.status === undefined ? provider.fetchSubscription(s.id, ctx()) : s);

  /** A finished checkout or a paid order, from a webhook, sync or confirm. Subscriptions are read back. */
  async function applyOrder(order, stamp, { alsoKey = null, org = null, trusted = false, event = null } = {}) {
    if (!order || !order.paid) return { handled: false, ignored: 'unpaid' };
    const orgId = refToOrg(order.orgId) ?? org; // sync/confirm know the org when the provider's reads don't say
    const mark = async (v) => {
      await store.set(sessionKey(order.id), v);
      if (alsoKey && alsoKey !== order.id) await store.set(sessionKey(alsoKey), v);
    };
    const dup = async (o) => {
      if (alsoKey && alsoKey !== order.id && orgId) await store.set(sessionKey(alsoKey), { orgId, at: now() }); // the checkout id is done too
      return { handled: false, duplicate: true, ...(o ? { orgId: o } : {}) };
    };
    if (order.kind === 'subscription') {
      if (!order.subscriptionRef) return { handled: false };
      if (await store.get(sessionKey(order.id))) return await dup();
      if (webhookOnly) {
        // Nothing to read back: this event only says which org the customer is. The subscription events apply the plan.
        if (!(await knows(orgId))) return { handled: false, ignored: 'unknown-org', hold: true };
        const conflict = await bindCheck({ orgId, rec: await getRec(orgId), customerRef: order.customerRef, subscriptionRef: order.subscriptionRef, via: 'hint', sub: null, trusted, event });
        if (conflict) return conflict;
        await linkCustomer(order.customerRef, orgId);
        await mark({ orgId, at: now() });
        return { handled: true, orgId, linked: true };
      }
      const r = await applySubscription(await provider.fetchSubscription(order.subscriptionRef, ctx()), stamp, { hint: orgId, trusted, event });
      if (r.orgId) await mark({ orgId: r.orgId, at: now() });
      return r;
    }
    if (order.kind !== 'payment') return { handled: false };
    const itemId = items[order.itemId] ? order.itemId : itemByRef.get(order.itemRef);
    const item = items[itemId];
    if (!(await knows(orgId))) return { handled: false, ignored: 'unknown-org', hold: !!item };
    if (!item) return { handled: false, ignored: 'unknown-item' };
    if (await store.get(sessionKey(order.id))) return await dup(orgId);
    const customerId = order.customerRef;
    const licenseKey = order.licenseKey ?? (provider.licenseKeyFor ? await provider.licenseKeyFor(order) : null);
    if (onPurchase) await onPurchase({ key: `session:${order.id}`, orgId, itemId, item, session: order.raw ?? order, order, licenseKey, provider: provider.name });
    await mark({ orgId, itemId, at: now() });
    const prior = customerId ? await getRec(orgId) : null;
    // A buyer is only linked to the org when that binding would be allowed (a user-controlled reference must not claim an org)
    if (customerId && !(await bindCheck({ orgId, rec: prior, customerRef: customerId, subscriptionRef: null, via: 'hint', sub: null, trusted, event }))) {
      if (!(await store.get(customerKey(customerId)))) await store.set(customerKey(customerId), orgId);
      const rec = prior;
      if (!rec) await store.set(orgKey(orgId), { orgId, customerId, subscriptionId: null, plan: null, status: 'none', seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, stamp: 0 });
    }
    return { handled: true, orgId, purchased: itemId };
  }

  /** Past-due beyond the grace period blocks access; seats is told once so `seats.access` agrees. */
  async function graceOver(rec) {
    return rec.status === 'past_due' && now() >= (rec.pastDueSince ?? 0) + graceMs;
  }

  /** An event or order with no id is deduped by a hash of its body, never under one shared key. */
  async function normalizeEvent(ev, text, fallbackId = null) {
    if (ev.id == null || ev.id === '') ev = { ...ev, id: fallbackId ?? `sha256:${await sha256(text)}` };
    if (ev.order && (ev.order.id == null || ev.order.id === '')) ev = { ...ev, order: { ...ev.order, id: `order:${ev.id}` } };
    return ev;
  }

  // ---- one event, from the webhook or replayed out of the hold ----
  async function processEvent(ev, rawText, { org = null, trusted = false } = {}) {
    const stamp = ev.fresh ? Math.max(ev.at, nowSec()) : ev.at;
    let result = { handled: false };
    switch (ev.type) {
      case 'checkout.completed':
      case 'order.paid':
        result = await applyOrder(ev.order, stamp, { org, trusted, event: ev });
        break;
      case 'subscription.updated':
        result = await applySubscription(await fullSubscription(ev.subscription), stamp, { hint: org, trusted, event: ev });
        break;
      case 'subscription.deleted':
        result = await applySubscription(await fullSubscription(ev.subscription), stamp, { hint: org, ended: true, trusted, event: ev });
        break;
      case 'payment.failed':
      case 'payment.succeeded': {
        // The payment only says something happened; the subscription itself says what state we're in
        if (!ev.subscription?.id) break;
        result = webhookOnly
          ? await applyPaymentSignal(ev, stamp, { hint: org })
          : await applySubscription(await provider.fetchSubscription(ev.subscription.id, ctx()), stamp, { hint: org, trusted, event: ev });
        break;
      }
      default:
        // Nothing here acts on it: hand it to the app, once per event id
        if (onEvent) {
          await onEvent({ event: { id: ev.id, rawType: ev.rawType, at: ev.at, customerRef: ev.customerRef ?? null, raw: ev.raw ?? null } });
          await store.set(eventKey(ev.id), { type: ev.rawType, at: now() });
        }
        return { ok: true, type: ev.rawType, handled: false };
    }
    const { hold, ...out } = result;
    // Marked only after it worked, so a failure above is retried. Unknown orgs are not marked
    // (another product on the same account, or an event that arrived before we knew the customer).
    if (out.ignored !== 'unknown-org') await store.set(eventKey(ev.id), { type: ev.rawType, at: now() });
    else if (hold && rawText && !org) {
      const sub = ev.type === 'order.paid' || ev.type === 'checkout.completed' ? ev.order?.kind === 'subscription' : true;
      const canHold = onUnclaimed || (webhookOnly && sub && ev.type.startsWith('subscription'));
      if (canHold && !(await store.get(heldKey(ev.id)))) {
        const email = (ev.email ?? ev.order?.email ?? null);
        await store.set(heldKey(ev.id), { id: ev.id, raw: rawText, customerRef: ev.customerRef ?? null, email: email ? String(email).trim().toLowerCase() : null, at: ev.at, held: now() });
        if (onUnclaimed) await onUnclaimed({ event: ev, email: email ?? null });
      }
      if (canHold) out.held = true;
    }
    return { ok: true, type: ev.rawType, ...out };
  }

  /** Replay held events that match, oldest first, into an org; each is removed once applied. */
  async function replayHeld(pred, orgId, { trusted = false } = {}) {
    const entries = [];
    for (const k of await store.list('held/')) {
      const h = await store.get(k);
      if (h && pred(h)) entries.push([k, h]);
    }
    entries.sort((x, y) => (x[1].at - y[1].at) || (x[1].held - y[1].held));
    const done = [];
    for (const [k, h] of entries) {
      const ev = await normalizeEvent(await provider.parseWebhook(h.raw, ctx()), h.raw, h.id);
      await processEvent(ev, null, { org: orgId, trusted });
      await store.set(eventKey(h.id), { type: ev.rawType, at: now() });
      await store.del(k);
      done.push(h.id);
    }
    return done;
  }

  /** Swap-ready view of the live subscription: its plan, items with roles. */
  async function liveState(orgId) {
    needApi();
    const rec = await getRec(orgId);
    if (!rec?.subscriptionId || !isLive(rec)) throw new BillingError('This organization has no live subscription.', 'no-subscription', 409);
    const sub = await provider.fetchSubscription(rec.subscriptionId, ctx());
    return { rec, sub, cls: await classify(sub.items) };
  }
  const updateKey = async (parts) => `lk-${(await sha256(`${parts.join('|')}|${Math.floor(now() / 600_000)}`)).slice(0, 40)}`;
  async function writeSubscription(orgId, rec, ops, proration, what) {
    if (typeof provider.updateSubscription !== 'function') throw unsupported('Changing a live subscription');
    await provider.updateSubscription({ subscriptionRef: rec.subscriptionId, ops, proration, idempotencyKey: await updateKey([orgId, what, proration, JSON.stringify(ops)]) });
  }
  async function converge(orgId, rec) {
    const fresh = await provider.fetchSubscription(rec.subscriptionId, ctx());
    await applySubscription(fresh, nowSec(), { hint: orgId, trusted: true });
    return statusOf(await getRec(orgId), true);
  }
  const clampQty = (n, lo, hi) => Math.min(hi ?? Infinity, Math.max(lo ?? 0, n));

  async function sendUsage(entry) {
    const rec = await getRec(entry.orgId);
    const usageItem = (rec?.items ?? []).find((i) => i.role === 'usage') ?? (rec?.items ?? []).find((i) => i.id);
    const stripeLike = provider.name === 'stripe';
    if (stripeLike ? !rec?.customerId : !usageItem?.id) throw new BillingError(stripeLike ? 'This organization has no billing account yet.' : 'This organization has no subscription item to report usage on.', 'no-customer', 409);
    if (typeof provider.reportUsage !== 'function') throw unsupported('Usage reporting');
    try {
      await provider.reportUsage({
        meter: entry.meter, eventName: meters[entry.meter] ?? entry.meter, customerRef: rec.customerId, subscriptionRef: rec.subscriptionId, itemId: usageItem?.id ?? null,
        value: entry.value, timestamp: entry.timestamp, identifier: entry.key, idempotencyKey: entry.key,
      });
    } catch (e) {
      if (!(e instanceof BillingError) || e.code === 'invalid' || e.code === 'unsupported' || e.code === 'not-configured') throw e;
      entry.attempts = (entry.attempts ?? 0) + 1;
      entry.error = e.code;
      await store.set(usageKey(entry.key), entry);
      return false;
    }
    entry.sentAt = now();
    await store.set(usageKey(entry.key), entry);
    return true;
  }

  const api = {
    async checkout(orgId, { planId, itemId, seats: wanted, quantity: qty, successUrl, cancelUrl, customerEmail, extra, trialDays } = {}) {
      needApi();
      const oneTime = itemId != null;
      const plan = oneTime ? items[itemId] : plans[planId];
      if (!plan) throw new BillingError(`No such ${oneTime ? 'item' : 'plan'}: ${oneTime ? itemId : planId}`, 'plan-not-found');
      if (!(await knows(orgId))) throw new BillingError('No such organization.', 'no-org', 404);
      for (const u of [successUrl, cancelUrl]) {
        try {
          new URL(u);
        } catch {
          throw new BillingError('successUrl and cancelUrl must be absolute URLs.', 'invalid');
        }
      }
      if (trialDays != null && (oneTime || !Number.isInteger(trialDays) || trialDays < 1 || trialDays > 730)) throw new BillingError('trialDays must be a whole number of days (1-730) on a subscription.', 'invalid');
      if (extra != null) {
        if (!provider.extraAllow) throw unsupported('Checkout extra');
        validateExtra(extra, provider.extraAllow);
      }
      const rec = await getRec(orgId);
      if (!oneTime && isLive(rec)) throw new BillingError('This organization already has a subscription. Change it in the billing portal.', 'already-subscribed', 409);
      const def = oneTime ? null : defById.get(planId);
      const quantity = oneTime
        ? Math.max(1, Math.floor(Number(qty) || 1))
        : plan.perSeat ? Math.min((await capOf(plan.maxSeats, orgId)) ?? Infinity, Math.max(plan.minSeats ?? 1, Math.floor(Number(wanted) || plan.minSeats || 1))) : 1;
      let lineItems;
      if (def?.lines.length) {
        lineItems = [];
        for (const l of def.lines) {
          const metered = !!l.spec.metered || l.role === 'usage';
          const ref = await refFor(l.spec);
          if (!ref && !l.spec.inlinePrice) throw new BillingError(`Plan "${planId}" has a ${l.role} line item with nothing to sell (ref, lookupKey or inlinePrice).`, 'invalid');
          const q = metered ? undefined
            : l.role === 'seat' ? clampQty(wanted == null ? (l.spec.quantity ?? 0) : Math.max(0, Math.floor(Number(wanted) || 0)), l.spec.min ?? 0, await capOf(l.spec.max ?? plan.maxSeats, orgId))
            : (l.spec.quantity ?? 1);
          lineItems.push({ role: l.role, ref, inlinePrice: l.spec.inlinePrice, quantity: q, metered });
        }
      }
      const sellRef = lineItems ? undefined : await refFor(plan);
      if (!lineItems && !sellRef && !(plan.inlinePrice)) throw new BillingError(`Plan "${planId ?? itemId}" has no price to sell (ref, lookupKey or inlinePrice).`, 'invalid');
      const what = oneTime ? `item:${itemId}` : planId;
      const more = lineItems || extra || trialDays ? `|${JSON.stringify([lineItems, extra ?? null, trialDays ?? null])}` : '';
      const idempotencyKey = `lk-${(await sha256(`${orgId}|${what}|${quantity}|${Math.floor(now() / 600_000)}${more}`)).slice(0, 40)}`;
      const kind = oneTime ? 'payment' : 'subscription';
      const session = await provider.createCheckout({
        orgId, kind, planId, itemId, plan: { ...plan, ref: sellRef ?? refOf(plan), kind }, ...(lineItems ? { lineItems } : {}), quantity, successUrl, cancelUrl, customerEmail,
        customerRef: rec?.customerId ?? null, idempotencyKey, nowMs: now(), bindingSig: await bindSig(orgId), ...(extra ? { extra } : {}), ...(trialDays ? { trialDays } : {}),
      });
      if (!session?.url) throw new BillingError('The billing provider returned no checkout URL.', errCode, 502);
      const entry = session.pending ?? session.id;
      if (entry) await store.set(pendingKey(orgId), packPending([...(await getPending(orgId)), typeof entry === 'string' ? { id: entry } : entry].slice(-20)));
      return session.url;
    },

    async portal(orgId, { returnUrl } = {}) {
      needApi();
      const rec = await getRec(orgId);
      if (!rec?.customerId) throw new BillingError('This organization has no billing account yet.', 'no-customer', 409);
      const session = await provider.createPortal({ customerRef: rec.customerId, subscriptionRef: rec.subscriptionId ?? null, returnUrl, idempotencyKey: `lk-portal-${randomId()}` });
      if (!session?.url) throw new BillingError('The billing provider returned no portal URL.', errCode, 502);
      return session.url;
    },

    async handleWebhook(rawBody, signature) {
      if (!secret) throw new BillingError('webhookSecret is not configured.', 'no-webhook-secret', 500);
      await provider.verifyWebhook(rawBody, signature, { secret, toleranceSec, nowSec: nowSec() });
      const text = dec.decode(rawBytes(rawBody));
      const ev = await normalizeEvent(await provider.parseWebhook(rawBody, ctx()), text);
      if (!ev.type && !onEvent) return { ok: true, type: ev.rawType, handled: false };
      if (await store.get(eventKey(ev.id))) return { ok: true, type: ev.rawType, handled: false, duplicate: true };
      return processEvent(ev, text);
    },

    /** Change the plan on the live subscription in place (no checkout): swap base/metered prices, keep seat quantity. */
    async changePlan(orgId, newPlanId, { proration = 'create_prorations' } = {}) {
      needApi();
      const def = defById.get(newPlanId);
      if (!def) throw new BillingError(`No such plan: ${newPlanId}`, 'plan-not-found');
      if (!PRORATIONS.includes(proration)) throw new BillingError(`proration must be one of ${PRORATIONS.join(', ')}.`, 'invalid');
      const { rec, sub, cls } = await liveState(orgId);
      const target = def.lines.length ? def.lines : [{ role: 'base', spec: def.plan, m: def.base }];
      const existing = cls?.items ?? [];
      const ops = [];
      const used = new Set();
      for (const line of target) {
        const old = existing.find((i) => i.role === line.role && !used.has(i));
        if (old) used.add(old);
        const spec = line.spec;
        const metered = !!spec.metered || line.role === 'usage';
        const qty = metered ? undefined
          : line.role === 'seat' ? (old ? old.quantity : (spec.quantity ?? 0))
          : def.plan.perSeat && line.role === 'base' ? clampQty(old?.quantity ?? def.plan.minSeats ?? 1, def.plan.minSeats ?? 1, await capOf(def.plan.maxSeats, orgId))
          : (spec.quantity ?? 1);
        const ref = await refFor(spec);
        if (old) {
          const same = await specMatches(line.m, old);
          const op = { id: old.id, ...(same ? {} : ref ? { price: ref } : { inlinePrice: spec.inlinePrice }), ...(qty !== undefined && qty !== old.quantity ? { quantity: qty } : {}) };
          if (!same || op.quantity !== undefined) ops.push(op);
        } else {
          ops.push({ ...(ref ? { price: ref } : { inlinePrice: spec.inlinePrice }), ...(qty !== undefined ? { quantity: qty } : {}) });
        }
      }
      if (cls) for (const old of existing) if (!used.has(old) && ['base', 'seat', 'usage'].includes(old.role) && old.id) ops.push({ id: old.id, deleted: true, ...(old.metered ? { clearUsage: true } : {}) });
      if (ops.length) await writeSubscription(orgId, rec, ops, proration, `plan:${newPlanId}`);
      return { changed: ops.length > 0, status: await converge(orgId, rec) };
    },

    /** Set the quantity of a role's item (CryptoBlocks' students) on the live subscription. */
    async setQuantity(orgId, role, n, { proration = 'create_prorations' } = {}) {
      needApi();
      if (!['base', 'seat'].includes(role)) throw new BillingError('setQuantity works on a base or seat item.', 'invalid');
      if (!Number.isInteger(n) || n < 0) throw new BillingError('quantity must be a whole number, 0 or more.', 'invalid');
      if (!PRORATIONS.includes(proration)) throw new BillingError(`proration must be one of ${PRORATIONS.join(', ')}.`, 'invalid');
      const { rec, cls } = await liveState(orgId);
      const item = cls?.items.find((i) => i.role === role);
      if (!item?.id) throw new BillingError(`The plan has no ${role} item.`, 'invalid');
      const line = cls.def.lines.find((l) => l.role === role);
      const plan = cls.def.plan;
      const lo = role === 'seat' ? (line?.spec.min ?? 0) : (plan.perSeat ? (plan.minSeats ?? 1) : 1);
      const hi = await capOf(line?.spec.max ?? plan.maxSeats, orgId);
      const target = clampQty(n, lo, hi);
      if (target !== item.quantity) await writeSubscription(orgId, rec, [{ id: item.id, quantity: target }], proration, `qty:${role}:${target}`);
      return { changed: target !== item.quantity, status: await converge(orgId, rec) };
    },

    /** Report metered usage: stored first (de-duplicated by idempotencyKey), then sent; a provider failure stays queued. */
    async reportUsage(orgId, { meter, value, timestamp, idempotencyKey } = {}) {
      needApi();
      if (typeof meter !== 'string' || !meter) throw new BillingError('reportUsage needs a meter name.', 'invalid');
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new BillingError('reportUsage needs a finite value, 0 or more.', 'invalid');
      const ts = timestamp == null ? nowSec() : timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1000) : Number(timestamp) > 1e12 ? Math.floor(Number(timestamp) / 1000) : Math.floor(Number(timestamp));
      if (!Number.isFinite(ts) || ts <= 0) throw new BillingError('timestamp must be a date or epoch time.', 'invalid');
      const key = idempotencyKey == null ? `u-${randomId()}` : String(idempotencyKey);
      if (!key || key.length > 100) throw new BillingError('idempotencyKey must be 1-100 characters.', 'invalid');
      const seen = await store.get(usageKey(key));
      if (seen) return { sent: !!seen.sentAt, queued: !seen.sentAt, duplicate: true };
      const rec = await getRec(orgId);
      if (!rec) throw new BillingError('This organization has no billing account yet.', 'no-customer', 409);
      const entry = { key, orgId, meter, value, timestamp: ts, attempts: 0, at: now(), sentAt: null };
      await store.set(usageKey(key), entry);
      const sent = await sendUsage(entry);
      return { sent, queued: !sent };
    },

    usage: {
      /** Send every queued report, retrying each with doubling back-off. */
      async flush() {
        needApi();
        const retries = usageOpts.retries ?? 3;
        const sleep = usageOpts.sleep ?? sleepMs;
        const out = { sent: 0, failed: 0, pending: 0 };
        for (const k of await store.list('usage/')) {
          const entry = await store.get(k);
          if (!entry || entry.sentAt) continue;
          let ok = false;
          for (let i = 0; i < retries && !ok; i++) {
            if (i) await sleep(200 * 2 ** (i - 1));
            ok = await sendUsage(entry);
          }
          if (ok) out.sent++;
          else {
            out.failed++;
            out.pending++;
          }
        }
        return out;
      },
    },

    /** Seed an org's billing state from a migration (stamp 0, so the next real event applies). The stored record shapes are
     *  internal: this is the way in. Replays are safe (it overwrites the same org's own seed). */
    async adopt(orgId, { customerRef = null, subscriptionRef = null, planId, status, periodEnd = null } = {}) {
      if (!(await knows(orgId))) throw new BillingError('No such organization.', 'no-org', 404);
      if (!plans[planId]) throw new BillingError(`No such plan: ${planId}`, 'plan-not-found');
      if (![...LIVE, 'canceled', 'none'].includes(status)) throw new BillingError(`status must be one of ${[...LIVE, 'canceled', 'none'].join(', ')}.`, 'invalid');
      const endMs = periodEnd == null ? null : periodEnd instanceof Date ? periodEnd.getTime() : Number(periodEnd);
      if (endMs !== null && !Number.isFinite(endMs)) throw new BillingError('periodEnd must be a Date or epoch milliseconds.', 'invalid');
      for (const [what, v] of [['customerRef', customerRef], ['subscriptionRef', subscriptionRef]]) if (v != null && (typeof v !== 'string' || !v)) throw new BillingError(`${what} must be a string.`, 'invalid');
      if (customerRef) {
        const linked = await store.get(customerKey(customerRef));
        if (linked && linked !== orgId) throw new BillingError('That customer is already linked to another organization.', 'conflict', 409);
      }
      const rec = await getRec(orgId);
      const next = {
        orgId, customerId: customerRef, subscriptionId: subscriptionRef, subCreated: null, plan: planId, status, seats: await seatCount(planId, { quantity: 1 }, orgId),
        currentPeriodEnd: endMs, cancelAtPeriodEnd: false, endsAt: null, trialEndsAt: null, portalUrl: null, items: [],
        pastDueSince: status === 'past_due' ? now() : null, stamp: 0,
      };
      await commit(orgId, rec ?? null, next, { plan: planId, status: status === 'none' ? 'incomplete' : status, billing: { customerId: customerRef, subscriptionId: subscriptionRef } });
      if (entitlements?.onChange) await store.set(orgKey(orgId), { ...next, mirrored: statusOf(next, true) }); // the app already has this state
      if (subscriptionRef) await store.set(subKey(subscriptionRef), orgId);
      if (customerRef) await store.set(customerKey(customerRef), orgId);
      return statusOf(next, true);
    },

    /** Link an org to what was bought before it existed: replay events held for that email, exactly once. */
    async claim(orgId, { email } = {}) {
      if (typeof email !== 'string' || !email.includes('@')) throw new BillingError('claim needs the buyer email.', 'invalid');
      if (!(await knows(orgId))) throw new BillingError('No such organization.', 'no-org', 404);
      const e = email.trim().toLowerCase();
      const customers = new Set();
      for (const k of await store.list('held/')) {
        const h = await store.get(k);
        if (h?.email === e && h.customerRef) customers.add(h.customerRef);
      }
      for (const c of customers) if (!(await store.get(customerKey(c)))) await store.set(customerKey(c), orgId);
      const events = await replayHeld((h) => h.email === e || (h.customerRef && customers.has(h.customerRef)), orgId, { trusted: true }); // the app vouched for this org
      return { claimed: events.length, events };
    },

    /** Pull: ask the provider about this org and apply it the way the webhook would. For servers it can't reach. */
    async sync(orgId) {
      needApi();
      const rec = await getRec(orgId);
      const pending = await getPending(orgId);
      const applied = [];
      const stamp = nowSec();
      const open = [];
      for (const entry of pending) {
        if (await store.get(sessionKey(entry.id))) continue;
        const order = await provider.fetchCheckout(entry, ctx());
        const r = await applyOrder(order, stamp, { alsoKey: entry.id, org: orgId, trusted: true }); // a checkout billing created
        if (r.handled) applied.push({ session: entry.id, ...r });
        const stale = entry.at != null && now() - entry.at > 7 * DAY;
        if (!r.handled && !r.duplicate && !order?.expired && !stale) open.push(entry); // still waiting for payment
      }
      if (open.length !== pending.length) await store.set(pendingKey(orgId), packPending(open));
      const fresh = (await getRec(orgId)) ?? rec;
      if (fresh?.subscriptionId) {
        const r = await applySubscription(await provider.fetchSubscription(fresh.subscriptionId, ctx()), stamp, { hint: orgId, trusted: true });
        if (r.handled || r.periodGranted) applied.push({ subscription: fresh.subscriptionId, ...r });
      }
      return { status: await api.status(orgId), applied };
    },

    /** Sync every org that has billing state. A failing org is reported, not thrown. */
    async syncAll() {
      needApi();
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

    /** The return-from-checkout page: don't trust the URL, ask the provider about the checkout. */
    async confirm(orgId, sessionId) {
      needApi();
      const pending = await getPending(orgId);
      const entry = pending.find((e) => e.id === sessionId) ?? { id: sessionId };
      if (!pending.some((e) => e.id === sessionId)) {
        const done = await store.get(sessionKey(sessionId)); // already applied (by sync or the webhook) for this org
        if (done?.orgId === orgId) return { status: await api.status(orgId), applied: true };
      }
      const order = await provider.fetchCheckout(entry, ctx());
      if (!order) {
        if (pending.some((e) => e.id === sessionId)) return { status: await api.status(orgId), applied: false }; // not paid / not visible yet
        throw new BillingError('That checkout belongs to another organization.', 'wrong-org', 403);
      }
      const ours = order.orgId != null ? refToOrg(order.orgId) === orgId : pending.some((e) => e.id === sessionId);
      if (!ours) throw new BillingError('That checkout belongs to another organization.', 'wrong-org', 403);
      const r = await applyOrder(order, nowSec(), { alsoKey: sessionId, org: orgId, trusted: pending.some((e) => e.id === sessionId) });
      return { status: await api.status(orgId), applied: r.handled || !!r.duplicate };
    },

    async status(orgId, { detail = false } = {}) {
      return statusOf(await getRec(orgId), detail);
    },

    async canUse(orgId) {
      const rec = await getRec(orgId);
      if (!rec) return false;
      if (rec.status === 'trialing' || rec.status === 'active') return true;
      if (rec.status === 'past_due') {
        if (!(await graceOver(rec))) return true;
        // Tell seats too, so seats.access() blocks without the app having to ask billing
        const org = seats && (await seats.getOrg(orgId));
        if (org && org.status === 'past_due') await seats.updateOrg(orgId, { status: 'unpaid' });
      }
      return false;
    },
  };
  return api;
}
