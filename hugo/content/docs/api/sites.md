---
title: "Sites"
description: "Manage your websites and analytics properties"
weight: 27
priority: 0.7
---

## Overview

The Sites API allows you to create, list, update, and delete websites (analytics properties) in your Zero Trust Analytics account. Each site has a unique ID used for tracking and data retrieval.

## Endpoints

```
GET /api/sites
POST /api/sites
DELETE /api/sites
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Sites

Get all sites in your account.

### Request

```bash
curl "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "sites": [
    {
      "id": "site_abc123",
      "domain": "example.com",
      "name": "Example Website",
      "timezone": "America/New_York",
      "public": false,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "stats": {
        "pageviews": 125432,
        "visitors": 45231,
        "lastPageview": "2024-12-12T16:30:00.000Z"
      },
      "teamMembers": 3
    },
    {
      "id": "site_def456",
      "domain": "blog.example.com",
      "name": "Example Blog",
      "timezone": "America/Los_Angeles",
      "public": true,
      "createdAt": "2024-03-20T14:00:00.000Z",
      "stats": {
        "pageviews": 87654,
        "visitors": 32145,
        "lastPageview": "2024-12-12T16:25:00.000Z"
      },
      "teamMembers": 2
    }
  ]
}
```

## Create Site

Add a new website to track analytics.

### Request

```bash
curl -X POST "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "newsite.com",
    "name": "New Site",
    "timezone": "America/New_York",
    "public": false
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | Yes | Website domain (without protocol) |
| `name` | string | No | Friendly name for the site (defaults to domain) |
| `timezone` | string | No | Timezone for date/time display (default: UTC) |
| `public` | boolean | No | Make stats publicly viewable (default: false) |

### Domain Format

Domains should be provided without protocol or path:

✅ Good:
- `example.com`
- `www.example.com`
- `blog.example.com`

❌ Bad:
- `https://example.com`
- `example.com/`
- `example.com/blog`

### Timezone

Use IANA timezone identifiers:

- `America/New_York`
- `America/Los_Angeles`
- `America/Chicago`
- `Europe/London`
- `Europe/Paris`
- `Asia/Tokyo`
- `UTC`

[Full list of timezones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

### Response

```json
{
  "site": {
    "id": "site_abc123",
    "domain": "newsite.com",
    "name": "New Site",
    "timezone": "America/New_York",
    "public": false,
    "createdAt": "2024-12-12T16:00:00.000Z",
    "trackingCode": "<script async src=\"https://cdn.ztas.io/track.js\" data-site-id=\"site_abc123\"></script>"
  }
}
```

**Important:** Save the `trackingCode` - you'll need to add it to your website to start collecting analytics.

## Update Site

Modify site settings.

### Request

```bash
curl -X PATCH "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "site_abc123",
    "name": "Updated Name",
    "timezone": "America/Los_Angeles",
    "public": true
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Site ID to update |
| `name` | string | No | New site name |
| `timezone` | string | No | New timezone |
| `public` | boolean | No | Change public visibility |

**Note:** You cannot change the domain after creation. Delete and recreate the site if needed.

### Response

```json
{
  "site": {
    "id": "site_abc123",
    "domain": "example.com",
    "name": "Updated Name",
    "timezone": "America/Los_Angeles",
    "public": true,
    "updatedAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Delete Site

Permanently delete a site and all its analytics data.

### Request

```bash
curl -X DELETE "https://ztas.io/api/sites?id=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Site ID to delete |

**Warning:** This action is irreversible. All analytics data, goals, funnels, and settings will be permanently deleted.

### Response

```json
{
  "success": true,
  "message": "Site deleted successfully"
}
```

## Get Site Details

Get detailed information about a specific site.

### Request

```bash
curl "https://ztas.io/api/sites/site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "site": {
    "id": "site_abc123",
    "domain": "example.com",
    "name": "Example Website",
    "timezone": "America/New_York",
    "public": false,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "owner": {
      "id": "user_abc123",
      "email": "owner@example.com",
      "name": "Alice Johnson"
    },
    "stats": {
      "pageviews": 125432,
      "visitors": 45231,
      "sessions": 67543,
      "bounceRate": 42.5,
      "avgSessionDuration": 185,
      "lastPageview": "2024-12-12T16:30:00.000Z"
    },
    "team": [
      {
        "id": "user_abc123",
        "email": "owner@example.com",
        "role": "owner"
      },
      {
        "id": "user_def456",
        "email": "admin@example.com",
        "role": "admin"
      }
    ],
    "goals": 5,
    "funnels": 2,
    "alerts": 3
  }
}
```

## Public Sites

Make your analytics data publicly viewable:

```bash
curl -X PATCH "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "site_abc123",
    "public": true
  }'
```

When `public` is `true`:
- Anyone can view analytics at `https://ztas.io/public/site_abc123`
- No authentication required
- Read-only access
- Great for open-source projects and transparency

**Public dashboard URL:** `https://ztas.io/public/{siteId}`

## Tracking Code

After creating a site, add the tracking code to your website:

### Standard Installation

Add before the closing `</head>` tag:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <!-- Zero Trust Analytics -->
  <script async src="https://cdn.ztas.io/track.js" data-site-id="site_abc123"></script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

### Next.js

Add to `pages/_app.js` or `app/layout.js`:

```javascript
import Script from 'next/script'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Script
        src="https://cdn.ztas.io/track.js"
        data-site-id="site_abc123"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  )
}
```

### React

Add to your main component:

```javascript
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.ztas.io/track.js';
    script.setAttribute('data-site-id', 'site_abc123');
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return <div>Your app</div>;
}
```

### WordPress

Add to your theme's `header.php` before `</head>`:

```php
<script async src="https://cdn.ztas.io/track.js" data-site-id="site_abc123"></script>
<?php wp_head(); ?>
```

Or use the Zero Trust Analytics WordPress plugin.

## Site Limits

| Plan | Max Sites |
|------|-----------|
| Free | 3 |
| Pro | 10 |
| Business | 50 |
| Enterprise | Unlimited |

## Site Settings

### Exclude Paths

Exclude certain paths from tracking:

```bash
curl -X PATCH "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "site_abc123",
    "settings": {
      "excludePaths": ["/admin", "/dashboard"]
    }
  }'
```

### Ignore Query Parameters

Ignore specific query parameters in URLs:

```bash
curl -X PATCH "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "site_abc123",
    "settings": {
      "ignoreParams": ["utm_source", "utm_medium", "fbclid"]
    }
  }'
```

### Data Retention

Configure how long to keep analytics data:

```bash
curl -X PATCH "https://ztas.io/api/sites" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "site_abc123",
    "settings": {
      "dataRetention": 365
    }
  }'
```

| Plan | Default Retention | Max Retention |
|------|-------------------|---------------|
| Free | 90 days | 90 days |
| Pro | 1 year | 2 years |
| Business | 2 years | 5 years |
| Enterprise | 2 years | Unlimited |

## Data Export

Export all site data before deleting:

```bash
curl "https://ztas.io/api/sites/site_abc123/export" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Returns a download URL for a ZIP file containing:
- All pageview data (CSV)
- Custom events (CSV)
- Goals and funnels (JSON)
- Site settings (JSON)

See [Export API](/docs/api/export/) for more details.

## Verify Domain Ownership

For certain features (custom domains, SSO), you may need to verify domain ownership:

```bash
curl "https://ztas.io/api/sites/site_abc123/verify" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Returns a TXT record to add to your DNS:

```json
{
  "verification": {
    "type": "TXT",
    "name": "_zta-verify",
    "value": "zta-verify=abc123def456"
  }
}
```

Add this TXT record to your DNS, then verify:

```bash
curl -X POST "https://ztas.io/api/sites/site_abc123/verify" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Domain is required"
}
```

```json
{
  "error": "Invalid domain format"
}
```

```json
{
  "error": "Invalid timezone"
}
```

### 403 Forbidden

```json
{
  "error": "Site limit reached. Upgrade to create more sites."
}
```

```json
{
  "error": "Only the site owner can delete this site"
}
```

### 404 Not Found

```json
{
  "error": "Site not found"
}
```

### 409 Conflict

```json
{
  "error": "A site with this domain already exists"
}
```

## Best Practices

### 1. Use Descriptive Names

Make it easy to identify sites:

✅ Good: "Marketing Website", "Product Documentation", "Blog"
✗ Bad: "Site 1", "Test", "ABC"

### 2. Set the Correct Timezone

Match your business timezone for accurate daily reports:

```bash
{
  "timezone": "America/New_York"  # If your team is in NYC
}
```

### 3. One Site Per Domain

Create separate sites for:
- `example.com` (main site)
- `blog.example.com` (blog)
- `app.example.com` (application)

Don't combine them into one site unless they share the same navigation.

### 4. Use Public Sites for Transparency

Show your metrics publicly:

```bash
{
  "public": true
}
```

Great for:
- Open-source projects
- Transparency initiatives
- Building trust

### 5. Configure Exclusions Early

Exclude admin and internal pages:

```bash
{
  "settings": {
    "excludePaths": ["/admin", "/dashboard", "/internal"]
  }
}
```

### 6. Test Tracking Before Launch

Verify tracking works:

```bash
# Send a test pageview
curl -X POST "https://ztas.io/api/track" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pageview",
    "siteId": "site_abc123",
    "path": "/test"
  }'

# Check realtime stats
curl "https://ztas.io/api/realtime?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Example: Multi-Site Management

Manage multiple client sites:

```javascript
const API_KEY = 'zta_live_abc123...';

// Create sites for all clients
const clients = [
  { domain: 'client1.com', name: 'Client 1' },
  { domain: 'client2.com', name: 'Client 2' },
  { domain: 'client3.com', name: 'Client 3' }
];

for (const client of clients) {
  const response = await fetch('https://ztas.io/api/sites', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      domain: client.domain,
      name: client.name,
      timezone: 'America/New_York'
    })
  });

  const data = await response.json();
  console.log(`Created site for ${client.name}: ${data.site.id}`);
}

// List all sites
const sitesResponse = await fetch('https://ztas.io/api/sites', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

const sites = await sitesResponse.json();
console.log(`Total sites: ${sites.sites.length}`);
```

## Example: Site Backup

Backup all site configurations:

```python
import requests
import json

API_KEY = 'zta_live_abc123...'

# Get all sites
response = requests.get(
    'https://ztas.io/api/sites',
    headers={'Authorization': f'Bearer {API_KEY}'}
)

sites = response.json()['sites']

# Save to file
with open('sites_backup.json', 'w') as f:
    json.dump(sites, f, indent=2)

print(f"Backed up {len(sites)} sites")
```
