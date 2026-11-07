---
title: "SPA Support"
description: "Using Zero Trust Analytics with React, Vue, Next.js, and other single-page applications"
weight: 5
priority: 0.7
---

## Automatic SPA Detection

Our tracking script automatically detects single-page application navigation using the History API. No additional configuration needed for most SPAs.

## Manual Page Tracking

Use one approach, not both. With `data-spa="true"`, every route change is already recorded, so calling
`ZTA.trackPageView()` as well counts each page twice. For manual tracking, set `data-auto-track="false"`
and leave `data-spa` off.

If automatic detection doesn't work for your setup, manually track page views:

```javascript
// Call after each route change
ZTA.trackPageView()

// Optionally specify a custom path
ZTA.trackPageView('/custom/path')
```

## React Router

```jsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function App() {
  const location = useLocation()

  useEffect(() => {
    // Track page view on route change
    if (window.ZTA) {
      window.ZTA.trackPageView()
    }
  }, [location])

  return (
    // Your app content
  )
}
```

## Next.js (App Router)

```jsx
// app/layout.js
'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function RootLayout({ children }) {
  const pathname = usePathname()

  useEffect(() => {
    if (window.ZTA) {
      window.ZTA.trackPageView()
    }
  }, [pathname])

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

## Next.js (Pages Router)

```jsx
// pages/_app.js
import { useRouter } from 'next/router'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    const handleRouteChange = () => {
      if (window.ZTA) {
        window.ZTA.trackPageView()
      }
    }

    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])

  return <Component {...pageProps} />
}

export default MyApp
```

## Vue Router

```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [/* your routes */]
})

router.afterEach(() => {
  if (window.ZTA) {
    window.ZTA.trackPageView()
  }
})

export default router
```

## Angular

```typescript
// app.component.ts
import { Component } from '@angular/core'
import { Router, NavigationEnd } from '@angular/router'
import { filter } from 'rxjs/operators'

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>'
})
export class AppComponent {
  constructor(private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        if ((window as any).zta) {
          (window as any).ZTA.trackPageView()
        }
      })
  }
}
```

## Troubleshooting

### Pageviews not tracking on navigation

Make sure the script is loaded before navigation occurs. Add it to the `<head>` with `defer`.

### Double pageviews

If you're seeing duplicate pageviews, the automatic detection might be conflicting with manual tracking. Remove manual `trackPageView()` calls.

### Script not available

The `zta` object might not be available immediately. Wrap calls in a check:

```javascript
if (window.ZTA) {
  window.ZTA.trackPageView()
}
```
