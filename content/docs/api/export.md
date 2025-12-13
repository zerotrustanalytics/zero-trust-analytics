---
title: "Export Endpoint"
description: "Export your analytics data as JSON or CSV"
weight: 14
priority: 0.7
---

## Overview

The Export endpoint lets you download your analytics data for offline analysis, backups, or integration with other tools.

## Endpoint

```
GET /api/export
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Your Site ID |
| `format` | string | No | Output format: `json` or `csv` (default: `json`) |
| `type` | string | No | Data type: `summary`, `pageviews`, `events` (default: `summary`) |
| `period` | string | No | Time period: `7d`, `30d`, `90d`, `365d` (default: `30d`) |
| `limit` | number | No | Max rows to return (default: 10000) |

## Export Types

### Summary (Default)

Daily aggregated data:

```bash
curl "https://ztas.io/api/export?siteId=site_abc123&type=summary&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "site_id": "site_abc123",
  "period": {
    "start": "2024-11-10T00:00:00Z",
    "end": "2024-12-10T00:00:00Z"
  },
  "type": "summary",
  "count": 30,
  "data": [
    {
      "date": "2024-12-09",
      "pageviews": 423,
      "unique_visitors": 187,
      "sessions": 201,
      "bounces": 84,
      "bounce_rate": 41.8,
      "avg_time_on_page": 65
    }
  ]
}
```

### Pageviews

Individual pageview records:

```bash
curl "https://ztas.io/api/export?siteId=site_abc123&type=pageviews&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response includes:**
- Timestamp
- Page path
- Referrer
- UTM parameters
- Device, browser, OS
- Country, region
- Time on page
- Bounce flag

### Events

Custom event records:

```bash
curl "https://ztas.io/api/export?siteId=site_abc123&type=events&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response includes:**
- Timestamp
- Event type
- Event name
- Event data (category, label, value)
- Page path
- Device
- Country

## CSV Export

Add `format=csv` for CSV output:

```bash
curl "https://ztas.io/api/export?siteId=site_abc123&type=summary&format=csv" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o analytics-export.csv
```

**Response:**

```csv
Date,Pageviews,Unique Visitors,Sessions,Bounces,Bounce Rate,Avg Time on Page
2024-12-09,423,187,201,84,41.8%,65s
2024-12-08,398,172,189,76,40.2%,71s
```

## Large Exports

For large date ranges, use the `limit` parameter or paginate:

```bash
# First 10,000 records
curl "https://ztas.io/api/export?siteId=site_abc123&type=pageviews&limit=10000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Use Cases

### Backup Your Data

```bash
# Weekly backup script
curl "https://ztas.io/api/export?siteId=site_abc123&type=pageviews&format=csv&period=7d" \
  -H "Authorization: Bearer $ZTA_TOKEN" \
  -o "backup-$(date +%Y-%m-%d).csv"
```

### Import to Google Sheets

1. Export as CSV
2. Open Google Sheets
3. File > Import > Upload
4. Select your CSV file

### Analyze in Python

```python
import requests
import pandas as pd

response = requests.get(
    'https://ztas.io/api/export',
    params={'siteId': 'site_abc123', 'type': 'summary', 'period': '30d'},
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)

data = response.json()
df = pd.DataFrame(data['data'])
print(df.describe())
```
