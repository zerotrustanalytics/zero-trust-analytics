# Zero Trust Analytics - Launch Playbook

## For Solo Devs with Day Jobs

This document outlines the systems and rules for managing ZTA profitably as a solo founder.

---

## 1. Efficiency Rules

### The Golden Rule
> **"If support exceeds 2 hours/month for any customer, pricing changes."**

This is non-negotiable. Your time is worth more than any single customer's subscription fee.

### Support Time Tracking

Every support interaction gets logged in the admin dashboard:
```
POST /api/admin/usage/support-log
{
  "userId": "user_xxx",
  "durationMinutes": 30,
  "category": "setup",
  "notes": "Helped configure Docker deployment"
}
```

Categories:
- `general` - General questions
- `bug` - Bug reports
- `setup` - Setup/configuration help
- `feature` - Feature requests
- `billing` - Billing questions

### Alert Threshold
The admin dashboard automatically flags customers who exceed 2 hours MTD (month-to-date).

### Actions When Threshold Hit
1. **First offense**: Polite email explaining support is limited, point to docs
2. **Second month**: Offer priority support add-on ($50/month) or suggest they might need Enterprise
3. **Third month**: Move to Enterprise pricing ($99+/month) or offboard

---

## 2. Pilot Customer Strategy

### Tagging Pilots

Every early adopter should be tagged as a pilot:
```
POST /api/admin/usage/tag
{
  "userId": "user_xxx",
  "isPilot": true,
  "customerType": "pilot",
  "notes": "Early adopter, testing Growth features, agreed to feedback calls"
}
```

### Pilot Types
- `pilot` - Early adopter, testing features
- `internal` - Your own test accounts
- `enterprise` - Enterprise customer
- `high_touch` - Requires more support (watch closely)

### What Pilots Get
- Access to beta features
- Direct Slack/email access to you
- Flexibility on pricing (temporarily)

### What You Get from Pilots
- Real usage data for pricing decisions
- Feedback on features
- Case studies and testimonials

### Pilot Rules
1. **Max 5-10 pilots at launch** - Don't overcommit
2. **Time-boxed** - Pilot status expires after 3 months
3. **Clear expectations** - Monthly check-in, feedback required
4. **Document everything** - Their usage patterns set your pricing

---

## 3. Usage Metrics for Pricing Leverage

### What to Track (Per Site)

| Metric | Why It Matters |
|--------|----------------|
| Pageviews/day | Core pricing metric |
| API reads/day | API abuse detection |
| API writes/day | Write-heavy customers cost more |
| Storage growth/week | Database cost predictor |
| Cache hit % | Infrastructure efficiency |

### Admin Dashboard Access
```
GET /api/admin/usage?days=30
Headers: { "X-Admin-Key": "your-admin-secret" }
```

### Key Reports
- `/api/admin/usage/sites` - Top sites by usage (find outliers)
- `/api/admin/usage/storage` - Storage growth (predict costs)
- `/api/admin/usage/cache` - Cache efficiency
- `/api/admin/usage/support` - High-support customers

### Pricing Leverage Conversations

When a customer is using significantly more than their tier:

> "I noticed your site has been generating 180k pageviews/month. That's amazing growth! Your current Growth plan includes 200k pageviews. You might want to consider upgrading to Business to ensure uninterrupted service and get additional features like..."

When a customer complains about pricing:

> "I hear you. Let me share some context: most Growth customers use under 50k pageviews/month. Your site is doing 180k - that's 3.6x the typical usage. The Business plan at $49/month works out to about $0.27 per 1000 pageviews, which is actually very competitive."

---

## 4. Pre-Launch Checklist

### Security
- [x] Stripe webhook signature verification enforced
- [ ] Rate limiting tested on all endpoints
- [ ] CORS properly configured
- [ ] API keys properly validated

### Infrastructure
- [ ] Turso database provisioned (production)
- [ ] Upstash Redis configured (caching)
- [ ] Netlify functions deployed
- [ ] CDN configured for static assets

### Billing
- [ ] Stripe products created
- [ ] Webhook endpoint configured in Stripe
- [ ] Test purchase flow works
- [ ] Upgrade/downgrade flows work

### Monitoring
- [x] Usage metrics schema deployed
- [x] Admin dashboard accessible
- [ ] Error tracking configured (Sentry/similar)
- [ ] Uptime monitoring configured

### Documentation
- [ ] API docs complete
- [ ] Self-hosting guide reviewed
- [ ] SDK integration examples ready
- [ ] FAQ populated

### Legal
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Cookie Policy (if applicable)
- [ ] GDPR compliance verified

---

## 5. Launch Day Protocol

### Morning of Launch
1. Double-check all env vars in production
2. Verify Stripe is in live mode
3. Test signup flow one more time
4. Test tracking script on a live site

### During Launch
1. Monitor error logs
2. Watch admin dashboard for signups
3. Respond to support quickly (first impression matters)
4. Tag early signups as pilots

### End of Day
1. Review usage metrics
2. Log any support time
3. Note any bugs or issues
4. Celebrate!

---

## 6. Post-Launch Rituals

### Daily (5 min)
- Glance at admin dashboard
- Check for support emails

### Weekly (30 min)
- Review usage growth
- Check cache hit rates
- Review support time by customer
- Update pilot notes

### Monthly (2 hours)
- Deep dive on metrics
- Identify pricing leverage opportunities
- Review support time totals
- Adjust pilot list
- Send investor/personal update

---

## Quick Reference

### Admin Dashboard
URL: `/dashboard/admin`
Auth: ADMIN_SECRET env var

### Key API Endpoints
```
GET  /api/admin/usage              - Full report
GET  /api/admin/usage/sites        - Top sites
GET  /api/admin/usage/storage      - Storage metrics
GET  /api/admin/usage/cache        - Cache metrics
POST /api/admin/usage/tag          - Tag customer
POST /api/admin/usage/support-log  - Log support time
```

### Environment Variables
```
ADMIN_SECRET=your-admin-key        # For admin dashboard access
NEXT_PUBLIC_ZTA_SITE_ID=site_xxx   # Dogfood your own product
```

---

## Remember

1. **Time is money** - Track support time religiously
2. **Data is leverage** - Know your customers' usage better than they do
3. **Pilots are partners** - Treat them well, but don't overcommit
4. **Simple rules scale** - 2 hours/month is clear and enforceable

Good luck with the launch!
