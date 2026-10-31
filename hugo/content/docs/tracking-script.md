---
title: "Tracking Script"
description: "Complete reference for the Zero Trust Analytics tracking script"
weight: 3
priority: 0.7
---

## Script Attributes

The tracking script supports several configuration options via `data-*` attributes:

```html
<script
  defer
  data-site-id="YOUR_SITE_ID"
  src="https://ztas.io/js/analytics.js">
</script>
```

### Available Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-site-id` | Yes | - | Your unique Site ID |
| `data-auto-track` | No | `true` | Automatically track page views |
| `data-spa` | No | `false` | SPA mode: a page view on each route change (path changes only; query-string and hash updates are not new pages) |
| `data-debug` | No | `false` | Enable console debug logging |
| `data-sample-rate` | No | `1` | Fraction of visitors to record (e.g. `0.5`). Applied server-side, consistently per visitor per day |
| `data-api` | No | `https://app.ztas.io` | API base URL — set this to your own server when self-hosting |
| `data-track-scroll` | No | `false` | Send events at 25%, 50%, 75% and 100% scroll depth |
| `data-track-outbound` | No | `true` | Track outbound link clicks |
| `data-track-downloads` | No | `true` | Track file downloads |
| `data-track-forms` | No | `true` | Track form submissions |

The script sets no cookies and stores nothing on the visitor's device. Visitors
and sessions are derived server-side from a daily-rotating, one-way hash.

## What Gets Tracked Automatically

When the script loads, it automatically tracks:

- **Page views** - Every page load and navigation
- **Session duration** - Time spent on your site
- **Bounce rate** - Visitors who leave without interaction
- **Referrer** - Where visitors came from
- **UTM parameters** - Campaign tracking data
- **Device info** - Mobile vs desktop, browser, OS
- **Geographic data** - Country and region (not IP-based)

## What We DON'T Track

- IP addresses (hashed immediately, never stored)
- Cookies (we don't use any)
- Personal data (names, emails, etc.)
- Cross-site behavior
- Fingerprints

## Script Size

The tracking script is under **3KB** minified and gzipped. It won't impact your page load performance.

## Excluding Pages

Configure page exclusions in your site settings in the dashboard. Go to **Sites → Settings → Exclude Paths** to add URL patterns that should not be tracked.

## Disabling Auto-Tracking

If you want full control over what gets tracked, disable auto-tracking:

```html
<script
  defer
  data-site-id="YOUR_SITE_ID"
  data-auto-track="false"
  src="https://ztas.io/js/analytics.js">
</script>
```

Then manually call `zta.trackPageview()` when you want to track a view.

## SPA Mode

For single-page applications that handle their own routing:

```html
<script
  defer
  data-site-id="YOUR_SITE_ID"
  data-spa="true"
  src="https://ztas.io/js/analytics.js">
</script>
```

In SPA mode, call `zta.trackPageview()` after each route change. See the [SPA Support](/docs/spa-support) guide for framework-specific examples.
