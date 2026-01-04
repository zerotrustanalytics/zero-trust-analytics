---
title: "Public Stats"
description: "Public dashboard statistics endpoint with share token authentication"
weight: 36
priority: 0.7
---

# Public Stats API

The public stats API allows shared access to analytics dashboards using secure share tokens. This enables you to share specific analytics data with clients, stakeholders, or the public without requiring authentication.

## Endpoint

### Get Public Statistics

Retrieve analytics statistics for a shared dashboard.

**Endpoint:** `GET /api/public/stats`

**Authentication:** Share token (query parameter)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Valid share token for the dashboard |
| `period` | string | No | Time period for stats (default: `7d`) |

**Supported Periods:**
- `24h` - Last 24 hours
- `7d` - Last 7 days (default)
- `30d` - Last 30 days
- `90d` - Last 90 days
- `365d` - Last 365 days

**Note:** Available periods may be restricted by the share token configuration. If a period is not allowed, the API will return a 403 error.

**Response (Success):**
```json
{
  "site": {
    "domain": "example.com",
    "nickname": "My Website"
  },
  "period": "7d",
  "allowedPeriods": ["24h", "7d", "30d"],
  "uniqueVisitors": 1250,
  "pageviews": 3480,
  "bounceRate": 42.5,
  "avgSessionDuration": 185.3,
  "pages": [
    {
      "path": "/",
      "pageviews": 850,
      "uniqueVisitors": 620
    },
    {
      "path": "/about",
      "pageviews": 420,
      "uniqueVisitors": 380
    }
  ],
  "referrers": [
    {
      "source": "google.com",
      "visits": 450
    },
    {
      "source": "direct",
      "visits": 380
    }
  ],
  "devices": [
    {
      "type": "desktop",
      "count": 720
    },
    {
      "type": "mobile",
      "count": 480
    },
    {
      "type": "tablet",
      "count": 50
    }
  ],
  "browsers": [
    {
      "name": "Chrome",
      "count": 680
    },
    {
      "name": "Safari",
      "count": 320
    },
    {
      "name": "Firefox",
      "count": 180
    }
  ],
  "countries": [
    {
      "code": "US",
      "name": "United States",
      "count": 580
    },
    {
      "code": "GB",
      "name": "United Kingdom",
      "count": 240
    }
  ],
  "daily": [
    {
      "date": "2025-12-05",
      "pageviews": 485,
      "uniqueVisitors": 168
    },
    {
      "date": "2025-12-06",
      "pageviews": 512,
      "uniqueVisitors": 182
    }
  ]
}
```

**Response (Error - Missing Token):**
```json
{
  "error": "Share token required"
}
```

**Response (Error - Invalid Token):**
```json
{
  "error": "Invalid or expired share link"
}
```

**Response (Error - Period Not Allowed):**
```json
{
  "error": "Period not allowed for this share"
}
```

**Status Codes:**
- `200` - Statistics retrieved successfully
- `400` - Missing share token
- `403` - Period not allowed for this share token
- `404` - Invalid or expired share token
- `500` - Internal server error

---

## Share Tokens

Share tokens are secure, randomly generated identifiers that grant access to specific dashboard statistics.

### Token Features

**Security:**
- Tokens are unique and unguessable
- Can be revoked at any time by the dashboard owner
- Optional expiration dates
- No authentication required (token acts as authentication)

**Access Control:**
- Tokens are tied to specific sites/dashboards
- Can restrict available time periods
- Read-only access (no modifications)
- Limited to analytics data only

**Permissions:**
Share tokens may restrict which time periods are accessible. The `allowedPeriods` field in the response indicates which periods can be queried.

---

## Example Usage

### Basic Request

```javascript
const shareToken = 'abc123def456ghi789';
const period = '30d';

const response = await fetch(
  `/api/public/stats?token=${shareToken}&period=${period}`
);

const stats = await response.json();

console.log(`Unique visitors: ${stats.uniqueVisitors}`);
console.log(`Pageviews: ${stats.pageviews}`);
console.log(`Bounce rate: ${stats.bounceRate}%`);
```

### With Error Handling

```javascript
async function fetchPublicStats(token, period = '7d') {
  try {
    const url = new URL('/api/public/stats', window.location.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('period', period);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch stats');
    }

    return data;
  } catch (error) {
    console.error('Error fetching public stats:', error);
    throw error;
  }
}

// Usage
fetchPublicStats('your-share-token', '30d')
  .then(stats => {
    console.log('Stats loaded:', stats);
  })
  .catch(error => {
    console.error('Failed to load stats:', error.message);
  });
```

### Checking Allowed Periods

```javascript
const stats = await fetchPublicStats(token);

// Check which periods are available
if (stats.allowedPeriods) {
  console.log('Available periods:', stats.allowedPeriods);

  // Verify period is allowed before requesting
  if (stats.allowedPeriods.includes('90d')) {
    const quarterlyStats = await fetchPublicStats(token, '90d');
  }
}
```

---

## Data Insights

### Summary Metrics

The API provides key performance indicators:

- **Unique Visitors** - Count of distinct users in the period
- **Pageviews** - Total page views across all visitors
- **Bounce Rate** - Percentage of single-page sessions
- **Average Session Duration** - Mean session length in seconds

### Detailed Breakdowns

**Pages:**
Top performing pages with pageviews and unique visitor counts.

**Referrers:**
Traffic sources showing where visitors came from.

**Devices:**
Device type distribution (desktop, mobile, tablet).

**Browsers:**
Browser usage statistics.

**Countries:**
Geographic distribution of visitors by country code.

**Daily Stats:**
Time-series data showing daily pageviews and unique visitors.

---

## Caching

The public stats endpoint implements caching for performance:

- **Cache-Control:** `public, max-age=300` (5 minutes)
- Stats are cached for 5 minutes
- Reduces load on the database
- Improves response times for frequently accessed dashboards

Client applications should respect cache headers for optimal performance.

---

## CORS Support

The public stats endpoint supports CORS with:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

This allows the API to be accessed from any domain, making it suitable for embedding in external websites or applications.

---

## Use Cases

### Public Dashboard Embedding

Embed analytics on external websites:

```html
<div id="public-stats"></div>

<script>
  async function loadStats() {
    const stats = await fetchPublicStats('your-token');

    document.getElementById('public-stats').innerHTML = `
      <h3>Website Statistics</h3>
      <p>Unique Visitors: ${stats.uniqueVisitors.toLocaleString()}</p>
      <p>Pageviews: ${stats.pageviews.toLocaleString()}</p>
      <p>Bounce Rate: ${stats.bounceRate}%</p>
    `;
  }

  loadStats();
</script>
```

### Client Reporting

Share analytics with clients without giving them account access:

```javascript
// Generate report for client
const clientStats = await fetchPublicStats(clientToken, '30d');

// Display in dashboard
renderClientReport({
  siteName: clientStats.site.domain,
  metrics: {
    visitors: clientStats.uniqueVisitors,
    views: clientStats.pageviews,
    bounce: clientStats.bounceRate
  },
  topPages: clientStats.pages.slice(0, 10),
  traffic: clientStats.referrers
});
```

### Public Transparency

Display site metrics publicly:

```javascript
// Show real-time stats on about page
const publicStats = await fetchPublicStats('public-token', '24h');

document.getElementById('live-stats').innerHTML = `
  <p>In the last 24 hours:</p>
  <ul>
    <li>${publicStats.uniqueVisitors} visitors</li>
    <li>${publicStats.pageviews} page views</li>
    <li>${publicStats.countries.length} countries</li>
  </ul>
`;
```

---

## Security Considerations

1. **Token Protection** - Treat share tokens as secrets if the data is sensitive
2. **Token Rotation** - Regularly rotate tokens for sensitive dashboards
3. **Period Restrictions** - Limit available periods to control data exposure
4. **Expiration** - Set expiration dates for time-limited sharing
5. **Monitoring** - Track token usage to detect unauthorized access
6. **Revocation** - Revoke tokens immediately when access should end

---

## Best Practices

1. **Use specific periods** instead of always defaulting to 7d
2. **Check `allowedPeriods`** before requesting different time ranges
3. **Handle errors gracefully** with user-friendly messages
4. **Respect cache headers** to reduce server load
5. **Update periodically** rather than on every page load
6. **Display site name** from `site.domain` or `site.nickname`
7. **Format numbers** for readability (e.g., 1,250 instead of 1250)

---

## Related Documentation

- [Dashboard Features](/docs/features/dashboard/)
- [Sharing Dashboards](/docs/guides/sharing/)
- [Analytics Privacy](/docs/privacy/)
