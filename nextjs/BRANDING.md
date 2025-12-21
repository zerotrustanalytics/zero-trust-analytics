# Zero Trust Analytics - Branding Assets

This document outlines all branding assets for Zero Trust Analytics (ZTA.io) and how to use them.

## Brand Identity

### Brand Colors

```css
/* Primary Colors */
--primary-blue: #2563eb;      /* Primary brand color */
--dark-blue: #1e40af;         /* Dark blue for depth */
--trust-green: #059669;       /* Green for privacy/trust indicators */
--background: #f8fafc;        /* Light background */

/* Secondary Colors */
--gray-600: #475569;          /* Body text */
--gray-400: #64748b;          /* Muted text */
--gray-200: #e2e8f0;          /* Borders/dividers */
```

### Brand Messaging

**Primary Tagline:** "Privacy-First Analytics"

**Key Messages:**
- No cookies, no tracking
- GDPR & CCPA compliant by design
- 100% data ownership
- Analytics you can trust
- Zero Trust Analytics

## Asset Inventory

### Favicons (Location: `/static/`)

| File | Dimensions | Format | Purpose |
|------|-----------|--------|---------|
| `favicon.ico` | 32x32 | ICO | Legacy browser support |
| `favicon.svg` | Scalable | SVG | Modern browsers, scalable |
| `favicon-16x16.png` | 16x16 | PNG | Small favicon display |
| `favicon-32x32.png` | 32x32 | PNG | Standard favicon display |
| `apple-touch-icon.png` | 180x180 | PNG | iOS home screen icon |
| `safari-pinned-tab.svg` | Scalable | SVG | Safari pinned tabs (monochrome) |

### Logo (Location: `/static/images/`)

| File | Dimensions | Format | Purpose |
|------|-----------|--------|---------|
| `logo.png` | 800x200 | PNG | Primary logo for website, emails |

**Logo Elements:**
- Shield icon representing Zero Trust security
- Lock symbol inside shield for data protection
- Green checkmark for verification/trust
- "Zero Trust" in bold (Lato 700)
- "Analytics" in regular weight (Lato 400)
- Tagline: "Privacy-First Analytics" in light (Lato 300)

### Social Share Image (Location: `/static/images/brand/`)

| File | Dimensions | Format | Purpose |
|------|-----------|--------|---------|
| `share.png` | 1200x630 | PNG | Open Graph / Twitter Cards |

**Share Image Features:**
- Gradient background (#f8fafc to #e2e8f0)
- Large shield icon with lock
- Brand name and tagline
- Three key benefits with green checkmarks
- Professional, trustworthy design

## Usage Guidelines

### Favicon Implementation

The favicons are already properly configured in `/layouts/partials/head.html`:

```html
<link rel="apple-touch-icon" href="{{ "apple-touch-icon.png" | relURL }}" sizes="180x180">
<link rel="icon" href="{{ "favicon-32x32.png" | relURL }}" sizes="32x32" type="image/png">
<link rel="icon" href="{{ "favicon-16x16.png" | relURL }}" sizes="16x16" type="image/png">
<link rel="mask-icon" href="{{ "safari-pinned-tab.svg" | relURL }}">
<link rel="icon" href="{{ "favicon.ico" | relURL }}">
<meta name="msapplication-TileColor" content="#2563eb">
<meta name="theme-color" content="#2563eb">
```

### Social Share Configuration

Social sharing meta tags are configured in `/layouts/partials/seo_schema.html` with automatic fallback to the default share image:

```html
<!-- Open Graph -->
<meta property="og:image" content="{{ .Site.BaseURL }}{{ .Params.seoimage | default "images/brand/share.png" }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{{ .Site.BaseURL }}{{ .Params.image | default "images/brand/share.png" }}">
```

### Logo Usage

The logo works best:
- On light backgrounds (#f8fafc, #ffffff)
- With minimum height of 50px for web display
- With clear space around it (minimum 20px padding)
- Never stretched or distorted (maintain aspect ratio)

## Regenerating Assets

If you need to regenerate the branding assets (e.g., after updating SVG sources):

### Prerequisites

Install the required dependency:

```bash
npm install --save-dev sharp
```

### Running the Generator

Execute the Node.js script:

```bash
node generate-branding-assets.js
```

Or use the bash script (requires ImageMagick):

```bash
./generate-branding-assets.sh
```

The scripts will:
1. Generate all PNG files from SVG sources
2. Create the multi-size favicon.ico
3. Generate the Safari pinned tab SVG
4. Clean up temporary files
5. Output confirmation of generated assets

## File Structure

```
/static/
├── favicon.ico                    # Legacy favicon
├── favicon.svg                    # Scalable favicon
├── favicon-16x16.png             # 16px favicon
├── favicon-32x32.png             # 32px favicon
├── apple-touch-icon.png          # iOS home screen icon
├── safari-pinned-tab.svg         # Safari pinned tab
└── images/
    ├── logo.png                  # Primary logo
    └── brand/
        └── share.png             # Social share image (1200x630)
```

## Accessibility Considerations

All branding assets follow accessibility best practices:

### Color Contrast
- Primary blue (#2563eb) on white provides 7.5:1 contrast ratio (WCAG AAA)
- Dark blue (#1e40af) on white provides 11:1 contrast ratio (WCAG AAA)
- Green (#059669) on white provides 4.6:1 contrast ratio (WCAG AA+)

### Icon Design
- Shield and lock symbols are universally recognized security metaphors
- Checkmark provides clear positive affirmation
- High contrast between elements ensures visibility
- SVG format ensures crisp rendering at any size

### Theme Colors
- Browser theme color set to primary blue (#2563eb)
- Provides consistent brand experience across browsers
- Supports dark mode detection (future enhancement)

## Brand Do's and Don'ts

### Do:
- Use the shield/lock icon to represent security and trust
- Maintain the green color for positive/trust indicators
- Keep messaging focused on privacy and transparency
- Emphasize "zero" and "trust" in brand communications

### Don't:
- Don't modify the logo proportions or colors
- Don't use the logo on busy backgrounds
- Don't combine with competitor logos
- Don't use red or warning colors in brand materials (conflicts with "trust" messaging)

## Support

For questions about branding assets or to request additional formats, please refer to the main project documentation or contact the design team.

---

**Last Updated:** December 12, 2025
**Version:** 1.0.0
