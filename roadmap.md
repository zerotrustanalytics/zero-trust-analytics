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

## Phase 8: Deployment (TODO)

- [ ] Create GitHub repository
- [ ] Deploy to Netlify
- [ ] Set environment variables
- [ ] Configure Stripe webhook
- [ ] Test end-to-end flow

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

## Current Status: Ready for Deployment
