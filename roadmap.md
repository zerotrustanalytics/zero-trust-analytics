# Zero Trust Analytics - Project Roadmap

Privacy-focused, anonymous analytics SaaS with Stripe billing.

---

## Phase 1: Foundation
- [x] Copy Hugo template
- [x] Create roadmap.md
- [x] Update hugo.toml for project
- [x] Add package.json for Netlify functions
- [x] Update netlify.toml for functions + Hugo

---

## Phase 2: Tracking Engine

### 2.1 Client Script (`analytics.js`)
- [x] Lightweight embeddable script (<3KB)
- [x] Capture page URL, referrer, timestamp
- [x] Send data to tracking endpoint
- [x] SPA support with history API tracking

### 2.2 Server-Side Processing
- [x] `/api/track` - Receive pageview events
- [x] Hash IP + User-Agent + daily salt
- [x] Store hashed visitor ID (never raw IP)

### 2.3 Storage Layer
- [x] Use Netlify Blobs for persistence
- [x] Daily aggregation with unique visitor counting

---

## Phase 3: Dashboard & Stats API

- [x] `/api/stats` - Return analytics data
- [x] Dashboard page (unique visitors, page views)
- [x] Top pages & referrers tables
- [x] Embed code generator

---

## Phase 4: Authentication

- [x] `/api/auth/register` - Create account
- [x] `/api/auth/login` - Authenticate
- [x] JWT session management
- [x] Password hashing with bcrypt

---

## Phase 5: Multi-Site Support

- [x] Generate unique site IDs
- [x] `/api/sites/create` - Register new site
- [x] `/api/sites/list` - List user's sites
- [x] Isolate data per site

---

## Phase 6: Stripe Integration ($10/month)

- [x] `/api/stripe/checkout` - Create checkout session
- [x] `/api/stripe/webhook` - Handle Stripe events
- [x] `/api/stripe/portal` - Customer billing portal
- [x] Dashboard billing button

---

## Phase 7: Landing Page

- [x] Hero section with value proposition
- [x] Features section (privacy, lightweight, insights)
- [x] How it works section
- [x] Pricing section ($10/month)
- [x] Sign up CTA

---

## Phase 8: Deployment

- [x] Create GitHub repository
- [x] Deploy to Netlify
- [x] Set environment variables
- [x] Configure Stripe webhook
- [x] Test end-to-end flow
- [x] Purchase domain (zerotrustanalytics.com)
- [x] Configure Netlify DNS
- [x] Launch on custom domain

---

## Phase 9: Enhanced Tracking (Google Analytics Parity)

### 9.1 Session & Engagement Metrics
- [x] Time on page (duration per page)
- [x] Session duration (total time across pages)
- [x] Landing pages (entry pages)
- [x] Exit pages (last page before leaving)
- [x] Bounce rate (single-page sessions)
- [x] Pages per session
- [x] New vs returning visitors

### 9.2 Device & Browser Analytics
- [x] Device type (mobile/desktop/tablet)
- [x] Browser type & version
- [x] Operating system
- [x] Screen resolution
- [x] Viewport size
- [x] Browser language

### 9.3 Traffic Sources & Campaigns
- [x] Traffic source categorization (direct/organic/referral/social)
- [x] UTM parameter tracking (source, medium, campaign, term, content)
- [x] Search engine detection
- [x] Social network detection

### 9.4 Geographic Data
- [x] Country detection (from Netlify geolocation)
- [x] Region/state detection
- [x] City detection (approximate)

### 9.5 User Behavior Tracking
- [x] Scroll depth tracking (25%, 50%, 75%, 100%)
- [x] Outbound link clicks
- [x] File download tracking
- [x] Custom event tracking
- [ ] Form submission tracking

### 9.6 Real-Time Analytics
- [x] Current active visitors
- [x] Real-time page views
- [ ] Real-time traffic sources

### 9.7 Dashboard Enhancements
- [x] Date range picker
- [x] Data export (CSV/JSON)
- [ ] Comparison periods (vs previous period)
- [ ] Chart visualizations (line, bar, pie)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Hugo + Bootstrap 5 |
| Backend | Netlify Functions (Node.js) |
| Storage | Netlify Blobs |
| Auth | JWT + bcrypt |
| Payments | Stripe |

---

## Phase 10: Security & UX Hardening

### 10.1 Security
- [x] CORS origin validation (only allow requests from registered domains)
- [x] IP hashing with daily rotating salt (never stored raw)
- [x] Improved error handling with fallback messages

### 10.2 Mobile & UX
- [x] Responsive dashboard CSS for mobile devices
- [x] Table overflow handling with text truncation
- [x] Toast notification improvements

---

## Phase 11: Testing & Enhanced Dashboard

### 11.1 Test Suite
- [x] Jest test framework with ESM support
- [x] Unit tests for hash module (15 tests)
- [x] Unit tests for storage module (20 tests)
- [x] Integration test structure for API endpoints

### 11.2 Chart Visualizations
- [x] Chart.js integration
- [x] Visitors & Pageviews line chart (daily trends)
- [x] Traffic Sources doughnut chart

### 11.3 Enhanced Events UI
- [x] Event categories with badges
- [x] Event labels/details column
- [x] Event value tracking with totals
- [x] Revenue display for purchase events

### 11.4 Site Management
- [x] Site settings modal
- [x] Edit site domain
- [x] Add site nickname
- [x] Delete site with confirmation
- [x] `/api/sites/update` endpoint
- [x] `/api/sites/delete` endpoint

---

## Current Status: LAUNCHED on zerotrustanalytics.com

**Launch Date:** December 8, 2025

**Live URLs:**
- Production: https://zerotrustanalytics.com
- Netlify: https://zerotrustanalytics.netlify.app



2. Add a “What we DON’T collect” section

This instantly boosts trust.

3. Add a screenshot of your dashboard

Only takes 2 minutes.

4. Add /api/health endpoint

Monitors + uptime.

5. Add page load time collection (no user fingerprinting needed)

Just performance.now() — anonymized.

6. Add “bot filtering lite”

Basic: ignore user-agents containing “bot”, “crawl”, “spider”.

7. Add script defer snippet example

More dev friendliness.
