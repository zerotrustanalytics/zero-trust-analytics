---
title: "Privacy Model"
description: "How Zero Trust Analytics protects visitor privacy"
weight: 20
priority: 0.7
---

## The Zero Trust Principle

Our name comes from the "Zero Trust" security model: **never trust, always verify, never store what you don't need**.

Applied to analytics, this means:
- We never trust that we need personal data (we don't)
- We verify that no PII leaks into our systems
- We store only anonymous, aggregated data

## How We Anonymize Visitors

### IP Address Handling

When a visitor loads your page, their IP address is processed like this:

```
1. IP arrives: 192.168.1.100
2. Combined with User Agent: 192.168.1.100 + Mozilla/5.0...
3. Combined with daily salt: 192.168.1.100 + Mozilla/5.0... + 2024-12-10-secret
4. SHA256 hashed: a1b2c3d4e5f6...
5. Original IP discarded immediately
```

**The raw IP address is NEVER stored.** It exists in memory for milliseconds, only long enough to generate the hash.

### Daily Salt Rotation

The salt used in the hash rotates every 24 hours. This means:

- A visitor today generates hash `abc123`
- The same visitor tomorrow generates hash `xyz789`
- We cannot link these hashes together
- Long-term tracking is mathematically impossible

### One-Way Hashing

SHA256 is a one-way cryptographic hash. Given the hash `a1b2c3d4e5f6...`, there's no way to reverse it back to the original IP address. Even if our database were breached, the data would be useless.

## No Cookies

We don't use cookies. At all. Not for tracking, not for sessions, not for anything.

**Why this matters:**
- No cookie consent banners needed
- No GDPR cookie compliance headaches
- No cross-session tracking

## No Fingerprinting

We don't use any fingerprinting techniques:
- No canvas fingerprinting
- No WebGL fingerprinting
- No font enumeration
- No audio fingerprinting
- No hardware detection

We only collect what's necessary for basic analytics.

## Geographic Data

We determine visitor location from Netlify's edge network, not from IP geolocation:

- Country (US, GB, DE, etc.)
- Region/State (California, Texas, etc.)

This is derived from the edge server that handled the request, not from the visitor's IP address.

## Data Minimization

We only collect what's needed for useful analytics:

| Collected | NOT Collected |
|-----------|---------------|
| Page URL | IP address |
| Referrer domain | Full referrer URL with query params |
| Device type | Device ID |
| Browser name | Browser fingerprint |
| Country/region | City or precise location |
| Session duration | Individual user journeys |

## Your Data, Your Control

- **Export anytime** - Download all your data as JSON or CSV
- **Delete anytime** - Request complete data deletion
- **No data selling** - We never sell or share your analytics data
- **No third parties** - Your data stays in our infrastructure

## Compliance by Design

Because we don't collect personal data, many compliance requirements don't apply:

- **GDPR**: No personal data = no GDPR data subject rights
- **CCPA**: No personal information = no CCPA obligations
- **HIPAA**: No PHI = no HIPAA business associate requirements

We're not compliant because we check boxes. We're compliant because we designed the system to never collect the data that regulations protect.
