---
title: "Annotations"
description: "Add context to your analytics charts with visual annotations"
weight: 30
priority: 0.7
---

## Overview

Chart annotations allow you to mark important events on your analytics charts - product launches, marketing campaigns, site changes, and other significant moments. Annotations appear as visual markers with customizable colors and icons, making it easy to correlate events with traffic changes.

**Use cases:**

- **Product Launches** - Mark release dates to measure impact on traffic
- **Marketing Campaigns** - Track campaign start dates and measure effectiveness
- **Site Changes** - Document redesigns, migrations, or technical changes
- **External Events** - Note competitor launches, industry news, or seasonal events

## Endpoints

```
GET /api/annotations
POST /api/annotations
PATCH /api/annotations
DELETE /api/annotations
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Annotations

Get all annotations for a site within a date range.

### Request

```bash
curl "https://ztas.io/api/annotations?siteId=site_abc123&startDate=2024-12-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list annotations for |
| `startDate` | string | No | Start date in YYYY-MM-DD format |
| `endDate` | string | No | End date in YYYY-MM-DD format |

### Response

```json
{
  "annotations": [
    {
      "id": "ann_abc123",
      "siteId": "site_abc123",
      "date": "2024-12-01",
      "title": "Product Launch",
      "description": "Released v2.0 with new features",
      "color": "#0d6efd",
      "icon": "rocket",
      "createdBy": "user_abc123",
      "createdAt": "2024-12-01T10:00:00.000Z",
      "updatedAt": "2024-12-01T10:00:00.000Z"
    },
    {
      "id": "ann_def456",
      "siteId": "site_abc123",
      "date": "2024-12-15",
      "title": "Marketing Campaign",
      "description": "Started social media campaign",
      "color": "#198754",
      "icon": "megaphone",
      "createdBy": "user_abc123",
      "createdAt": "2024-12-15T14:30:00.000Z",
      "updatedAt": "2024-12-15T14:30:00.000Z"
    }
  ]
}
```

## Create Annotation

Add a new annotation to mark an important event.

### Request

```bash
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-12-20",
    "title": "Product Launch",
    "description": "Released v2.0 with new dashboard and reporting features",
    "color": "#0d6efd",
    "icon": "rocket"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID for the annotation |
| `date` | string | Yes | Date in YYYY-MM-DD format |
| `title` | string | No | Annotation title (default: "Event") |
| `description` | string | No | Detailed description (default: "") |
| `color` | string | No | Hex color code (default: "#0d6efd") |
| `icon` | string | No | Icon name (default: "star") |

### Available Icons

Common icons you can use:

- `star` - General events
- `rocket` - Product launches
- `megaphone` - Marketing campaigns
- `wrench` - Technical changes
- `calendar` - Scheduled events
- `trophy` - Milestones
- `bell` - Notifications
- `flag` - Important markers

### Response

```json
{
  "annotation": {
    "id": "ann_abc123",
    "siteId": "site_abc123",
    "date": "2024-12-20",
    "title": "Product Launch",
    "description": "Released v2.0 with new dashboard and reporting features",
    "color": "#0d6efd",
    "icon": "rocket",
    "createdBy": "user_abc123",
    "createdAt": "2024-12-20T16:00:00.000Z",
    "updatedAt": "2024-12-20T16:00:00.000Z"
  }
}
```

## Update Annotation

Modify an existing annotation.

### Request

```bash
curl -X PATCH "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotationId": "ann_abc123",
    "title": "Major Product Launch",
    "description": "Released v2.0 with new dashboard, reporting, and team collaboration features",
    "color": "#dc3545"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `annotationId` | string | Yes | Annotation ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `date` | string | No | New date (YYYY-MM-DD) |
| `color` | string | No | New color |
| `icon` | string | No | New icon |

**Note:** You can only update annotations you created, unless you're a site owner/admin.

### Response

```json
{
  "annotation": {
    "id": "ann_abc123",
    "siteId": "site_abc123",
    "date": "2024-12-20",
    "title": "Major Product Launch",
    "description": "Released v2.0 with new dashboard, reporting, and team collaboration features",
    "color": "#dc3545",
    "icon": "rocket",
    "createdBy": "user_abc123",
    "createdAt": "2024-12-20T16:00:00.000Z",
    "updatedAt": "2024-12-20T18:30:00.000Z"
  }
}
```

## Delete Annotation

Remove an annotation from your charts.

### Request

```bash
curl -X DELETE "https://ztas.io/api/annotations?annotationId=ann_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `annotationId` | string | Yes | Annotation ID to delete |

**Note:** You can only delete annotations you created, unless you're a site owner/admin.

### Response

```json
{
  "success": true
}
```

## Color Palette

Use these recommended colors for different event types:

| Color | Hex Code | Use Case |
|-------|----------|----------|
| Blue | `#0d6efd` | Product launches, features |
| Green | `#198754` | Marketing campaigns, growth |
| Red | `#dc3545` | Issues, incidents, alerts |
| Yellow | `#ffc107` | Warnings, changes |
| Purple | `#6f42c1` | Special events, milestones |
| Orange | `#fd7e14` | Updates, releases |
| Teal | `#20c997` | Improvements, optimizations |
| Gray | `#6c757d` | Notes, reminders |

## Chart Display

Annotations appear on analytics charts as vertical markers:

- Hover over an annotation to see the full title and description
- Click an annotation to view details and edit/delete options
- Annotations are displayed chronologically across all date ranges
- Filter annotations by date range using the chart controls

## Example: Track Campaign Impact

Mark the start of a marketing campaign and analyze its impact:

```bash
# 1. Create annotation for campaign start
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-12-01",
    "title": "Holiday Campaign Launch",
    "description": "Started email and social media campaign for holiday sales",
    "color": "#198754",
    "icon": "megaphone"
  }'

# 2. View analytics for the campaign period
curl "https://ztas.io/api/stats?siteId=site_abc123&startDate=2024-12-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Add follow-up annotation
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-12-15",
    "title": "Campaign Phase 2",
    "description": "Launched retargeting ads and influencer partnerships",
    "color": "#198754",
    "icon": "megaphone"
  }'
```

## Example: Product Release Timeline

Track multiple release milestones:

```bash
# Beta release
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-11-01",
    "title": "Beta Release",
    "description": "Limited beta release to 100 users",
    "color": "#ffc107",
    "icon": "flag"
  }'

# Public launch
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-12-01",
    "title": "Public Launch",
    "description": "Full public release with press coverage",
    "color": "#0d6efd",
    "icon": "rocket"
  }'

# First update
curl -X POST "https://ztas.io/api/annotations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "date": "2024-12-15",
    "title": "v2.1 Update",
    "description": "Bug fixes and performance improvements",
    "color": "#fd7e14",
    "icon": "wrench"
  }'
```

## Annotation Limits

| Plan | Max Annotations |
|------|-----------------|
| Free | 10 per site |
| Pro | 100 per site |
| Business | 500 per site |
| Enterprise | Unlimited |

## Best Practices

### 1. Use Descriptive Titles

Keep titles concise but informative:

**Good:** "Black Friday Sale Launch"
**Bad:** "Event 1"

### 2. Add Context in Descriptions

Include relevant details in the description:

```json
{
  "title": "Homepage Redesign",
  "description": "Launched new homepage with updated hero section, streamlined navigation, and mobile-first design. Expected 20% conversion rate improvement."
}
```

### 3. Consistent Color Coding

Use the same colors for similar event types across all sites:

- Blue for product launches
- Green for marketing campaigns
- Red for incidents or issues
- Yellow for A/B tests

### 4. Don't Over-Annotate

Add annotations for significant events only. Too many annotations make charts cluttered and harder to read.

### 5. Document External Events

Track external factors that might affect your metrics:

```json
{
  "title": "Competitor Product Launch",
  "description": "CompetitorX launched similar product with aggressive pricing",
  "color": "#dc3545",
  "icon": "bell"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Site ID and date required"
}
```

```json
{
  "error": "Invalid date format. Use YYYY-MM-DD"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```

### 404 Not Found

```json
{
  "error": "Annotation not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create annotation"
}
```

## Bulk Import

Import multiple annotations at once using a script:

```bash
#!/bin/bash

# annotations.csv:
# date,title,description,color,icon
# 2024-12-01,Launch,Product launch,#0d6efd,rocket
# 2024-12-15,Campaign,Marketing campaign,#198754,megaphone

while IFS=, read -r date title description color icon; do
  curl -X POST "https://ztas.io/api/annotations" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"siteId\": \"site_abc123\",
      \"date\": \"$date\",
      \"title\": \"$title\",
      \"description\": \"$description\",
      \"color\": \"$color\",
      \"icon\": \"$icon\"
    }"
  sleep 1  # Rate limiting
done < annotations.csv
```

## Export Annotations

Export all annotations for documentation or backup:

```bash
curl "https://ztas.io/api/annotations?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq -r '.annotations[] | [.date, .title, .description] | @csv' \
  > annotations.csv
```
