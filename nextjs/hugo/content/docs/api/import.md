---
title: "Google Analytics Import API"
description: "Import historical data from Google Analytics to ensure seamless data continuity when switching to Zero Trust Analytics."
weight: 50
---

# Google Analytics Import API

Import historical analytics data from Google Analytics (GA4 or Universal Analytics) to maintain data continuity when switching to Zero Trust Analytics.

## Overview

The Import API allows you to:
- Import data from GA4 exports (CSV or JSON)
- Import data from Universal Analytics exports
- Import data directly from GA4 API responses
- View import history
- Delete imported data if needed

**Endpoint:** `/.netlify/functions/import`

**Authentication:** Required (JWT token in Authorization header)

---

## Import Data

Import historical analytics data from Google Analytics.

**POST** `/.netlify/functions/import`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `siteId` | string | Yes | Your ZTA site ID |
| `format` | string | Yes | Data format: `csv`, `json`, `ga4-api`, or `ua-csv` |
| `data` | string/object | Yes | The analytics data (CSV string or JSON object/array) |
| `source` | string | No | Source identifier (default: `google-analytics`) |
| `dateRange` | object | No | Optional date range override `{start, end}` |

### Supported Formats

#### CSV Format (`csv` or `ua-csv`)

Standard CSV export from Google Analytics:

```csv
date,pagePath,pageTitle,screenPageViews,sessions,totalUsers
20241201,/home,Homepage,150,100,80
20241202,/about,About Us,75,50,40
20241203,/contact,Contact,30,25,20
```

#### JSON Array Format (`json`)

Array of records:

```json
[
  {
    "date": "20241201",
    "pagePath": "/home",
    "screenPageViews": 150,
    "sessions": 100,
    "totalUsers": 80
  },
  {
    "date": "20241202",
    "pagePath": "/about",
    "screenPageViews": 75,
    "sessions": 50,
    "totalUsers": 40
  }
]
```

#### GA4 API Response Format (`ga4-api`)

Direct response from GA4 Data API:

```json
{
  "dimensionHeaders": [
    {"name": "date"},
    {"name": "pagePath"}
  ],
  "metricHeaders": [
    {"name": "screenPageViews"},
    {"name": "sessions"}
  ],
  "rows": [
    {
      "dimensionValues": [
        {"value": "20241201"},
        {"value": "/home"}
      ],
      "metricValues": [
        {"value": "150"},
        {"value": "100"}
      ]
    }
  ]
}
```

### Example Request

```bash
curl -X POST https://yourdomain.com/.netlify/functions/import \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "format": "csv",
    "data": "date,pageviews,sessions,visitors\n20241201,150,100,80\n20241202,75,50,40"
  }'
```

### Success Response

```json
{
  "success": true,
  "importId": "import_1702484923_x7k2m9p4q",
  "recordsProcessed": 30,
  "recordsStored": 30,
  "dateRange": {
    "start": "2024-12-01",
    "end": "2024-12-30",
    "days": 30
  },
  "message": "Successfully imported 30 days of historical data"
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `siteId is required` | Missing site ID |
| 400 | `data is required` | Missing import data |
| 400 | `Invalid format` | Unsupported format specified |
| 400 | `Failed to parse data` | Data could not be parsed |
| 403 | `Site not found or access denied` | User doesn't own the site |

---

## Get Import History

Retrieve a list of previous imports.

**GET** `/.netlify/functions/import`

### Example Request

```bash
curl -X GET https://yourdomain.com/.netlify/functions/import \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Response

```json
{
  "imports": [
    {
      "id": "import_1702484923_x7k2m9p4q",
      "siteId": "site_abc123",
      "source": "google-analytics",
      "recordCount": 30,
      "importedAt": "2024-12-13T15:22:03.000Z"
    }
  ],
  "supportedFormats": ["csv", "json", "ga4-api", "ua-csv"]
}
```

---

## Delete Import

Remove imported data from your analytics.

**DELETE** `/.netlify/functions/import?importId=IMPORT_ID`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `importId` | string | Yes | The import ID to delete |

### Example Request

```bash
curl -X DELETE "https://yourdomain.com/.netlify/functions/import?importId=import_1702484923_x7k2m9p4q" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Success Response

```json
{
  "success": true,
  "deletedRecords": 30,
  "message": "Successfully deleted import and 30 historical records"
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `importId is required` | Missing import ID |
| 403 | `Access denied` | User doesn't own this import |
| 404 | `Import not found` | Import ID doesn't exist |

---

## Field Mapping

The Import API automatically maps Google Analytics fields to ZTA fields:

### GA4 Fields

| GA4 Field | ZTA Field |
|-----------|-----------|
| `date` | `date` |
| `pagePath` | `page` |
| `pageTitle` | `title` |
| `screenPageViews` | `pageviews` |
| `sessions` | `sessions` |
| `totalUsers` | `visitors` |
| `newUsers` | `new_visitors` |
| `bounceRate` | `bounce_rate` |
| `averageSessionDuration` | `avg_duration` |
| `sessionSource` | `source` |
| `sessionMedium` | `medium` |
| `country` | `country` |
| `region` | `region` |
| `city` | `city` |
| `deviceCategory` | `device` |
| `browser` | `browser` |
| `operatingSystem` | `os` |

### Universal Analytics Fields

| UA Field | ZTA Field |
|----------|-----------|
| `ga:date` | `date` |
| `ga:pagePath` | `page` |
| `ga:pageTitle` | `title` |
| `ga:pageviews` | `pageviews` |
| `ga:sessions` | `sessions` |
| `ga:users` | `visitors` |
| `ga:newUsers` | `new_visitors` |
| `ga:bounceRate` | `bounce_rate` |
| `ga:avgSessionDuration` | `avg_duration` |
| `ga:source` | `source` |
| `ga:medium` | `medium` |
| `ga:country` | `country` |
| `ga:region` | `region` |
| `ga:city` | `city` |
| `ga:deviceCategory` | `device` |
| `ga:browser` | `browser` |
| `ga:operatingSystem` | `os` |

---

## Date Format Handling

The API automatically normalizes dates to `YYYY-MM-DD` format:

| Input Format | Example | Normalized |
|--------------|---------|------------|
| YYYYMMDD | `20241201` | `2024-12-01` |
| MM/DD/YYYY | `12/01/2024` | `2024-12-01` |
| YYYY-MM-DD | `2024-12-01` | `2024-12-01` |

---

## How to Export from Google Analytics

### GA4 Export

1. Go to **Reports** > Select your report
2. Click **Share this report** (share icon)
3. Select **Download file** > **Download CSV** or **Download JSON**
4. Upload the file to ZTA using the Import feature

### GA4 API Export

Use the [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1):

```javascript
// Example: Export data via GA4 API
const response = await analyticsDataClient.runReport({
  property: 'properties/YOUR_PROPERTY_ID',
  dateRanges: [{ startDate: '2024-01-01', endDate: '2024-12-31' }],
  dimensions: [{ name: 'date' }, { name: 'pagePath' }],
  metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }]
});

// Send response directly to ZTA Import API
fetch('/.netlify/functions/import', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    siteId: 'your_site_id',
    format: 'ga4-api',
    data: response
  })
});
```

---

## Best Practices

1. **Start with a test import** - Import a small date range first to verify mapping
2. **Use consistent date ranges** - Avoid overlapping imports to prevent duplicate data
3. **Keep your export files** - Store original GA exports as backup
4. **Review imported data** - Check your ZTA dashboard after import to verify accuracy
5. **Delete and re-import if needed** - Use the delete endpoint to remove and reimport data

---

## Dashboard Import Feature

You can also import data directly from the ZTA dashboard:

1. Log in to your dashboard
2. Click the **Import GA** button in the toolbar
3. Select your export file (CSV or JSON)
4. Preview the data mapping
5. Click **Import** to complete

The dashboard provides:
- File upload with drag-and-drop
- Data preview before import
- Import history view
- One-click delete for imports
