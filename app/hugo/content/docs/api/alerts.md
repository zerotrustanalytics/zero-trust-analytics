---
title: "Alerts"
description: "Get notified when metrics exceed thresholds or anomalies occur"
weight: 24
priority: 0.7
---

## Overview

Alerts notify you when important metrics exceed thresholds or when anomalies are detected. Set up email, Slack, or webhook notifications to stay informed about traffic spikes, conversion drops, and unusual activity.

**Alert types:**

- **Threshold alerts** - Triggered when a metric crosses a threshold
- **Anomaly alerts** - Triggered when unusual patterns are detected
- **Comparison alerts** - Triggered when metrics change significantly period-over-period

## Endpoints

```
GET /api/alerts
POST /api/alerts
DELETE /api/alerts
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Alerts

Get all alerts configured for a site.

### Request

```bash
curl "https://ztas.io/api/alerts?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list alerts for |

### Response

```json
{
  "alerts": [
    {
      "id": "alert_abc123",
      "name": "Traffic Spike",
      "type": "threshold",
      "condition": "pageviews > 1000",
      "metric": "pageviews",
      "operator": ">",
      "threshold": 1000,
      "period": "1h",
      "enabled": true,
      "notifications": ["email", "slack"],
      "lastTriggered": "2024-12-12T15:30:00.000Z",
      "triggerCount": 5,
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "alert_def456",
      "name": "Conversion Drop",
      "type": "comparison",
      "condition": "conversionRate < -20%",
      "metric": "conversionRate",
      "operator": "<",
      "threshold": -20,
      "compareWith": "previous_period",
      "period": "24h",
      "enabled": true,
      "notifications": ["email"],
      "lastTriggered": null,
      "triggerCount": 0,
      "createdAt": "2024-02-20T14:00:00.000Z"
    }
  ]
}
```

## Create Alert

Create a new alert to monitor metrics.

### Threshold Alert

Triggered when a metric crosses a threshold:

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Traffic Spike",
    "type": "threshold",
    "metric": "pageviews",
    "operator": ">",
    "threshold": 1000,
    "period": "1h",
    "notifications": ["email", "slack"]
  }'
```

### Comparison Alert

Triggered when a metric changes significantly compared to a previous period:

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Conversion Drop",
    "type": "comparison",
    "metric": "conversionRate",
    "operator": "<",
    "threshold": -20,
    "compareWith": "previous_period",
    "period": "24h",
    "notifications": ["email", "webhook"]
  }'
```

### Anomaly Alert

Triggered when unusual patterns are detected using machine learning:

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Traffic Anomaly",
    "type": "anomaly",
    "metric": "pageviews",
    "sensitivity": "medium",
    "notifications": ["email"]
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID for the alert |
| `name` | string | Yes | Alert name (max 100 characters) |
| `type` | string | Yes | Alert type: `threshold`, `comparison`, or `anomaly` |
| `metric` | string | Yes | Metric to monitor (see below) |
| `notifications` | array | Yes | Array of notification channels |
| **Threshold alerts:** |
| `operator` | string | Conditional | Operator: `>`, `<`, `>=`, `<=` (required for threshold) |
| `threshold` | number | Conditional | Threshold value (required for threshold) |
| `period` | string | Conditional | Time period: `1h`, `24h`, `7d` (required for threshold) |
| **Comparison alerts:** |
| `operator` | string | Conditional | Operator: `>`, `<` (required for comparison) |
| `threshold` | number | Conditional | Percentage change threshold (required for comparison) |
| `compareWith` | string | Conditional | `previous_period`, `previous_week`, `previous_month` |
| `period` | string | Conditional | Time period to compare: `1h`, `24h`, `7d` |
| **Anomaly alerts:** |
| `sensitivity` | string | No | Sensitivity: `low`, `medium`, `high` (default: `medium`) |

### Metrics

Monitor these metrics:

| Metric | Description |
|--------|-------------|
| `pageviews` | Total page views |
| `uniqueVisitors` | Unique visitors |
| `sessions` | Total sessions |
| `bounceRate` | Bounce rate percentage |
| `avgSessionDuration` | Average session duration (seconds) |
| `conversionRate` | Overall conversion rate |
| `goal.{goalId}.completions` | Specific goal completions |
| `goal.{goalId}.conversionRate` | Specific goal conversion rate |
| `funnel.{funnelId}.conversionRate` | Specific funnel conversion rate |

### Notification Channels

| Channel | Description |
|---------|-------------|
| `email` | Email notification to account email |
| `slack` | Slack notification (requires Slack integration) |
| `webhook` | HTTP POST to a webhook URL |
| `sms` | SMS notification (Enterprise only) |

### Response

```json
{
  "alert": {
    "id": "alert_abc123",
    "name": "Traffic Spike",
    "type": "threshold",
    "condition": "pageviews > 1000",
    "metric": "pageviews",
    "operator": ">",
    "threshold": 1000,
    "period": "1h",
    "enabled": true,
    "notifications": ["email", "slack"],
    "createdAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Delete Alert

Remove an alert and stop monitoring.

### Request

```bash
curl -X DELETE "https://ztas.io/api/alerts?id=alert_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Alert ID to delete |

### Response

```json
{
  "success": true,
  "message": "Alert deleted successfully"
}
```

## Enable/Disable Alert

Toggle an alert on or off without deleting it.

### Request

```bash
curl -X PATCH "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alert_abc123",
    "enabled": false
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Alert ID |
| `enabled` | boolean | Yes | Enable or disable the alert |

### Response

```json
{
  "alert": {
    "id": "alert_abc123",
    "enabled": false,
    "updatedAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Alert History

Get the history of alert triggers.

### Request

```bash
curl "https://ztas.io/api/alerts/alert_abc123/history?limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Maximum number of entries (default: 50, max: 100) |
| `offset` | number | No | Offset for pagination (default: 0) |

### Response

```json
{
  "alert": {
    "id": "alert_abc123",
    "name": "Traffic Spike"
  },
  "history": [
    {
      "id": "trigger_xyz789",
      "triggeredAt": "2024-12-12T15:30:00.000Z",
      "metric": "pageviews",
      "value": 1543,
      "threshold": 1000,
      "condition": "pageviews > 1000",
      "notificationsSent": ["email", "slack"],
      "acknowledged": false
    },
    {
      "id": "trigger_abc456",
      "triggeredAt": "2024-12-11T10:15:00.000Z",
      "metric": "pageviews",
      "value": 1234,
      "threshold": 1000,
      "condition": "pageviews > 1000",
      "notificationsSent": ["email", "slack"],
      "acknowledged": true,
      "acknowledgedBy": "user_abc123",
      "acknowledgedAt": "2024-12-11T10:20:00.000Z"
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 50,
    "offset": 0
  }
}
```

## Notification Examples

### Email Notification

```
Subject: 🚨 Alert: Traffic Spike

Your site example.com has triggered an alert.

Alert: Traffic Spike
Condition: pageviews > 1000
Current Value: 1,543 pageviews
Time: Dec 12, 2024 at 3:30 PM

View details: https://ztas.io/dashboard/site_abc123/alerts/alert_abc123
```

### Slack Notification

```
🚨 Alert: Traffic Spike

*example.com* has triggered an alert

• Condition: pageviews > 1000
• Current Value: 1,543 pageviews
• Time: Dec 12, 2024 at 3:30 PM

<https://ztas.io/dashboard/site_abc123/alerts/alert_abc123|View details>
```

### Webhook Notification

```bash
POST https://your-server.com/webhook
Content-Type: application/json

{
  "event": "alert",
  "timestamp": "2024-12-12T15:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "alertId": "alert_abc123",
    "alertName": "Traffic Spike",
    "condition": "pageviews > 1000",
    "metric": "pageviews",
    "currentValue": 1543,
    "threshold": 1000,
    "operator": ">"
  }
}
```

## Alert Examples

### Traffic Monitoring

```bash
# High traffic alert
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "High Traffic",
    "type": "threshold",
    "metric": "pageviews",
    "operator": ">",
    "threshold": 10000,
    "period": "1h",
    "notifications": ["email", "slack"]
  }'

# Low traffic alert
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Low Traffic",
    "type": "threshold",
    "metric": "pageviews",
    "operator": "<",
    "threshold": 100,
    "period": "24h",
    "notifications": ["email"]
  }'
```

### Conversion Monitoring

```bash
# Low conversion rate
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Low Conversion Rate",
    "type": "threshold",
    "metric": "conversionRate",
    "operator": "<",
    "threshold": 2,
    "period": "24h",
    "notifications": ["email", "slack"]
  }'

# Conversion drop compared to last week
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Conversion Drop",
    "type": "comparison",
    "metric": "conversionRate",
    "operator": "<",
    "threshold": -20,
    "compareWith": "previous_week",
    "period": "7d",
    "notifications": ["email"]
  }'
```

### Goal Monitoring

```bash
# Goal completion threshold
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Newsletter Signups",
    "type": "threshold",
    "metric": "goal.goal_abc123.completions",
    "operator": ">",
    "threshold": 50,
    "period": "24h",
    "notifications": ["email", "slack"]
  }'
```

### Bounce Rate Monitoring

```bash
# High bounce rate
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "High Bounce Rate",
    "type": "threshold",
    "metric": "bounceRate",
    "operator": ">",
    "threshold": 70,
    "period": "24h",
    "notifications": ["email"]
  }'
```

## Alert Limits

| Plan | Max Alerts | Notification Channels |
|------|------------|---------------------|
| Free | 2 | Email only |
| Pro | 20 | Email, Slack, Webhook |
| Business | 100 | Email, Slack, Webhook |
| Enterprise | Unlimited | Email, Slack, Webhook, SMS |

## Cool-down Period

To prevent alert fatigue, alerts have a cool-down period after triggering:

- **Threshold alerts**: 1 hour cool-down
- **Comparison alerts**: 24 hour cool-down
- **Anomaly alerts**: 6 hour cool-down

During the cool-down period, the alert won't trigger again even if the condition is still met.

## Best Practices

### 1. Set Realistic Thresholds

Avoid alert fatigue by setting thresholds that matter:

✅ Good: Alert when traffic drops 50% (unusual event)
✗ Bad: Alert when traffic changes by 5% (normal variation)

### 2. Use Comparison Alerts for Trends

Monitor period-over-period changes to catch trends:

```bash
# Alert if conversions drop 20% compared to last week
{
  "type": "comparison",
  "metric": "conversionRate",
  "operator": "<",
  "threshold": -20,
  "compareWith": "previous_week"
}
```

### 3. Combine with Webhooks

Integrate alerts with your workflow tools:

```bash
# Send alert to PagerDuty
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Critical Traffic Drop",
    "type": "threshold",
    "metric": "pageviews",
    "operator": "<",
    "threshold": 10,
    "period": "1h",
    "notifications": ["webhook"]
  }'

# Configure webhook in webhook settings
curl -X POST "https://ztas.io/api/webhooks" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "url": "https://events.pagerduty.com/integration/...",
    "events": ["alert"]
  }'
```

### 4. Monitor Business Hours Only

For B2B sites, alert only during business hours to reduce noise:

```bash
# This feature requires Enterprise plan
{
  "name": "Business Hours Traffic",
  "schedule": {
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "hours": "9-17",
    "timezone": "America/New_York"
  }
}
```

### 5. Test Your Alerts

Verify alerts work correctly before relying on them:

```bash
# Temporarily lower threshold to trigger alert
curl -X PATCH "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alert_abc123",
    "threshold": 1
  }'

# Check that notification arrives
# Then restore original threshold
```

## Slack Integration

Connect Slack to receive alert notifications:

1. Go to Settings → Integrations → Slack
2. Click "Add to Slack"
3. Select the channel for notifications
4. Add `slack` to alert notifications

## Error Responses

### 400 Bad Request

```json
{
  "error": "Alert name is required"
}
```

```json
{
  "error": "Invalid alert type. Must be: threshold, comparison, or anomaly"
}
```

```json
{
  "error": "Invalid metric: invalid_metric"
}
```

```json
{
  "error": "Threshold is required for threshold alerts"
}
```

### 403 Forbidden

```json
{
  "error": "Alert limit reached. Upgrade to create more alerts."
}
```

```json
{
  "error": "SMS notifications require Enterprise plan"
}
```

### 404 Not Found

```json
{
  "error": "Alert not found"
}
```

```json
{
  "error": "Goal not found: goal_abc123"
}
```
