---
title: "API Keys"
description: "Manage API keys for programmatic access"
weight: 26
priority: 0.7
---

## Overview

API keys provide an alternative to JWT tokens for programmatic access to the Zero Trust Analytics API. They're ideal for server-side integrations, scripts, and long-running applications where user authentication isn't practical.

**Key features:**

- Long-lived authentication (no expiration)
- Scoped permissions (read-only, full access, etc.)
- Easy to rotate and revoke
- Multiple keys per account for different integrations

## Endpoints

```
GET /api/api-keys
POST /api/api-keys
DELETE /api/api-keys
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List API Keys

Get all API keys for your account.

### Request

```bash
curl "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "apiKeys": [
    {
      "id": "key_abc123",
      "name": "Production Server",
      "key": "zta_live_abc123def456...",
      "scope": "read",
      "lastUsed": "2024-12-12T15:30:00.000Z",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "expiresAt": null
    },
    {
      "id": "key_def456",
      "name": "Analytics Script",
      "key": "zta_live_def456ghi789...",
      "scope": "write",
      "lastUsed": "2024-12-12T16:00:00.000Z",
      "createdAt": "2024-03-20T14:00:00.000Z",
      "expiresAt": null
    },
    {
      "id": "key_xyz789",
      "name": "Reporting Tool",
      "key": "zta_live_xyz789abc123...",
      "scope": "read",
      "lastUsed": null,
      "createdAt": "2024-12-10T09:00:00.000Z",
      "expiresAt": null
    }
  ]
}
```

**Note:** The full API key is only shown once during creation. After that, only a masked version is displayed.

## Create API Key

Generate a new API key for programmatic access.

### Request

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Server",
    "scope": "read",
    "expiresIn": null
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Descriptive name for the API key (max 100 characters) |
| `scope` | string | Yes | Permission scope: `read`, `write`, or `admin` |
| `expiresIn` | number | No | Expiration time in days (null for no expiration) |
| `siteId` | string | No | Limit key to specific site (null for all sites) |

### Scopes

| Scope | Permissions |
|-------|-------------|
| `read` | Read analytics data, view sites, view goals/funnels |
| `write` | Everything in `read` + send tracking data, create goals/funnels |
| `admin` | Everything in `write` + manage sites, invite team members, manage API keys |

### Response

```json
{
  "apiKey": {
    "id": "key_abc123",
    "name": "Production Server",
    "key": "zta_live_abc123def456ghi789jkl012mno345pqr678",
    "scope": "read",
    "createdAt": "2024-12-12T16:00:00.000Z",
    "expiresAt": null
  }
}
```

**Important:** Save the `key` value immediately - it's only shown once. If you lose it, you'll need to create a new key.

## Delete API Key

Revoke an API key and immediately stop all access.

### Request

```bash
curl -X DELETE "https://ztas.io/api/api-keys?id=key_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | API key ID to revoke |

### Response

```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

All requests using this key will immediately fail with `401 Unauthorized`.

## Using API Keys

Include your API key in the `Authorization` header with the `Bearer` scheme:

```bash
curl "https://ztas.io/api/stats?siteId=site_abc123&period=7d" \
  -H "Authorization: Bearer zta_live_abc123def456ghi789jkl012mno345pqr678"
```

### Example: Node.js

```javascript
const API_KEY = 'zta_live_abc123def456ghi789jkl012mno345pqr678';

const response = await fetch('https://ztas.io/api/stats?siteId=site_abc123&period=7d', {
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  }
});

const data = await response.json();
console.log(data);
```

### Example: Python

```python
import requests

API_KEY = 'zta_live_abc123def456ghi789jkl012mno345pqr678'

response = requests.get(
    'https://ztas.io/api/stats',
    params={'siteId': 'site_abc123', 'period': '7d'},
    headers={'Authorization': f'Bearer {API_KEY}'}
)

data = response.json()
print(data)
```

### Example: cURL

```bash
API_KEY="zta_live_abc123def456ghi789jkl012mno345pqr678"

curl "https://ztas.io/api/stats?siteId=site_abc123&period=7d" \
  -H "Authorization: Bearer $API_KEY"
```

## API Key vs JWT Token

| Feature | API Key | JWT Token |
|---------|---------|-----------|
| **Lifetime** | No expiration (unless set) | 7 days |
| **Use case** | Server-side, scripts | User authentication |
| **Rotation** | Manual | Automatic on login |
| **Revocation** | Immediate | Wait for expiration |
| **Scope** | Configurable | Full access |
| **Best for** | Integrations, automation | Web/mobile apps |

**Use API keys when:**
- Building server-side integrations
- Running automated scripts
- Creating data pipelines
- No user interaction needed

**Use JWT tokens when:**
- Building web/mobile apps
- User-specific access needed
- Session-based authentication

## Scoped API Keys

Limit API key permissions for security:

### Read-Only Key

Perfect for dashboards and reporting:

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Reporting Dashboard",
    "scope": "read"
  }'
```

Can only:
- Fetch analytics data
- View goals and funnels
- Export data

Cannot:
- Send tracking data
- Create/modify resources
- Manage team members

### Write Key

For sending tracking data:

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Backend Tracking",
    "scope": "write"
  }'
```

Can:
- Everything in `read` scope
- Send pageviews and events
- Create goals and funnels

Cannot:
- Manage sites
- Invite team members
- Manage API keys

### Admin Key

Full access (use with caution):

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin Script",
    "scope": "admin"
  }'
```

Can do everything a user can do via the API.

## Site-Specific Keys

Limit a key to a single site for added security:

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "example.com Analytics",
    "scope": "read",
    "siteId": "site_abc123"
  }'
```

This key can only access data for `site_abc123`. Attempts to access other sites will fail with `403 Forbidden`.

## Expiring Keys

Create temporary keys that automatically expire:

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Trial Integration",
    "scope": "read",
    "expiresIn": 30
  }'
```

The key will expire after 30 days. Useful for:
- Proof of concepts
- Temporary integrations
- Partner access

## Key Rotation

Regularly rotate API keys to maintain security:

1. **Create a new key:**

```bash
curl -X POST "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Server (New)",
    "scope": "read"
  }'
```

2. **Update your application** to use the new key

3. **Test** that the new key works

4. **Revoke the old key:**

```bash
curl -X DELETE "https://ztas.io/api/api-keys?id=key_old123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Monitoring API Keys

Track API key usage to detect unauthorized access:

```bash
# List all keys with last used timestamp
curl "https://ztas.io/api/api-keys" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Look for:
- Keys that haven't been used recently (can be revoked)
- Unexpected usage patterns
- Keys with `lastUsed` times during off-hours

## API Key Limits

| Plan | Max API Keys |
|------|--------------|
| Free | 2 |
| Pro | 10 |
| Business | 50 |
| Enterprise | Unlimited |

## Security Best Practices

### 1. Never Commit Keys to Version Control

Use environment variables:

```javascript
// ✅ Good
const API_KEY = process.env.ZTA_API_KEY;

// ❌ Bad
const API_KEY = 'zta_live_abc123...';
```

### 2. Use Minimal Scopes

Only grant the permissions needed:

```bash
# ✅ Good - read-only for reporting
{ "scope": "read" }

# ❌ Bad - admin for reporting
{ "scope": "admin" }
```

### 3. Rotate Keys Regularly

Rotate keys every 90 days:

```bash
# Set a reminder to rotate keys quarterly
```

### 4. Monitor Usage

Check the activity log for suspicious API key usage:

```bash
curl "https://ztas.io/api/activity-log?type=api_key&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Revoke Unused Keys

Remove keys that aren't being used:

```bash
# If lastUsed is null or > 90 days ago, consider revoking
curl -X DELETE "https://ztas.io/api/api-keys?id=key_unused" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. Use Site-Specific Keys

Limit blast radius if a key is compromised:

```bash
{
  "name": "Client A Integration",
  "scope": "read",
  "siteId": "site_clientA"
}
```

### 7. Store Keys Securely

Use a secret management service:

- AWS Secrets Manager
- Google Cloud Secret Manager
- HashiCorp Vault
- Environment variables (for local dev)

## Activity Log

All API key actions are logged:

```bash
curl "https://ztas.io/api/activity-log?type=api_key" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Logged events:**
- API key created
- API key used
- API key revoked
- Failed authentication attempts

## Error Responses

### 400 Bad Request

```json
{
  "error": "API key name is required"
}
```

```json
{
  "error": "Invalid scope. Must be: read, write, or admin"
}
```

### 401 Unauthorized

```json
{
  "error": "Invalid API key"
}
```

```json
{
  "error": "API key has expired"
}
```

### 403 Forbidden

```json
{
  "error": "API key limit reached. Upgrade to create more keys."
}
```

```json
{
  "error": "Insufficient permissions. This key has read-only access."
}
```

```json
{
  "error": "This API key cannot access site_xyz789"
}
```

### 404 Not Found

```json
{
  "error": "API key not found"
}
```

## Example: Data Pipeline

Fetch analytics data daily and store in your database:

```python
import requests
import psycopg2
from datetime import datetime, timedelta

API_KEY = 'zta_live_abc123...'
SITE_ID = 'site_abc123'

# Fetch yesterday's data
yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

response = requests.get(
    'https://ztas.io/api/stats',
    params={
        'siteId': SITE_ID,
        'startDate': yesterday,
        'endDate': yesterday
    },
    headers={'Authorization': f'Bearer {API_KEY}'}
)

data = response.json()

# Store in database
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute(
    "INSERT INTO analytics (date, pageviews, visitors) VALUES (%s, %s, %s)",
    (yesterday, data['summary']['pageviews'], data['summary']['uniqueVisitors'])
)

conn.commit()
cur.close()
conn.close()

print(f"Stored analytics for {yesterday}")
```

## Example: Slack Bot

Create a Slack bot that reports daily analytics:

```javascript
const API_KEY = 'zta_live_abc123...';
const SITE_ID = 'site_abc123';
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/...';

async function sendDailyReport() {
  // Fetch yesterday's stats
  const response = await fetch(
    `https://ztas.io/api/stats?siteId=${SITE_ID}&period=24h`,
    {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    }
  );

  const data = await response.json();

  // Send to Slack
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: '📊 Daily Analytics Report',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${data.summary.pageviews}* pageviews\n*${data.summary.uniqueVisitors}* visitors\n*${data.summary.bounceRate}%* bounce rate`
          }
        }
      ]
    })
  });
}

// Run daily at 9 AM
sendDailyReport();
```
