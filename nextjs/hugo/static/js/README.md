# ZTA Analytics Scripts

## Available Versions

### 🎯 analytics.min.js (RECOMMENDED)
**Size:** 3.73 KB minified / **1.59 KB gzipped**

The core analytics tracker with essential features only. Perfect for most websites.

**Features:**
- ✅ Pageview tracking
- ✅ Custom event tracking (`ZTA.track()`)
- ✅ Traditional event tracking (`ZTA.trackEvent()`)
- ✅ Session management
- ✅ Device & browser detection
- ✅ Traffic source detection
- ✅ UTM parameter tracking
- ✅ Event batching (reduces API calls)
- ✅ Auto-initialization via data attributes

**Usage:**
```html
<script src="https://ztas.io/js/analytics.min.js" data-site-id="YOUR_SITE_ID"></script>
```

---

### 🚀 analytics.full.min.js
**Size:** 11.42 KB minified / **3.72 KB gzipped**

The full-featured analytics tracker with advanced capabilities.

**Additional Features:**
- ✅ All core features, plus:
- ✅ Scroll depth tracking
- ✅ Outbound link tracking
- ✅ File download tracking
- ✅ Form submission tracking
- ✅ Performance metrics (Core Web Vitals)
- ✅ Real-time heartbeat
- ✅ SPA (Single Page App) support
- ✅ Declarative tracking (data attributes)
- ✅ Time on page / engagement metrics

**Usage:**
```html
<script src="https://ztas.io/js/analytics.full.min.js"
        data-site-id="YOUR_SITE_ID"
        data-track-scroll="true"
        data-track-outbound="true"
        data-track-downloads="true"
        data-track-forms="true"></script>
```

---

### 🔧 analytics.dev.js
**Size:** 6.59 KB (unminified, readable)

Development version with readable code and comments.

**Usage:**
```html
<script src="https://ztas.io/js/analytics.dev.js"
        data-site-id="YOUR_SITE_ID"
        data-debug="true"></script>
```

---

## Quick Start

### 1. Basic Setup (Automatic)
Add one line to your HTML:

```html
<script src="https://ztas.io/js/analytics.min.js" data-site-id="YOUR_SITE_ID"></script>
```

This will:
- ✅ Auto-initialize the tracker
- ✅ Track page views automatically
- ✅ Track sessions and visitors

### 2. Manual Initialization
For more control:

```html
<script src="https://ztas.io/js/analytics.min.js"></script>
<script>
  ZTA.init('YOUR_SITE_ID', {
    autoTrack: true,    // Auto-track page views (default: true)
    debug: false,       // Enable console logging (default: false)
    endpoint: 'https://ztas.io/api/track'  // API endpoint
  });
</script>
```

### 3. Track Custom Events

```javascript
// Simple event
ZTA.track('button_click');

// Event with properties
ZTA.track('purchase', {
  amount: 99.99,
  product: 'Pro Plan',
  currency: 'USD'
});

// Traditional Google Analytics style
ZTA.trackEvent('ecommerce', 'purchase', 'Pro Plan', 99.99);
```

### 4. Manual Page Views (SPA)

```javascript
// Track page view manually (useful for SPAs)
ZTA.trackPageView();

// With custom data
ZTA.trackPageView({
  section: 'dashboard',
  user_type: 'premium'
});
```

---

## Configuration Options

All configuration is done via data attributes or the `ZTA.init()` options object.

### Core Version Options

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-site-id` | String | (required) | Your site ID |
| `data-auto-track` | Boolean | `true` | Auto-track page views |
| `data-debug` | Boolean | `false` | Enable debug logging |

### Full Version Additional Options

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-track-scroll` | Boolean | `true` | Track scroll depth |
| `data-track-outbound` | Boolean | `true` | Track outbound links |
| `data-track-downloads` | Boolean | `true` | Track file downloads |
| `data-track-forms` | Boolean | `true` | Track form submissions |
| `data-spa` | Boolean | `false` | Enable SPA tracking |

---

## API Reference

### ZTA.init(siteId, options)
Initialize the tracker.

```javascript
ZTA.init('site-123', {
  autoTrack: true,
  debug: false,
  endpoint: 'https://ztas.io/api/track'
});
```

### ZTA.trackPageView(customData)
Track a page view.

```javascript
ZTA.trackPageView();
ZTA.trackPageView({ section: 'blog' });
```

### ZTA.track(eventName, properties)
Track a custom event (modern API).

```javascript
ZTA.track('signup');
ZTA.track('purchase', { amount: 99, plan: 'pro' });
```

### ZTA.trackEvent(category, action, label, value)
Track an event (Google Analytics style).

```javascript
ZTA.trackEvent('video', 'play', 'homepage-hero');
ZTA.trackEvent('ecommerce', 'purchase', 'pro-plan', 99);
```

---

## Performance Comparison

| Service | Script Size (gzipped) | Load Time (3G) |
|---------|----------------------|----------------|
| **ZTA (Core)** | **1.59 KB** | ~50ms |
| Plausible | < 1 KB | ~30ms |
| **ZTA (Full)** | **3.72 KB** | ~120ms |
| Fathom | ~1.5 KB | ~50ms |
| Google Analytics 4 | ~45 KB | ~1.5s |
| Matomo | ~25 KB | ~800ms |

---

## Browser Support

- ✅ Chrome/Edge (last 2 versions)
- ✅ Firefox (last 2 versions)
- ✅ Safari (last 2 versions)
- ✅ iOS Safari (last 2 versions)
- ✅ Android Chrome (last 2 versions)
- ⚠️ IE11 (core features only, with polyfills)

---

## Testing

### Browser Test
Open `/test-optimized.html` in your browser to test the tracker.

### API Test
```bash
node test-api.js
```

---

## Building from Source

```bash
# Install dependencies
npm install

# Build all versions
npm run build

# This creates:
# - static/js/analytics.min.js (core)
# - static/js/analytics.full.min.js (full)
# - static/js/analytics.dev.js (development)
```

---

## Security & Privacy

- ✅ No cookies
- ✅ No cross-site tracking
- ✅ No personal data collection
- ✅ No browser fingerprinting
- ✅ GDPR compliant
- ✅ No obfuscation (fully auditable)

---

## Migration from Old Version

If you're using the old obfuscated version (analytics.js, 50 KB):

**Before:**
```html
<script src="https://ztas.io/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
```

**After:**
```html
<script src="https://ztas.io/js/analytics.min.js" data-site-id="YOUR_SITE_ID"></script>
```

The API is 100% compatible. No code changes required!

---

## License

MIT

---

## Support

- 📧 Email: support@ztas.io
- 📖 Docs: https://ztas.io/docs
- 💬 GitHub: https://github.com/jasonsutter87/zero-trust-analytics
