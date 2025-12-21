---
title: "Heatmaps"
description: "Visualize user interactions with click and scroll heatmaps"
weight: 25
priority: 0.7
---

## Overview

Heatmaps visualize how users interact with your website by tracking clicks, scrolls, and mouse movements. Identify which elements get the most attention, where users get stuck, and how far they scroll down the page.

**Heatmap types:**

- **Click heatmaps** - Show where users click on the page
- **Scroll heatmaps** - Show how far users scroll down
- **Move heatmaps** - Show where users move their mouse
- **Attention heatmaps** - Combine scroll and time data to show engaged areas

## Endpoint

```
GET /api/heatmaps
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Get Heatmap Data

Retrieve heatmap data for a specific page.

### Request

```bash
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/pricing&type=click&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `path` | string | Yes | Page path to get heatmap for |
| `type` | string | Yes | Heatmap type: `click`, `scroll`, `move`, or `attention` |
| `period` | string | No | Time period: `24h`, `7d`, `30d`, `90d` (default: `7d`) |
| `startDate` | string | No | Custom start date (ISO 8601) |
| `endDate` | string | No | Custom end date (ISO 8601) |
| `device` | string | No | Filter by device: `desktop`, `mobile`, `tablet` |

### Response

#### Click Heatmap

```json
{
  "type": "click",
  "path": "/pricing",
  "period": "7d",
  "totalClicks": 3421,
  "pageviews": 8243,
  "clicks": [
    {
      "x": 512,
      "y": 234,
      "count": 876,
      "percentage": 25.6,
      "element": "button#signup",
      "text": "Get Started"
    },
    {
      "x": 640,
      "y": 567,
      "count": 432,
      "percentage": 12.6,
      "element": "a.pricing-link",
      "text": "View Features"
    },
    {
      "x": 450,
      "y": 890,
      "count": 234,
      "percentage": 6.8,
      "element": "button.contact",
      "text": "Contact Sales"
    }
  ],
  "viewport": {
    "width": 1280,
    "height": 1024
  }
}
```

#### Scroll Heatmap

```json
{
  "type": "scroll",
  "path": "/blog/article",
  "period": "7d",
  "pageviews": 5432,
  "scrollDepth": [
    {
      "depth": 0,
      "percentage": 100,
      "visitors": 5432
    },
    {
      "depth": 25,
      "percentage": 87.3,
      "visitors": 4742
    },
    {
      "depth": 50,
      "percentage": 64.2,
      "visitors": 3487
    },
    {
      "depth": 75,
      "percentage": 41.5,
      "visitors": 2254
    },
    {
      "depth": 100,
      "percentage": 23.7,
      "visitors": 1287
    }
  ],
  "avgScrollDepth": 58.3,
  "foldHeight": 768
}
```

#### Move Heatmap

```json
{
  "type": "move",
  "path": "/product",
  "period": "7d",
  "totalMovements": 45632,
  "pageviews": 3421,
  "movements": [
    {
      "x": 640,
      "y": 300,
      "intensity": 892,
      "percentage": 1.95
    },
    {
      "x": 400,
      "y": 450,
      "intensity": 654,
      "percentage": 1.43
    }
  ],
  "viewport": {
    "width": 1280,
    "height": 1024
  }
}
```

#### Attention Heatmap

```json
{
  "type": "attention",
  "path": "/",
  "period": "7d",
  "pageviews": 12543,
  "areas": [
    {
      "y": 200,
      "height": 400,
      "attention": 892,
      "avgTime": 12.5,
      "scrollReach": 98.3
    },
    {
      "y": 600,
      "height": 400,
      "attention": 654,
      "avgTime": 8.7,
      "scrollReach": 72.1
    },
    {
      "y": 1000,
      "height": 400,
      "attention": 234,
      "avgTime": 3.2,
      "scrollReach": 31.4
    }
  ]
}
```

## Response Fields

### Click Heatmap Fields

| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X coordinate of click (pixels from left) |
| `y` | number | Y coordinate of click (pixels from top) |
| `count` | number | Number of clicks at this location |
| `percentage` | number | Percentage of total clicks |
| `element` | string | CSS selector of clicked element |
| `text` | string | Text content of clicked element |

### Scroll Heatmap Fields

| Field | Type | Description |
|-------|------|-------------|
| `depth` | number | Scroll depth percentage (0-100) |
| `percentage` | number | Percentage of visitors who scrolled this far |
| `visitors` | number | Number of visitors who scrolled this far |

### Move Heatmap Fields

| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X coordinate of mouse position |
| `y` | number | Y coordinate of mouse position |
| `intensity` | number | Movement intensity at this location |
| `percentage` | number | Percentage of total movements |

### Attention Heatmap Fields

| Field | Type | Description |
|-------|------|-------------|
| `y` | number | Y coordinate of area start |
| `height` | number | Height of area in pixels |
| `attention` | number | Attention score (combination of time and scroll) |
| `avgTime` | number | Average time spent in this area (seconds) |
| `scrollReach` | number | Percentage of visitors who scrolled to this area |

## Get Popular Elements

Get the most clicked elements on a page.

### Request

```bash
curl "https://ztas.io/api/heatmaps/elements?siteId=site_abc123&path=/pricing&period=7d&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `path` | string | Yes | Page path |
| `period` | string | No | Time period: `24h`, `7d`, `30d` (default: `7d`) |
| `limit` | number | No | Maximum number of elements (default: 10, max: 50) |
| `device` | string | No | Filter by device type |

### Response

```json
{
  "path": "/pricing",
  "period": "7d",
  "pageviews": 8243,
  "elements": [
    {
      "element": "button#signup",
      "selector": "#signup",
      "text": "Get Started",
      "clicks": 876,
      "clickRate": 10.6,
      "avgClickTime": 45.3
    },
    {
      "element": "a.pricing-link",
      "selector": ".pricing-link",
      "text": "View Features",
      "clicks": 432,
      "clickRate": 5.2,
      "avgClickTime": 67.8
    },
    {
      "element": "button.contact",
      "selector": ".contact",
      "text": "Contact Sales",
      "clicks": 234,
      "clickRate": 2.8,
      "avgClickTime": 89.2
    }
  ]
}
```

## Get Rage Clicks

Identify areas where users repeatedly click in frustration (rage clicks).

### Request

```bash
curl "https://ztas.io/api/heatmaps/rage-clicks?siteId=site_abc123&path=/checkout&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "path": "/checkout",
  "period": "7d",
  "rageClicks": [
    {
      "x": 640,
      "y": 500,
      "element": "button#submit",
      "text": "Submit Order",
      "count": 54,
      "avgClicks": 8.3,
      "maxClicks": 23,
      "severity": "high"
    },
    {
      "x": 400,
      "y": 300,
      "element": "input#coupon",
      "text": "",
      "count": 23,
      "avgClicks": 6.2,
      "maxClicks": 15,
      "severity": "medium"
    }
  ]
}
```

**Rage click definition:** 5+ clicks in the same small area within 1 second

**Severity levels:**
- **High**: 10+ average clicks (critical UX issue)
- **Medium**: 6-9 average clicks (significant issue)
- **Low**: 5-6 average clicks (minor issue)

## Get Dead Clicks

Identify clicks on non-interactive elements.

### Request

```bash
curl "https://ztas.io/api/heatmaps/dead-clicks?siteId=site_abc123&path=/&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "path": "/",
  "period": "7d",
  "deadClicks": [
    {
      "x": 512,
      "y": 400,
      "element": "div.hero-image",
      "clicks": 234,
      "percentage": 6.8
    },
    {
      "x": 640,
      "y": 800,
      "element": "h2.section-title",
      "text": "Our Features",
      "clicks": 123,
      "percentage": 3.6
    }
  ],
  "totalDeadClicks": 357,
  "deadClickRate": 10.4
}
```

**Dead click:** Click on a non-interactive element (div, p, h1, etc.) that does nothing

## Enable Heatmap Tracking

Heatmaps require additional tracking code. Add this to your site:

```html
<script>
  window.zta = window.zta || function() {
    (window.zta.q = window.zta.q || []).push(arguments)
  };

  // Enable heatmap tracking
  window.zta('config', {
    heatmaps: true,
    heatmapTypes: ['click', 'scroll', 'move']
  });
</script>
<script async src="https://cdn.ztas.io/track.js" data-site-id="site_abc123"></script>
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `heatmaps` | boolean | false | Enable heatmap tracking |
| `heatmapTypes` | array | ['click', 'scroll'] | Types to track |
| `sampleRate` | number | 100 | Percentage of sessions to track (1-100) |
| `ignorePaths` | array | [] | Paths to exclude from tracking |

## Device-Specific Heatmaps

Get heatmaps for specific device types:

```bash
# Desktop heatmap
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&device=desktop" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Mobile heatmap
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&device=mobile" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Mobile and desktop heatmaps are tracked separately because viewport sizes and interaction patterns differ significantly.

## Viewport Normalization

Heatmap coordinates are normalized to a standard viewport size:

- **Desktop**: 1280x1024
- **Tablet**: 768x1024
- **Mobile**: 375x667

This allows aggregating data from users with different screen sizes.

## Use Cases

### 1. Optimize CTA Placement

Identify if users are clicking your primary CTA:

```bash
curl "https://ztas.io/api/heatmaps/elements?siteId=site_abc123&path=/&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

If your CTA has low clicks, consider:
- Moving it higher on the page
- Making it more prominent
- Changing the copy

### 2. Fix UX Issues

Find rage clicks and dead clicks:

```bash
# Find rage clicks (frustrated users)
curl "https://ztas.io/api/heatmaps/rage-clicks?siteId=site_abc123&path=/checkout" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Find dead clicks (confusing UI)
curl "https://ztas.io/api/heatmaps/dead-clicks?siteId=site_abc123&path=/" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Analyze Content Engagement

See how far users scroll on blog posts:

```bash
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/blog/article&type=scroll" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

If most users don't scroll past 50%, your intro might be too long.

### 4. A/B Test Validation

Compare heatmaps before and after design changes:

```bash
# Before: Oct 1-31
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&startDate=2024-10-01&endDate=2024-10-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# After: Nov 1-30
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&startDate=2024-11-01&endDate=2024-11-30" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Heatmap Limits

| Plan | Heatmap Tracking | Retention |
|------|------------------|-----------|
| Free | Not available | - |
| Pro | Up to 10 pages | 90 days |
| Business | Up to 50 pages | 1 year |
| Enterprise | Unlimited | 2 years |

## Performance Considerations

Heatmap tracking has minimal performance impact:

- **File size**: +2KB to tracking script
- **CPU usage**: <1% on modern devices
- **Network**: 1 request per session (batched)

For high-traffic sites, use sampling to reduce data volume:

```javascript
window.zta('config', {
  heatmaps: true,
  sampleRate: 50  // Track 50% of sessions
});
```

## Privacy

Heatmaps respect user privacy:

- No personal data is collected
- No text input values are captured
- Password fields are automatically excluded
- Complies with GDPR and CCPA

## Error Responses

### 400 Bad Request

```json
{
  "error": "Site ID and path are required"
}
```

```json
{
  "error": "Invalid heatmap type. Must be: click, scroll, move, or attention"
}
```

### 403 Forbidden

```json
{
  "error": "Heatmaps require Pro plan or higher"
}
```

### 404 Not Found

```json
{
  "error": "No heatmap data found for this page"
}
```

Enable heatmap tracking and wait for data to accumulate.

## Best Practices

### 1. Track Important Pages First

Start with high-impact pages:
- Landing pages
- Pricing pages
- Checkout flow
- Signup forms

### 2. Use Appropriate Sample Rates

For high-traffic sites, sample to reduce data volume:

```javascript
// Enterprise site: 1M+ pageviews/month
window.zta('config', { sampleRate: 10 });

// Medium site: 100K pageviews/month
window.zta('config', { sampleRate: 50 });

// Small site: <10K pageviews/month
window.zta('config', { sampleRate: 100 });
```

### 3. Combine with Analytics

Cross-reference heatmaps with bounce rate and time on page:

```bash
# Low scroll depth + high bounce rate = poor content
# High clicks on dead elements = confusing UI
```

### 4. Track Over Time

Compare heatmaps across periods to see trends:

```bash
# Last month
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Mobile vs Desktop

Always analyze mobile and desktop separately:

```bash
curl "https://ztas.io/api/heatmaps?siteId=site_abc123&path=/&type=click&device=mobile" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Mobile users interact differently than desktop users.
