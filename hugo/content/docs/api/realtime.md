---
title: "Realtime Endpoint"
description: "Get live visitor data for your site"
weight: 13
priority: 0.7
---

## Overview

The Realtime endpoint returns live data about visitors currently on your site.

## Endpoint

```
GET /api/realtime
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Your Site ID |

## Example Request

```bash
curl "https://ztas.io/api/realtime?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Response

```json
{
  "activeVisitors": 23,
  "pageviewsLast5Min": 47,
  "pageBreakdown": {
    "/": 8,
    "/pricing": 5,
    "/docs": 4,
    "/blog/getting-started": 3,
    "/features": 3
  },
  "recentPageviews": [
    {
      "page": "/pricing",
      "timestamp": "2024-12-10T14:32:15Z",
      "country": "US"
    },
    {
      "page": "/",
      "timestamp": "2024-12-10T14:32:08Z",
      "country": "GB"
    }
  ],
  "visitorsPerMinute": [
    { "minute": "14:28", "visitors": 4 },
    { "minute": "14:29", "visitors": 6 },
    { "minute": "14:30", "visitors": 5 },
    { "minute": "14:31", "visitors": 3 },
    { "minute": "14:32", "visitors": 5 }
  ],
  "timestamp": "2024-12-10T14:32:20Z"
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `activeVisitors` | number | Visitors active in the last 5 minutes |
| `pageviewsLast5Min` | number | Total pageviews in the last 5 minutes |
| `pageBreakdown` | object | Active visitors by page |
| `recentPageviews` | array | Most recent pageviews with timestamps |
| `visitorsPerMinute` | array | Visitor count for the last 5 minutes |
| `timestamp` | string | Server timestamp of this response |

## Polling

For live dashboards, poll this endpoint every 5-10 seconds:

```javascript
async function updateRealtime() {
  const response = await fetch(
    'https://ztas.io/api/realtime?siteId=site_abc123',
    { headers: { 'Authorization': 'Bearer YOUR_TOKEN' } }
  )
  const data = await response.json()

  document.getElementById('active').textContent = data.activeVisitors
  document.getElementById('pageviews').textContent = data.pageviewsLast5Min
}

// Update every 5 seconds
setInterval(updateRealtime, 5000)
updateRealtime()
```

## Cache Headers

This endpoint returns `Cache-Control: no-cache` to ensure you always get fresh data.

## Error Responses

### 400 Bad Request

```json
{
  "error": "Site ID required"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```
