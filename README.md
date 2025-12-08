# Zero Trust Analytics

Privacy-focused, anonymous website analytics. Track visitors without compromising their privacy.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Integration Guide](#integration-guide)
  - [Basic Integration](#basic-integration)
  - [Hugo Sites](#hugo-sites)
  - [React / Next.js](#react--nextjs)
  - [Vue / Nuxt](#vue--nuxt)
  - [WordPress](#wordpress)
  - [Static HTML](#static-html)
- [Configuration Options](#configuration-options)
- [JavaScript API](#javascript-api)
- [REST API Reference](#rest-api-reference)
- [Self-Hosting / Deployment](#self-hosting--deployment)
- [How It Works](#how-it-works)

---

## Features

| Feature | Description |
|---------|-------------|
| **Privacy First** | No cookies, no fingerprinting, no personal data stored |
| **GDPR Compliant** | No consent banner needed - we don't track personal data |
| **Lightweight** | Under 3KB script, won't slow down your site |
| **Anonymous** | Visitors identified by daily-rotating hashed IDs |
| **Multi-site** | Track unlimited websites from one dashboard |
| **Real-time** | View stats immediately in your dashboard |

---

## Quick Start

### 1. Create an Account

Go to [https://zero-trust-analytics.netlify.app/register/](https://zero-trust-analytics.netlify.app/register/) and create your account.

### 2. Add Your Site

In the dashboard, click "Add Site" and enter your domain (e.g., `mywebsite.com`).

### 3. Copy the Embed Code

You'll receive a code snippet like this:

```html
<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="site_abc123def456"></script>
```

### 4. Add to Your Website

Paste the code into your website's `<head>` tag. That's it!

---

## Integration Guide

### Basic Integration

Add this single line to your HTML `<head>`:

```html
<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
```

Replace `YOUR_SITE_ID` with the ID from your dashboard.

---

### Hugo Sites

**Option 1: Add to `baseof.html`**

Edit `layouts/_default/baseof.html`:

```html
<head>
  {{ partial "head.html" . }}

  <!-- Zero Trust Analytics -->
  <script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
</head>
```

**Option 2: Create a partial**

Create `layouts/partials/analytics.html`:

```html
{{ if not .Site.IsServer }}
<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
{{ end }}
```

Then include it in your `<head>`:

```html
{{ partial "analytics.html" . }}
```

This only loads analytics in production, not during `hugo server`.

---

### React / Next.js

**Next.js (App Router)**

Create `app/analytics.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

declare global {
  interface Window {
    ZTA: {
      trackPageView: () => void;
      trackEvent: (name: string, data?: object) => void;
    };
  }
}

export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    // Load script once
    if (!document.getElementById('zta-script')) {
      const script = document.createElement('script');
      script.id = 'zta-script';
      script.src = 'https://zero-trust-analytics.netlify.app/js/analytics.js';
      script.dataset.siteId = 'YOUR_SITE_ID';
      script.dataset.spa = 'true';
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    // Track page views on route change
    if (window.ZTA) {
      window.ZTA.trackPageView();
    }
  }, [pathname]);

  return null;
}
```

Add to `app/layout.tsx`:

```tsx
import Analytics from './analytics';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

**Next.js (Pages Router)**

Add to `pages/_app.tsx`:

```tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://zero-trust-analytics.netlify.app/js/analytics.js';
    script.dataset.siteId = 'YOUR_SITE_ID';
    document.head.appendChild(script);

    const handleRouteChange = () => {
      if (window.ZTA) window.ZTA.trackPageView();
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, []);

  return <Component {...pageProps} />;
}
```

**Create React App / Vite**

Add to `index.html`:

```html
<head>
  <script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID" data-spa="true"></script>
</head>
```

---

### Vue / Nuxt

**Nuxt 3**

Create `plugins/analytics.client.ts`:

```ts
export default defineNuxtPlugin(() => {
  if (process.client) {
    const script = document.createElement('script');
    script.src = 'https://zero-trust-analytics.netlify.app/js/analytics.js';
    script.dataset.siteId = 'YOUR_SITE_ID';
    script.dataset.spa = 'true';
    document.head.appendChild(script);
  }
});
```

**Vue 3 (Vite)**

Add to `index.html`:

```html
<head>
  <script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID" data-spa="true"></script>
</head>
```

Or create a composable `useAnalytics.ts`:

```ts
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

export function useAnalytics() {
  const route = useRoute();

  onMounted(() => {
    const script = document.createElement('script');
    script.src = 'https://zero-trust-analytics.netlify.app/js/analytics.js';
    script.dataset.siteId = 'YOUR_SITE_ID';
    document.head.appendChild(script);
  });

  watch(() => route.path, () => {
    if (window.ZTA) window.ZTA.trackPageView();
  });
}
```

---

### WordPress

**Option 1: Theme Header**

Add to your theme's `header.php` before `</head>`:

```php
<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
```

**Option 2: functions.php**

Add to your theme's `functions.php`:

```php
function add_zero_trust_analytics() {
    echo '<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>';
}
add_action('wp_head', 'add_zero_trust_analytics');
```

**Option 3: Plugin (Insert Headers and Footers)**

1. Install "Insert Headers and Footers" plugin
2. Go to Settings > Insert Headers and Footers
3. Paste the script in the "Header" section

---

### Static HTML

Simply add to every page's `<head>`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My Website</title>

  <!-- Zero Trust Analytics -->
  <script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

---

## Configuration Options

Configure via `data-*` attributes on the script tag:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-site-id` | (required) | Your unique site ID from the dashboard |
| `data-auto-track` | `true` | Automatically track page view on load |
| `data-spa` | `false` | Enable SPA mode (tracks history changes) |
| `data-debug` | `false` | Log tracking events to console |
| `data-endpoint` | (auto) | Custom API endpoint URL |

**Examples:**

```html
<!-- Basic (auto-tracks on page load) -->
<script src=".../analytics.js" data-site-id="site_123"></script>

<!-- SPA with debug logging -->
<script src=".../analytics.js" data-site-id="site_123" data-spa="true" data-debug="true"></script>

<!-- Manual tracking only -->
<script src=".../analytics.js" data-site-id="site_123" data-auto-track="false"></script>
```

---

## JavaScript API

After the script loads, a global `ZTA` object is available:

### `ZTA.init(siteId, options)`

Initialize manually (if not using data attributes):

```javascript
ZTA.init('site_abc123', {
  autoTrack: true,
  spa: false,
  debug: false
});
```

### `ZTA.trackPageView(customData)`

Track a page view:

```javascript
// Basic
ZTA.trackPageView();

// With custom data
ZTA.trackPageView({
  category: 'blog',
  author: 'john'
});
```

### `ZTA.trackEvent(eventName, eventData)`

Track custom events:

```javascript
// Button click
ZTA.trackEvent('button_click', { button: 'signup' });

// Form submission
ZTA.trackEvent('form_submit', { form: 'contact' });

// Purchase
ZTA.trackEvent('purchase', { product: 'pro-plan', value: 10 });
```

### Full Example

```html
<script src="https://zero-trust-analytics.netlify.app/js/analytics.js"
        data-site-id="YOUR_SITE_ID"
        data-auto-track="false"
        data-debug="true"></script>

<script>
  // Wait for script to load
  window.addEventListener('load', function() {
    // Track initial page view
    ZTA.trackPageView();

    // Track button clicks
    document.getElementById('signup-btn').addEventListener('click', function() {
      ZTA.trackEvent('signup_click');
    });

    // Track form submissions
    document.getElementById('contact-form').addEventListener('submit', function() {
      ZTA.trackEvent('contact_submit');
    });
  });
</script>
```

---

## REST API Reference

All API endpoints are available at `https://zero-trust-analytics.netlify.app/api/`

### Track Pageview

```
POST /api/track
Content-Type: application/json

{
  "siteId": "site_abc123",
  "path": "/about",
  "referrer": "https://google.com",
  "url": "https://mysite.com/about"
}
```

### Get Stats (Authenticated)

```
GET /api/stats?siteId=site_abc123&period=7d
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**

```json
{
  "pageviews": 1250,
  "uniqueVisitors": 487,
  "pages": {
    "/": 500,
    "/about": 200,
    "/contact": 150
  },
  "referrers": {
    "https://google.com": 300,
    "https://twitter.com": 100
  },
  "daily": [
    { "date": "2024-01-01", "pageviews": 180, "uniqueVisitors": 72 }
  ]
}
```

**Period options:** `24h`, `7d`, `30d`, `90d`

### Authentication

**Register:**

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Login:**

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  }
}
```

### Sites

**Create Site:**

```
POST /api/sites/create
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "domain": "mywebsite.com"
}
```

**List Sites:**

```
GET /api/sites/list
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Self-Hosting / Deployment

Want to run your own instance? Here's how:

### Prerequisites

- Node.js 18+
- Netlify account
- Stripe account (for billing)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/zero-trust-analytics.git
cd zero-trust-analytics
cd netlify/functions && npm install && cd ../..
```

### 2. Create Netlify Site

```bash
npm install -g netlify-cli
netlify login
netlify init
```

### 3. Set Environment Variables

In Netlify Dashboard > Site Settings > Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `HASH_SECRET` | Random string for visitor hashing | `a7f2b9c4e1d8...` |
| `JWT_SECRET` | Random string for auth tokens | `x9k2m5n8p1q4...` |
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` |
| `STRIPE_PRICE_ID` | Your $10/month price ID | `price_...` |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Set Up Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create a product called "Zero Trust Analytics Pro"
3. Add a recurring price: $10/month
4. Copy the Price ID to `STRIPE_PRICE_ID`
5. Go to Developers > Webhooks
6. Add endpoint: `https://YOUR-SITE.netlify.app/api/stripe/webhook`
7. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
8. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

### 5. Deploy

```bash
netlify deploy --prod
```

### 6. Update Analytics Script URL

After deploying, update the script URL in your integrations:

```html
<script src="https://YOUR-SITE.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
```

---

## How It Works

### Privacy-Preserving Visitor Counting

Instead of storing IP addresses or using cookies, we:

1. **Hash the visitor identity**: `SHA256(IP + UserAgent + DailySalt)`
2. **Rotate the salt daily**: Yesterday's visitors can't be linked to today's
3. **Store only the hash**: The original IP is never saved

This means:
- We can count unique visitors accurately
- We cannot identify who they are
- We cannot track them across days
- No consent banner needed

### Data Flow

```
[Your Website] → analytics.js → /api/track → Hash Visitor → Store in Netlify Blobs
                                    ↓
                              Extract IP from headers
                              (never stored)
```

### What We Track

| Data | Stored | Purpose |
|------|--------|---------|
| Page URL | Yes | Top pages report |
| Referrer | Yes | Traffic sources |
| Timestamp | Yes | Time-series data |
| Screen size | No | Not stored |
| IP Address | **No** | Hashed then discarded |
| User Agent | **No** | Used for hash only |
| Cookies | **No** | We don't use cookies |

---

## Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/zero-trust-analytics/issues)
- **Email**: support@your-domain.com

---

## License

MIT License - feel free to use, modify, and distribute.
