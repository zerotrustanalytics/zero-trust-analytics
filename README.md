# Zero Trust Analytics

Privacy-focused, anonymous website analytics SaaS built with Hugo + Netlify Functions.

## Features

- **Privacy First**: No cookies, no fingerprinting, no personal data stored
- **Anonymous Tracking**: Visitors identified by daily-rotating hashed IDs
- **Lightweight Script**: Under 3KB, uses `sendBeacon` for reliable tracking
- **Real-time Dashboard**: View unique visitors, page views, top pages & referrers
- **Multi-site Support**: Track unlimited websites from one account
- **Stripe Billing**: $10/month subscription with customer portal

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Hugo + Bootstrap 5 |
| Backend | Netlify Functions (Node.js) |
| Storage | Netlify Blobs |
| Auth | JWT + bcrypt |
| Payments | Stripe |

## Deployment

### 1. Create Netlify Site

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Create new site
netlify init
```

### 2. Set Environment Variables

In Netlify Dashboard > Site Settings > Environment Variables, add:

| Variable | Description |
|----------|-------------|
| `HASH_SECRET` | Random string for visitor ID hashing |
| `JWT_SECRET` | Random string for JWT tokens |
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_...) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret (whsec_...) |
| `STRIPE_PRICE_ID` | Stripe price ID for $10/month subscription |

### 3. Set Up Stripe

1. Create a product in [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Add a $10/month recurring price
3. Copy the Price ID to `STRIPE_PRICE_ID`
4. Create a webhook endpoint pointing to `/api/stripe/webhook`
5. Subscribe to events: `checkout.session.completed`, `customer.subscription.*`
6. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### 4. Deploy

```bash
# Deploy to Netlify
netlify deploy --prod
```

## Local Development

```bash
# Install dependencies
cd netlify/functions && npm install && cd ../..

# Run Hugo dev server with Netlify functions
netlify dev
```

## Usage

### Embed the tracking script

Add this to your website's `<head>`:

```html
<script src="https://YOUR-SITE.netlify.app/js/analytics.js" data-site-id="YOUR_SITE_ID"></script>
```

### Options

```html
<!-- Enable SPA tracking -->
<script src="..." data-site-id="..." data-spa="true"></script>

<!-- Disable auto-tracking (manual control) -->
<script src="..." data-site-id="..." data-auto-track="false"></script>

<!-- Enable debug logging -->
<script src="..." data-site-id="..." data-debug="true"></script>
```

### Manual tracking

```javascript
// Track page view
ZTA.trackPageView();

// Track custom event
ZTA.trackEvent('button_click', { button: 'signup' });
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/track` | POST | Record pageview |
| `/api/stats` | GET | Get analytics data |
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login |
| `/api/sites/create` | POST | Register new site |
| `/api/sites/list` | GET | List user's sites |
| `/api/stripe/checkout` | POST | Create checkout session |
| `/api/stripe/webhook` | POST | Stripe webhook handler |
| `/api/stripe/portal` | POST | Customer billing portal |

## License

MIT
