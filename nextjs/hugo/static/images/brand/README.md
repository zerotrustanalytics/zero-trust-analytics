# Brand Assets Directory

This directory contains the primary branding assets for Zero Trust Analytics.

## Files in This Directory

### share.png (1200x630)
Social sharing image for Open Graph and Twitter Cards. This image appears when links to ZTA.io are shared on social media platforms.

**Features:**
- Professional gradient background (light blue-gray)
- Large shield icon with lock symbol (representing Zero Trust security)
- "Zero Trust Analytics" headline
- "Privacy-First Web Analytics" subheadline
- Three key benefits with green checkmarks:
  - No cookies, no tracking
  - GDPR & CCPA compliant
  - 100% data ownership
- Footer: "ZTA.io - Analytics you can trust"

**Dimensions:** 1200x630 pixels (standard for social media)
**Format:** PNG
**File Size:** ~79KB

## Usage

This image is automatically used for social sharing via the meta tags in `/layouts/partials/seo_schema.html`. Pages can override this by setting custom `seoimage` or `image` parameters in their front matter.

### Default Social Sharing
```html
<meta property="og:image" content="https://zerotrustanalytics.com/images/brand/share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

### Custom Social Image (in page front matter)
```yaml
---
title: "My Page"
seoimage: "images/custom-share-image.png"
---
```

## Regenerating

To regenerate this image from the SVG source:

```bash
npm run generate-branding
```

Or directly:

```bash
node generate-branding-assets.js
```

## Testing Social Sharing

Test how your links appear on social media:

- **Facebook/LinkedIn:** [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- **Twitter:** [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- **General:** [Open Graph Debugger](https://www.opengraphcheck.com/)

---

For more information about all branding assets, see `/BRANDING.md` in the project root.
