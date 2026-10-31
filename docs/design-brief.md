Design a complete visual identity and key screens for **Zero Trust Analytics (ZTA)** — privacy-first website analytics — covering both the marketing site (ztas.io) and the signed-in dashboard (app.ztas.io). One identity across both.

## What the product is (design around these real facts)
- Website analytics that never learns who anyone is. Site owners paste one script (~7 KB, ~2.4 KB gzipped); it sets no cookies and writes nothing to the visitor's device.
- Per visit we keep only: page path (query strings stripped), referring domain, UTM tags, country/region/city, device category + browser + OS name, time on page, and optional named events. Visitors are counted with a one-way hash of IP + browser that rotates daily — the IP itself is never stored.
- Unlimited sites on every plan; you pay for monthly events (pageviews + custom events), not per site. Free tier exists. Plan names: Free, Starter, Growth, Business, Scale, Enterprise — use [PRICE] and [LIMIT] placeholders, numbers aren't final.
- Data retention by plan (30 days → unlimited); aggregate charts are kept, raw events age out.
- Sign-in is passwordless (passkeys via our own SSO, "gatekeep").
- Audience: small businesses, agencies running many client sites, developers, and regulated fields (healthcare/dental, therapists, lawyers) who can't use Google Analytics.

## What I do NOT want (I've seen these too many times)
- Split hero with headline left + floating fake-dashboard card right
- Pill-shaped CTA pairs, gradient blue hero, 3-column icon feature strips
- Cream/beige + serif "editorial" look; dark "terminal/hacker" look with monospace and neon green
- Generic Bootstrap/Tailwind-UI SaaS template feel, stock illustrations, emoji, glassmorphism
Give it a distinct point of view — something a privacy/trust product could own.

## Screens to design
**Marketing (ztas.io)**
1. Home
2. Pricing (6 plans, monthly/yearly, an FAQ)
3. Live demo — a public, read-only dashboard of ztas.io's own traffic with a "start your free trial" banner
4. Docs article page (sidebar nav + long-form technical content with code blocks) — sections: Quickstart, Installation, Tracking script, Custom events, SPA support, Data collected, Privacy model, GDPR/CCPA, Self-hosting, API reference
5. Blog index + blog post (≈15 long-form posts, e.g. "Zero-knowledge: I can't look vs. I won't look", "Why Google Analytics is a HIPAA risk for dental practices")
6. Comparison page template ("ZTA vs Plausible / Fathom / Google Analytics")
7. Global header + footer. The footer MUST include a **Help** link to a user-manual section (auto-generated end-user docs), plus Privacy, Terms, Accessibility, Docs, Blog, Contact.

**Dashboard (app.ztas.io)**
8. Sites list (many sites per account; add-site flow with the one-line install snippet)
9. Site overview — KPIs (visitors, pageviews, bounce rate, avg time), visitors-over-time chart, top pages, sources, countries, devices/browsers/OS, UTM campaigns, period picker
10. Realtime view (visitors in the last 5/30 minutes)
11. Goals / conversion rules, Annotations on the chart
12. Settings: site settings, team members, API keys, billing/usage meter ("you've used 68% of this month's events")
13. Sign-in / sign-up (single "Continue with passkey" action)
14. Empty states (new site, no data yet) and the shared public-stats link view

Include desktop and phone widths for Home, Pricing, Site overview, and Sign-in.

## Constraints for implementation
- Marketing site is a static Hugo site; dashboard is Next.js 16 + Tailwind CSS 3. Use web-safe or Google Fonts.
- Accessible: WCAG 2.1 AA contrast, visible focus states, real buttons/links, charts readable without color alone.
- Support light and dark mode for the dashboard.

## Deliverables I need back
- The screens above
- Design tokens: color palette (light + dark) with hex values and roles, type scale (families, sizes, weights, line heights), spacing scale, radii, shadows — ideally as CSS custom properties and a Tailwind theme config
- Component specs: buttons, inputs, nav, cards/panels, tables, KPI tiles, chart styling, badges, tabs, modals, banners/alerts, code blocks
