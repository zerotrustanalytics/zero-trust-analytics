// A fake Stripe REST API on localhost (node:http, port 0) that createStripeRest talks to through `baseUrl`.
// It records what billing sent and builds the subscription a completed checkout would create, so a test can
// sign the webhook Stripe would send. Nothing leaves the machine.
import { createServer } from 'node:http';
import { signWebhook } from '../../../vendor/launchkit/billing.js';
import { createAdmin } from './fake-stripe-admin.js';

export const S0 = Math.floor(Date.now() / 1000);
const DAY = 86_400;

export async function fakeStripe() {
  const f = { sessions: {}, subs: {}, calls: [], n: 0, down: false, lastSession: null, meterEvents: [] };
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const url = new URL(req.url, 'http://x');
    f.calls.push({ method: req.method, path: url.pathname, query: url.search, body: raw });
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (f.down) return send(500, { error: { message: 'down' } });
    try {
      const adminResult = f.admin.handle(req.method, url.pathname, url.search, raw, req.headers);
      if (adminResult) return send(adminResult[0], adminResult[1]);
    } catch (e) {
      if (!f.StripeError || !(e instanceof f.StripeError)) throw e;
      return send(e.status, { error: { type: 'invalid_request_error', message: e.message, code: e.code, param: e.param } });
    }
    const form = Object.fromEntries(new URLSearchParams(raw));
    let m;
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const id = `cs_${++f.n}`;
      f.sessions[id] = { id, form, done: false };
      f.lastSession = f.sessions[id];
      return send(200, { id, url: `https://checkout.stripe.test/${id}` });
    }
    if (req.method === 'POST' && url.pathname === '/v1/billing/meter_events') {
      f.meterEvents.push(Object.fromEntries(new URLSearchParams(raw)));
      return send(200, { object: 'billing.meter_event', identifier: form.identifier ?? null });
    }
    if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') return send(200, { id: 'bps_1', url: `https://billing.stripe.test/p/${form.customer}` });
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/subscriptions\/(.+)$/))) return f.subs[m[1]] ? send(200, f.subs[m[1]]) : send(404, { error: { message: 'no such subscription' } });
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return f.sessions[m[1]] ? send(200, f.object(f.sessions[m[1]])) : send(404, { error: { message: 'no such session' } });
    return send(404, { error: { message: 'not found' } });
  });
  createAdmin(f);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  f.url = `http://127.0.0.1:${server.address().port}`;
  f.close = () => new Promise((r) => (server.closeAllConnections?.(), server.close(r)));

  /** The Checkout Session object as Stripe would return it. */
  f.object = (s) => ({
    id: s.id,
    object: 'checkout.session',
    mode: s.form.mode ?? 'subscription',
    status: s.done ? 'complete' : 'open',
    payment_status: s.done ? 'paid' : 'unpaid',
    client_reference_id: s.form.client_reference_id,
    customer: s.done ? 'cus_1' : null,
    subscription: s.done ? `sub_${s.id.slice(3)}` : null,
    metadata: Object.fromEntries(Object.entries(s.form).filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])),
  });
  /** "The customer paid": creates the subscription Stripe would, returns the checkout object. */
  f.pay = (session = f.lastSession, { status = 'active' } = {}) => {
    session.done = true;
    const metadata = Object.fromEntries(Object.entries(session.form).filter(([k]) => k.startsWith('subscription_data[metadata][')).map(([k, v]) => [k.slice(28, -1), v]));
    const id = `sub_${session.id.slice(3)}`;
    f.subs[id] = {
      id, object: 'subscription', customer: 'cus_1', status, created: S0, cancel_at_period_end: false, metadata,
      current_period_start: S0, current_period_end: S0 + 30 * DAY,
      items: { data: [{ id: 'si_1', price: f.admin.prices.get(session.form['line_items[0][price]']) ?? { id: session.form['line_items[0][price]'] }, quantity: Number(session.form['line_items[0][quantity]'] ?? 1) }] },
    };
    return f.object(session);
  };
  return f;
}

/** A signed Stripe webhook request for `type` carrying `object`. */
let n = 0;
export async function stripeWebhook(url, secret, type, object, { id = `evt_${++n}`, created = Math.floor(Date.now() / 1000), t = created } = {}) {
  const body = JSON.stringify({ id, object: 'event', type, created, data: { object } });
  return new Request(url, { method: 'POST', body, headers: { 'stripe-signature': await signWebhook(body, secret, t), 'content-type': 'application/json' } });
}
