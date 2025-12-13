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
- [x] `/api/auth/forgot` - Forgot password (sends reset email)
- [x] `/api/auth/reset` - Reset password with token
- [x] Dual email provider support (Resend + SendGrid fallback)

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
- [x] Form submission tracking

### 9.6 Real-Time Analytics
- [x] Current active visitors
- [x] Real-time page views
- [x] Real-time traffic sources

### 9.7 Dashboard Enhancements
- [x] Date range picker
- [x] Data export (CSV/JSON)
- [x] Comparison periods (vs previous period)
- [x] Chart visualizations (line, bar, pie, doughnut)

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

---

# Q1 2026 ROADMAP (January - March)

*Updated: December 11, 2025 - Post-launch planning session*

**Goal:** 100 paying customers, $1,000 MRR by end of Q1

---

## Phase 12: Stabilize & Relaunch (January 2026)

**Target: 10 paying customers, $100 MRR**

### 12.1 Critical Fixes (Week 1-2)
- [ ] Delete Tinybird code completely (lib/tinybird.js, /tinybird/ directory)
- [ ] Fix JWT expiration check (tokens currently never expire)
- [ ] Add rate limiting to /api/track and /api/auth/* endpoints
- [ ] Remove debug colors from _header.scss (red/green/blue backgrounds)
- [ ] Fix pricing mismatch (register page vs homepage)
- [ ] Standardize error responses across all API endpoints

### 12.2 Dashboard Charts (Week 1-2)
- [ ] Verify Chart.js is working in production
- [ ] Add visitors/pageviews line chart (daily trends)
- [ ] Add traffic sources doughnut chart
- [ ] Add device breakdown bar chart
- [ ] Ensure chart accessibility (alt text, data tables)

### 12.3 Growth Foundation (Week 2-3)
- [ ] Add 14-day free trial (no credit card required)
- [ ] Create demo account with sample data (public dashboard)
- [ ] Add annual billing option ($100/year - save $20)
- [ ] Build basic email onboarding sequence (Day 0, 3, 7, 14)

### 12.4 Launch Campaign (Week 3-4)
- [ ] Product Hunt launch (aim for Top 5 Product of Day)
- [ ] Hacker News Show HN post
- [ ] Reddit posts (r/privacy, r/webdev, r/SideProject)
- [ ] Submit to 20 directories (AlternativeTo, G2, SaaSHub, Capterra)

### 12.5 Content & SEO (Week 1-4)
- [ ] Add JSON-LD structured data (Organization, SoftwareApplication, FAQ)
- [ ] Create /vs/google-analytics/ comparison page
- [ ] Create /vs/plausible/ comparison page
- [ ] Create /vs/fathom/ comparison page
- [ ] Blog: "Zero Trust Analytics vs Google Analytics: Complete Comparison 2026"
- [ ] Blog: "How to Migrate from Google Analytics in 10 Minutes"
- [ ] Blog: "The Best Google Analytics Alternatives for Privacy in 2026"
- [ ] Blog: "Why Real Estate Agents Need GDPR-Compliant Analytics"

### 12.6 Observability (Week 2)
- [ ] Set up Sentry for error tracking
- [ ] Set up BetterUptime for uptime monitoring
- [ ] Install ZTA analytics on zerotrustanalytics.com (eat your own dogfood!)

---

## Phase 13: Growth Engine (February 2026)

**Target: 50 paying customers, $500 MRR**

### 13.1 Performance & Caching (Week 1-2)
- [ ] Add Redis/Upstash caching layer ($10/month)
- [ ] Cache dashboard stats for 5 minutes
- [ ] Cache site configs
- [ ] Add missing Turso indexes
- [ ] Optimize hot query paths
- [ ] Implement pre-aggregation for dashboard stats

### 13.2 Integrations (Week 2-3)
- [ ] Build WordPress plugin (critical - 43% of web)
- [ ] Create Zapier integration
- [ ] Write Next.js integration guide
- [ ] Write React SPA setup guide
- [ ] Write Shopify integration guide

### 13.3 Onboarding & UX (Week 3-4)
- [ ] Build onboarding wizard (add site → install script → verify → celebrate)
- [ ] Add contextual tooltips for first-time users
- [ ] Redesign dashboard information hierarchy (tabs: Overview | Pages | Sources | Tech | Geo)
- [ ] Fix mobile dashboard (increase fonts, card-based tables)
- [ ] Add loading skeleton screens

### 13.4 Content (Week 1-4)
- [ ] Blog: "Plausible vs Zero Trust Analytics: Which is Right for You?"
- [ ] Blog: "Fathom vs Zero Trust Analytics: Pricing & Features Compared"
- [ ] Blog: "The Complete Guide to HIPAA-Compliant Website Analytics"
- [ ] Blog: "Legal Website Analytics: Bar Association Rules on Client Data"
- [ ] Blog: "How We Built Analytics That Literally Can't Track Users"
- [ ] Blog: "Daily Salt Rotation: Why Most Privacy Analytics Still Track You"
- [ ] Blog: "Analytics for SaaS: Track Signups Without Compromising Privacy"
- [ ] Blog: "Benchmarking Analytics Scripts: Why 3KB Matters for Core Web Vitals"
- [ ] Record 5-minute setup video walkthrough
- [ ] Create WordPress plugin documentation

### 13.5 Testing (Week 4)
- [ ] Add integration tests for critical flows (signup → create site → track → view)
- [ ] Set up automated testing in CI/CD
- [ ] Add test coverage reporting (target: 80%)

---

## Phase 14: Scale & Monetize (March 2026)

**Target: 100 paying customers, $1,000 MRR**

### 14.1 Revenue Features
- [ ] Add team collaboration (invite users to account)
- [ ] Add custom email alerts (traffic spikes, zero data)
- [ ] Add public dashboards (share stats publicly - viral loop)
- [ ] Create API access tier
- [ ] Launch $20/month HIPAA tier with BAA signing

### 14.2 Pricing Tiers
- [ ] Free tier: 10k pageviews/month, 1 site, 90-day retention
- [ ] Pro ($10/month): 100k pageviews, 10 sites, unlimited retention
- [ ] HIPAA ($20/month): 200k pageviews, 25 sites, BAA included
- [ ] Agency ($50/month): 1M pageviews, unlimited sites, white-label, API

### 14.3 Growth Programs
- [ ] Launch referral program (give $10, get $10)
- [ ] Outreach to 20 web agencies (reseller program)
- [ ] Partner with 3 privacy-focused newsletters
- [ ] First paid ads test ($500 budget - Google/Reddit/LinkedIn)

### 14.4 Content & Authority
- [ ] Blog: "E-commerce Analytics Without Tracking: Track Sales, Not People"
- [ ] Blog: "Why Cookie Banners Will Be Illegal by 2026"
- [ ] Blog: "The $2.5M GDPR Fine That Changed Website Analytics"
- [ ] Create 3 customer case studies
- [ ] Launch public changelog
- [ ] Launch email newsletter

### 14.5 Advanced Features
- [ ] Real-time dashboard updates (WebSocket or SSE)
- [ ] Slack integration for alerts
- [ ] Comparison mode improvements (visual bars/charts)
- [ ] Keyboard shortcuts (?, Cmd+K)

### 14.6 Design Polish
- [ ] New color palette (unique brand identity, not Bootstrap blue)
- [ ] Custom logo design
- [ ] Dark mode option
- [ ] Custom illustrations for empty states
- [ ] Micro-interactions and animations

---

## Success Metrics

### Month 1 (January)
- [ ] 10 paying customers ($100 MRR)
- [ ] 500 trial signups
- [ ] 5,000 website visitors
- [ ] Product Hunt Top 10 finish
- [ ] 4 blog posts published

### Month 2 (February)
- [ ] 50 paying customers ($500 MRR)
- [ ] 2,000 trial signups
- [ ] 20,000 website visitors
- [ ] WordPress plugin launched
- [ ] 8 blog posts total (12 cumulative)

### Month 3 (March)
- [ ] 100 paying customers ($1,000 MRR)
- [ ] 5,000 trial signups
- [ ] 50,000 website visitors
- [ ] 10% trial-to-paid conversion rate
- [ ] 25 blog posts total
- [ ] 100+ referring domains

---

## Target Customer Segments (Prioritized)

1. **Privacy-Conscious Developers** - High intent, quick conversion
2. **HIPAA-Regulated Healthcare** - Dental, therapy, medical practices
3. **GDPR-Compliant EU Businesses** - Large market, compliance pain
4. **Web Agencies** - High LTV, unlimited sites value prop
5. **Ethical Brands/B-Corps** - Brand alignment

---

## Tech Stack Update

| Component | Technology |
|-----------|------------|
| Frontend | Hugo + Bootstrap 5 |
| Backend | Netlify Functions (Node.js) |
| Storage | Netlify Blobs (users, sites) + Turso (analytics) |
| Auth | JWT + bcrypt |
| Payments | Stripe |
| Email | Resend + SendGrid (fallback) |
| Caching | Upstash Redis (planned) |
| Monitoring | Sentry + BetterUptime (planned) |

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Free tier cannibalizes paid | High | Set at 10k pageviews (personal blogs only) |
| High-volume abuse | Medium | Add usage-based overage ($1 per 10k extra) |
| HIPAA claims without legal review | Low | Add disclaimer, get BAA reviewed by lawyer |
| Can't compete with free (GA) | Medium | Target customers already decided "no Google" |
| Competitors copy approach | High | Build community moat, first-mover advantage |

---

# Dashboard Power Features Roadmap

*Added: December 12, 2025*

Backend functions and frontend modals already exist for all features. Work is primarily enabling, testing, and polishing.

---

## Phase A: Quick Wins (Week 1) - CURRENT

**Status: IN PROGRESS**

### A.1 Sessions Management
- [x] Backend: `/api/user/sessions` endpoint (GET, DELETE)
- [x] Frontend: `openSessionsModal()` with device list
- [x] Enable feature (remove d-none)
- [ ] Test session tracking on login
- [ ] Test session revocation

### A.2 API Keys
- [x] Backend: `/api/keys` endpoint (CRUD)
- [x] Frontend: `openApiKeysModal()` with permissions
- [x] Enable feature (remove d-none)
- [ ] Add API key authentication middleware
- [ ] Test key generation and revocation
- [ ] Document API key usage

### A.3 Goals/Conversions
- [x] Backend: `/api/goals` endpoint (CRUD + progress calc)
- [x] Frontend: `openGoalsModal()` with progress bars
- [x] Enable feature (remove d-none)
- [ ] Test goal calculations (daily, weekly, monthly)
- [ ] Add goal completion notifications

---

## Phase B: Collaboration & Security (Week 2-3)

### B.1 Activity Log
- [x] Backend: `/api/activity` endpoint
- [x] Frontend: `openActivityModal()` with pagination
- [ ] Enable feature (remove d-none)
- [ ] Add `logActivity()` calls to all user actions
- [ ] Add filtering by action type
- [ ] Add export activity log

### B.2 Team Management
- [x] Backend: `/api/teams` endpoint (CRUD, invites, roles)
- [x] Frontend: `openTeamsModal()` with member management
- [ ] Enable feature (remove d-none)
- [ ] Implement invite acceptance flow
- [ ] Add team-based site filtering
- [ ] Test multi-user permissions

---

## Phase C: Automation & Monitoring (Week 4-5)

### C.1 Webhooks
- [x] Backend: `/api/webhooks` endpoint (CRUD, test, HMAC)
- [x] Frontend: `openWebhooksModal()` with delivery stats
- [ ] Enable feature (remove d-none)
- [ ] Fire webhooks from track/stats endpoints
- [ ] Add retry logic for failed deliveries
- [ ] Add webhook delivery history

### C.2 Alerts
- [x] Backend: `/api/alerts` endpoint (CRUD, thresholds)
- [x] Frontend: `openAlertsModal()` with baseline display
- [ ] Enable feature (remove d-none)
- [ ] Build scheduled function for alert evaluation
- [ ] Implement notification delivery (email + webhook)
- [ ] Add alert trigger history

---

## Phase D: Advanced Analytics (Week 6+)

### D.1 Funnels
- [x] Backend: `/api/funnels` endpoint (CRUD, steps)
- [x] Frontend: `openFunnelsModal()` with visualization
- [ ] Enable feature (remove d-none)
- [ ] Implement `calculateFunnelData` algorithm
- [ ] Add date range filtering
- [ ] Optimize queries for performance

### D.2 Heatmaps
- [x] Backend: `/api/heatmaps` endpoint (record, retrieve)
- [x] Frontend: `openHeatmapsModal()` with page selector
- [ ] Enable feature (remove d-none)
- [ ] Add click/scroll tracking to analytics.js
- [ ] Implement storage layer functions
- [ ] Integrate heatmap visualization library
- [ ] Build page layout capture system

---

## Feature Effort Summary

| Feature | Backend | Frontend | Effort | Priority |
|---------|---------|----------|--------|----------|
| Sessions | Done | Done | 2-4 hrs | Phase A |
| API Keys | Done | Done | 3-6 hrs | Phase A |
| Goals | Done | Done | 4-6 hrs | Phase A |
| Activity Log | Done | Done | 6-10 hrs | Phase B |
| Teams | Done | Done | 10-14 hrs | Phase B |
| Webhooks | Done | Done | 8-12 hrs | Phase C |
| Alerts | Partial | Done | 12-16 hrs | Phase C |
| Funnels | Partial | Done | 12-18 hrs | Phase D |
| Heatmaps | Partial | Partial | 16-24 hrs | Phase D |

**Total: 73-110 hours**

