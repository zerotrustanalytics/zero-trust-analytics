# Zero Trust Analytics - Go Live Checklist

Target: ~15 days (when Netlify resets)

## Pre-Launch Testing

### Team Features
- [ ] Send team invite email
- [ ] Accept invite flow
- [ ] Team member permissions working
- [ ] Team member can view dashboard
- [ ] Team owner can remove members

### Plan Limits
- [ ] Free tier: 5,000 pageviews/mo cap works
- [ ] Starter tier: 50,000 cap works
- [ ] Growth tier: 200,000 cap works
- [ ] Usage meter displays correctly
- [ ] Overage handling (graceful cutoff)

### SDK / Tracker
- [ ] analytics.js loads correctly
- [ ] Pageviews tracked
- [ ] Custom events tracked
- [ ] Session handling works
- [ ] Batch sending works
- [ ] Bot filtering works

### API Routes
- [ ] /api/track (now on DO)
- [ ] /api/stats
- [ ] /api/sites-create
- [ ] /api/sites-update
- [ ] /api/sites-delete
- [ ] /api/sites-list
- [ ] /api/tracker-config
- [ ] Auth middleware working

### Add-ons
- [ ] Real-time add-on
- [ ] Heartbeat tracking (for paid real-time users only)

### Dashboard
- [ ] Login/logout flow
- [ ] Site creation
- [ ] Site settings
- [ ] Analytics display
- [ ] Date range picker
- [ ] Export functionality

## Pre-Launch Prep

### Database
- [ ] Wipe Turso DB (clean slate)
- [ ] Run migrations fresh
- [ ] Verify schema correct
- [ ] Create test site for smoke test

### Hugo Marketing Site
- [ ] Update pricing numbers
- [ ] Update feature list
- [ ] Verify tracker embed code shown correctly
- [ ] Test contact/signup forms

### Business Math
- [ ] Recalculate with DO costs ($0 for tracking)
- [ ] Update margin calculations
- [ ] Verify tier pricing still makes sense

### Credentials
- [ ] Rotate Turso auth token
- [ ] Rotate HASH_SECRET
- [ ] Rotate Resend API key
- [ ] Verify all env vars in Netlify
- [ ] Verify all env vars in DO Functions

## Launch Day

### Deploy
- [ ] Final git push
- [ ] Netlify auto-deploys
- [ ] Verify DO function still running
- [ ] Smoke test tracking on live site

### Monitor
- [ ] Check Turso dashboard for data
- [ ] Check DO function logs
- [ ] Check Netlify function logs
- [ ] Verify no errors

### Announce
- [ ] Reddit r/SaaS post
- [ ] Any other channels

## Post-Launch

- [ ] Monitor for 24 hours
- [ ] Check error rates
- [ ] Respond to feedback
- [ ] Fix any critical bugs immediately

---

## Architecture Reminder

```
Tracking (high volume) --> DO Functions --> Turso
Dashboard/Auth/API    --> Netlify Functions --> Turso
Marketing Site        --> Hugo on Netlify
```

DO Function URL:
https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-8859ab2d-54c9-4ca1-b3aa-8f2ee26c90be/analytics/track
