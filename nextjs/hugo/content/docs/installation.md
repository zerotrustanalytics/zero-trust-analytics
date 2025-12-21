---
title: "Installation"
description: "Different ways to install Zero Trust Analytics on your website"
weight: 2
priority: 0.7
---

## Standard Installation

Add this script to your HTML, just before the closing `</head>` tag:

```html
<script defer data-site="YOUR_SITE_ID" src="https://ztas.io/js/analytics.js"></script>
```

The `defer` attribute ensures the script doesn't block page rendering.

## WordPress

### Option 1: Theme Header

Add the script to your theme's `header.php` file, just before `</head>`:

```php
<script defer data-site="YOUR_SITE_ID" src="https://ztas.io/js/analytics.js"></script>
</head>
```

### Option 2: Plugin

Use a plugin like "Insert Headers and Footers" to add the script without editing theme files.

## Shopify

1. Go to **Online Store > Themes > Edit Code**
2. Open `theme.liquid`
3. Add the script just before `</head>`

## Squarespace

1. Go to **Settings > Advanced > Code Injection**
2. Paste the script in the **Header** section

## Wix

1. Go to **Settings > Tracking & Analytics**
2. Click **+ New Tool > Custom**
3. Paste the script and set it to load in the **Head**

## Next.js

```jsx
// pages/_app.js or app/layout.js
import Script from 'next/script'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Script
        defer
        data-site="YOUR_SITE_ID"
        src="https://ztas.io/js/analytics.js"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  )
}
```

## Gatsby

```jsx
// gatsby-browser.js
export const onClientEntry = () => {
  const script = document.createElement('script')
  script.defer = true
  script.dataset.site = 'YOUR_SITE_ID'
  script.src = 'https://ztas.io/js/analytics.js'
  document.head.appendChild(script)
}
```

## Hugo

Add to your `layouts/partials/head.html`:

```html
<script defer data-site="YOUR_SITE_ID" src="https://ztas.io/js/analytics.js"></script>
```

## Verifying Installation

After adding the script:

1. Open your website in a new browser tab
2. Open your Zero Trust Analytics dashboard
3. You should see your pageview within seconds

If you don't see data, check:
- The Site ID matches your registered domain
- The script is loading (check browser Network tab)
- No ad blockers are interfering
