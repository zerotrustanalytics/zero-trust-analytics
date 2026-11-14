// billing-config: one declarative file (billing.config.ts) that drives every billing service.
//   defineBilling(config)                  validate + freeze; errors name the exact field
//   env(name, fallback?)                   a lazy environment reference: resolved at first use, never at import or build
//   createBillingFromConfig(def, { store, auth, ... })   createBilling + billingRoutes + canUse(orgId, feature), all from the config
// Contract: docs/billing/CONTRACT.md "Billing as config". Plain ESM on Web Crypto; no dependencies.
import { createBilling, createStripeRest, createLemonSqueezy, BillingError, STRIPE_WEBHOOK_EVENTS, LEMONSQUEEZY_WEBHOOK_EVENTS, deepMerge } from './billing.js';
import { billingRoutes } from './billing-http.js';

/** The events a webhook endpoint must subscribe to, per provider (derived from what billing.js handles). */
export const REQUIRED_EVENTS = Object.freeze({ stripe: STRIPE_WEBHOOK_EVENTS, lemonsqueezy: LEMONSQUEEZY_WEBHOOK_EVENTS });

export class BillingConfigError extends Error {
  constructor(message, code = 'invalid-config') {
    super(message);
    this.name = 'BillingConfigError';
    this.code = code;
  }
}

const ENV = Symbol.for('launchkit.env');
const DEF = Symbol.for('launchkit.billing-definition');
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A lazy environment reference. `env('PRODUCT_PRO')` is resolved when billing is first built, not when the file is imported. */
export function env(name, fallback) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new BillingConfigError(`env(): the variable name must look like PRODUCT_PRO, got ${JSON.stringify(name)}`);
  if (fallback !== undefined && typeof fallback !== 'string') throw new BillingConfigError(`env("${name}"): the fallback must be a string`);
  return Object.freeze({ [ENV]: true, name, fallback });
}
/** A lazy list: `env.list('STRIPE_PRO_PRICES')` resolves to an array (comma or whitespace separated); unset is [], never an error. */
env.list = (name, fallback) => {
  const r = env(name, fallback);
  return Object.freeze({ [ENV]: true, name: r.name, fallback: r.fallback, list: true });
};
export const isEnv = (v) => !!v && typeof v === 'object' && v[ENV] === true;
const processEnv = () => globalThis.process?.env ?? {};
const splitList = (v) => String(v ?? '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

/** A literal passes through; an env reference becomes its value, else its fallback, else a clear error. A list becomes an array. */
export function resolveEnv(v, source = processEnv(), where = '') {
  if (!isEnv(v)) return v;
  const got = source?.[v.name];
  if (v.list) return splitList(typeof got === 'string' && got !== '' ? got : v.fallback);
  if (typeof got === 'string' && got !== '') return got;
  if (v.fallback !== undefined) return v.fallback;
  throw new BillingConfigError(`${where ? `${where}: ` : ''}environment variable ${v.name} is not set. Set it in your environment or .env${/^(PRODUCT|PRICE|VARIANT)_/.test(v.name) ? ' (run `launchkit billing sync` to create it)' : ''}.`, 'missing-env');
}
/** Like resolveEnv but a missing variable is `undefined` instead of an error (what sync and doctor use). */
export const tryEnv = (v, source) => {
  try {
    return resolveEnv(v, source);
  } catch {
    return undefined;
  }
};

// ---- naming conventions (shared with `launchkit billing sync`) -------------------------------------------------------
export const lookupKeyFor = (plan, interval) => `lk_${plan}_${interval}`; // interval: 'monthly' | 'yearly' | 'usage' | 'seat'
export const variantEnvName = (plan, interval) => `VARIANT_${plan}_${interval}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export const itemLookupKey = (id) => `lk_item_${id}`;
/** The lookup key of one of a plan's prices: the key the config gives (used as given), else lk_<plan>_<kind>. */
export const priceKey = (plan, kind) => plan.lookupKeys?.[kind] ?? lookupKeyFor(plan.key, kind);

// ---- validation ------------------------------------------------------------------------------------------------------
const PLAN_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{1,200}$/;
const PLAN_FIELDS = [
  'name', 'product', 'price', 'priceId', 'usage', 'features', 'highlight', 'trialDays', 'perSeat', 'seats',
  'lookupKeys', 'productName', 'priceIds', 'match', 'matchProduct', 'matchMetadata', 'adoptPrices', 'credits', 'meta', 'variantName',
];
const ITEM_FIELDS = ['name', 'product', 'productName', 'price', 'priceId', 'lookupKey', 'credits', 'meta', 'match', 'adoptPrices'];
const TOP_FIELDS = ['provider', 'plans', 'features', 'currency', 'onChange', 'items', 'mode', 'storeId', 'apiVersion', 'webhook', 'portal', 'hooks', 'graceMs', 'checkout'];
const HOOK_FIELDS = ['onPeriod', 'onPurchase', 'onEvent', 'onUnclaimed', 'canBind', 'onConflict', 'orgExists', 'parseReference', 'entitlements'];
const fail = (path, why) => {
  throw new BillingConfigError(`billing.config: ${path} ${why}`);
};
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : isEnv(v) ? `env(${v.name})` : typeof v === 'function' ? 'a function' : JSON.stringify(v) ?? String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !isEnv(v);
const money = (path, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(path, `must be a number of major units (29 means $29), got ${show(v)}`);
  if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) fail(path, `has more than 2 decimals (${v}); amounts are major units with cents at most`);
  return v;
};
const unknownKeys = (obj, allowed, path) => {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(`${path ? `${path}.` : ''}${k}`, `is not a known field. Allowed: ${allowed.join(', ')}`);
};
const idRef = (path, v) => {
  if (!(isEnv(v) || (typeof v === 'string' && v))) fail(path, `must be env('NAME') or a non-empty string id, got ${show(v)}`);
  return v;
};
const lookupKeyOf = (path, v) => {
  if (!(typeof v === 'string' && KEY_RE.test(v))) fail(path, `must be a lookup key of letters, digits and _ . : - (max 200), got ${show(v)}`);
  return v;
};
/** A price: 29, or { amount: 29, lookupKey?, id? } -> { amount, lookupKey?, id? } */
const priceEntry = (path, v) => {
  if (!isObj(v)) return { amount: money(path, v) };
  unknownKeys(v, ['amount', 'lookupKey', 'id'], path);
  const out = { amount: money(`${path}.amount`, v.amount) };
  if (v.lookupKey !== undefined) out.lookupKey = lookupKeyOf(`${path}.lookupKey`, v.lookupKey);
  if (v.id !== undefined) out.id = idRef(`${path}.id`, v.id);
  return out;
};
const bool = (path, v) => {
  if (typeof v !== 'boolean') fail(path, `must be true or false, got ${show(v)}`);
  return v;
};
const matchFields = (at, p) => {
  const out = {};
  if (p.match !== undefined) {
    if (typeof p.match !== 'function') fail(`${at}.match`, `must be a function (item, { env }) => boolean, got ${show(p.match)}`);
    out.match = p.match;
  }
  if (p.adoptPrices !== undefined) out.adoptPrices = bool(`${at}.adoptPrices`, p.adoptPrices);
  if (p.credits !== undefined) {
    if (typeof p.credits !== 'number' || !Number.isFinite(p.credits) || p.credits < 0) fail(`${at}.credits`, `must be a number of at least 0, got ${show(p.credits)}`);
    out.credits = p.credits;
  }
  if (p.meta !== undefined) {
    if (!isObj(p.meta)) fail(`${at}.meta`, `must be an object, got ${show(p.meta)}`);
    out.meta = Object.freeze({ ...p.meta });
  }
  if (p.productName !== undefined) {
    if (typeof p.productName !== 'string' || !p.productName.trim()) fail(`${at}.productName`, `must be a non-empty string, got ${show(p.productName)}`);
    out.productName = p.productName;
  }
  return out;
};
const tiersOf = (at, list) => {
  if (!Array.isArray(list) || !list.length) fail(`${at}.tiers`, `must be a non-empty array of { upTo, unitAmount?, flatAmount? }, got ${show(list)}`);
  let last = 0;
  return list.map((t, i) => {
    const w = `${at}.tiers[${i}]`;
    if (!isObj(t)) fail(w, `must be { upTo, unitAmount?, flatAmount? }, got ${show(t)}`);
    unknownKeys(t, ['upTo', 'unitAmount', 'flatAmount'], w);
    const inf = t.upTo === 'inf' || t.upTo === Infinity;
    if (!inf && !(Number.isInteger(t.upTo) && t.upTo > last)) fail(`${w}.upTo`, `must be a whole number above the previous tier (${last}) or 'inf', got ${show(t.upTo)}`);
    if (inf && i !== list.length - 1) fail(`${w}.upTo`, `'inf' must be the last tier`);
    if (!inf && i === list.length - 1) fail(`${w}.upTo`, `the last tier must be 'inf'`);
    if (!inf) last = t.upTo;
    if (t.unitAmount !== undefined && (typeof t.unitAmount !== 'number' || !Number.isFinite(t.unitAmount) || t.unitAmount < 0)) fail(`${w}.unitAmount`, `must be a number of major units per unit (0.02 is two cents), got ${show(t.unitAmount)}`);
    if (t.flatAmount !== undefined) money(`${w}.flatAmount`, t.flatAmount);
    if (t.unitAmount === undefined && t.flatAmount === undefined) fail(w, `needs unitAmount or flatAmount`);
    return Object.freeze({ upTo: inf ? 'inf' : t.upTo, ...(t.unitAmount !== undefined ? { unitAmount: t.unitAmount } : {}), ...(t.flatAmount !== undefined ? { flatAmount: t.flatAmount } : {}) });
  });
};

export function defineBilling(config) {
  if (!isObj(config)) fail('(root)', `must be an object passed to defineBilling, got ${show(config)}`);
  unknownKeys(config, TOP_FIELDS, '');
  let provider = config.provider ?? 'stripe';
  if (!isEnv(provider) && !['stripe', 'lemonsqueezy'].includes(provider)) fail('provider', `must be 'stripe', 'lemonsqueezy' or env('BILLING_PROVIDER', 'stripe'), got ${show(provider)}`);
  if (isEnv(provider) && provider.fallback !== undefined && !['stripe', 'lemonsqueezy'].includes(provider.fallback)) fail('provider', `fallback must be 'stripe' or 'lemonsqueezy', got ${show(provider.fallback)}`);
  const currency = config.currency ?? 'usd';
  if (typeof currency !== 'string' || !/^[a-zA-Z]{3}$/.test(currency)) fail('currency', `must be a 3-letter ISO code like 'usd', got ${show(config.currency)}`);
  if (config.onChange !== undefined && typeof config.onChange !== 'function') fail('onChange', `must be a function, got ${show(config.onChange)}`);
  const mode = config.mode ?? 'api';
  if (!['api', 'webhook-only', 'auto'].includes(mode)) fail('mode', `must be 'api', 'webhook-only' or 'auto', got ${show(config.mode)}`);
  if (config.storeId !== undefined && !(isEnv(config.storeId) || typeof config.storeId === 'number' || (typeof config.storeId === 'string' && config.storeId))) fail('storeId', `must be a number, a string or env('LEMONSQUEEZY_STORE_ID'), got ${show(config.storeId)}`);
  if (config.apiVersion !== undefined && !(isEnv(config.apiVersion) || (typeof config.apiVersion === 'string' && config.apiVersion))) fail('apiVersion', `must be a string or env(...), got ${show(config.apiVersion)}`);
  let webhook = {};
  if (config.webhook !== undefined) {
    if (!isObj(config.webhook)) fail('webhook', `must be { path?, extraEvents? }, got ${show(config.webhook)}`);
    unknownKeys(config.webhook, ['path', 'extraEvents'], 'webhook');
    if (config.webhook.path !== undefined && !(typeof config.webhook.path === 'string' && /^\/[A-Za-z0-9_\-./]*$/.test(config.webhook.path))) fail('webhook.path', `must be a path like /api/stripe/webhook, got ${show(config.webhook.path)}`);
    if (config.webhook.extraEvents !== undefined && (!Array.isArray(config.webhook.extraEvents) || config.webhook.extraEvents.some((e) => typeof e !== 'string' || !e))) fail('webhook.extraEvents', `must be an array of event names, got ${show(config.webhook.extraEvents)}`);
    webhook = Object.freeze({ ...(config.webhook.path ? { path: config.webhook.path } : {}), ...(config.webhook.extraEvents ? { extraEvents: Object.freeze([...config.webhook.extraEvents]) } : {}) });
  }
  if (config.portal !== undefined) bool('portal', config.portal);
  if (config.graceMs !== undefined && (typeof config.graceMs !== 'number' || !Number.isFinite(config.graceMs) || config.graceMs < 0)) fail('graceMs', `must be a number of milliseconds, got ${show(config.graceMs)}`);
  let hooks;
  if (config.hooks !== undefined) {
    if (!isObj(config.hooks)) fail('hooks', `must be an object of functions, got ${show(config.hooks)}`);
    unknownKeys(config.hooks, HOOK_FIELDS, 'hooks');
    hooks = {};
    for (const [k, v] of Object.entries(config.hooks)) {
      if (k === 'entitlements') {
        if (!isObj(v) || (v.onChange !== undefined && typeof v.onChange !== 'function')) fail('hooks.entitlements', `must be { onChange?: function }, got ${show(v)}`);
        hooks[k] = Object.freeze({ ...v });
      } else {
        if (typeof v !== 'function') fail(`hooks.${k}`, `must be a function, got ${show(v)}`);
        hooks[k] = v;
      }
    }
    hooks = Object.freeze(hooks);
  }
  let checkout;
  if (config.checkout !== undefined) {
    if (!isObj(config.checkout)) fail('checkout', `must be { extra? }, got ${show(config.checkout)}`);
    unknownKeys(config.checkout, ['extra'], 'checkout');
    if (config.checkout.extra !== undefined && !(isObj(config.checkout.extra) || typeof config.checkout.extra === 'function')) fail('checkout.extra', `must be an object or a function (ctx) => object, got ${show(config.checkout.extra)}`);
    checkout = Object.freeze({ ...config.checkout });
  }
  if (config.plans !== undefined && !isObj(config.plans)) fail('plans', 'must be an object with at least one plan');
  if (!Object.keys(config.plans ?? {}).length && !(isObj(config.items) && Object.keys(config.items).length)) fail('plans', 'must be an object with at least one plan (or `items` for a one-time-purchase app)');
  const usedKeys = new Map();
  const claimKey = (path, key) => {
    if (usedKeys.has(key)) fail(path, `lookup key ${show(key)} is already used by ${usedKeys.get(key)}; a key belongs to one price`);
    usedKeys.set(key, path);
  };

  const plans = {};
  for (const [key, p] of Object.entries(config.plans ?? {})) {
    const at = `plans.${key}`;
    if (!PLAN_KEY.test(key)) fail(at, `has an illegal id: use letters, digits, - and _, starting with a letter (max 40)`);
    if (/_(yearly|monthly|usage)$/i.test(key)) fail(at, `ends in _yearly/_monthly/_usage, which billing reserves for the price of a plan`);
    if (!isObj(p)) fail(at, `must be an object, got ${show(p)}`);
    unknownKeys(p, PLAN_FIELDS, at);
    if (typeof p.name !== 'string' || !p.name.trim()) fail(`${at}.name`, `is required (the text the pricing UI shows), got ${show(p.name)}`);
    if (p.product !== undefined) idRef(`${at}.product`, p.product);
    const extra = matchFields(at, p);
    const keys = {};
    const ids = {};
    const price = {};
    if (p.price !== undefined) {
      if (!isObj(p.price)) fail(`${at}.price`, `must be { monthly?, yearly? }, got ${show(p.price)}`);
      unknownKeys(p.price, ['monthly', 'yearly'], `${at}.price`);
      for (const k of ['monthly', 'yearly']) {
        if (p.price[k] === undefined) continue;
        const e = priceEntry(`${at}.price.${k}`, p.price[k]);
        price[k] = e.amount;
        if (e.lookupKey) keys[k] = e.lookupKey;
        if (e.id) ids[k] = e.id;
      }
    }
    if (p.lookupKeys !== undefined) {
      if (!isObj(p.lookupKeys)) fail(`${at}.lookupKeys`, `must be { monthly?, yearly?, usage?, seat? }, got ${show(p.lookupKeys)}`);
      unknownKeys(p.lookupKeys, ['monthly', 'yearly', 'usage', 'seat'], `${at}.lookupKeys`);
      for (const [k, v] of Object.entries(p.lookupKeys)) {
        lookupKeyOf(`${at}.lookupKeys.${k}`, v);
        if (keys[k] !== undefined && keys[k] !== v) fail(`${at}.lookupKeys.${k}`, `(${show(v)}) disagrees with the lookupKey given in price (${show(keys[k])})`);
        keys[k] = v;
      }
    }
    let usage;
    if (p.usage !== undefined) {
      if (!isObj(p.usage)) fail(`${at}.usage`, `must be { meter, unitPrice | tiers, base? }, got ${show(p.usage)}`);
      const u = p.usage;
      unknownKeys(u, ['meter', 'unitPrice', 'tiers', 'tiersMode', 'base', 'aggregation', 'alias', 'displayName', 'lookupKey'], `${at}.usage`);
      if (!(isEnv(u.meter) || (typeof u.meter === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(u.meter)))) fail(`${at}.usage.meter`, `must be a meter name like 'api_calls' (or env(...)), got ${show(u.meter)}`);
      if ((u.unitPrice === undefined) === (u.tiers === undefined)) fail(`${at}.usage`, `needs exactly one of unitPrice (a flat price per unit) or tiers (graduated or volume)`);
      if (u.unitPrice !== undefined && (typeof u.unitPrice !== 'number' || !(u.unitPrice > 0) || !Number.isFinite(u.unitPrice))) fail(`${at}.usage.unitPrice`, `must be a positive number (major units per unit, 0.002 is a fifth of a cent), got ${show(u.unitPrice)}`);
      const tiers = u.tiers !== undefined ? tiersOf(`${at}.usage`, u.tiers) : undefined;
      if (u.tiersMode !== undefined && (!tiers || !['graduated', 'volume'].includes(u.tiersMode))) fail(`${at}.usage.tiersMode`, `must be 'graduated' or 'volume' and needs tiers, got ${show(u.tiersMode)}`);
      if (u.aggregation !== undefined && !['sum', 'last', 'max'].includes(u.aggregation)) fail(`${at}.usage.aggregation`, `must be 'sum', 'last' or 'max', got ${show(u.aggregation)}`);
      if (u.alias !== undefined && !(typeof u.alias === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(u.alias))) fail(`${at}.usage.alias`, `must be a name like 'mau', got ${show(u.alias)}`);
      if (u.displayName !== undefined && !(typeof u.displayName === 'string' && u.displayName)) fail(`${at}.usage.displayName`, `must be a non-empty string, got ${show(u.displayName)}`);
      let base;
      if (u.base !== undefined) {
        const e = priceEntry(`${at}.usage.base`, u.base);
        base = e.amount;
        if (e.lookupKey) keys.monthly = e.lookupKey;
        if (e.id) ids.monthly = e.id;
      }
      if (u.lookupKey !== undefined) keys.usage = lookupKeyOf(`${at}.usage.lookupKey`, u.lookupKey);
      if (Object.keys(price).length) fail(`${at}.price`, `cannot be combined with usage: put the flat monthly fee in usage.base`);
      usage = {
        meter: u.meter, ...(u.unitPrice !== undefined ? { unitPrice: u.unitPrice } : {}), ...(tiers ? { tiers: Object.freeze(tiers), tiersMode: u.tiersMode ?? 'graduated' } : {}),
        aggregation: u.aggregation ?? 'sum', ...(u.alias ? { alias: u.alias } : {}), ...(u.displayName ? { displayName: u.displayName } : {}), ...(base ? { base } : {}),
      };
    }
    let priceIds;
    if (p.priceIds !== undefined) {
      if (!(isEnv(p.priceIds) || (Array.isArray(p.priceIds) && p.priceIds.every((x) => typeof x === 'string' && x)))) fail(`${at}.priceIds`, `must be env.list('NAME') or an array of price ids, got ${show(p.priceIds)}`);
      priceIds = isEnv(p.priceIds) ? p.priceIds : Object.freeze([...p.priceIds]);
    }
    let matchMetadata;
    if (p.matchMetadata !== undefined) {
      if (!isObj(p.matchMetadata) || !Object.keys(p.matchMetadata).length || Object.values(p.matchMetadata).some((v) => typeof v !== 'string')) fail(`${at}.matchMetadata`, `must be { key: 'value' } of strings, got ${show(p.matchMetadata)}`);
      matchMetadata = Object.freeze({ ...p.matchMetadata });
    }
    if (p.matchProduct !== undefined) bool(`${at}.matchProduct`, p.matchProduct);
    const identified = !!(priceIds || extra.match || matchMetadata);
    if (!usage && !Object.keys(price).length && !identified) fail(`${at}.price`, `is required: { monthly?, yearly? } (or usage for a metered plan, or priceIds / match / matchMetadata for a plan that is identified but not sold)`);
    let priceId;
    if (p.priceId !== undefined || Object.keys(ids).length) {
      if (p.priceId !== undefined && !isObj(p.priceId)) fail(`${at}.priceId`, `must be { monthly?, yearly? } of env('NAME') or ids, got ${show(p.priceId)}`);
      if (p.priceId) unknownKeys(p.priceId, ['monthly', 'yearly'], `${at}.priceId`);
      priceId = {};
      for (const k of ['monthly', 'yearly']) {
        if (p.priceId?.[k] === undefined && ids[k] === undefined) continue;
        if (price[k] === undefined && !(k === 'monthly' && usage?.base)) fail(`${at}.priceId.${k}`, `has no matching ${at}.price.${k}`);
        if (p.priceId?.[k] !== undefined && ids[k] !== undefined) fail(`${at}.priceId.${k}`, `is given twice (priceId and price.${k}.id)`);
        priceId[k] = idRef(`${at}.priceId.${k}`, p.priceId?.[k] ?? ids[k]);
      }
    }
    if (p.variantName !== undefined) {
      if (!isObj(p.variantName)) fail(`${at}.variantName`, `must be { monthly?, yearly? } of variant names, got ${show(p.variantName)}`);
      unknownKeys(p.variantName, ['monthly', 'yearly'], `${at}.variantName`);
      for (const [k, v] of Object.entries(p.variantName)) if (typeof v !== 'string' || !v) fail(`${at}.variantName.${k}`, `must be a name, got ${show(v)}`);
    }
    if (p.features !== undefined && (!Array.isArray(p.features) || p.features.some((f) => typeof f !== 'string'))) fail(`${at}.features`, `must be an array of strings, got ${show(p.features)}`);
    if (p.highlight !== undefined && typeof p.highlight !== 'boolean') fail(`${at}.highlight`, `must be true or false, got ${show(p.highlight)}`);
    if (p.trialDays !== undefined && (!Number.isInteger(p.trialDays) || p.trialDays < 1 || p.trialDays > 730)) fail(`${at}.trialDays`, `must be a whole number of days from 1 to 730, got ${show(p.trialDays)}`);
    let perSeat = false;
    let seat;
    if (p.perSeat !== undefined) {
      if (isObj(p.perSeat)) {
        const s = p.perSeat;
        unknownKeys(s, ['price', 'product', 'productName', 'quantity', 'lookupKey', 'id'], `${at}.perSeat`);
        if (s.productName !== undefined && !(typeof s.productName === 'string' && s.productName)) fail(`${at}.perSeat.productName`, `must be a non-empty string, got ${show(s.productName)}`);
        if (s.price === undefined) fail(`${at}.perSeat.price`, `is required for a separate seat price (a number or { amount, lookupKey?, id? }); use perSeat: true to sell the base price per seat`);
        const e = priceEntry(`${at}.perSeat.price`, s.price);
        if (s.product !== undefined) idRef(`${at}.perSeat.product`, s.product);
        if (s.quantity !== undefined && !(Number.isInteger(s.quantity) && s.quantity >= 0)) fail(`${at}.perSeat.quantity`, `must be a whole number of at least 0, got ${show(s.quantity)}`);
        const lk = e.lookupKey ?? (s.lookupKey !== undefined ? lookupKeyOf(`${at}.perSeat.lookupKey`, s.lookupKey) : undefined);
        if (lk) keys.seat = lk;
        else if (keys.seat) { /* from lookupKeys.seat */ }
        seat = { amount: e.amount, quantity: s.quantity ?? 0, ...(s.product !== undefined ? { product: s.product } : {}), ...(s.productName ? { productName: s.productName } : {}), ...(e.id ?? s.id ? { id: idRef(`${at}.perSeat.id`, e.id ?? s.id) } : {}) };
        perSeat = true;
      } else perSeat = bool(`${at}.perSeat`, p.perSeat);
    }
    let seats;
    if (p.seats !== undefined) {
      if (!perSeat) fail(`${at}.seats`, `needs perSeat: true`);
      if (!isObj(p.seats)) fail(`${at}.seats`, `must be { min?, max? }, got ${show(p.seats)}`);
      unknownKeys(p.seats, ['min', 'max'], `${at}.seats`);
      if (p.seats.min !== undefined && (!Number.isInteger(p.seats.min) || p.seats.min < 1)) fail(`${at}.seats.min`, `must be a whole number of at least 1, got ${show(p.seats.min)}`);
      if (p.seats.max !== undefined && typeof p.seats.max !== 'function' && (!Number.isInteger(p.seats.max) || p.seats.max < 1)) fail(`${at}.seats.max`, `must be a whole number of at least 1 or a function (orgId) => number, got ${show(p.seats.max)}`);
      if (typeof p.seats.min === 'number' && typeof p.seats.max === 'number' && p.seats.max < p.seats.min) fail(`${at}.seats.max`, `(${p.seats.max}) is below seats.min (${p.seats.min})`);
      seats = { ...p.seats };
    }
    for (const [k, v] of Object.entries(keys)) claimKey(`${at}.lookupKeys.${k}`, v);
    plans[key] = Object.freeze({
      key, name: p.name, ...(p.product !== undefined ? { product: p.product } : {}), price: Object.freeze(price), ...(priceId ? { priceId: Object.freeze(priceId) } : {}),
      ...(usage ? { usage: Object.freeze(usage) } : {}), features: Object.freeze([...(p.features ?? [])]), highlight: !!p.highlight,
      ...(p.trialDays ? { trialDays: p.trialDays } : {}), perSeat, ...(seat ? { seat: Object.freeze(seat) } : {}), ...(seats ? { seats: Object.freeze(seats) } : {}),
      ...(Object.keys(keys).length ? { lookupKeys: Object.freeze(keys) } : {}), ...(priceIds ? { priceIds } : {}), ...(matchMetadata ? { matchMetadata } : {}),
      matchProduct: p.matchProduct !== false, adoptPrices: extra.adoptPrices !== false, ...(p.variantName ? { variantName: Object.freeze({ ...p.variantName }) } : {}),
      ...(extra.match ? { match: extra.match } : {}), ...(extra.credits !== undefined ? { credits: extra.credits } : {}), ...(extra.meta ? { meta: extra.meta } : {}), ...(extra.productName ? { productName: extra.productName } : {}),
    });
  }

  const items = {};
  if (config.items !== undefined) {
    if (!isObj(config.items)) fail('items', `must be { itemId: { name, price, ... } }, got ${show(config.items)}`);
    for (const [id, it] of Object.entries(config.items)) {
      const at = `items.${id}`;
      if (!PLAN_KEY.test(id)) fail(at, `has an illegal id: use letters, digits, - and _, starting with a letter (max 40)`);
      if (!isObj(it)) fail(at, `must be an object, got ${show(it)}`);
      unknownKeys(it, ITEM_FIELDS, at);
      if (typeof it.name !== 'string' || !it.name.trim()) fail(`${at}.name`, `is required, got ${show(it.name)}`);
      if (it.product !== undefined) idRef(`${at}.product`, it.product);
      if (it.price === undefined) fail(`${at}.price`, `is required: an amount in major units (12 is $12) or { amount, lookupKey?, id? }`);
      const e = priceEntry(`${at}.price`, it.price);
      const lk = e.lookupKey ?? (it.lookupKey !== undefined ? lookupKeyOf(`${at}.lookupKey`, it.lookupKey) : undefined);
      if (e.lookupKey && it.lookupKey !== undefined && it.lookupKey !== e.lookupKey) fail(`${at}.lookupKey`, `disagrees with price.lookupKey`);
      const ref = it.priceId !== undefined ? idRef(`${at}.priceId`, it.priceId) : e.id;
      if (it.priceId !== undefined && e.id !== undefined) fail(`${at}.priceId`, `is given twice (priceId and price.id)`);
      const extra = matchFields(at, it);
      claimKey(`${at}.lookupKey`, lk ?? itemLookupKey(id));
      items[id] = Object.freeze({
        id, name: it.name, ...(it.product !== undefined ? { product: it.product } : {}), amount: e.amount, lookupKey: lk ?? itemLookupKey(id), ...(ref ? { priceId: ref } : {}),
        adoptPrices: extra.adoptPrices !== false, ...(extra.match ? { match: extra.match } : {}), ...(extra.credits !== undefined ? { credits: extra.credits } : {}), ...(extra.meta ? { meta: extra.meta } : {}), ...(extra.productName ? { productName: extra.productName } : {}),
      });
    }
  }
  // the implicit lk_<plan>_<kind> keys must not collide with a key the config gives another price
  for (const p of Object.values(plans)) {
    for (const k of ['monthly', 'yearly']) if (!p.lookupKeys?.[k] && usedKeys.has(lookupKeyFor(p.key, k))) fail(`plans.${p.key}`, `would use the lookup key ${lookupKeyFor(p.key, k)}, which ${usedKeys.get(lookupKeyFor(p.key, k))} already uses`);
  }

  const features = {};
  if (config.features !== undefined) {
    if (!isObj(config.features)) fail('features', `must be { featureName: [planIds] }, got ${show(config.features)}`);
    for (const [f, list] of Object.entries(config.features)) {
      if (!Array.isArray(list)) fail(`features.${f}`, `must be an array of plan ids, got ${show(list)}`);
      for (const id of list) if (!(typeof id === 'string' && Object.hasOwn(plans, id))) fail(`features.${f}`, `names the plan ${show(id)}, which is not in plans (${Object.keys(plans).join(', ')})`);
      features[f] = Object.freeze([...list]);
    }
  }
  return Object.freeze({
    [DEF]: true, provider, mode, currency: currency.toLowerCase(), plans: Object.freeze(plans), items: Object.freeze(items), features: Object.freeze(features),
    ...(config.storeId !== undefined ? { storeId: config.storeId } : {}), ...(config.apiVersion !== undefined ? { apiVersion: config.apiVersion } : {}),
    webhook, portal: config.portal !== false, ...(hooks ? { hooks } : {}), ...(config.graceMs !== undefined ? { graceMs: config.graceMs } : {}), ...(checkout ? { checkout } : {}),
    ...(config.onChange ? { onChange: config.onChange } : {}),
  });
}
export const isDefinition = (d) => !!d && d[DEF] === true;

/** Every sellable plan price a config declares, in order: { id, plan, interval, kind, amount, lookupKey, ... }. `id` is the billing plan id. */
export function sellables(def) {
  const out = [];
  for (const p of Object.values(def.plans)) {
    const monthlyAmount = p.usage ? p.usage.base : p.price.monthly;
    const priceless = !p.usage && !Object.keys(p.price).length; // identified by priceIds / match, not sold
    if (monthlyAmount !== undefined || p.usage || priceless) {
      out.push({ id: p.key, plan: p.key, kind: 'monthly', interval: 'month', amount: monthlyAmount, lookupKey: priceKey(p, 'monthly'), flat: monthlyAmount !== undefined, ...(priceless ? { priceless: true } : {}) });
    }
    if (p.price.yearly !== undefined) out.push({ id: out.some((s) => s.plan === p.key) ? `${p.key}_yearly` : p.key, plan: p.key, kind: 'yearly', interval: 'year', amount: p.price.yearly, lookupKey: priceKey(p, 'yearly'), flat: true });
  }
  return out;
}
/** The separate seat prices (`perSeat: { price }`): { plan, kind: 'seat', interval, amount, lookupKey, quantity }. */
export function seatPrices(def) {
  return Object.values(def.plans).filter((p) => p.seat).map((p) => ({ plan: p.key, kind: 'seat', interval: p.price.monthly !== undefined || p.usage ? 'month' : 'year', amount: p.seat.amount, lookupKey: priceKey(p, 'seat'), quantity: p.seat.quantity }));
}
/** The one-time items: { id, kind: 'item', amount, lookupKey }. */
export const itemPrices = (def) => Object.values(def.items ?? {}).map((it) => ({ id: it.id, kind: 'item', interval: null, amount: it.amount, lookupKey: it.lookupKey }));
export const usageLookupKey = (plan) => lookupKeyFor(plan, 'usage');
/** The unit price of a usage plan in cents as a decimal string: 0.002 -> "0.2". */
export const centsDecimal = (major) => String(Number((major * 100).toFixed(8)));
export const cents = (major) => Math.round(major * 100);

// ---- createBillingFromConfig ------------------------------------------------------------------------------------------
const needDef = (def) => {
  if (!isDefinition(def)) throw new BillingConfigError('createBillingFromConfig needs the value defineBilling() returned', 'invalid-config');
};
const HOOK_NAMES = HOOK_FIELDS.filter((h) => h !== 'entitlements');

function buildProvider(name, source, def, { fetch: fetchImpl } = {}) {
  const need = (n) => resolveEnv(env(n), source, `provider ${name}`);
  const withFetch = fetchImpl ? { fetch: fetchImpl } : {};
  if (name === 'stripe') {
    if (def.mode === 'webhook-only' || (def.mode === 'auto' && !source.STRIPE_SECRET_KEY)) return createStripeRest({ webhookOnly: true });
    const apiVersion = def.apiVersion !== undefined ? resolveEnv(def.apiVersion, source, 'apiVersion') : null;
    const base = createStripeRest({ secretKey: need('STRIPE_SECRET_KEY'), baseUrl: source.STRIPE_API_BASE || undefined, portalConfiguration: source.STRIPE_PORTAL_CONFIGURATION || null, ...(apiVersion ? { apiVersion } : {}), ...withFetch });
    const productOf = new Map();
    for (const s of sellables(def)) {
      if (!s.lookupKey || s.priceless || !def.plans[s.plan].adoptPrices) continue;
      const product = resolveEnv(def.plans[s.plan].product, source, `plans.${s.plan}.product`);
      if (product) productOf.set(s.lookupKey, { product, interval: s.interval, cents: s.amount === undefined ? null : cents(s.amount) });
    }
    for (const s of seatPrices(def)) {
      const p = def.plans[s.plan];
      const product = resolveEnv(p.seat.product ?? p.product, source, `plans.${s.plan}.perSeat.product`);
      if (product && p.adoptPrices) productOf.set(s.lookupKey, { product, interval: s.interval, cents: cents(s.amount) });
    }
    for (const it of Object.values(def.items)) {
      const product = resolveEnv(it.product, source, `items.${it.id}.product`);
      if (product && it.adoptPrices) productOf.set(it.lookupKey, { product, interval: null, cents: cents(it.amount) });
    }
    return {
      ...base,
      // by lookup key; failing that, the plan's product + interval (+ amount)
      async resolveLookupKey(key) {
        const found = await base.resolveLookupKey(key);
        if (found) return found;
        const want = productOf.get(key);
        if (!want) return null;
        const r = await base.listPrices({ product: want.product, active: true, type: want.interval ? 'recurring' : 'one_time', limit: 100 });
        const rows = (r?.data ?? []).filter((x) => (want.interval ? x.recurring?.interval === want.interval && !x.recurring?.meter && x.recurring?.usage_type !== 'metered' : !x.recurring));
        return (rows.find((x) => want.cents == null || x.unit_amount === want.cents) ?? null)?.id ?? null;
      },
    };
  }
  const apiKey = source.LEMONSQUEEZY_API_KEY;
  const webhookOnly = def.mode === 'webhook-only' || (def.mode === 'auto' && !apiKey);
  const storeId = def.storeId !== undefined ? resolveEnv(def.storeId, source, 'storeId') : webhookOnly ? source.LEMONSQUEEZY_STORE_ID || undefined : need('LEMONSQUEEZY_STORE_ID');
  return createLemonSqueezy({ ...(webhookOnly ? { webhookOnly: true } : { apiKey: need('LEMONSQUEEZY_API_KEY') }), storeId, baseUrl: source.LEMONSQUEEZY_API_BASE || undefined, ...withFetch });
}

/** The matcher a config plan or item contributes: product (not metered, interval), a price-id list, the app's own function, subscription metadata. */
function matcherFor(p, { product, interval, metered = false, source }) {
  const parts = [];
  if (product && p.matchProduct !== false) parts.push((item) => (metered ? !!item.metered : !item.metered) && String(item.productRef) === String(product) && (interval === undefined || item.interval == null || item.interval === interval));
  if (!metered) {
    if (p.priceIds) {
      const ids = resolveEnv(p.priceIds, source); // a declared list that is empty matches nothing
      parts.push((item) => ids.includes(String(item.ref)));
    }
    if (p.match) parts.push((item) => p.match(item, { env: source }));
    if (p.matchMetadata) parts.push((item) => Object.entries(p.matchMetadata).every(([k, v]) => item.metadata?.[k] === v));
  }
  return parts.length ? (item) => parts.some((f) => f(item)) : undefined;
}

/**
 * Build billing from a definition. `store` is required. `auth(req)` makes the HTTP handler. `env` defaults to process.env.
 * `provider` overrides the one built from the environment; `fetch` is handed to the provider built from it. Any other createBilling option
 * (seats, onPeriod, orgExists, parseReference, canBind, graceMs...) passes through and wins over the same name in the config's `hooks`.
 */
export function createBillingFromConfig(def, { store, auth, env: source = processEnv(), provider: givenProvider, providerName, fetch: fetchImpl, webhookSecret, bindingSecret, successUrl, cancelUrl, returnUrl, origin, basePath, entitlements, ...rest } = {}) {
  needDef(def);
  if (!store) throw new BillingConfigError('createBillingFromConfig needs { store }', 'invalid-config');
  const name = providerName ?? resolveEnv(def.provider, source, 'provider');
  if (!['stripe', 'lemonsqueezy'].includes(name)) throw new BillingConfigError(`provider must be 'stripe' or 'lemonsqueezy', got ${show(name)}`);
  const provider = givenProvider ?? buildProvider(name, source, def, { fetch: fetchImpl });
  const stripe = name === 'stripe';
  const webhookEnv = stripe ? 'STRIPE_WEBHOOK_SECRET' : 'LEMONSQUEEZY_WEBHOOK_SECRET';

  const rows = sellables(def);
  const plans = {};
  const keyOfId = new Map();
  for (const s of rows) {
    const p = def.plans[s.plan];
    keyOfId.set(s.id, s.plan);
    if (!stripe && p.usage) throw new BillingConfigError(`plans.${p.key}.usage: usage-based plans are not supported on Lemon Squeezy by billing; use Stripe`, 'unsupported');
    const where = `plans.${p.key}`;
    const product = stripe ? resolveEnv(p.product, source, `${where}.product`) : undefined;
    const ref = resolveEnv(p.priceId?.[s.kind], source, `${where}.priceId.${s.kind}`) ?? (stripe ? undefined : s.priceless ? undefined : resolveEnv(env(variantEnvName(p.key, s.kind)), source, `${where}.${s.kind} (Lemon Squeezy variant)`));
    const match = stripe ? matcherFor(p, { product, interval: s.interval, source }) : undefined;
    const identify = stripe
      ? { ...(ref ? { priceId: ref } : s.flat ? { lookupKey: s.lookupKey } : {}), ...(match ? { match } : {}) }
      : { variantId: ref };
    const display = {
      plan: p.key, name: p.name, price: s.amount ?? 0, interval: s.interval, currency: def.currency.toUpperCase(), group: p.key, features: [...p.features], ...(p.highlight ? { highlight: true } : {}),
      ...(p.trialDays ? { trialDays: p.trialDays } : {}), ...(p.usage ? { usage: { meter: resolveEnv(p.usage.meter, source), ...(p.usage.unitPrice !== undefined ? { unitPrice: p.usage.unitPrice } : { tiers: p.usage.tiers.map((t) => ({ ...t })) }) } } : {}),
    };
    const seatFlag = p.perSeat && !p.seat ? { perSeat: true, ...(p.seats?.min ? { minSeats: p.seats.min } : {}), ...(p.seats?.max ? { maxSeats: p.seats.max } : {}) } : {};
    const spec = { ...(p.meta ?? {}), ...(p.credits !== undefined ? { credits: p.credits } : {}), ...display, ...seatFlag, ...identify };
    const lines = [];
    if (p.usage || p.seat) {
      if (s.flat) lines.push({ role: p.perSeat && !p.seat ? 'seat' : 'base', ...identify, ...(p.perSeat && !p.seat ? { min: p.seats?.min ?? 1, ...(p.seats?.max ? { max: p.seats.max } : {}) } : {}) });
      if (p.seat) {
        const seatProduct = resolveEnv(p.seat.product ?? p.product, source, `${where}.perSeat.product`);
        const seatRef = resolveEnv(p.seat.id, source, `${where}.perSeat.id`);
        const seatMatch = matcherFor({ matchProduct: p.matchProduct }, { product: seatProduct, interval: undefined, source });
        lines.push({ role: 'seat', ...(seatRef ? { priceId: seatRef } : { lookupKey: priceKey(p, 'seat') }), quantity: p.seat.quantity, ...(p.seats?.min ? { min: p.seats.min } : {}), ...(p.seats?.max ? { max: p.seats.max } : {}), ...(seatMatch ? { match: seatMatch } : {}) });
      }
      if (p.usage) {
        const usageMatch = matcherFor(p, { product, interval: undefined, metered: true, source });
        const usageLine = { role: 'usage', metered: true, lookupKey: priceKey(p, 'usage'), ...(usageMatch ? { match: usageMatch } : {}) };
        if (s.flat) lines.push(usageLine);
        else {
          // metered only: no flat fee, so the usage price is what identifies the plan
          delete spec.priceId;
          delete spec.match;
          Object.assign(spec, { lookupKey: priceKey(p, 'usage'), ...(usageMatch ? { match: usageMatch } : {}) });
          lines.push(usageLine);
        }
      }
      spec.lineItems = lines;
    }
    plans[s.id] = spec;
  }
  const items = {};
  for (const it of Object.values(def.items)) {
    const product = stripe ? resolveEnv(it.product, source, `items.${it.id}.product`) : undefined;
    const ref = resolveEnv(it.priceId, source, `items.${it.id}.priceId`) ?? (stripe ? undefined : resolveEnv(env(variantEnvName(it.id, 'item')), source, `items.${it.id} (Lemon Squeezy variant)`));
    const match = stripe ? matcherFor(it, { product, interval: undefined, source }) : undefined;
    items[it.id] = { ...(it.meta ?? {}), ...(it.credits !== undefined ? { credits: it.credits } : {}), name: it.name, ...(stripe ? (ref ? { priceId: ref } : { lookupKey: it.lookupKey }) : { variantId: ref }), ...(match ? { match } : {}) };
  }
  const meters = Object.fromEntries(Object.values(def.plans).filter((p) => p.usage).map((p) => [p.usage.alias ?? resolveEnv(p.usage.meter, source), resolveEnv(p.usage.meter, source)]));
  const secret = webhookSecret ?? (source[webhookEnv] || null);
  const bind = bindingSecret ?? (source.BILLING_BINDING_SECRET || null);

  const handlers = [def.onChange, def.hooks?.entitlements?.onChange, entitlements?.onChange].filter(Boolean);
  const onChange = handlers.length
    ? async (e) => {
        const key = keyOfId.get(e.plan) ?? e.plan ?? null;
        const row = rows.find((r) => r.id === e.plan);
        const ev = { ...e, plan: key, planId: e.plan, interval: row?.interval ?? null };
        for (const h of handlers) await h(ev);
      }
    : undefined;
  const hooks = Object.fromEntries(HOOK_NAMES.filter((h) => def.hooks?.[h]).map((h) => [h, def.hooks[h]]));
  const billing = createBilling({
    store, provider, plans, ...(Object.keys(items).length ? { items } : {}), meters, webhookSecret: secret, bindingSecret: bind, ...(def.graceMs !== undefined ? { graceMs: def.graceMs } : {}),
    ...hooks, ...rest, entitlements: { ...def.hooks?.entitlements, ...entitlements, ...(onChange ? { onChange } : {}) },
  });

  const idFor = (plan, interval) => {
    const options = rows.filter((r) => r.plan === plan);
    if (!options.length) throw new BillingError(`No such plan: ${plan}`, 'plan-not-found');
    if (interval == null) return options[0].id;
    const want = { month: 'month', monthly: 'month', year: 'year', yearly: 'year' }[interval];
    const hit = options.find((r) => r.interval === want);
    if (!hit) throw new BillingError(`Plan ${plan} has no ${interval} price`, 'plan-not-found');
    return hit.id;
  };
  const planKey = (id) => keyOfId.get(id) ?? null;

  const api = {
    ...billing,
    def,
    provider: name,
    planKey,
    /** checkout(orgId, { plan: 'pro', interval?: 'month' | 'year', seats?, successUrl, cancelUrl, ... }) -> url. A plan's trialDays applies unless you pass your own. */
    async checkout(orgId, { plan, interval, planId, ...more } = {}) {
      const id = plan !== undefined ? idFor(plan, interval) : planId;
      const trial = def.plans[keyOfId.get(id)]?.trialDays;
      let extra = more.extra;
      if (def.checkout?.extra !== undefined) {
        const ctx = { orgId, plan: id !== undefined ? keyOfId.get(id) ?? null : null, planId: id ?? null, itemId: more.itemId ?? null, kind: more.itemId !== undefined ? 'payment' : 'subscription', interval: rows.find((r) => r.id === id)?.interval ?? null, customerEmail: more.customerEmail ?? null, seats: more.seats ?? null };
        const base = typeof def.checkout.extra === 'function' ? await def.checkout.extra(ctx) : def.checkout.extra;
        extra = deepMerge(base ?? {}, more.extra ?? {});
      }
      return billing.checkout(orgId, { ...more, ...(extra !== undefined ? { extra } : {}), ...(id !== undefined ? { planId: id } : {}), ...(more.trialDays === undefined && trial && more.itemId === undefined ? { trialDays: trial } : {}) });
    },
    async changePlan(orgId, plan, { interval, ...opts } = {}) {
      return billing.changePlan(orgId, keyOfId.has(plan) ? plan : idFor(plan, interval), opts);
    },
    /** canUse(orgId): is the subscription live? canUse(orgId, 'exports'): live AND on a plan that lists that feature. */
    async canUse(orgId, feature) {
      if (feature === undefined) return billing.canUse(orgId);
      if (!Object.hasOwn(def.features, feature)) throw new BillingConfigError(`unknown feature ${show(feature)}; the config declares: ${Object.keys(def.features).join(', ') || '(none)'}`, 'unknown-feature');
      if (!(await billing.canUse(orgId))) return false;
      const key = planKey((await billing.status(orgId)).plan);
      return key !== null && def.features[feature].includes(key);
    },
    /** The Web-standard (Request) => Response for /api/billing/*. Needs `auth` in the options. */
    handler: null,
  };
  let routes;
  api.handler = (req) => {
    if (!auth) throw new BillingConfigError('createBillingFromConfig needs { auth(req) } to serve routes: return the signed-in org id or null', 'invalid-config');
    routes ??= billingRoutes(billing, { auth, successUrl, cancelUrl, returnUrl, origin, ...(basePath ? { basePath } : {}) });
    return routes(req);
  };
  return api;
}

/** The React (or any) UI module, returned as is: only its types change, so <Upgrade plan="pro"> is checked against your plan ids. */
export function typedUi(def, ui) {
  needDef(def);
  return ui;
}
