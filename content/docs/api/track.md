---
title: "Track Endpoint"
description: "Send pageview and event data to Zero Trust Analytics"
weight: 11
priority: 0.7
---

## Overview

The Track endpoint receives pageview and event data from your website. This is what the tracking script uses internally, but you can also call it directly for server-side tracking.

## Endpoint

```
POST /api/track
```

**Note:** This endpoint doesn't require authentication - it uses your Site ID for authorization.

## Request Headers

```
Content-Type: application/json
```

## Request Body

### Pageview

```json
{
  "type": "pageview",
  "siteId": "site_abc123",
  "path": "/blog/my-article",
  "referrer": "https://google.com",
  "utm": {
    "source": "google",
    "medium": "cpc",
    "campaign": "summer-sale"
  }
}
```

### Custom Event

```json
{
  "type": "event",
  "siteId": "site_abc123",
  "path": "/pricing",
  "action": "signup_click",
  "category": "conversion",
  "label": "hero_button",
  "value": 1
}
```

### Engagement (Session End)

```json
{
  "type": "engagement",
  "siteId": "site_abc123",
  "path": "/blog/my-article",
  "sessionId": "sess_xyz789",
  "timeOnPage": 45,
  "isBounce": false
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Event type: `pageview`, `event`, `engagement`, `heartbeat` |
| `siteId` | string | Yes | Your unique Site ID |
| `path` | string | No | Page path (defaults to `/`) |
| `referrer` | string | No | Referring URL |
| `utm` | object | No | UTM campaign parameters |
| `utm.source` | string | No | Campaign source |
| `utm.medium` | string | No | Campaign medium |
| `utm.campaign` | string | No | Campaign name |
| `action` | string | No | Event name (for custom events) |
| `category` | string | No | Event category |
| `label` | string | No | Event label |
| `value` | number | No | Event value |
| `sessionId` | string | No | Session identifier |
| `timeOnPage` | number | No | Time spent on page in seconds |
| `isBounce` | boolean | No | Whether this was a bounce |

## Response

### Success

```json
{
  "success": true
}
```

### Error

```json
{
  "error": "Invalid site ID"
}
```

## CORS

The Track endpoint supports CORS for browser-based requests. The `Origin` header must match your registered site domain.

## Server-Side Tracking

For server-side tracking (Node.js, Python, etc.), call the endpoint directly:

```javascript
// Node.js example
const response = await fetch('https://ztas.io/api/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'pageview',
    siteId: 'site_abc123',
    path: '/api-tracked-page'
  })
})
```

## Bot Filtering

The endpoint automatically filters common bots and crawlers. Bot traffic is silently ignored (returns `success: true` but doesn't store data).
