---
title: "Custom Events"
description: "Track button clicks, form submissions, and custom user interactions"
weight: 4
priority: 0.7
---

## Overview

Custom events let you track specific user interactions beyond pageviews. Track button clicks, form submissions, purchases, downloads, and any other actions.

## Basic Usage

Call `zta.track()` to send a custom event:

```javascript
zta.track('signup_click')
```

## Event with Properties

Add context with the second parameter:

```javascript
zta.track('purchase', {
  category: 'ecommerce',
  label: 'Premium Plan',
  value: 29
})
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `category` | string | Event grouping (e.g., 'ecommerce', 'engagement') |
| `label` | string | Descriptive label for the event |
| `value` | number | Numeric value (e.g., purchase amount) |

## Declarative Tracking (Recommended)

Use data attributes for cleaner HTML - no JavaScript required:

```html
<button data-zta-track="cta_click" data-zta-label="hero_signup">
  Get Started
</button>
```

### Available Attributes

| Attribute | Description |
|-----------|-------------|
| `data-zta-track` | Event name (required) |
| `data-zta-category` | Event category |
| `data-zta-label` | Event label |
| `data-zta-value` | Numeric value |

### Campaign Link Example

```html
<a href="/promo"
   data-zta-track="campaign_click"
   data-zta-category="campaign"
   data-zta-label="summer_sale_2025">
  Summer Sale - 20% Off
</a>
```

## JavaScript Tracking

For dynamic scenarios, use the JavaScript API:

### Button Click

```html
<button onclick="zta.track('cta_click', {label: 'hero_signup'})">
  Get Started
</button>
```

### Form Submission

```javascript
document.querySelector('form').addEventListener('submit', function() {
  zta.track('form_submit', {
    category: 'lead_gen',
    label: 'contact_form'
  })
})
```

### File Download

```html
<a href="/files/whitepaper.pdf"
   onclick="zta.track('download', {label: 'whitepaper.pdf'})">
  Download Whitepaper
</a>
```

### Purchase

```javascript
zta.track('purchase', {
  category: 'ecommerce',
  label: 'Pro Plan - Monthly',
  value: 29
})
```

### Scroll Depth

Tracked automatically! We capture 25%, 50%, 75%, and 100% scroll milestones.

### Outbound Links

```javascript
document.querySelectorAll('a[href^="http"]').forEach(link => {
  if (!link.href.includes(window.location.hostname)) {
    link.addEventListener('click', () => {
      zta.track('outbound_click', {
        label: link.href
      })
    })
  }
})
```

## Viewing Events

Custom events appear in your dashboard under the **Events** tab. You can:

- See event counts over time
- Filter by event name
- Break down by category and label
- Export event data via API

## Best Practices

1. **Use consistent naming** - Stick to `snake_case` for event names
2. **Be specific** - `signup_form_submit` is better than `click`
3. **Don't over-track** - Focus on meaningful business actions
4. **Use categories** - Group related events together
5. **Add values when relevant** - Numeric data enables better analysis
