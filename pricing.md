# ZeroTrustAnalytics Pricing

## Pricing Tiers

| Plan | Monthly | Yearly | Pageviews | Sites |
|------|---------|--------|-----------|-------|
| **Solo** | $5/mo | $50/yr | 10k | Unlimited |
| **Starter** | $15/mo | $150/yr | 50k | Unlimited |
| **Pro** | $29/mo | $290/yr | 100k | Unlimited |
| **Business** | $79/mo | $790/yr | 1M | Unlimited |
| **Scale** | $199/mo | $1,990/yr | 10M | Unlimited |

- Yearly billing = 2 months free (~17% discount)
- 14-day free trial on all plans
- **Unlimited sites on every tier** (key differentiator)

---

## Competitor Comparison

| Pageviews | ZeroTrust | Plausible | Fathom |
|-----------|-----------|-----------|--------|
| 10k | $5 | $9 (1 site) | - |
| 50k | $15 | ~$14 (1 site) | - |
| 100k | $29 | $19 (1 site) | $15 (50 sites) |
| 1M | $79 | $69 (3 sites) | $60 (50 sites) |
| 10M | $199 | $180 (10 sites) | $200 (50 sites) |

**Our advantage:** Unlimited sites at every tier. Agencies, freelancers, and multi-site owners save significantly.

---

## Revenue Targets

**Goal: $500k ARR in 16 months**

$500k ARR = $41,667/month

| Scenario | Avg Price | Customers Needed | Per Month |
|----------|-----------|------------------|-----------|
| Mostly Solo/Starter | $12/mo | 3,472 | 217/mo |
| Mixed tiers | $30/mo | 1,389 | 87/mo |
| Mostly Pro/Business | $50/mo | 833 | 52/mo |

Target: ~1,000-1,500 paying customers with healthy tier distribution.

---

## Stripe Setup Checklist

### Products to Create

1. **Solo Plan**
   - Product name: `Solo`
   - Monthly price: $5.00 (price ID needed)
   - Yearly price: $50.00 (price ID needed)
   - Metadata: `pageview_limit: 10000`

2. **Starter Plan**
   - Product name: `Starter`
   - Monthly price: $15.00
   - Yearly price: $150.00
   - Metadata: `pageview_limit: 50000`

3. **Pro Plan**
   - Product name: `Pro`
   - Monthly price: $29.00
   - Yearly price: $290.00
   - Metadata: `pageview_limit: 100000`

4. **Business Plan**
   - Product name: `Business`
   - Monthly price: $79.00
   - Yearly price: $790.00
   - Metadata: `pageview_limit: 1000000`

5. **Scale Plan**
   - Product name: `Scale`
   - Monthly price: $199.00
   - Yearly price: $1990.00
   - Metadata: `pageview_limit: 10000000`

### Trial Settings
- Free trial: 14 days
- No card required to start trial (optional - decide based on conversion goals)

### Webhook Events to Handle
- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Plan change, renewal
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_failed` - Failed payment

### Environment Variables Needed
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SOLO_MONTHLY_PRICE_ID=price_...
STRIPE_SOLO_YEARLY_PRICE_ID=price_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_YEARLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_...
STRIPE_BUSINESS_YEARLY_PRICE_ID=price_...
STRIPE_SCALE_MONTHLY_PRICE_ID=price_...
STRIPE_SCALE_YEARLY_PRICE_ID=price_...
```

---

## Features by Plan

All plans include:
- Unlimited sites
- Real-time dashboard
- Privacy-first tracking (no cookies)
- GDPR/CCPA compliant
- Data export (CSV/JSON)
- API access
- Email reports

Future premium features (Business/Scale only):
- Custom domains
- Team members
- Priority support
- Extended data retention
- White-label option

---

## Overage Handling

Options when user exceeds pageview limit:
1. **Soft limit** - Keep tracking, show warning, prompt upgrade
2. **Hard limit** - Stop tracking, require upgrade
3. **Overage billing** - Charge per 10k extra pageviews

Recommendation: Soft limit with email notification at 80%, 100%, 120%. Stop tracking at 150% unless upgraded.
