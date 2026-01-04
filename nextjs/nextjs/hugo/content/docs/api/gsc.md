---
title: "Google Search Console API"
description: "Connect Google Search Console to view search performance data alongside your analytics."
weight: 60
---

# Google Search Console Integration

Connect your Google Search Console account to view search performance data directly in your Zero Trust Analytics dashboard.

## Overview

The GSC integration allows you to:
- View total clicks, impressions, CTR, and average position
- See top search queries driving traffic
- Analyze top-performing pages
- Track search performance over time
- All without leaving your analytics dashboard

**Endpoint:** `/.netlify/functions/gsc`

**Authentication:** Required (JWT token in Authorization header)

---

## Connect GSC

Start the OAuth flow to connect Google Search Console.

**GET** `/.netlify/functions/gsc?action=connect`

### Response

```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
  "message": "Redirect user to authUrl to connect Google Search Console"
}
```

Redirect the user to `authUrl` to complete Google OAuth. After authorization, they will be redirected back to your dashboard with a success or error parameter.

---

## Check Connection Status

Check if GSC is connected for the current user.

**GET** `/.netlify/functions/gsc?action=status`

### Response (Connected)

```json
{
  "connected": true,
  "connectedAt": "2024-12-13T10:30:00.000Z",
  "expiresAt": "2024-12-13T11:30:00.000Z"
}
```

### Response (Not Connected)

```json
{
  "connected": false,
  "message": "Google Search Console is not connected"
}
```

---

## Get Sites

Get list of properties/sites from Google Search Console.

**GET** `/.netlify/functions/gsc?action=sites`

### Response

```json
{
  "sites": [
    {
      "url": "https://example.com",
      "permissionLevel": "siteOwner"
    },
    {
      "url": "sc-domain:example.org",
      "permissionLevel": "siteFullUser"
    }
  ]
}
```

**Permission Levels:**
- `siteOwner` - Full access to the site
- `siteFullUser` - Full user access
- `siteRestrictedUser` - Restricted access
- `siteUnverifiedUser` - Unverified access

---

## Get Performance Data

Get search performance metrics over time.

**GET** `/.netlify/functions/gsc?action=performance`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | GSC property URL |
| `startDate` | string | No | Start date (YYYY-MM-DD). Default: 28 days ago |
| `endDate` | string | No | End date (YYYY-MM-DD). Default: today |
| `dimensions` | string | No | Comma-separated dimensions. Default: `date` |

### Available Dimensions

- `date` - Performance by date
- `query` - Performance by search query
- `page` - Performance by page URL
- `country` - Performance by country
- `device` - Performance by device type

### Example Request

```bash
curl "https://yourdomain.com/.netlify/functions/gsc?action=performance&siteUrl=https://example.com&startDate=2024-12-01&endDate=2024-12-13" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Response

```json
{
  "siteUrl": "https://example.com",
  "startDate": "2024-12-01",
  "endDate": "2024-12-13",
  "rows": [
    {
      "date": "2024-12-01",
      "clicks": 150,
      "impressions": 2500,
      "ctr": 0.06,
      "position": 8.5
    },
    {
      "date": "2024-12-02",
      "clicks": 175,
      "impressions": 2800,
      "ctr": 0.0625,
      "position": 7.8
    }
  ],
  "totals": {
    "clicks": 325,
    "impressions": 5300,
    "avgCtr": 0.06125,
    "avgPosition": 8.15
  }
}
```

---

## Get Top Queries

Get top search queries driving traffic to your site.

**GET** `/.netlify/functions/gsc?action=queries`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | GSC property URL |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `limit` | number | No | Number of queries to return. Default: 50 |

### Example Request

```bash
curl "https://yourdomain.com/.netlify/functions/gsc?action=queries&siteUrl=https://example.com&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Response

```json
{
  "siteUrl": "https://example.com",
  "startDate": "2024-11-15",
  "endDate": "2024-12-13",
  "queries": [
    {
      "query": "privacy analytics",
      "clicks": 450,
      "impressions": 5000,
      "ctr": 0.09,
      "position": 3.2
    },
    {
      "query": "cookieless analytics",
      "clicks": 320,
      "impressions": 4200,
      "ctr": 0.076,
      "position": 4.5
    }
  ]
}
```

---

## Get Top Pages

Get top-performing pages in search results.

**GET** `/.netlify/functions/gsc?action=pages`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | GSC property URL |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |
| `limit` | number | No | Number of pages to return. Default: 25 |

### Example Request

```bash
curl "https://yourdomain.com/.netlify/functions/gsc?action=pages&siteUrl=https://example.com&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Response

```json
{
  "siteUrl": "https://example.com",
  "startDate": "2024-11-15",
  "endDate": "2024-12-13",
  "pages": [
    {
      "page": "https://example.com/",
      "clicks": 1200,
      "impressions": 15000,
      "ctr": 0.08,
      "position": 2.5
    },
    {
      "page": "https://example.com/docs/getting-started",
      "clicks": 850,
      "impressions": 9500,
      "ctr": 0.089,
      "position": 3.1
    }
  ]
}
```

---

## Disconnect GSC

Disconnect Google Search Console from your account.

**GET** `/.netlify/functions/gsc?action=disconnect`

### Response

```json
{
  "success": true,
  "message": "Google Search Console disconnected"
}
```

---

## Dashboard Integration

Access GSC data directly from your Zero Trust Analytics dashboard:

1. Click the **Search Console** button in the dashboard toolbar
2. Click **Connect Google Search Console**
3. Authorize ZTA to access your GSC data (read-only)
4. Select a property from the dropdown
5. View your search performance metrics

### Features

- **Metrics Cards**: See total clicks, impressions, CTR, and average position at a glance
- **Top Queries**: Discover which search terms drive traffic to your site
- **Top Pages**: See which pages perform best in search results
- **Performance Chart**: Track clicks and impressions over time

---

## Setup Requirements

To use the GSC integration, you need to configure Google OAuth credentials:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Search Console API**

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type
3. Fill in required fields:
   - App name: Zero Trust Analytics
   - User support email: your email
   - Developer contact: your email
4. Add scope: `https://www.googleapis.com/auth/webmasters.readonly`

### 3. Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Add authorized redirect URI: `https://yourdomain.com/.netlify/functions/gsc?action=callback`
5. Copy the **Client ID** and **Client Secret**

### 4. Configure Environment Variables

Set these in your Netlify environment:

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

---

## Error Handling

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Invalid action` | Unknown action parameter |
| 400 | `siteUrl is required` | Missing required siteUrl parameter |
| 401 | `Not connected` | GSC not connected for user |
| 500 | `Google OAuth not configured` | Missing environment variables |

---

## Privacy & Security

- We only request **read-only** access to your Search Console data
- OAuth tokens are stored securely and encrypted
- Tokens are automatically refreshed when expired
- You can disconnect at any time to revoke access
