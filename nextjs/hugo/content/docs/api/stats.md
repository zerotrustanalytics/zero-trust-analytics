---
title: "Stats Endpoint"
description: "Retrieve analytics data for your sites"
weight: 12
priority: 0.7
---

## Overview

The Stats endpoint returns aggregated analytics data for a site over a specified time period.

## Endpoint

```
GET /api/stats
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Your Site ID |
| `period` | string | No | Time period: `24h`, `7d`, `30d`, `90d`, `365d` (default: `7d`) |
| `startDate` | string | No | Custom start date (ISO 8601) |
| `endDate` | string | No | Custom end date (ISO 8601) |

## Example Request

```bash
curl "https://ztas.io/api/stats?siteId=site_abc123&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Response

```json
{
  "summary": {
    "pageviews": 12543,
    "uniqueVisitors": 4821,
    "sessions": 5432,
    "bounceRate": 42.5,
    "avgSessionDuration": 185,
    "avgTimeOnPage": 67
  },
  "timeseries": [
    {
      "date": "2024-12-01",
      "pageviews": 412,
      "uniqueVisitors": 156
    },
    {
      "date": "2024-12-02",
      "pageviews": 389,
      "uniqueVisitors": 142
    }
  ],
  "topPages": [
    { "path": "/", "pageviews": 3421, "uniqueVisitors": 2100 },
    { "path": "/pricing", "pageviews": 1234, "uniqueVisitors": 890 },
    { "path": "/blog/getting-started", "pageviews": 876, "uniqueVisitors": 654 }
  ],
  "topReferrers": [
    { "domain": "google.com", "visits": 2341 },
    { "domain": "twitter.com", "visits": 543 },
    { "domain": "(direct)", "visits": 1234 }
  ],
  "devices": {
    "desktop": 65.4,
    "mobile": 32.1,
    "tablet": 2.5
  },
  "browsers": [
    { "name": "Chrome", "percentage": 58.2 },
    { "name": "Safari", "percentage": 24.1 },
    { "name": "Firefox", "percentage": 10.3 }
  ],
  "countries": [
    { "code": "US", "name": "United States", "visits": 3421 },
    { "code": "GB", "name": "United Kingdom", "visits": 876 },
    { "code": "CA", "name": "Canada", "visits": 543 }
  ],
  "trafficSources": {
    "direct": 34.2,
    "organic": 28.5,
    "referral": 21.3,
    "social": 12.1,
    "paid": 3.9
  }
}
```

## Response Fields

### Summary

| Field | Type | Description |
|-------|------|-------------|
| `pageviews` | number | Total page views |
| `uniqueVisitors` | number | Unique visitors (based on anonymous hash) |
| `sessions` | number | Total sessions |
| `bounceRate` | number | Bounce rate percentage |
| `avgSessionDuration` | number | Average session duration in seconds |
| `avgTimeOnPage` | number | Average time on page in seconds |

### Timeseries

Daily breakdown of pageviews and visitors. Useful for charting trends.

### Top Pages

Most visited pages, sorted by pageview count.

### Top Referrers

Traffic sources by referring domain. `(direct)` indicates no referrer.

### Devices, Browsers, Countries

Breakdowns by device type, browser, and geographic location.

## Custom Date Range

For custom date ranges, use `startDate` and `endDate`:

```bash
curl "https://ztas.io/api/stats?siteId=site_abc123&startDate=2024-11-01&endDate=2024-11-30" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

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

You don't own this site.
