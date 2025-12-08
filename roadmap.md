# Zero Trust Analytics - Project Roadmap

Privacy-focused, anonymous analytics SaaS with Stripe billing.

---

## Phase 1: Foundation
- [x] Copy Hugo template
- [x] Create roadmap.md
- [ ] Update hugo.toml for project
- [ ] Add package.json for Netlify functions
- [ ] Update netlify.toml for functions + Hugo

---

## Phase 2: Tracking Engine

### 2.1 Client Script (`analytics.js`)
- [ ] Lightweight embeddable script (<3KB)
- [ ] Capture page URL, referrer, timestamp
- [ ] Send data to tracking endpoint

### 2.2 Server-Side Processing
- [ ] `/api/track` - Receive pageview events
- [ ] Hash IP + User-Agent + daily salt
- [ ] Store hashed visitor ID (never raw IP)

### 2.3 Storage Layer
- [ ] Use Netlify Blobs for persistence
- [ ] Daily/weekly/monthly aggregation

---

## Phase 3: Dashboard & Stats API

- [ ] `/api/stats` - Return analytics data
- [ ] Dashboard page (unique visitors, page views)
- [ ] Embed code generator

---

## Phase 4: Authentication

- [ ] `/api/auth/register` - Create account
- [ ] `/api/auth/login` - Authenticate
- [ ] JWT session management

---

## Phase 5: Multi-Site Support

- [ ] Generate unique site IDs
- [ ] Isolate data per site

---

## Phase 6: Stripe Integration ($10/month)

- [ ] `/api/stripe/checkout` - Create checkout
- [ ] `/api/stripe/webhook` - Handle events
- [ ] `/api/stripe/portal` - Billing portal
- [ ] Gate dashboard to paid users

---

## Phase 7: Landing Page

- [ ] Hero section
- [ ] Features & pricing
- [ ] Sign up CTA

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Hugo + Bootstrap |
| Backend | Netlify Functions |
| Storage | Netlify Blobs |
| Auth | JWT + bcrypt |
| Payments | Stripe |

---

## Current Status: Phase 1
