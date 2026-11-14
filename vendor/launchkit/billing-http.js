// The billing HTTP routes as one Web-standard handler: (Request) => Response. Contract: docs/billing/CONTRACT.md "HTTP routes".
// Runs as is on Bun, Deno, Cloudflare Workers, Netlify Functions v2 and Next.js route handlers; src/billing-http-adapters.js
// has the shims for node:http / Express and Next. No dependencies, no logging.
//
//   POST /checkout   { plan | item, quantity? }  -> { url }      (auth)
//   POST /portal                                 -> { url }      (auth)
//   GET  /status                                 -> { status, canUse, plans, items }   (auth)
//   GET  /return?session_id=                     -> 303 to successUrl?billing=ok|pending   (auth)
//   POST /webhook    raw body + provider signature header        -> { received: true }    (no auth: the signature is the auth)

import { BillingError } from './billing.js';

const ROUTES = {
  checkout: 'POST',
  portal: 'POST',
  status: 'GET',
  return: 'GET',
  webhook: 'POST',
};
// BillingError code -> HTTP status. Anything not listed is a 500 with no detail.
const STATUS = {
  invalid: 400,
  'plan-not-found': 400,
  unsupported: 400,
  'no-org': 404,
  'wrong-org': 404,
  'already-subscribed': 409,
  'no-customer': 409,
  'no-subscription': 409,
  conflict: 409,
  'stripe-error': 503,
  'provider-error': 503,
  'not-configured': 503,
};
// A webhook that fails verification is the sender's fault (400, never retried); every other failure is ours (5xx, retried).
const WEBHOOK_REJECT = new Set(['bad-signature', 'stale-timestamp', 'bad-payload', 'no-raw-body']);
const MAX_JSON = 64 * 1024;
const MAX_WEBHOOK = 1024 * 1024;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, error, message, headers) => json({ error, message }, status, headers);

const MESSAGES = {
  invalid: 'The request is not valid.',
  'plan-not-found': 'That plan is not available.',
  unsupported: 'The billing provider does not support that.',
  'no-org': 'No such organization.',
  'wrong-org': 'Not found.',
  'already-subscribed': 'This organization already has a subscription. Use the billing portal to change it.',
  'no-customer': 'Choose a plan first.',
  'no-subscription': 'Choose a plan first.',
  conflict: 'This billing account is linked to another organization.',
  'stripe-error': 'Billing is unavailable. Try again shortly.',
  'provider-error': 'Billing is unavailable. Try again shortly.',
  'not-configured': 'Billing is unavailable. Try again shortly.',
};

/** BillingError -> a JSON error Response. Messages are fixed strings: provider detail never reaches the client. */
export function errorResponse(e) {
  if (e instanceof BillingError && e.code in STATUS) return fail(STATUS[e.code], e.code, MESSAGES[e.code]);
  return fail(500, 'server-error', 'Something went wrong.');
}

async function readText(req, max) {
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > max) throw new BillingError('Body too large.', 'invalid', 413);
  return buf;
}

export function billingRoutes(billing, { auth, successUrl, cancelUrl, returnUrl, basePath = '/api/billing', origin = null, plans = null } = {}) {
  if (!billing || typeof billing.checkout !== 'function') throw new Error('billingRoutes: pass a createBilling() instance');
  if (typeof auth !== 'function') throw new Error('billingRoutes: auth(req) is required. Return the signed-in org id, or null.');
  const base = `/${String(basePath).replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');

  const originOf = async (req) => String((typeof origin === 'function' ? await origin(req) : origin) ?? new URL(req.url).origin).replace(/\/+$/, '');
  const absolute = async (v, req, fallback) => {
    const raw = typeof v === 'function' ? await v(req) : v;
    if (raw == null || raw === '') return fallback;
    return new URL(String(raw), `${await originOf(req)}/`).toString();
  };
  const routeOf = (pathname) => {
    const p = pathname.replace(/\/+$/, '');
    if (p.startsWith(`${base}/`)) return p.slice(base.length + 1);
    const last = p.split('/').pop(); // behind a rewrite (Netlify redirects, proxies): the last segment still names the route
    return last in ROUTES ? last : null;
  };
  /** auth() may return an org id, or { orgId, email }. */
  const who = async (req) => {
    const a = await auth(req);
    if (a == null || a === false || a === '') return null;
    return typeof a === 'object' ? (a.orgId ? { orgId: String(a.orgId), email: a.email ?? undefined } : null) : { orgId: String(a) };
  };

  async function handle(req) {
    const url = new URL(req.url);
    const route = routeOf(url.pathname);
    if (!route || !(route in ROUTES) || !Object.hasOwn(ROUTES, route)) return fail(404, 'not-found', 'No such route.');
    if (req.method !== ROUTES[route]) return fail(405, 'method-not-allowed', `Use ${ROUTES[route]}.`, { allow: ROUTES[route] });

    if (route === 'webhook') {
      try {
        const sig = req.headers.get('stripe-signature') ?? req.headers.get('x-signature') ?? '';
        const out = await billing.handleWebhook(await readText(req, MAX_WEBHOOK), sig);
        return json({ received: true, ...(out?.duplicate ? { duplicate: true } : {}) });
      } catch (e) {
        if (e instanceof BillingError && (WEBHOOK_REJECT.has(e.code) || e.status === 413)) return fail(400, 'webhook-rejected', 'Webhook rejected.');
        return fail(500, 'server-error', 'Something went wrong.'); // 5xx: the provider retries
      }
    }

    let me;
    try {
      me = await who(req);
    } catch {
      return fail(500, 'server-error', 'Something went wrong.');
    }
    if (!me) return fail(401, 'unauthorized', 'Sign in first.', { 'www-authenticate': 'Bearer' });

    try {
      if (route === 'checkout') {
        let body;
        try {
          body = JSON.parse(new TextDecoder().decode(await readText(req, MAX_JSON)) || '{}');
        } catch (e) {
          if (e instanceof BillingError) throw e;
          throw new BillingError('Body is not JSON.', 'invalid');
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BillingError('Body must be an object.', 'invalid');
        const { plan, item, quantity } = body;
        if ((plan == null) === (item == null) || typeof (plan ?? item) !== 'string') throw new BillingError('Send exactly one of plan or item, as a string.', 'invalid');
        if (quantity != null && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= 100_000)) throw new BillingError('quantity must be a whole number of 1 or more.', 'invalid');
        const o = await originOf(req);
        const landing = await absolute(successUrl ?? returnUrl, req, `${o}/`);
        const success = `${o}${base}/return?session_id={CHECKOUT_SESSION_ID}`; // the provider fills the placeholder in
        const common = { successUrl: success, cancelUrl: await absolute(cancelUrl, req, landing), customerEmail: me.email };
        const trial = item == null && typeof billing.catalog === 'function' ? billing.catalog().plans.find((p) => p.id === plan)?.trialDays : undefined; // a plan's own trial
        const url2 = await billing.checkout(me.orgId, item != null ? { itemId: item, quantity, ...common } : { planId: plan, seats: quantity, ...(Number.isInteger(trial) && trial > 0 ? { trialDays: trial } : {}), ...common });
        return json({ url: url2 });
      }

      if (route === 'portal') {
        const landing = await absolute(returnUrl ?? successUrl, req, `${await originOf(req)}/`);
        return json({ url: await billing.portal(me.orgId, { returnUrl: landing }) });
      }

      if (route === 'status') {
        const cat = plans ?? (typeof billing.catalog === 'function' ? billing.catalog() : { plans: [], items: [] });
        const [status, canUse] = await Promise.all([billing.status(me.orgId, { detail: true }), billing.canUse(me.orgId)]);
        return json({ status, canUse, plans: cat.plans ?? [], items: cat.items ?? [] });
      }

      // GET /return: back from checkout. Confirm the session (so the app is up to date even if the webhook is late), then go home.
      const sid = url.searchParams.get('session_id');
      let applied = false;
      const did = (r) => (Array.isArray(r?.applied) ? r.applied.length > 0 : !!r?.applied);
      if (sid && /^[A-Za-z0-9_-]{1,200}$/.test(sid)) applied = did(await billing.confirm(me.orgId, sid));
      else if (typeof billing.sync === 'function') applied = did(await billing.sync(me.orgId).catch(() => null)); // Lemon Squeezy has no session id: ask the provider
      const dest = new URL(await absolute(successUrl ?? returnUrl, req, `${await originOf(req)}/`));
      dest.searchParams.set('billing', applied ? 'ok' : 'pending');
      return new Response(null, { status: 303, headers: { location: dest.toString(), 'cache-control': 'no-store' } });
    } catch (e) {
      return errorResponse(e);
    }
  }

  return async function billingHandler(req) {
    try {
      return await handle(req);
    } catch {
      return fail(500, 'server-error', 'Something went wrong.');
    }
  };
}
