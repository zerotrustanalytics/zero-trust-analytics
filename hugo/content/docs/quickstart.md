---
title: "Quick Start"
description: "Get Zero Trust Analytics running on your site in under 5 minutes"
weight: 1
priority: 0.7
---

## Step 1: Create an Account

Sign up for a free account at [ztas.io/register](/register/). No credit card required.

## Step 2: Add Your Site

After logging in, click **"Add Site"** and enter your website's domain (e.g., `example.com`).

You'll receive a unique **Site ID** that looks like this:
```
site_abc123xyz
```

## Step 3: Add the Tracking Script

Copy this script and paste it just before the closing `</head>` tag on your website:

```html
<script defer data-site="YOUR_SITE_ID" src="https://ztas.io/js/analytics.js"></script>
```

Replace `YOUR_SITE_ID` with the Site ID from Step 2.

## Step 4: Verify Installation

Visit your website in a new browser tab, then check your Zero Trust Analytics dashboard. You should see your visit appear within a few seconds.

## That's It!

You're now tracking visitors with privacy-first analytics. No cookies, no consent banners, no personal data.

## Next Steps

- [Track custom events](/docs/custom-events/) like button clicks and form submissions
- [Set up your SPA](/docs/spa-support/) for React, Vue, or Angular apps
- [Explore the API](/docs/api/authentication/) for custom integrations
