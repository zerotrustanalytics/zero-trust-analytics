---
title: "Funnels"
description: "Analyze user conversion paths and identify drop-off points"
weight: 23
priority: 0.7
---

## Overview

Funnels help you understand how visitors move through your conversion paths and identify where they drop off. Define a series of steps (pageviews, events, goals) and track how many visitors complete each step.

**Use cases:**

- E-commerce checkout flow
- Signup process
- Onboarding completion
- Content engagement path
- Lead generation funnel

## Endpoints

```
GET /api/funnels
POST /api/funnels
DELETE /api/funnels
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Funnels

Get all funnels configured for a site.

### Request

```bash
curl "https://ztas.io/api/funnels?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list funnels for |

### Response

```json
{
  "funnels": [
    {
      "id": "funnel_abc123",
      "name": "Signup Funnel",
      "steps": [
        {
          "id": "step_1",
          "name": "Homepage",
          "type": "pageview",
          "path": "/"
        },
        {
          "id": "step_2",
          "name": "Pricing Page",
          "type": "pageview",
          "path": "/pricing"
        },
        {
          "id": "step_3",
          "name": "Signup Complete",
          "type": "goal",
          "goalId": "goal_abc123"
        }
      ],
      "totalVisitors": 8243,
      "completions": 342,
      "conversionRate": 4.15,
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

## Create Funnel

Create a new funnel to analyze conversion paths.

### Request

```bash
curl -X POST "https://ztas.io/api/funnels" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Signup Funnel",
    "steps": [
      {
        "name": "Homepage",
        "type": "pageview",
        "path": "/"
      },
      {
        "name": "Pricing Page",
        "type": "pageview",
        "path": "/pricing"
      },
      {
        "name": "Signup Form",
        "type": "pageview",
        "path": "/signup"
      },
      {
        "name": "Signup Complete",
        "type": "goal",
        "goalId": "goal_abc123"
      }
    ],
    "timeWindow": 3600
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID for the funnel |
| `name` | string | Yes | Funnel name (max 100 characters) |
| `steps` | array | Yes | Array of funnel steps (2-10 steps) |
| `timeWindow` | number | No | Time window in seconds for completing the funnel (default: 3600) |

### Step Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Step name |
| `type` | string | Yes | Step type: `pageview`, `event`, or `goal` |
| **Pageview steps:** |
| `path` | string | Conditional | Page path to match (required for pageview steps) |
| `matchType` | string | No | Match type: `exact`, `contains`, `regex` (default: `exact`) |
| **Event steps:** |
| `eventAction` | string | Conditional | Event action to match (required for event steps) |
| `eventCategory` | string | No | Optional event category to match |
| **Goal steps:** |
| `goalId` | string | Conditional | Goal ID to match (required for goal steps) |

### Response

```json
{
  "funnel": {
    "id": "funnel_abc123",
    "name": "Signup Funnel",
    "steps": [
      {
        "id": "step_1",
        "name": "Homepage",
        "type": "pageview",
        "path": "/"
      },
      {
        "id": "step_2",
        "name": "Pricing Page",
        "type": "pageview",
        "path": "/pricing"
      },
      {
        "id": "step_3",
        "name": "Signup Form",
        "type": "pageview",
        "path": "/signup"
      },
      {
        "id": "step_4",
        "name": "Signup Complete",
        "type": "goal",
        "goalId": "goal_abc123"
      }
    ],
    "timeWindow": 3600,
    "totalVisitors": 0,
    "completions": 0,
    "conversionRate": 0,
    "createdAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Delete Funnel

Remove a funnel and stop tracking conversions.

### Request

```bash
curl -X DELETE "https://ztas.io/api/funnels?id=funnel_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Funnel ID to delete |

**Note:** Deleting a funnel does not delete historical data - it only stops tracking new conversions.

### Response

```json
{
  "success": true,
  "message": "Funnel deleted successfully"
}
```

## Funnel Analytics

Get detailed analytics for a specific funnel.

### Request

```bash
curl "https://ztas.io/api/funnels/funnel_abc123/stats?period=30d" \
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
  "funnel": {
    "id": "funnel_abc123",
    "name": "Signup Funnel",
    "timeWindow": 3600
  },
  "stats": {
    "totalVisitors": 8243,
    "completions": 342,
    "overallConversionRate": 4.15,
    "avgTimeToComplete": 1847
  },
  "steps": [
    {
      "stepNumber": 1,
      "name": "Homepage",
      "visitors": 8243,
      "dropOff": 0,
      "dropOffRate": 0,
      "progressRate": 100,
      "avgTimeOnStep": 45
    },
    {
      "stepNumber": 2,
      "name": "Pricing Page",
      "visitors": 3421,
      "dropOff": 4822,
      "dropOffRate": 58.5,
      "progressRate": 41.5,
      "avgTimeOnStep": 67
    },
    {
      "stepNumber": 3,
      "name": "Signup Form",
      "visitors": 876,
      "dropOff": 2545,
      "dropOffRate": 74.4,
      "progressRate": 25.6,
      "avgTimeOnStep": 120
    },
    {
      "stepNumber": 4,
      "name": "Signup Complete",
      "visitors": 342,
      "dropOff": 534,
      "dropOffRate": 61.0,
      "progressRate": 39.0,
      "avgTimeOnStep": 15
    }
  ],
  "timeseries": [
    {
      "date": "2024-12-01",
      "visitors": 287,
      "completions": 12,
      "conversionRate": 4.18
    },
    {
      "date": "2024-12-02",
      "visitors": 301,
      "completions": 15,
      "conversionRate": 4.98
    }
  ],
  "topPaths": [
    {
      "path": ["Homepage", "Pricing Page", "Signup Form", "Signup Complete"],
      "count": 234,
      "avgTime": 1654
    },
    {
      "path": ["Homepage", "Pricing Page", "Signup Complete"],
      "count": 108,
      "avgTime": 892
    }
  ]
}
```

## Funnel Visualization

The funnel data can be visualized to show the conversion flow:

```
Step 1: Homepage
  8,243 visitors (100%)
    ↓
  4,822 drop off (58.5%)
    ↓
Step 2: Pricing Page
  3,421 visitors (41.5%)
    ↓
  2,545 drop off (74.4%)
    ↓
Step 3: Signup Form
  876 visitors (25.6%)
    ↓
  534 drop off (61.0%)
    ↓
Step 4: Signup Complete
  342 visitors (39.0%)

Overall Conversion Rate: 4.15%
```

## Time Windows

The `timeWindow` parameter defines how long visitors have to complete the funnel:

- **1 hour (3600s)** - For quick conversions (checkout, signup)
- **1 day (86400s)** - For considered purchases
- **7 days (604800s)** - For long sales cycles
- **30 days (2592000s)** - For enterprise sales

Visitors must complete all steps within this time window to count as a conversion.

## Step Types

### Pageview Steps

Track when visitors view specific pages:

```json
{
  "name": "Product Page",
  "type": "pageview",
  "path": "/product/123",
  "matchType": "exact"
}
```

### Event Steps

Track when custom events fire:

```json
{
  "name": "Add to Cart",
  "type": "event",
  "eventAction": "add_to_cart",
  "eventCategory": "ecommerce"
}
```

### Goal Steps

Track when goals are completed:

```json
{
  "name": "Purchase Complete",
  "type": "goal",
  "goalId": "goal_abc123"
}
```

## Funnel Metrics

### Drop-off Rate

Percentage of visitors who leave at this step:

```
Drop-off Rate = (Visitors at Previous Step - Visitors at This Step) / Visitors at Previous Step × 100
```

### Progress Rate

Percentage of initial visitors who reach this step:

```
Progress Rate = Visitors at This Step / Visitors at Step 1 × 100
```

### Overall Conversion Rate

Percentage of initial visitors who complete the entire funnel:

```
Overall Conversion Rate = Completions / Total Visitors × 100
```

## Example: E-commerce Funnel

Track the complete purchase journey:

```bash
curl -X POST "https://ztas.io/api/funnels" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Purchase Funnel",
    "steps": [
      {
        "name": "Product Page",
        "type": "pageview",
        "path": "/product",
        "matchType": "contains"
      },
      {
        "name": "Add to Cart",
        "type": "event",
        "eventAction": "add_to_cart"
      },
      {
        "name": "Checkout",
        "type": "pageview",
        "path": "/checkout"
      },
      {
        "name": "Payment Info",
        "type": "pageview",
        "path": "/checkout/payment"
      },
      {
        "name": "Purchase",
        "type": "goal",
        "goalId": "goal_purchase"
      }
    ],
    "timeWindow": 86400
  }'
```

## Example: Signup Funnel

Track user registration:

```bash
curl -X POST "https://ztas.io/api/funnels" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Signup Funnel",
    "steps": [
      {
        "name": "Landing Page",
        "type": "pageview",
        "path": "/"
      },
      {
        "name": "Clicked CTA",
        "type": "event",
        "eventAction": "cta_click"
      },
      {
        "name": "Signup Form",
        "type": "pageview",
        "path": "/signup"
      },
      {
        "name": "Email Verification",
        "type": "pageview",
        "path": "/verify"
      },
      {
        "name": "Signup Complete",
        "type": "goal",
        "goalId": "goal_signup"
      }
    ],
    "timeWindow": 3600
  }'
```

## Funnel Limits

| Plan | Max Funnels | Max Steps per Funnel |
|------|-------------|---------------------|
| Free | 2 | 5 |
| Pro | 20 | 10 |
| Business | 100 | 10 |
| Enterprise | Unlimited | 20 |

## Best Practices

### 1. Keep Steps Sequential

Define steps in the order visitors naturally follow:

✅ Good: Homepage → Pricing → Signup
✗ Bad: Signup → Pricing → Homepage

### 2. Optimize High Drop-off Steps

Focus on steps with the highest drop-off rates:

```bash
# Get funnel stats
curl "https://ztas.io/api/funnels/funnel_abc123/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Look for steps with drop-off > 50%
# Optimize those pages/flows
```

### 3. Use Appropriate Time Windows

Match the time window to your conversion cycle:

- Checkout: 1 hour
- B2C signup: 1 day
- B2B lead: 7-30 days

### 4. Segment Funnel Data

Compare funnel performance across segments:

```bash
# Compare desktop vs mobile
curl "https://ztas.io/api/funnels/funnel_abc123/stats?device=desktop" \
  -H "Authorization: Bearer YOUR_TOKEN"

curl "https://ztas.io/api/funnels/funnel_abc123/stats?device=mobile" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Monitor Over Time

Track funnel performance trends:

```bash
# Get 90-day trend
curl "https://ztas.io/api/funnels/funnel_abc123/stats?period=90d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. A/B Test Funnel Changes

Create separate funnels for different variants:

```bash
# Control funnel
POST /api/funnels
{ "name": "Signup Funnel (Control)", ... }

# Variant funnel
POST /api/funnels
{ "name": "Signup Funnel (Variant A)", ... }
```

## Alerts

Get notified when funnel performance changes via [Alerts](/docs/api/alerts/):

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "name": "Signup Funnel Drop",
    "condition": "funnel.funnel_abc123.conversionRate < 3"
  }'
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Funnel name is required"
}
```

```json
{
  "error": "Funnel must have at least 2 steps"
}
```

```json
{
  "error": "Funnel cannot have more than 10 steps"
}
```

```json
{
  "error": "Invalid step type. Must be: pageview, event, or goal"
}
```

### 403 Forbidden

```json
{
  "error": "Funnel limit reached. Upgrade to create more funnels."
}
```

### 404 Not Found

```json
{
  "error": "Funnel not found"
}
```

```json
{
  "error": "Goal not found: goal_abc123"
}
```

## Advanced: Funnel Comparisons

Compare multiple funnels to find the best conversion path:

```bash
# Get all funnels
curl "https://ztas.io/api/funnels?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Compare conversion rates
# Funnel A: 4.15%
# Funnel B: 5.82%
# → Funnel B performs 40% better
```
