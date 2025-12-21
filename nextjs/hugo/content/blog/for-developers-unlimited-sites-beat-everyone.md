---
title: "For Developers: Our Pricing Model Beats Everyone (Unlimited Sites)"
description: "You've got side projects, client sites, and experiments. Per-site pricing kills you. Here's why unlimited-site analytics is the developer's best friend."
date: 2025-03-03
author: "Zero Trust Analytics Team"
category: "Product Updates"
tags: ["Developers", "Pricing", "Side Projects", "Unlimited", "Value"]
priority: 0.8
---

Let me guess your situation:

- Your portfolio site
- That SaaS you're building on the side
- The client site you're maintaining
- Three abandoned projects you might resurrect
- A blog that gets sporadic traffic
- Landing pages for experiments

That's 7+ sites. At $9-19 per site (Plausible, Fathom, etc.), you're looking at $63-133/month just for basic analytics.

**Or you could pay $15/month. Total. For all of them.**

## The Developer's Analytics Problem

We know developers because we are developers. And we know the analytics struggle:

### The Side Project Tax

You build a thing. It might take off, it might not. But you need analytics to know if anyone cares.

Traditional pricing: "That'll be $9/month per site."

You have 5 side projects? That's $45/month for projects that might generate $0. Most developers either:
- Use Google Analytics (privacy nightmare)
- Skip analytics entirely (fly blind)
- Use janky self-hosted solutions (maintenance burden)

None of these are good options.

### The Client Site Awkwardness

You build sites for clients. They need analytics. Options:

1. Help them set up Google Analytics (now they have compliance problems)
2. Bill them for per-site analytics (adds friction to projects)
3. Absorb the cost yourself (eats your margin)
4. Use your own analytics... wait, per-site pricing again

### The Experiment Problem

You want to A/B test a landing page. Or try a new positioning. Or see if that domain you bought gets any organic traffic.

Traditional pricing makes every experiment cost $9-19/month. That kills experimentation.

## Our Approach: Unlimited Sites

Zero Trust Analytics: **$15/month for unlimited sites.**

- Portfolio site? Covered.
- SaaS project? Covered.
- Client sites? Covered.
- Side projects? Covered.
- Experiments? Covered.
- That domain you might do something with someday? Covered.

Add as many sites as you want. The price doesn't change.

## The Math That Makes Sense

| Sites | Plausible | Fathom | Zero Trust Analytics |
|-------|-----------|--------|---------------------|
| 1 | $9 | $15 | $15 |
| 3 | $27 | $45 | $15 |
| 5 | $45 | $75 | $15 |
| 10 | $90 | $150 | $15 |
| 20 | $180 | $300 | $15 |

At 2 sites, we're competitive. At 3+, we're cheaper. At 10+, it's not even close.

## What You Get

### Simple Integration

One script tag. That's it.

```html
<script defer data-site="YOUR_SITE_ID" src="https://ztas.io/js/analytics.js"></script>
```

No npm packages to install. No build step integration. No configuration files. Works with any stack.

### API Access

Every plan includes API access. Build custom dashboards, integrate with your tools, export data programmatically.

```bash
curl "https://ztas.io/api/stats?siteId=YOUR_SITE&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Multiple Sites, One Dashboard

Toggle between sites with a click. Compare traffic across projects. See everything in one place.

### No Cookie Banners

We don't use cookies. Your sites don't need cookie consent banners. Better UX, less code, simpler maintenance.

### Accurate Data

Ad blockers block Google Analytics. They generally don't block us. You see more of your real traffic.

## Perfect For:

### Indie Hackers

Building in public? You need analytics for every project. Per-site pricing kills this. Unlimited sites lets you track everything.

### Freelancers

Client sites need analytics. With unlimited sites, include it in every project. No awkward "analytics costs $X extra" conversations.

### Agency Developers

Managing multiple client sites? One account. All sites. Simple billing you can factor into your rates.

### Open Source Maintainers

Documentation sites, landing pages, demo apps. Track them all without budget stress.

### The Serially Curious

You start lots of projects. Some work, most don't. That's the developer life. Analytics shouldn't punish experimentation.

## Self-Hosted? We Respect That.

Some developers prefer self-hosted analytics (Umami, Plausible self-hosted, etc.). We get it. You want control.

But consider the real cost:

- Server: $5-20/month minimum
- Setup time: Several hours
- Maintenance: Updates, security patches, backups
- Database: Storage costs, performance tuning
- Debugging: When something breaks at 2am

If your time is worth anything, self-hosting costs more than $15/month.

We handle the infrastructure. You focus on building.

## The Privacy Angle (Because Developers Care)

We're not just cheap. We're private.

- **No cookies** - No consent banners on your sites
- **No IP storage** - Hashed immediately, discarded
- **No tracking across sites** - Each site is isolated
- **Open about what we collect** - [Full documentation](/docs/data-collected/)

Your users get privacy. You get analytics. No ethical compromise.

## Getting Started

```bash
# 1. Sign up (free trial, no card required)
# 2. Create a site in dashboard
# 3. Add to your site
```

```html
<script defer data-site="site_xxx" src="https://ztas.io/js/analytics.js"></script>
```

That's literally it. You'll see data within seconds.

## The Bottom Line

You're a developer. You understand value propositions.

**Google Analytics:** Free, but privacy nightmare, compliance risk, complex, blocked by ad blockers

**Per-site analytics:** Privacy-friendly, but $$$$ when you have multiple projects

**Zero Trust Analytics:** Privacy-friendly, simple, $15/month regardless of how many sites

For developers with side projects, client work, and experiments, unlimited-site pricing is the obvious choice.

---

*Built by developers, for developers. [Start your free trial](/register/) and track all your projects for one simple price.*
