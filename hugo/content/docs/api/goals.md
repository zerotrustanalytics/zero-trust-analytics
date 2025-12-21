---
title: "Goals"
description: "Track conversions and measure success with goals"
weight: 22
priority: 0.7
---

## Overview

Goals help you track conversions and measure the success of your website. Define specific actions you want visitors to take (newsletter signup, purchase, download, etc.) and track how many visitors complete them.

**Goal types:**

- **Pageview goals** - Triggered when a specific page is viewed
- **Event goals** - Triggered when a custom event fires
- **Duration goals** - Triggered when time on site exceeds a threshold

## Endpoints

```
GET /api/goals
POST /api/goals
DELETE /api/goals
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Goals

Get all goals configured for a site.

### Request

```bash
curl "https://ztas.io/api/goals?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list goals for |

### Response

```json
{
  "goals": [
    {
      "id": "goal_abc123",
      "name": "Newsletter Signup",
      "type": "pageview",
      "path": "/thank-you",
      "value": 5,
      "completions": 342,
      "conversionRate": 4.2,
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "goal_def456",
      "name": "Product Purchase",
      "type": "event",
      "eventAction": "purchase",
      "value": 50,
      "completions": 87,
      "conversionRate": 1.1,
      "createdAt": "2024-02-20T14:00:00.000Z"
    },
    {
      "id": "goal_xyz789",
      "name": "Engaged Visitor",
      "type": "duration",
      "durationSeconds": 120,
      "completions": 1234,
      "conversionRate": 15.2,
      "createdAt": "2024-03-10T09:00:00.000Z"
    }
  ]
}
```

## Create Goal

Create a new goal to track conversions.

### Pageview Goal

Triggered when a visitor views a specific page:

```bash
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Newsletter Signup",
    "type": "pageview",
    "path": "/thank-you",
    "value": 5
  }'
```

### Event Goal

Triggered when a custom event fires:

```bash
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Product Purchase",
    "type": "event",
    "eventAction": "purchase",
    "eventCategory": "ecommerce",
    "value": 50
  }'
```

### Duration Goal

Triggered when time on site exceeds a threshold:

```bash
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Engaged Visitor",
    "type": "duration",
    "durationSeconds": 120,
    "value": 1
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID for the goal |
| `name` | string | Yes | Goal name (max 100 characters) |
| `type` | string | Yes | Goal type: `pageview`, `event`, or `duration` |
| `value` | number | No | Monetary value of the goal (default: 0) |
| **Pageview goals:** |
| `path` | string | Conditional | Page path to match (required for pageview goals) |
| `matchType` | string | No | Match type: `exact`, `contains`, `regex` (default: `exact`) |
| **Event goals:** |
| `eventAction` | string | Conditional | Event action to match (required for event goals) |
| `eventCategory` | string | No | Optional event category to match |
| `eventLabel` | string | No | Optional event label to match |
| **Duration goals:** |
| `durationSeconds` | number | Conditional | Minimum duration in seconds (required for duration goals) |

### Response

```json
{
  "goal": {
    "id": "goal_abc123",
    "name": "Newsletter Signup",
    "type": "pageview",
    "path": "/thank-you",
    "value": 5,
    "completions": 0,
    "conversionRate": 0,
    "createdAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Delete Goal

Remove a goal and stop tracking completions.

### Request

```bash
curl -X DELETE "https://ztas.io/api/goals?id=goal_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Goal ID to delete |

**Note:** Deleting a goal does not delete historical completion data - it only stops tracking new completions.

### Response

```json
{
  "success": true,
  "message": "Goal deleted successfully"
}
```

## Goal Statistics

Get detailed statistics for a specific goal.

### Request

```bash
curl "https://ztas.io/api/goals/goal_abc123/stats?period=30d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `24h`, `7d`, `30d`, `90d` (default: `30d`) |
| `startDate` | string | No | Custom start date (ISO 8601) |
| `endDate` | string | No | Custom end date (ISO 8601) |

### Response

```json
{
  "goal": {
    "id": "goal_abc123",
    "name": "Newsletter Signup",
    "type": "pageview",
    "path": "/thank-you"
  },
  "stats": {
    "completions": 342,
    "uniqueCompletions": 298,
    "conversionRate": 4.2,
    "totalValue": 1710,
    "avgValue": 5
  },
  "timeseries": [
    {
      "date": "2024-12-01",
      "completions": 12,
      "conversionRate": 4.1
    },
    {
      "date": "2024-12-02",
      "completions": 15,
      "conversionRate": 4.8
    }
  ],
  "topSources": [
    {
      "source": "google.com",
      "completions": 156,
      "conversionRate": 5.2
    },
    {
      "source": "(direct)",
      "completions": 98,
      "conversionRate": 3.8
    }
  ],
  "topPages": [
    {
      "path": "/pricing",
      "completions": 187,
      "conversionRate": 8.9
    },
    {
      "path": "/",
      "completions": 112,
      "conversionRate": 2.1
    }
  ]
}
```

## Tracking Goal Completions

Goals are tracked automatically based on your configuration:

### Pageview Goals

When a visitor views the specified page, the goal is completed:

```javascript
// The tracking script automatically tracks pageviews
// Goal completes when visitor lands on /thank-you
```

### Event Goals

Trigger goals with custom events:

```javascript
// In your application code
window.zta('event', 'purchase', {
  category: 'ecommerce',
  value: 99.99
});

// If you have an event goal matching action "purchase",
// it will be automatically completed
```

See [Custom Events](/docs/custom-events/) for more details.

### Duration Goals

Duration goals are automatically tracked based on time on site. No additional code needed.

## Match Types

For pageview goals, specify how the path should be matched:

### Exact Match (default)

```json
{
  "type": "pageview",
  "path": "/thank-you",
  "matchType": "exact"
}
```

Matches only `/thank-you` (not `/thank-you/` or `/thank-you/success`)

### Contains Match

```json
{
  "type": "pageview",
  "path": "/thank-you",
  "matchType": "contains"
}
```

Matches any path containing `/thank-you`:
- `/thank-you`
- `/thank-you/`
- `/thank-you/success`
- `/blog/thank-you-post`

### Regex Match

```json
{
  "type": "pageview",
  "path": "^/product/[0-9]+$",
  "matchType": "regex"
}
```

Matches paths using regular expressions:
- `/product/123` ✓
- `/product/456` ✓
- `/product/abc` ✗

## Goal Values

Assign monetary values to goals to measure revenue:

```bash
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Product Purchase",
    "type": "event",
    "eventAction": "purchase",
    "value": 50
  }'
```

For event goals, you can also pass the value dynamically:

```javascript
window.zta('event', 'purchase', {
  value: 99.99  // Override the default goal value
});
```

## Conversion Rate Calculation

Conversion rate is calculated as:

```
Conversion Rate = (Goal Completions / Total Visitors) × 100
```

For example:
- 342 goal completions
- 8,143 total visitors
- Conversion rate: (342 / 8143) × 100 = 4.2%

## Goal Limits

| Plan | Max Goals |
|------|-----------|
| Free | 5 |
| Pro | 50 |
| Business | 200 |
| Enterprise | Unlimited |

## Webhooks

Get notified when goals are completed via [Webhooks](/docs/api/webhooks/):

```bash
curl -X POST "https://ztas.io/api/webhooks" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "url": "https://your-server.com/webhook",
    "events": ["goal"]
  }'
```

Webhook payload:

```json
{
  "event": "goal",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "goalId": "goal_abc123",
    "goalName": "Newsletter Signup",
    "path": "/thank-you",
    "value": 5,
    "visitorId": "vis_xyz789"
  }
}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Goal name is required"
}
```

```json
{
  "error": "Invalid goal type. Must be: pageview, event, or duration"
}
```

```json
{
  "error": "Path is required for pageview goals"
}
```

```json
{
  "error": "Event action is required for event goals"
}
```

```json
{
  "error": "Duration is required for duration goals"
}
```

### 403 Forbidden

```json
{
  "error": "Goal limit reached. Upgrade to create more goals."
}
```

### 404 Not Found

```json
{
  "error": "Goal not found"
}
```

## Best Practices

### 1. Use Descriptive Names

Give goals clear, descriptive names:

✅ Good: "Newsletter Signup - Header Form"
✗ Bad: "Goal 1"

### 2. Set Appropriate Values

Assign realistic monetary values:

- Newsletter signup: $5 (estimated lifetime value)
- Product purchase: $50 (average order value)
- Demo request: $100 (potential deal size)

### 3. Track Micro-Conversions

Don't just track final conversions. Track micro-conversions too:

- Scrolled 50% of page
- Watched video
- Clicked pricing link
- Started checkout

### 4. Monitor Conversion Rates

Set up [Alerts](/docs/api/alerts/) for significant changes:

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Low Newsletter Conversions",
    "condition": "goal.goal_abc123.conversionRate < 3"
  }'
```

### 5. Use Funnels

Combine goals into [Funnels](/docs/api/funnels/) to analyze conversion paths:

```bash
# Create a funnel: Visit → View Pricing → Sign Up
curl -X POST "https://ztas.io/api/funnels" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Signup Funnel",
    "steps": [
      { "type": "pageview", "path": "/" },
      { "type": "pageview", "path": "/pricing" },
      { "type": "goal", "goalId": "goal_abc123" }
    ]
  }'
```

## Example: E-commerce Goals

Track the complete purchase funnel:

```bash
# 1. Product page view
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Product Page View",
    "type": "pageview",
    "path": "/product",
    "matchType": "contains",
    "value": 0
  }'

# 2. Add to cart
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Add to Cart",
    "type": "event",
    "eventAction": "add_to_cart",
    "value": 0
  }'

# 3. Start checkout
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Start Checkout",
    "type": "pageview",
    "path": "/checkout",
    "value": 0
  }'

# 4. Complete purchase
curl -X POST "https://ztas.io/api/goals" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Purchase",
    "type": "event",
    "eventAction": "purchase",
    "value": 50
  }'
```
