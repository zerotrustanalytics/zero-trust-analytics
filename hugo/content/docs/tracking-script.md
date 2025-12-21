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
  data-site="YOUR_SITE_ID"
  data-honor-dnt="true"
  data-exclude="/admin/*,/preview/*"
  src="https://ztas.io/js/analytics.js">
</script>
```

### Available Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-site` | Yes | Your unique Site ID |
| `data-honor-dnt` | No | Respect Do Not Track browser setting (default: false) |
| `data-exclude` | No | Comma-separated URL patterns to exclude from tracking |
| `data-domain` | No | Override the domain for cross-subdomain tracking |

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

Use the `data-exclude` attribute to skip tracking on certain pages:

```html
<script
  defer
  data-site="YOUR_SITE_ID"
  data-exclude="/admin/*,/dashboard/*,/internal/*"
  src="https://ztas.io/js/analytics.js">
</script>
```

Supports wildcards (`*`) for pattern matching.

## Respecting Do Not Track

If you want to honor the browser's Do Not Track setting:

```html
<script
  defer
  data-site="YOUR_SITE_ID"
  data-honor-dnt="true"
  src="https://ztas.io/js/analytics.js">
</script>
```

When enabled, visitors with DNT will not be tracked.
