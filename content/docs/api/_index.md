---
title: "API Reference"
description: "Complete API reference for Zero Trust Analytics"
weight: 1
priority: 0.7
---

## Overview

The Zero Trust Analytics API provides programmatic access to your analytics data, site management, and advanced features like webhooks, goals, and funnels. All API endpoints use HTTPS and return JSON responses.

**Base URL:** `https://ztas.io/api`

## Authentication

Most API endpoints require authentication using JWT (JSON Web Tokens). See the [Authentication](/docs/api/authentication/) guide for details on obtaining and using tokens.

```bash
curl https://ztas.io/api/stats?siteId=site_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Quick Start

1. **Get your credentials** - Log in to get a JWT token
2. **Make your first request** - Fetch analytics data for your site
3. **Explore the API** - Check out the endpoint documentation below

### Example: Fetch Analytics

```bash
# Get JWT token
TOKEN=$(curl -X POST https://ztas.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}' \
  | jq -r '.token')

# Fetch analytics data
curl "https://ztas.io/api/stats?siteId=site_abc123&period=7d" \
  -H "Authorization: Bearer $TOKEN"
```

## API Endpoints

### Core Analytics

- [**Authentication**](/docs/api/authentication/) - Login, password reset, and token management
- [**Stats**](/docs/api/stats/) - Get aggregated analytics data
- [**Track**](/docs/api/track/) - Send pageview and event data
- [**Export**](/docs/api/export/) - Export analytics data
- [**Realtime**](/docs/api/realtime/) - Get real-time visitor data

### Site Management

- [**Sites**](/docs/api/sites/) - Create, list, and delete sites
- [**API Keys**](/docs/api/api-keys/) - Manage API keys for programmatic access
- [**Teams**](/docs/api/teams/) - Invite and manage team members

### Advanced Features

- [**Goals**](/docs/api/goals/) - Create and track conversion goals
- [**Funnels**](/docs/api/funnels/) - Analyze user conversion funnels
- [**Alerts**](/docs/api/alerts/) - Set up automated alerts
- [**Webhooks**](/docs/api/webhooks/) - Receive real-time event notifications
- [**Heatmaps**](/docs/api/heatmaps/) - Get click and scroll heatmap data
- [**Activity Log**](/docs/api/activity-log/) - View account activity history

## Rate Limits

API requests are rate-limited to ensure service quality:

- **100 requests per minute** per user
- **1000 requests per hour** per user

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate limit exceeded. Try again in 60 seconds."
}
```

## Response Format

All API endpoints return JSON responses with consistent formatting:

### Success Response

```json
{
  "data": {
    // Response data
  }
}
```

### Error Response

```json
{
  "error": "Error message describing what went wrong"
}
```

## HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created - Resource successfully created |
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid authentication |
| `403` | Forbidden - Authenticated but not authorized |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Something went wrong on our end |

## Best Practices

### Security

1. **Use HTTPS** - Always use HTTPS for API requests
2. **Protect your tokens** - Never expose JWT tokens in client-side code or URLs
3. **Rotate API keys** - Regularly rotate API keys and revoke unused ones
4. **Limit scope** - Only request data for resources you own

### Performance

1. **Cache responses** - Cache analytics data that doesn't change frequently
2. **Use appropriate time periods** - Request only the data you need
3. **Batch operations** - Group related API calls when possible
4. **Handle rate limits** - Implement exponential backoff for rate limit errors

### Error Handling

Always handle errors gracefully:

```javascript
try {
  const response = await fetch('https://ztas.io/api/stats?siteId=site_abc123', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired - get a new one
      await refreshToken();
    } else if (response.status === 429) {
      // Rate limited - wait and retry
      await sleep(60000);
    }
  }

  const data = await response.json();
} catch (error) {
  console.error('API request failed:', error);
}
```

## CORS

The API supports CORS (Cross-Origin Resource Sharing) for browser-based requests. The following headers are included in responses:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

## Webhooks

For real-time notifications, use [Webhooks](/docs/api/webhooks/) instead of polling the API. Webhooks deliver events instantly when they occur:

- New pageviews
- Custom events
- Goal completions
- Alert triggers

## Support

Need help with the API?

- Check the documentation for each endpoint
- Review code examples in our [GitHub repository](https://github.com/zta-io)
- Contact support at support@ztas.io

## SDKs and Libraries

Official SDKs coming soon:

- JavaScript/TypeScript (Node.js & Browser)
- Python
- Go
- Ruby

For now, use standard HTTP clients to interact with the API.
