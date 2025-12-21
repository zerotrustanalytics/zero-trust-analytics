---
title: "Activity Log"
description: "Audit trail of all account and site activities"
weight: 28
priority: 0.7
---

## Overview

The Activity Log provides a complete audit trail of all actions performed on your Zero Trust Analytics account. Track who did what, when they did it, and from where. Essential for security, compliance, and debugging.

**Logged activities:**

- User logins and logouts
- Site creation, updates, and deletion
- Team member invitations and removals
- API key creation and revocation
- Goal and funnel changes
- Alert triggers
- Settings modifications
- Data exports

## Endpoint

```
GET /api/activity-log
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Get Activity Log

Retrieve the activity log for your account or a specific site.

### Request

```bash
curl "https://ztas.io/api/activity-log?siteId=site_abc123&period=7d&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | No | Filter by site ID (omit for account-wide log) |
| `period` | string | No | Time period: `24h`, `7d`, `30d`, `90d` (default: `7d`) |
| `startDate` | string | No | Custom start date (ISO 8601) |
| `endDate` | string | No | Custom end date (ISO 8601) |
| `type` | string | No | Filter by activity type (see below) |
| `userId` | string | No | Filter by user ID |
| `limit` | number | No | Maximum number of entries (default: 50, max: 100) |
| `offset` | number | No | Offset for pagination (default: 0) |

### Activity Types

Filter by specific activity types:

| Type | Description |
|------|-------------|
| `auth` | Login, logout, password changes |
| `site` | Site creation, updates, deletion |
| `team` | Team member invitations, removals, role changes |
| `api_key` | API key creation, usage, revocation |
| `goal` | Goal creation, updates, deletion |
| `funnel` | Funnel creation, updates, deletion |
| `alert` | Alert creation, triggers, deletion |
| `webhook` | Webhook creation, delivery, deletion |
| `export` | Data export requests |
| `settings` | Settings changes |

### Response

```json
{
  "activities": [
    {
      "id": "activity_abc123",
      "timestamp": "2024-12-12T16:30:00.000Z",
      "type": "site",
      "action": "site.created",
      "actor": {
        "id": "user_abc123",
        "email": "user@example.com",
        "name": "Alice Johnson"
      },
      "target": {
        "type": "site",
        "id": "site_abc123",
        "name": "example.com"
      },
      "metadata": {
        "domain": "example.com",
        "timezone": "America/New_York"
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    },
    {
      "id": "activity_def456",
      "timestamp": "2024-12-12T15:45:00.000Z",
      "type": "team",
      "action": "team.member_invited",
      "actor": {
        "id": "user_abc123",
        "email": "user@example.com",
        "name": "Alice Johnson"
      },
      "target": {
        "type": "user",
        "email": "newmember@example.com"
      },
      "metadata": {
        "role": "admin",
        "siteId": "site_abc123"
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    },
    {
      "id": "activity_xyz789",
      "timestamp": "2024-12-12T14:20:00.000Z",
      "type": "alert",
      "action": "alert.triggered",
      "target": {
        "type": "alert",
        "id": "alert_abc123",
        "name": "Traffic Spike"
      },
      "metadata": {
        "metric": "pageviews",
        "currentValue": 1543,
        "threshold": 1000,
        "siteId": "site_abc123"
      }
    }
  ],
  "pagination": {
    "total": 234,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

## Activity Actions

### Authentication Actions

| Action | Description |
|--------|-------------|
| `auth.login` | User logged in |
| `auth.logout` | User logged out |
| `auth.password_changed` | Password was changed |
| `auth.password_reset` | Password was reset via email |
| `auth.failed_login` | Failed login attempt |
| `auth.2fa_enabled` | Two-factor authentication enabled |
| `auth.2fa_disabled` | Two-factor authentication disabled |

### Site Actions

| Action | Description |
|--------|-------------|
| `site.created` | New site created |
| `site.updated` | Site settings updated |
| `site.deleted` | Site deleted |
| `site.verified` | Domain ownership verified |

### Team Actions

| Action | Description |
|--------|-------------|
| `team.member_invited` | Team member invitation sent |
| `team.member_accepted` | Invitation accepted |
| `team.member_removed` | Team member removed |
| `team.role_changed` | Member role changed |

### API Key Actions

| Action | Description |
|--------|-------------|
| `api_key.created` | API key created |
| `api_key.used` | API key used for authentication |
| `api_key.revoked` | API key revoked |

### Goal Actions

| Action | Description |
|--------|-------------|
| `goal.created` | Goal created |
| `goal.updated` | Goal settings updated |
| `goal.deleted` | Goal deleted |

### Funnel Actions

| Action | Description |
|--------|-------------|
| `funnel.created` | Funnel created |
| `funnel.updated` | Funnel settings updated |
| `funnel.deleted` | Funnel deleted |

### Alert Actions

| Action | Description |
|--------|-------------|
| `alert.created` | Alert created |
| `alert.triggered` | Alert triggered |
| `alert.acknowledged` | Alert acknowledged |
| `alert.deleted` | Alert deleted |

### Webhook Actions

| Action | Description |
|--------|-------------|
| `webhook.created` | Webhook created |
| `webhook.delivered` | Webhook successfully delivered |
| `webhook.failed` | Webhook delivery failed |
| `webhook.deleted` | Webhook deleted |

### Export Actions

| Action | Description |
|--------|-------------|
| `export.requested` | Data export requested |
| `export.completed` | Export ready for download |
| `export.downloaded` | Export file downloaded |

### Settings Actions

| Action | Description |
|--------|-------------|
| `settings.updated` | Account or site settings updated |
| `settings.integration_connected` | Third-party integration connected |
| `settings.integration_disconnected` | Third-party integration disconnected |

## Filtering Examples

### Recent Logins

```bash
curl "https://ztas.io/api/activity-log?type=auth&action=auth.login&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Failed Login Attempts

```bash
curl "https://ztas.io/api/activity-log?type=auth&action=auth.failed_login&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### API Key Usage

```bash
curl "https://ztas.io/api/activity-log?type=api_key&period=24h" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Team Changes

```bash
curl "https://ztas.io/api/activity-log?type=team&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Alert Triggers

```bash
curl "https://ztas.io/api/activity-log?type=alert&action=alert.triggered&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Site-Specific Activity

```bash
curl "https://ztas.io/api/activity-log?siteId=site_abc123&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### User-Specific Activity

```bash
curl "https://ztas.io/api/activity-log?userId=user_abc123&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Pagination

For large result sets, use pagination:

```bash
# First page (50 results)
curl "https://ztas.io/api/activity-log?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Second page (next 50 results)
curl "https://ztas.io/api/activity-log?limit=50&offset=50" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Third page
curl "https://ztas.io/api/activity-log?limit=50&offset=100" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Export Activity Log

Export the entire activity log to CSV:

```bash
curl "https://ztas.io/api/activity-log/export?period=90d&format=csv" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Returns a download URL for a CSV file containing all activity log entries.

### CSV Format

```csv
Timestamp,Type,Action,Actor Email,Actor Name,Target Type,Target ID,IP Address,User Agent
2024-12-12T16:30:00.000Z,site,site.created,user@example.com,Alice Johnson,site,site_abc123,192.168.1.1,Mozilla/5.0...
2024-12-12T15:45:00.000Z,team,team.member_invited,user@example.com,Alice Johnson,user,newmember@example.com,192.168.1.1,Mozilla/5.0...
```

## Real-time Activity Feed

Subscribe to real-time activity updates via webhooks:

```bash
curl -X POST "https://ztas.io/api/webhooks" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "url": "https://your-server.com/webhook",
    "events": ["activity"]
  }'
```

Webhook payload:

```json
{
  "event": "activity",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "id": "activity_abc123",
    "type": "team",
    "action": "team.member_invited",
    "actor": {
      "id": "user_abc123",
      "email": "user@example.com"
    },
    "target": {
      "type": "user",
      "email": "newmember@example.com"
    }
  }
}
```

## Retention

Activity logs are retained based on your plan:

| Plan | Retention Period |
|------|------------------|
| Free | 30 days |
| Pro | 90 days |
| Business | 1 year |
| Enterprise | 2 years |

## Use Cases

### 1. Security Monitoring

Monitor for suspicious activity:

```bash
# Failed login attempts
curl "https://ztas.io/api/activity-log?type=auth&action=auth.failed_login" \
  -H "Authorization: Bearer YOUR_TOKEN"

# API key usage from unexpected IPs
curl "https://ztas.io/api/activity-log?type=api_key&action=api_key.used" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Compliance Auditing

Generate compliance reports:

```bash
# All team changes in the last 90 days
curl "https://ztas.io/api/activity-log?type=team&period=90d" \
  -H "Authorization: Bearer YOUR_TOKEN"

# All data exports
curl "https://ztas.io/api/activity-log?type=export&period=365d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Debugging

Troubleshoot issues:

```bash
# Recent webhook failures
curl "https://ztas.io/api/activity-log?type=webhook&action=webhook.failed&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Recent alert triggers
curl "https://ztas.io/api/activity-log?type=alert&action=alert.triggered&period=24h" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. User Activity Tracking

Track what team members are doing:

```bash
# Activity by specific user
curl "https://ztas.io/api/activity-log?userId=user_abc123&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid time period"
}
```

```json
{
  "error": "Invalid activity type"
}
```

```json
{
  "error": "Limit must be between 1 and 100"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied. Only account owners can view the activity log."
}
```

### 404 Not Found

```json
{
  "error": "Site not found"
}
```

## Best Practices

### 1. Regular Reviews

Review activity logs regularly:

```bash
# Weekly security review
curl "https://ztas.io/api/activity-log?type=auth&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Monitor Failed Logins

Set up alerts for failed login attempts:

```bash
# Alert on 5+ failed logins in 1 hour
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Multiple Failed Logins",
    "type": "threshold",
    "metric": "activity.auth.failed_login.count",
    "operator": ">",
    "threshold": 5,
    "period": "1h"
  }'
```

### 3. Export for Long-term Storage

Export logs before they're deleted:

```bash
# Export logs quarterly for compliance
curl "https://ztas.io/api/activity-log/export?period=90d&format=csv" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Correlate with Other Data

Cross-reference activity with analytics:

```bash
# Check if a site deletion corresponded with a traffic drop
curl "https://ztas.io/api/activity-log?type=site&action=site.deleted" \
  -H "Authorization: Bearer YOUR_TOKEN"

curl "https://ztas.io/api/stats?siteId=site_abc123&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Track Team Productivity

Monitor team member contributions:

```bash
# Goals created by each team member
curl "https://ztas.io/api/activity-log?type=goal&action=goal.created&period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Example: Security Dashboard

Build a security monitoring dashboard:

```javascript
const API_KEY = 'zta_live_abc123...';

async function getSecurityMetrics() {
  // Failed logins
  const failedLogins = await fetch(
    'https://ztas.io/api/activity-log?type=auth&action=auth.failed_login&period=24h',
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  ).then(r => r.json());

  // API key usage
  const apiKeyUsage = await fetch(
    'https://ztas.io/api/activity-log?type=api_key&period=24h',
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  ).then(r => r.json());

  // Team changes
  const teamChanges = await fetch(
    'https://ztas.io/api/activity-log?type=team&period=7d',
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  ).then(r => r.json());

  return {
    failedLogins: failedLogins.activities.length,
    apiKeyRequests: apiKeyUsage.activities.length,
    teamChanges: teamChanges.activities.length
  };
}

// Display on dashboard
getSecurityMetrics().then(metrics => {
  console.log('Security Metrics (24h):');
  console.log(`- Failed logins: ${metrics.failedLogins}`);
  console.log(`- API requests: ${metrics.apiKeyRequests}`);
  console.log(`- Team changes: ${metrics.teamChanges}`);
});
```

## Example: Compliance Report

Generate a monthly compliance report:

```python
import requests
from datetime import datetime, timedelta

API_KEY = 'zta_live_abc123...'

# Get last month's activity
end_date = datetime.now().replace(day=1) - timedelta(days=1)
start_date = end_date.replace(day=1)

response = requests.get(
    'https://ztas.io/api/activity-log',
    params={
        'startDate': start_date.isoformat(),
        'endDate': end_date.isoformat()
    },
    headers={'Authorization': f'Bearer {API_KEY}'}
)

activities = response.json()['activities']

# Generate report
report = {
    'period': f"{start_date.strftime('%B %Y')}",
    'total_activities': len(activities),
    'by_type': {}
}

for activity in activities:
    activity_type = activity['type']
    report['by_type'][activity_type] = report['by_type'].get(activity_type, 0) + 1

print(f"Compliance Report - {report['period']}")
print(f"Total Activities: {report['total_activities']}")
print("\nBreakdown by Type:")
for activity_type, count in report['by_type'].items():
    print(f"  {activity_type}: {count}")
```
