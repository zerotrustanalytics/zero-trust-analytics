/**
 * ZTA's billing, declared once. The plans (id, name, monthly price) and where each Stripe price id comes from (env),
 * what a checkout carries besides billing's own fields, and the webhook path. launchkit reads this to build billing
 * (netlify/functions/lib/billing.js) and `npm run billing:sync` / `billing:doctor` read it to check the Stripe account.
 *
 * Prices are sold by id: STRIPE_PRICE_STARTER / _GROWTH / _BUSINESS / _SCALE. The "org" for billing is the user's email.
 * Plan limits (pageviews, retention, ...) stay in netlify/functions/lib/config.js; they are not billing.
 * The hooks (user-record mirror, renewals, orgExists) are app glue and are passed in by lib/billing.js.
 *
 * Edit this file, then: `npm run billing:sync -- --adopt-only --dry-run` with the TEST key first (see README "Billing config").
 */
import { defineBilling, env } from './vendor/launchkit/billing-config.js';

const TIERS = [['starter', 'Starter', 9], ['growth', 'Growth', 19], ['business', 'Business', 49], ['scale', 'Scale', 99]];
const priceEnv = (id) => `STRIPE_PRICE_${id.toUpperCase()}`;

/**
 * The definition, optionally limited to the plans whose price env is set in `source`. The default export has every plan, which is
 * what `billing:sync` / `billing:doctor` read (doctor warns about an unset price var). At runtime lib/billing.js passes process.env
 * so a plan with no price is simply not sold, as before, instead of failing billing for every plan.
 */
export const configFor = (source) => defineBilling({
  plans: Object.fromEntries(TIERS.filter(([id]) => !source || source[priceEnv(id)]).map(([id, name, amount]) => [id, {
    name,
    productName: `Zero Trust Analytics ${name}`,
    price: { monthly: { amount, id: env(priceEnv(id)) } },
  }])),
  portal: false, // sync leaves the Stripe portal configuration alone; stripe-portal.js opens sessions as before
  webhook: { path: '/api/stripe/webhook' },
  // What the old checkout sent besides billing's own fields: card only, and who and what as session metadata.
  checkout: { extra: ({ orgId, plan }) => ({ payment_method_types: ['card'], metadata: { email: orgId, plan } }) },
});

export default configFor();
