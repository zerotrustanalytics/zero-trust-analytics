---
title: "Stats API Reference"
description: "Public API for accessing analytics data programmatically"
date: 2024-12-12
weight: 1
---

# Stats API

The Stats API provides programmatic access to your analytics data for external integrations, custom dashboards, and third-party tools.

## Authentication

All Stats API requests require authentication using an API key. API keys can be created in your account dashboard under **Settings > API Keys**.

### Creating an API Key

1. Navigate to **Settings > API Keys**
2. Click **Create New API Key**
3. Give your key a descriptive name (e.g., "WordPress Plugin", "Looker Studio")
4. Select permissions (read, write, admin)
5. Save the API key immediately - you won't be able to see it again!

### Using Your API Key

Include your API key in the `Authorization` header using the Bearer token format:

```
Authorization: Bearer zta_your_api_key_here
```

## Base URL

```
https://your-domain.netlify.app/api/stats-api
```

## Rate Limits

- **100 requests per minute** per API key
- Rate limit headers are included in all responses:
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Unix timestamp when the rate limit resets

When rate limited, you'll receive a `429 Too Many Requests` response with a `Retry-After` header.

## Request Format

All requests use the GET method with query parameters:

```
GET /api/stats-api?site_id=xxx&period=7d&metrics=visitors,pageviews
```

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `site_id` | string | Your site identifier (required) |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `7d` | Time period (see Period Options) |
| `date_from` | string | - | Start date for custom period (YYYY-MM-DD) |
| `date_to` | string | - | End date for custom period (YYYY-MM-DD) |
| `metrics` | string | `visitors,pageviews` | Comma-separated metrics (see Metrics) |
| `property` | string | - | Property breakdown (see Properties) |
| `filters` | string | - | Filter results (see Filters) |

## Period Options

| Period | Description |
|--------|-------------|
| `realtime` | Last 5 minutes |
| `day` | Today (since midnight) |
| `7d` | Last 7 days |
| `30d` | Last 30 days |
| `6mo` | Last 6 months |
| `12mo` | Last 12 months |
| `custom` | Custom date range (requires `date_from` and `date_to`) |

## Metrics

| Metric | Description |
|--------|-------------|
| `visitors` | Unique visitors |
| `pageviews` | Total pageviews |
| `bounce_rate` | Bounce rate percentage |
| `visit_duration` | Average visit duration in seconds |
| `views_per_visit` | Average pageviews per visit |

You can request multiple metrics by separating them with commas:

```
metrics=visitors,pageviews,bounce_rate
```

## Properties (Breakdowns)

Use the `property` parameter to break down metrics by a specific dimension:

| Property | Description |
|----------|-------------|
| `page` | Break down by page URL |
| `source` | Break down by referrer/traffic source |
| `country` | Break down by country |
| `device` | Break down by device type |
| `browser` | Break down by browser |
| `os` | Break down by operating system |

Example:

```
GET /api/stats-api?site_id=xxx&period=7d&property=page&metrics=visitors,pageviews
```

## Filters

Filter results using the `filters` parameter. Multiple filters can be combined with semicolons.

### Filter Syntax

```
property==value
```

### Wildcard Support

Use `*` for wildcard matching:

```
filters=page==/blog/*
```

### Multiple Filters

Combine filters with semicolons:

```
filters=page==/blog/*;country==US
```

## Response Format

All successful responses return JSON with the following structure:

```json
{
  "results": [
    {
      "date": "2024-12-11",
      "visitors": 150,
      "pageviews": 420
    },
    {
      "date": "2024-12-10",
      "visitors": 145,
      "pageviews": 398
    }
  ],
  "query": {
    "site_id": "xxx",
    "period": "7d",
    "metrics": ["visitors", "pageviews"]
  }
}
```

### Response Fields

- `results`: Array of data points (time series or property breakdown)
- `query`: Echo of your query parameters for verification

### Property Breakdown Response

When using the `property` parameter, results are grouped by that property:

```json
{
  "results": [
    {
      "page": "/",
      "visitors": 520,
      "pageviews": 850
    },
    {
      "page": "/blog",
      "visitors": 310,
      "pageviews": 645
    }
  ],
  "query": {
    "site_id": "xxx",
    "period": "7d",
    "property": "page",
    "metrics": ["visitors", "pageviews"]
  }
}
```

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `400` | Bad Request (invalid parameters) |
| `401` | Unauthorized (missing or invalid API key) |
| `403` | Forbidden (no access to this site) |
| `405` | Method Not Allowed (use GET only) |
| `429` | Too Many Requests (rate limit exceeded) |
| `500` | Internal Server Error |

## Code Examples

### cURL

```bash
curl -X GET \
  'https://your-domain.netlify.app/api/stats-api?site_id=xxx&period=7d&metrics=visitors,pageviews' \
  -H 'Authorization: Bearer zta_your_api_key_here'
```

### JavaScript (Node.js)

```javascript
const fetch = require('node-fetch');

async function getStats() {
  const response = await fetch(
    'https://your-domain.netlify.app/api/stats-api?site_id=xxx&period=7d&metrics=visitors,pageviews',
    {
      headers: {
        'Authorization': 'Bearer zta_your_api_key_here'
      }
    }
  );

  const data = await response.json();
  console.log(data);
}

getStats();
```

### JavaScript (Browser)

```javascript
fetch('https://your-domain.netlify.app/api/stats-api?site_id=xxx&period=7d&metrics=visitors,pageviews', {
  headers: {
    'Authorization': 'Bearer zta_your_api_key_here'
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

### Python

```python
import requests

url = 'https://your-domain.netlify.app/api/stats-api'
params = {
    'site_id': 'xxx',
    'period': '7d',
    'metrics': 'visitors,pageviews'
}
headers = {
    'Authorization': 'Bearer zta_your_api_key_here'
}

response = requests.get(url, params=params, headers=headers)
data = response.json()
print(data)
```

### Python (with error handling)

```python
import requests
from datetime import datetime, timedelta

class ZTAClient:
    def __init__(self, api_key, base_url='https://your-domain.netlify.app'):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}'
        })

    def get_stats(self, site_id, period='7d', metrics=None, **kwargs):
        """
        Get stats for a site

        Args:
            site_id (str): Site identifier
            period (str): Time period (realtime, day, 7d, 30d, 6mo, 12mo, custom)
            metrics (list): List of metrics to retrieve
            **kwargs: Additional query parameters

        Returns:
            dict: Stats data
        """
        params = {
            'site_id': site_id,
            'period': period
        }

        if metrics:
            params['metrics'] = ','.join(metrics)

        params.update(kwargs)

        response = self.session.get(
            f'{self.base_url}/api/stats-api',
            params=params
        )

        response.raise_for_status()
        return response.json()

# Usage
client = ZTAClient('zta_your_api_key_here')

# Get basic stats
stats = client.get_stats('site_xxx', period='7d', metrics=['visitors', 'pageviews'])
print(f"Total visitors: {sum(r['visitors'] for r in stats['results'])}")

# Get page breakdown
pages = client.get_stats('site_xxx', period='30d', property='page')
print(f"Top page: {pages['results'][0]['page']}")

# Custom date range
stats = client.get_stats(
    'site_xxx',
    period='custom',
    date_from='2024-12-01',
    date_to='2024-12-10',
    metrics=['visitors', 'pageviews', 'bounce_rate']
)
```

### PHP

```php
<?php

function getStats($apiKey, $siteId, $period = '7d', $metrics = 'visitors,pageviews') {
    $url = 'https://your-domain.netlify.app/api/stats-api?' . http_build_query([
        'site_id' => $siteId,
        'period' => $period,
        'metrics' => $metrics
    ]);

    $options = [
        'http' => [
            'header' => "Authorization: Bearer $apiKey\r\n",
            'method' => 'GET'
        ]
    ];

    $context = stream_context_create($options);
    $response = file_get_contents($url, false, $context);

    return json_decode($response, true);
}

// Usage
$apiKey = 'zta_your_api_key_here';
$siteId = 'xxx';
$stats = getStats($apiKey, $siteId, '7d', 'visitors,pageviews');

print_r($stats);
?>
```

### Ruby

```ruby
require 'net/http'
require 'json'
require 'uri'

class ZTAClient
  def initialize(api_key, base_url = 'https://your-domain.netlify.app')
    @api_key = api_key
    @base_url = base_url
  end

  def get_stats(site_id, period: '7d', metrics: nil, **options)
    params = {
      site_id: site_id,
      period: period
    }

    params[:metrics] = metrics.join(',') if metrics
    params.merge!(options)

    uri = URI("#{@base_url}/api/stats-api")
    uri.query = URI.encode_www_form(params)

    request = Net::HTTP::Get.new(uri)
    request['Authorization'] = "Bearer #{@api_key}"

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    JSON.parse(response.body)
  end
end

# Usage
client = ZTAClient.new('zta_your_api_key_here')
stats = client.get_stats('site_xxx', period: '7d', metrics: ['visitors', 'pageviews'])
puts stats
```

## Use Cases

### WordPress Plugin

Fetch stats to display in the WordPress admin dashboard:

```javascript
async function fetchStatsForWordPress(siteId, apiKey) {
  const response = await fetch(
    `https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=30d&metrics=visitors,pageviews`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );

  const data = await response.json();

  // Display in WordPress dashboard
  const totalVisitors = data.results.reduce((sum, day) => sum + day.visitors, 0);
  const totalPageviews = data.results.reduce((sum, day) => sum + day.pageviews, 0);

  return { totalVisitors, totalPageviews, dailyStats: data.results };
}
```

### Looker Studio Connector

Create a custom connector for Looker Studio (formerly Google Data Studio):

```javascript
// Looker Studio connector example
function getData(request) {
  const apiKey = 'zta_your_api_key_here';
  const siteId = request.configParams.siteId;
  const period = request.dateRange || '30d';

  const url = `https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=${period}&metrics=visitors,pageviews,bounce_rate`;

  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const data = JSON.parse(response.getContentText());

  // Transform to Looker Studio format
  return {
    schema: [
      { name: 'date', dataType: 'STRING' },
      { name: 'visitors', dataType: 'NUMBER' },
      { name: 'pageviews', dataType: 'NUMBER' },
      { name: 'bounce_rate', dataType: 'NUMBER' }
    ],
    rows: data.results.map(row => ({
      values: [row.date, row.visitors, row.pageviews, row.bounce_rate]
    }))
  };
}
```

### Custom Dashboard

Build a custom analytics dashboard:

```javascript
async function buildDashboard(siteId, apiKey) {
  // Fetch multiple datasets in parallel
  const [overview, pages, sources, countries] = await Promise.all([
    fetch(`https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=7d&metrics=visitors,pageviews,bounce_rate`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json()),

    fetch(`https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=7d&property=page&metrics=visitors,pageviews`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json()),

    fetch(`https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=7d&property=source&metrics=visitors`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json()),

    fetch(`https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=7d&property=country&metrics=visitors`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json())
  ]);

  return {
    overview: overview.results,
    topPages: pages.results.slice(0, 10),
    topSources: sources.results.slice(0, 10),
    topCountries: countries.results.slice(0, 10)
  };
}
```

## Best Practices

### 1. Cache Responses

To avoid hitting rate limits, cache API responses:

```javascript
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedStats(siteId, apiKey, period = '7d') {
  const cacheKey = `${siteId}:${period}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await fetch(
    `https://your-domain.netlify.app/api/stats-api?site_id=${siteId}&period=${period}`,
    { headers: { 'Authorization': `Bearer ${apiKey}` } }
  );

  const data = await response.json();
  cache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}
```

### 2. Handle Rate Limits Gracefully

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      console.log(`Rate limited. Retrying after ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

### 3. Batch Requests

Minimize API calls by requesting multiple metrics at once:

```javascript
// Good: Single request
const stats = await fetch(
  'https://your-domain.netlify.app/api/stats-api?site_id=xxx&period=7d&metrics=visitors,pageviews,bounce_rate,visit_duration',
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
);

// Avoid: Multiple requests
const visitors = await fetch('...&metrics=visitors');
const pageviews = await fetch('...&metrics=pageviews');
const bounceRate = await fetch('...&metrics=bounce_rate');
```

### 4. Secure Your API Keys

- Never commit API keys to version control
- Store API keys in environment variables
- Rotate API keys regularly
- Use separate keys for different integrations
- Revoke unused or compromised keys immediately

## Support

For API support or feature requests:
- Email: support@zta.io
- Documentation: https://your-domain.netlify.app/docs
- GitHub Issues: https://github.com/your-repo/issues
