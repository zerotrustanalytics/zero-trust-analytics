# Zero Trust Analytics - Product Documentation

## Architecture Flow Chart

```
                                    ZERO TRUST ANALYTICS
                                    ====================

    YOUR WEBSITE                         ZERO TRUST ANALYTICS                    YOUR DASHBOARD
    ============                         ====================                    ==============

    +------------------+
    |   User Visits    |
    |   Your Site      |
    +--------+---------+
             |
             v
    +------------------+        +------------------------+
    |  analytics.js    |        |                        |
    |  (3KB script)    +------->|   /api/track           |
    |                  |  POST  |   (Netlify Function)   |
    |  Collects:       |        |                        |
    |  - Page path     |        |  Processing:           |
    |  - Referrer      |        |  - Validate site ID    |
    |  - Device info   |        |  - Hash IP + UA        |
    |  - Session ID    |        |  - Extract geo data    |
    |  - Scroll depth  |        |  - Categorize traffic  |
    |  - UTM params    |        |                        |
    +------------------+        +----------+-------------+
                                           |
                                           v
                                +------------------------+
                                |   Netlify Blobs        |
                                |   (Storage Layer)      |
                                |                        |
                                |  Stores:               |
                                |  - Daily pageviews     |
                                |  - Hashed visitor IDs  |
                                |  - Session data        |
                                |  - Event data          |
                                |  - Site configs        |
                                |  - User accounts       |
                                +----------+-------------+
                                           |
                                           v
    +------------------+        +------------------------+        +------------------+
    |   Dashboard      |<-------+   /api/stats           |        |   You Login      |
    |   (Hugo + JS)    |  JSON  |   (Netlify Function)   |<-------+   with JWT       |
    |                  |        |                        |        +------------------+
    |  Displays:       |        |  - Aggregates data     |
    |  - Visitors      |        |  - Calculates metrics  |
    |  - Page views    |        |  - Filters by date     |
    |  - Top pages     |        |  - Returns JSON        |
    |  - Referrers     |        |                        |
    |  - Devices       |        +------------------------+
    |  - Countries     |
    |  - Charts        |        +------------------------+
    |  - Real-time     |<-------+   /api/realtime        |
    +------------------+        |   (Active visitors)    |
                                +------------------------+


                            PRIVACY-FIRST DATA FLOW
                            =======================

    +-------------------+     +-------------------+     +-------------------+
    |   RAW DATA        |     |   PROCESSING      |     |   STORED DATA     |
    |   (Never Stored)  | --> |   (On-the-fly)    | --> |   (Anonymous)     |
    +-------------------+     +-------------------+     +-------------------+
    |                   |     |                   |     |                   |
    | IP: 192.168.1.1   |     | Hash(IP + UA +    |     | Visitor:          |
    | UA: Chrome/Win    | --> | Daily Salt)       | --> | a3f8b2c1d4e5...   |
    |                   |     |                   |     |                   |
    | No cookies        |     | No fingerprinting |     | No PII stored     |
    | No tracking IDs   |     | No cross-site     |     | No IP addresses   |
    |                   |     |                   |     |                   |
    +-------------------+     +-------------------+     +-------------------+


                            AUTHENTICATION FLOW
                            ===================

    +------------+     +----------------+     +------------+     +------------+
    |  Register  | --> |  Hash Password | --> | Store User | --> | Return JWT |
    +------------+     |  (bcrypt)      |     | (Blobs)    |     +------------+
                       +----------------+     +------------+           |
                                                                       v
    +------------+     +----------------+     +------------+     +------------+
    |   Login    | --> | Verify Password| --> | Valid?     | --> | Return JWT |
    +------------+     +----------------+     +------------+     +------------+
                                                                       |
                                                                       v
    +------------+     +----------------+     +------------+     +------------+
    | API Request| --> | Verify JWT     | --> | Valid?     | --> | Process    |
    | + JWT      |     +----------------+     +------------+     | Request    |
    +------------+                                               +------------+


                            BILLING FLOW (Stripe)
                            =====================

    +------------+     +----------------+     +----------------+     +------------+
    |  User      | --> | Stripe         | --> | Payment        | --> | Webhook    |
    |  Clicks    |     | Checkout       |     | Processed      |     | Received   |
    |  Subscribe |     +----------------+     +----------------+     +------------+
    +------------+                                                         |
                                                                           v
                                                              +------------+
                                                              | Update     |
                                                              | User Sub   |
                                                              | Status     |
                                                              +------------+
```

---

## The Short Pitch (30 seconds)

**Zero Trust Analytics is Google Analytics without the surveillance.**

We give you everything you need to understand your website traffic - visitors, pageviews, top pages, referrers, devices, countries, real-time stats - without collecting a single piece of personal data.

No cookies. No IP logging. No fingerprinting. No consent banners needed.

GDPR compliant by design. Plans from $5/month. 3KB script. 5-minute setup.

---

## The Full Pitch (3 minutes)

### The Problem

The internet has a privacy problem. Google Analytics tracks 85% of the web, building detailed profiles of every user across millions of sites. Users are tracked, fingerprinted, and their data is sold to advertisers.

Website owners are stuck in a catch-22:
- **Use Google Analytics** = Compromise your visitors' privacy, deal with GDPR consent banners, and hand data to the world's largest ad company
- **Go without analytics** = Fly blind with no insight into your traffic

Privacy-conscious website owners have been forced to choose between ethics and data.

### The Solution

**Zero Trust Analytics** applies the "zero trust" security principle to web analytics: **never trust, always verify, never store personal data.**

We built an analytics platform from the ground up with one rule: **if we don't need personal data to give you insights, we don't collect it.**

Here's what makes us different:

| Traditional Analytics | Zero Trust Analytics |
|-----------------------|----------------------|
| Stores IP addresses | Hashes IPs with daily rotating salt - never stored |
| Uses cookies | No cookies at all |
| Fingerprints browsers | No fingerprinting |
| Tracks across sites | Each site is isolated |
| Requires consent banners | No consent needed - we don't collect PII |
| 45KB+ scripts | 3KB lightweight script |
| Complex setup | One script tag, done |

### What You Get

Everything you actually need from analytics:

- **Visitors & Pageviews** - Unique visitors, total pageviews, trends over time
- **Top Pages** - Which content performs best
- **Referrers** - Where your traffic comes from
- **Traffic Sources** - Direct, organic, social, referral breakdown
- **Device Analytics** - Mobile vs desktop, browsers, operating systems
- **Geographic Data** - Country, region, city (from Netlify edge, not IP lookup)
- **Real-Time Stats** - Active visitors right now
- **Session Metrics** - Bounce rate, time on page, pages per session
- **Custom Events** - Track button clicks, form submissions, purchases
- **UTM Campaigns** - Full campaign tracking support
- **Data Export** - CSV and JSON exports of your data

### What You Don't Get (And Why That's Good)

- No individual user profiles
- No cross-site tracking
- No data sold to third parties
- No "audience segments" for advertisers
- No privacy policy headaches

### The Tech

- **Frontend**: Hugo static site + Bootstrap 5
- **Backend**: Netlify Functions (serverless Node.js)
- **Storage**: Netlify Blobs (no external database)
- **Auth**: JWT + bcrypt password hashing
- **Payments**: Stripe (tiered pricing from $5/month)
- **Hosting**: Netlify Edge (global CDN)

The entire stack is serverless, scalable, and runs on Netlify's infrastructure.

### The Market Gap We Fill

1. **Google Analytics** - Free but privacy-invasive, complex, overkill for most sites
2. **Plausible/Fathom** - Privacy-focused but $9-19/month for limited pageviews
3. **Matomo** - Self-hosted complexity, still collects IPs by default
4. **Simple Analytics** - Good but starts at $19/month

**Zero Trust Analytics** offers:
- True zero-knowledge privacy (not just "privacy-friendly")
- Tiered pricing from $5/month (unlimited sites on all plans)
- Plans scaled by pageviews (10k to 10M+)
- 3KB script (fastest in class)
- Full GA feature parity for what 90% of sites actually need

### Who It's For

- **Privacy-conscious developers** who don't want to compromise their users
- **GDPR-compliant businesses** tired of consent banner complexity
- **Small to medium websites** who need insights without enterprise complexity
- **Ethical companies** who want to walk the talk on privacy

---

## Technical Specifications

### Analytics Script (`analytics.js`)

| Metric | Value |
|--------|-------|
| Size | ~3KB minified |
| Dependencies | None |
| Cookies | None |
| Local Storage | Session ID only (anonymous) |
| Load Impact | <10ms |

### Data Collected

| Data Point | How It's Handled |
|------------|------------------|
| IP Address | Hashed with daily salt, never stored raw |
| User Agent | Used for device detection, never stored raw |
| Page URL | Stored (path only, not query params with PII) |
| Referrer | Stored (domain only) |
| Timestamp | Stored |
| Screen Size | Stored |
| Language | Stored |
| Country/Region | Derived from Netlify edge, not IP lookup |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/track` | POST | Receive pageview/event data |
| `/api/stats` | GET | Return aggregated statistics |
| `/api/realtime` | GET | Return active visitor count |
| `/api/auth/register` | POST | Create new account |
| `/api/auth/login` | POST | Authenticate user |
| `/api/sites/create` | POST | Register new site |
| `/api/sites/list` | GET | List user's sites |
| `/api/sites/update` | POST | Update site settings |
| `/api/sites/delete` | POST | Delete a site |
| `/api/stripe/checkout` | POST | Create Stripe checkout |
| `/api/stripe/webhook` | POST | Handle Stripe events |
| `/api/stripe/portal` | POST | Open billing portal |

---

## Competitive Positioning

```
                    PRIVACY
                       ^
                       |
         Zero Trust    |    Plausible
         Analytics  *  |  *  Fathom
                       |
    ---------------+---|---+---------------> SIMPLICITY
                       |
             Matomo *  |  * Simple Analytics
                       |
        Google      *  |
        Analytics      |
                       |
```

**Zero Trust Analytics** = Maximum privacy + Maximum simplicity + Fair pricing

---

## Live URLs

- **Production**: https://zerotrustanalytics.com
- **Netlify**: https://zerotrustanalytics.netlify.app
- **Dashboard**: https://zerotrustanalytics.com/dashboard/
- **About**: https://zerotrustanalytics.com/about/

---

*Built with privacy in mind. No compromises.*
