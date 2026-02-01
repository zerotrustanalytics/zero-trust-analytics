# Zero Trust Analytics - Business Math & Unit Economics

> Last Updated: January 2025

---

## Current Infrastructure Stack

| Service | Plan | Monthly Cost | Limits |
|---------|------|--------------|--------|
| **Netlify** | Free | $0 | 125k function invocations, 100GB bandwidth |
| **Turso** | Free | $0 | 500M row reads, 10M row writes, 5GB storage |
| **Clerk** | Free | $0 | 10,000 MAU (dashboard users) |
| **Vercel** | Free | $0 | Hosting |
| **Total** | | **$0/mo** | |

---




## Cost Per Pageview (Marginal Cost)

For each pageview tracked by a customer's site:

| Resource | Units Consumed | Cost at Scale |
|----------|---------------|---------------|
| Function Invocations | ~1.2 per pageview | $0.0000024 |
| DB Row Writes | ~8 per pageview | $0.000008 |
| DB Row Reads | ~5 per pageview (amortized) | $0.00000001 |
| Storage | ~700 bytes | $0.0000005 |
| **Total per pageview** | | **~$0.00001** |

### Cost Per 50,000 Pageviews

| Resource | Usage | Cost |
|----------|-------|------|
| Function Invocations | ~60,000 | $0.12 |
| DB Row Writes | ~400,000 | $0.40 |
| DB Row Reads | ~250,000 | $0.00 |
| Storage | ~35 MB | $0.03 |
| **Total per 50k PV** | | **~$0.55** |

---

## Pricing Tiers & Margins

### Tier Breakdown

| Tier | Price | PV Limit | Your Cost | Gross Profit | Margin |
|------|-------|----------|-----------|--------------|--------|
| Free | $0 | 5,000 | $0.06 | -$0.06 | Loss leader |
| Starter | $9 | 50,000 | $0.55 | **$8.45** | **94%** |
| Growth | $19 | 200,000 | $2.20 | **$16.80** | **88%** |
| Business | $49 | 1,000,000 | $11.00 | **$38.00** | **78%** |
| Scale | $149 | 5,000,000 | $55.00 | **$94.00** | **63%** |
| Enterprise | Custom | Unlimited | Variable | Negotiated | 50-70% target |

### Add-on: Real-time Analytics

| Add-on | Price | Your Cost | Gross Profit | Margin |
|--------|-------|-----------|--------------|--------|
| Real-time | $5/mo | ~$0.50 | **$4.50** | **90%** |

*Note: Real-time is included free in Scale tier*

---

## Revenue Scenarios

### Scenario A: 10 Paying Customers

| Mix | Count | MRR | Your Cost | Profit |
|-----|-------|-----|-----------|--------|
| Starter | 5 | $45 | $2.75 | $42.25 |
| Growth | 3 | $57 | $6.60 | $50.40 |
| Business | 2 | $98 | $22.00 | $76.00 |
| **Total** | **10** | **$200** | **$31.35** | **$168.65** |

**Blended margin: 84%**

### Scenario B: 50 Paying Customers

| Mix | Count | MRR | Your Cost | Profit |
|-----|-------|-----|-----------|--------|
| Starter | 25 | $225 | $13.75 | $211.25 |
| Growth | 15 | $285 | $33.00 | $252.00 |
| Business | 8 | $392 | $88.00 | $304.00 |
| Scale | 2 | $298 | $110.00 | $188.00 |
| **Total** | **50** | **$1,200** | **$244.75** | **$955.25** |

**Blended margin: 80%**

### Scenario C: 100 Paying Customers

| Mix | Count | MRR | Your Cost | Profit |
|-----|-------|-----|-----------|--------|
| Starter | 50 | $450 | $27.50 | $422.50 |
| Growth | 30 | $570 | $66.00 | $504.00 |
| Business | 15 | $735 | $165.00 | $570.00 |
| Scale | 5 | $745 | $275.00 | $470.00 |
| **Total** | **100** | **$2,500** | **$533.50** | **$1,966.50** |

**Blended margin: 79%**

---

## Free Tier Limits (Current Bottleneck)

| Resource | Free Limit | Max Pageviews Supported | Bottleneck? |
|----------|------------|------------------------|-------------|
| Netlify Functions | 125,000/mo | ~100,000 | **YES - PRIMARY** |
| Turso Writes | 10,000,000/mo | ~1,250,000 | No |
| Turso Reads | 500,000,000/mo | ~100,000,000 | No |
| Turso Storage | 5 GB | ~7,000,000 | No |
| Clerk MAU | 10,000 | 10,000 dashboard users | No |

**Your bottleneck is Netlify function invocations, not database.**

---

## Infrastructure Upgrade Path

### When to Upgrade

| Milestone | Total Pageviews/mo | Recommended Action |
|-----------|-------------------|-------------------|
| **Now** | ~100k | Stay on free tiers |
| **5 customers** | ~150k | Upgrade Netlify to Pro ($19/mo) |
| **15 customers** | ~500k | Add Turso Developer ($5/mo) |
| **40 customers** | ~1.5M | Upgrade Turso to Scaler ($25/mo) |
| **100 customers** | ~4M | Consider dedicated infrastructure |

### Upgrade Cost vs Revenue

| Stage | Customers | MRR | Infra Cost | Net Profit | Margin |
|-------|-----------|-----|------------|------------|--------|
| Free tiers | 1-4 | $36-$76 | $0 | $36-$76 | 100%* |
| Netlify Pro | 5-15 | $100-$300 | $19 | $81-$281 | 81-94% |
| + Turso Dev | 15-40 | $300-$800 | $24 | $276-$776 | 92-97% |
| + Turso Scaler | 40-100 | $800-$2,500 | $44 | $756-$2,456 | 94-98% |

*Until you hit free tier limits

---

## Break-Even Analysis

### To Cover Infrastructure Costs

| Infrastructure | Monthly Cost | Break-even Customers |
|---------------|--------------|---------------------|
| Free tiers | $0 | 0 |
| Netlify Pro | $19 | 2-3 Starter customers |
| Netlify Pro + Turso Dev | $24 | 3 Starter customers |
| Netlify Pro + Turso Scaler | $44 | 5 Starter OR 3 Growth |

### Customer Acquisition Cost (CAC) Payback

Assuming $0 CAC (organic/word-of-mouth):

| Tier | Price | Cost | Profit | LTV (12mo) |
|------|-------|------|--------|------------|
| Starter | $9 | $0.55 | $8.45 | $101.40 |
| Growth | $19 | $2.20 | $16.80 | $201.60 |
| Business | $49 | $11.00 | $38.00 | $456.00 |
| Scale | $149 | $55.00 | $94.00 | $1,128.00 |

---

## "Unlimited Sites" Cost Analysis

**Sites are free. Pageviews cost money.**

| Scenario | Sites | Total PV/mo | Your Cost |
|----------|-------|-------------|-----------|
| 1 site, 50k PV | 1 | 50,000 | $0.55 |
| 10 sites, 5k PV each | 10 | 50,000 | $0.55 |
| 10 sites, 50k PV each | 10 | 500,000 | $5.50 |

**Recommendation:** Limit by pageviews, not sites. "Unlimited sites" is a marketing feature that costs you nothing.

---

## Real-time Analytics Add-on Economics

### Cost Per Customer (with Real-time enabled)

| Heartbeat Interval | Extra Events/mo | Extra Cost/mo |
|-------------------|-----------------|---------------|
| 60 seconds | ~100,000 | $0.50 |
| 5 minutes | ~20,000 | $0.10 |

### Pricing Strategy

| Option | Price | Your Cost | Margin |
|--------|-------|-----------|--------|
| Add-on | $5/mo | $0.50 | 90% |
| Included in Scale ($149) | $0 | $0.50 | Absorbed |

---

## Healthy App Metrics to Monitor

### Infrastructure Health

| Metric | Yellow Zone | Red Zone | Action |
|--------|-------------|----------|--------|
| Function Invocations | >80% of limit | >95% | Upgrade Netlify |
| DB Row Writes | >70% of limit | >90% | Upgrade Turso |
| DB Storage | >60% of limit | >80% | Upgrade Turso |
| Response Time (p95) | >500ms | >1000ms | Optimize queries |
| Error Rate | >1% | >5% | Investigate immediately |

### Business Health

| Metric | Healthy | Warning | Action |
|--------|---------|---------|--------|
| Gross Margin | >75% | <60% | Review pricing |
| Churn Rate | <5%/mo | >10%/mo | Improve product |
| Free→Paid Conversion | >5% | <2% | Improve onboarding |
| Avg Revenue Per User | >$15 | <$10 | Upsell features |

---

## Summary: Key Numbers

| Metric | Value |
|--------|-------|
| Cost per 50k pageviews | **$0.55** |
| Best margin tier | **Starter (94%)** |
| Worst margin tier | **Scale (63%)** |
| Break-even customers | **3 Starter** |
| Max pageviews on free infra | **~100k/mo** |
| Upgrade trigger | **5 paying customers** |

---

## Quick Reference: Pricing Card

```
FREE        $0/mo     5,000 pageviews      1 site
STARTER     $9/mo     50,000 pageviews     3 sites
GROWTH      $19/mo    200,000 pageviews    10 sites
BUSINESS    $49/mo    1,000,000 pageviews  Unlimited
SCALE       $149/mo   5,000,000 pageviews  Unlimited + Real-time

Add-on: Real-time Analytics  $5/mo
```

---

*This document should be updated quarterly or when infrastructure costs change significantly.*
