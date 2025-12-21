---
title: "Data Collected"
description: "Exactly what data Zero Trust Analytics collects (and doesn't)"
weight: 21
priority: 0.7
---

## What We Collect

### Page View Data

| Data Point | Example | Purpose |
|------------|---------|---------|
| Page path | `/blog/my-article` | Know which pages are popular |
| Referrer domain | `google.com` | Understand traffic sources |
| UTM parameters | `source=twitter` | Track marketing campaigns |
| Timestamp | `2024-12-10T14:30:00Z` | Time-based analysis |

### Session Data

| Data Point | Example | Purpose |
|------------|---------|---------|
| Session ID | `sess_abc123` | Group pageviews into sessions |
| Duration | `185 seconds` | Measure engagement |
| Bounce | `true/false` | Identify single-page visits |
| Pages per session | `3.2` | Measure depth of engagement |

### Device Data

| Data Point | Example | Purpose |
|------------|---------|---------|
| Device type | `mobile` | Mobile vs desktop breakdown |
| Browser | `Chrome 120` | Browser compatibility insights |
| Operating system | `macOS 14` | OS distribution |
| Screen size | `1920x1080` | Responsive design decisions |

### Geographic Data

| Data Point | Example | Purpose |
|------------|---------|---------|
| Country | `US` | Geographic distribution |
| Region | `California` | Regional insights |

### Custom Events

| Data Point | Example | Purpose |
|------------|---------|---------|
| Event name | `signup_click` | Track specific actions |
| Category | `conversion` | Group related events |
| Label | `hero_button` | Identify specific elements |
| Value | `29` | Numeric data (e.g., price) |

## What We DON'T Collect

### Personal Identifiers

- **IP addresses** - Hashed immediately, never stored
- **Email addresses** - Never collected
- **Names** - Never collected
- **Phone numbers** - Never collected
- **Any PII** - Never collected

### Tracking Mechanisms

- **Cookies** - We don't use any
- **Local storage** - We don't persist anything
- **Fingerprints** - No canvas, WebGL, font, or audio fingerprinting
- **Device IDs** - Not collected

### Sensitive Data

- **Form inputs** - We don't capture what users type
- **Passwords** - Obviously never
- **Credit card numbers** - Never
- **Health information** - Never
- **Financial data** - Never

### Cross-Site Data

- **Third-party data** - We don't buy or use external data
- **Cross-site tracking** - We only see your site
- **Advertising IDs** - Not collected
- **Social profiles** - Not linked

## Data Storage

All data is stored in our secure infrastructure:

- **Location**: US-based servers
- **Encryption**: AES-256 at rest, TLS in transit
- **Retention**: Configurable, default 2 years
- **Access**: Only you can access your site's data

## Data Flow

```
Visitor Browser
     │
     ▼
 [Page Load]
     │
     ▼
analytics.js (3KB)
     │
     ├── Collects: path, referrer, device info
     │   Does NOT collect: IP, cookies, fingerprint
     │
     ▼
POST /api/track
     │
     ├── Server receives request
     ├── IP hashed with daily salt
     ├── Raw IP discarded
     │
     ▼
Anonymous record stored
     │
     ▼
Dashboard shows aggregated data
```

## Verify It Yourself

Open your browser's Developer Tools and watch the network requests. You'll see:

1. Our script loads (`analytics.js` - ~3KB)
2. It sends a POST to `/api/track`
3. The payload contains only: site ID, page path, referrer, device info
4. No cookies are set (check Application > Cookies)

We have nothing to hide because we collect nothing worth hiding.
