// The Stripe account-management endpoints `launchkit billing sync` uses, with Stripe's real semantics, for the local fake:
//   - bodies are form-encoded (a JSON body is rejected), nested like a[b][0][c]=v; errors are { error: { type, message, code, param } }
//   - lists are newest first, paginate with limit / starting_after / has_more
//   - prices are IMMUTABLE (amount, currency, recurring cannot change; only active, nickname, metadata, lookup_key)
//   - a lookup_key belongs to one price at a time: reusing it fails unless transfer_lookup_key=true, which moves it
//   - the webhook signing secret is returned ONLY by the create call
//   - a key can only see objects of its own mode (sk_test_ vs sk_live_)
//   - lookup_keys filters take at most 10 keys
export function createAdmin(f) {
  const db = { products: [], prices: [], meters: [], webhook_endpoints: [], portal: [] };
  let n = 0;
  const rnd = () => `${(++n).toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 10)}`;
  const now = () => Math.floor(Date.now() / 1000);

  class StripeError extends Error {
    constructor(status, message, code = null, param = null) {
      super(message);
      Object.assign(this, { status, code, param });
    }
  }
  const bad = (m, param) => new StripeError(400, m, 'parameter_invalid_empty', param);

  /** a[b][0][c]=v  ->  { a: { b: [ { c: 'v' } ] } } */
  function parseForm(raw) {
    const root = {};
    for (const [k, v] of new URLSearchParams(raw)) {
      const parts = [...k.matchAll(/[^[\]]+/g)].map((m) => m[0]);
      let at = root;
      parts.forEach((p, i) => {
        const last = i === parts.length - 1;
        const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
        if (last) at[p] = v;
        else at = at[p] ??= nextIsIndex ? [] : {};
      });
    }
    return root;
  }
  const bool = (v) => v === true || v === 'true';
  const list = (rows, q, filter = () => true) => {
    let r = rows.filter(filter).slice().reverse(); // newest first
    if (q.starting_after) {
      const at = r.findIndex((x) => x.id === q.starting_after);
      if (at < 0) throw new StripeError(400, `No such object: ${q.starting_after}`, 'resource_missing', 'starting_after');
      r = r.slice(at + 1);
    }
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 10)));
    return { object: 'list', data: r.slice(0, limit), has_more: r.length > limit, url: '/v1/x' };
  };
  const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v : Object.values(v));
  const patchMeta = (obj, meta) => {
    if (!meta) return;
    for (const [k, v] of Object.entries(meta)) v === '' ? delete obj.metadata[k] : (obj.metadata[k] = v);
  };
  const find = (rows, id, what, live) => {
    const row = rows.find((x) => x.id === id);
    if (row && row.livemode !== live) throw new StripeError(404, `No such ${what}: '${id}'; a similar object exists in ${row.livemode ? 'live' : 'test'} mode, but a ${live ? 'live' : 'test'} mode key was used to make this request.`, 'resource_missing', what);
    if (!row) throw new StripeError(404, `No such ${what}: '${id}'`, 'resource_missing', what);
    return row;
  };
  const ownMode = (rows, live) => rows.filter((x) => x.livemode === live);
  const shown = (price, expandTiers) => {
    if (expandTiers || !price.tiers) return price;
    const { tiers, ...rest } = price; // Stripe returns `tiers` on a price only when it is expanded
    return rest;
  };

  /** Returns [status, body] or null when the path is not an admin path. */
  f.admin = {
    db,
    prices: { get: (id) => db.prices.find((p) => p.id === id) },
    handle(method, pathname, query, raw, headers) {
      const m = pathname.match(/^\/v1\/(products|prices|billing\/meters|webhook_endpoints|billing_portal\/configurations)(?:\/([^/]+))?$/);
      if (!m) return null;
      const [, coll, id] = m;
      const live = /^Bearer (sk|rk)_live_/.test(headers.authorization ?? '');
      let form = {};
      if (method === 'POST') {
        if (!String(headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded')) throw new StripeError(400, 'Stripe API requests are form-encoded (application/x-www-form-urlencoded).', 'parameter_invalid');
        form = parseForm(raw);
      }
      const q = method === 'GET' ? parseForm(new URLSearchParams(query).toString()) : {};

      if (coll === 'products') {
        const rows = ownMode(db.products, live);
        if (method === 'GET' && !id) return [200, list(rows, q, (p) => q.active == null || p.active === bool(q.active))];
        if (method === 'GET') return [200, find(db.products, id, 'product', live)];
        if (method === 'POST' && !id) {
          if (!form.name) throw bad('Missing required param: name.', 'name');
          const p = { id: `prod_${rnd()}`, object: 'product', name: form.name, active: true, metadata: {}, created: now(), livemode: live };
          patchMeta(p, form.metadata);
          db.products.push(p);
          return [200, p];
        }
        const p = find(db.products, id, 'product', live);
        if (form.name !== undefined) p.name = form.name;
        if (form.active !== undefined) p.active = bool(form.active);
        patchMeta(p, form.metadata);
        return [200, p];
      }

      if (coll === 'prices') {
        const rows = ownMode(db.prices, live);
        if (method === 'GET' && !id) {
          const keys = q.lookup_keys ? toArr(q.lookup_keys) : null;
          if (keys && keys.length > 10) throw bad('You can pass at most 10 lookup_keys.', 'lookup_keys');
          const r = list(rows, q, (p) => (!keys || keys.includes(p.lookup_key)) && (!q.product || p.product === q.product) && (q.active == null || p.active === bool(q.active)) && (!q.type || (q.type === 'recurring') === !!p.recurring));
          return [200, { ...r, data: r.data.map((p) => shown(p, toArr(q.expand).includes('data.tiers'))) }]; // like Stripe: tiers only when expanded
        }
        if (method === 'GET') return [200, shown(find(db.prices, id, 'price', live), toArr(q.expand).includes('tiers'))];
        if (method === 'POST' && !id) {
          const product = find(db.products, form.product, 'product', live);
          if (!form.currency) throw bad('Missing required param: currency.', 'currency');
          const tiered = form.billing_scheme === 'tiered';
          if (tiered && !toArr(form.tiers).length) throw bad('Tiered prices need tiers.', 'tiers');
          if (tiered && !['graduated', 'volume'].includes(form.tiers_mode)) throw bad('Tiered prices need tiers_mode (graduated or volume).', 'tiers_mode');
          if (!tiered && form.unit_amount === undefined && form.unit_amount_decimal === undefined) throw bad('You must specify either `unit_amount` or `unit_amount_decimal`.', 'unit_amount');
          const rec = form.recurring ? { interval: form.recurring.interval, interval_count: Number(form.recurring.interval_count ?? 1), usage_type: form.recurring.usage_type ?? 'licensed', meter: form.recurring.meter ?? null } : null;
          if (rec && !['day', 'week', 'month', 'year'].includes(rec.interval)) throw bad('Invalid recurring[interval].', 'recurring[interval]');
          if (rec?.usage_type === 'metered') {
            if (!rec.meter) throw bad('Metered prices need recurring[meter].', 'recurring[meter]');
            find(db.meters, rec.meter, 'meter', live);
          }
          const price = {
            id: `price_${rnd()}`, object: 'price', product: product.id, currency: form.currency, active: true, nickname: form.nickname ?? null, metadata: {}, lookup_key: null, livemode: live, created: now(),
            type: rec ? 'recurring' : 'one_time', recurring: rec,
            unit_amount: form.unit_amount !== undefined ? Number(form.unit_amount) : null,
            unit_amount_decimal: tiered ? null : form.unit_amount_decimal ?? String(form.unit_amount), billing_scheme: form.billing_scheme ?? 'per_unit',
            ...(tiered ? { tiers_mode: form.tiers_mode, tiers: toArr(form.tiers).map((t) => ({ up_to: t.up_to === 'inf' ? null : Number(t.up_to), unit_amount: t.unit_amount_decimal !== undefined && Number.isInteger(Number(t.unit_amount_decimal)) ? Number(t.unit_amount_decimal) : null, unit_amount_decimal: t.unit_amount_decimal ?? null, flat_amount: t.flat_amount !== undefined ? Number(t.flat_amount) : null, flat_amount_decimal: t.flat_amount !== undefined ? String(t.flat_amount) : null })) } : {}),
          };
          patchMeta(price, form.metadata);
          if (form.lookup_key) {
            const holder = db.prices.find((p) => p.lookup_key === form.lookup_key && p.livemode === live);
            if (holder && !bool(form.transfer_lookup_key)) throw new StripeError(400, `A price with lookup_key \`${form.lookup_key}\` already exists. Set transfer_lookup_key=true to move it.`, 'lookup_key_already_exists', 'lookup_key');
            if (holder) holder.lookup_key = null;
            price.lookup_key = form.lookup_key;
          }
          db.prices.push(price);
          return [200, price];
        }
        const p = find(db.prices, id, 'price', live);
        for (const k of ['unit_amount', 'currency', 'recurring', 'product', 'unit_amount_decimal']) if (form[k] !== undefined) throw new StripeError(400, `You cannot change \`${k}\` on a price once it has been created. Create a new price instead.`, 'parameter_unknown', k);
        if (form.active !== undefined) p.active = bool(form.active);
        if (form.nickname !== undefined) p.nickname = form.nickname;
        patchMeta(p, form.metadata);
        if (form.lookup_key) {
          const holder = db.prices.find((x) => x.lookup_key === form.lookup_key && x.livemode === live && x !== p);
          if (holder && !bool(form.transfer_lookup_key)) throw new StripeError(400, `A price with lookup_key \`${form.lookup_key}\` already exists. Set transfer_lookup_key=true to move it.`, 'lookup_key_already_exists', 'lookup_key');
          if (holder) holder.lookup_key = null;
          p.lookup_key = form.lookup_key;
        }
        return [200, p];
      }

      if (coll === 'billing/meters') {
        const rows = ownMode(db.meters, live);
        if (method === 'GET') return [200, list(rows, q)];
        if (!form.event_name || !form.display_name || !form.default_aggregation?.formula) throw bad('display_name, event_name and default_aggregation[formula] are required.', 'event_name');
        if (db.meters.some((x) => x.event_name === form.event_name && x.livemode === live && x.status === 'active')) throw new StripeError(400, `A meter with event_name \`${form.event_name}\` already exists.`, 'resource_already_exists', 'event_name');
        const meter = { id: `mtr_${rnd()}`, object: 'billing.meter', display_name: form.display_name, event_name: form.event_name, status: 'active', default_aggregation: form.default_aggregation, livemode: live };
        db.meters.push(meter);
        return [200, meter];
      }

      if (coll === 'webhook_endpoints') {
        const rows = ownMode(db.webhook_endpoints, live);
        if (method === 'GET' && !id) return [200, list(rows, q)];
        if (method === 'POST' && !id) {
          if (!/^https?:\/\//.test(form.url ?? '')) throw bad('Invalid URL.', 'url');
          const events = toArr(form.enabled_events);
          if (!events.length) throw bad('Missing required param: enabled_events.', 'enabled_events');
          const ep = { id: `we_${rnd()}`, object: 'webhook_endpoint', url: form.url, enabled_events: events, status: 'enabled', description: form.description ?? null, metadata: {}, livemode: live };
          patchMeta(ep, form.metadata);
          db.webhook_endpoints.push(ep);
          return [200, { ...ep, secret: `whsec_${rnd()}${rnd()}${rnd()}` }]; // the ONLY time the secret is returned
        }
        const ep = find(db.webhook_endpoints, id, 'webhook endpoint', live);
        if (method === 'GET') return [200, ep];
        if (form.enabled_events !== undefined) ep.enabled_events = toArr(form.enabled_events);
        if (form.url !== undefined) ep.url = form.url;
        if (form.disabled !== undefined) ep.status = bool(form.disabled) ? 'disabled' : 'enabled';
        return [200, ep];
      }

      // billing_portal/configurations
      const rows = ownMode(db.portal, live);
      if (method === 'GET' && !id) return [200, list(rows, q)];
      if (method === 'POST' && !id) {
        if (!form.features) throw bad('Missing required param: features.', 'features');
        const c = { id: `bpc_${rnd()}`, object: 'billing_portal.configuration', active: true, features: form.features, metadata: {}, livemode: live };
        patchMeta(c, form.metadata);
        db.portal.push(c);
        return [200, c];
      }
      const c = find(db.portal, id, 'configuration', live);
      if (method === 'GET') return [200, c];
      if (form.features) c.features = form.features;
      patchMeta(c, form.metadata);
      return [200, c];
    },
  };
  f.StripeError = StripeError;
}
