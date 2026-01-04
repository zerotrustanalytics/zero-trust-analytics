---
title: "Account"
description: "Check subscription status and account information"
weight: 32
priority: 0.7
---

## Overview

The Account API provides information about your user account, subscription status, and plan details. Use this endpoint to check trial status, plan limits, and billing information.

**Key information:**

- **Plan type** - Free, Pro, Business, or Enterprise
- **Subscription status** - Active, trialing, past_due, or canceled
- **Trial period** - Days remaining in trial
- **Access control** - Whether you can access the platform

## Endpoint

```
GET /api/user/status
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## Get Account Status

Retrieve current account and subscription information.

### Request

```bash
curl "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "id": "user_abc123",
  "email": "user@example.com",
  "plan": "pro",
  "status": "active",
  "canAccess": true,
  "trialEndsAt": null,
  "daysLeft": null,
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2025-01-12T16:00:00.000Z"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Your user ID |
| `email` | string | Your email address |
| `plan` | string | Current plan: `free`, `pro`, `business`, or `enterprise` |
| `status` | string | Account status: `trial`, `active`, `past_due`, `canceled`, or `expired` |
| `canAccess` | boolean | Whether you can access the platform |
| `trialEndsAt` | string\|null | Trial end date (ISO 8601) or null if not in trial |
| `daysLeft` | number\|null | Days remaining in trial or null if not in trial |
| `subscription` | object\|null | Subscription details or null if no active subscription |

### Subscription Object

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Subscription status: `active`, `past_due`, `canceled`, or `incomplete` |
| `currentPeriodEnd` | string | End of current billing period (ISO 8601) |

## Account Statuses

### Trial

User is in trial period:

```json
{
  "plan": "free",
  "status": "trial",
  "canAccess": true,
  "trialEndsAt": "2024-12-26T16:00:00.000Z",
  "daysLeft": 14,
  "subscription": null
}
```

### Active Subscription

User has an active paid subscription:

```json
{
  "plan": "pro",
  "status": "active",
  "canAccess": true,
  "trialEndsAt": null,
  "daysLeft": null,
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2025-01-12T16:00:00.000Z"
  }
}
```

### Past Due

Subscription payment failed:

```json
{
  "plan": "pro",
  "status": "past_due",
  "canAccess": true,
  "trialEndsAt": null,
  "daysLeft": null,
  "subscription": {
    "status": "past_due",
    "currentPeriodEnd": "2024-12-12T16:00:00.000Z"
  }
}
```

**Note:** Access continues for a grace period while we retry payment.

### Trial Expired

Trial period ended without upgrade:

```json
{
  "plan": "free",
  "status": "expired",
  "canAccess": false,
  "trialEndsAt": "2024-12-01T16:00:00.000Z",
  "daysLeft": -11,
  "subscription": null
}
```

### Canceled

Subscription was canceled:

```json
{
  "plan": "free",
  "status": "canceled",
  "canAccess": false,
  "trialEndsAt": null,
  "daysLeft": null,
  "subscription": {
    "status": "canceled",
    "currentPeriodEnd": "2024-12-12T16:00:00.000Z"
  }
}
```

**Note:** Access continues until the end of the current billing period.

## Plan Features

Compare features across different plans:

### Free Plan

```json
{
  "plan": "free",
  "features": {
    "sites": 1,
    "pageviews": 10000,
    "dataRetention": "90 days",
    "teamMembers": 1,
    "goals": 5,
    "annotations": 10,
    "exports": false,
    "customDomains": false,
    "apiAccess": true,
    "support": "Community"
  }
}
```

### Pro Plan

```json
{
  "plan": "pro",
  "features": {
    "sites": 10,
    "pageviews": 100000,
    "dataRetention": "2 years",
    "teamMembers": 5,
    "goals": 50,
    "annotations": 100,
    "exports": true,
    "customDomains": true,
    "apiAccess": true,
    "support": "Email"
  }
}
```

### Business Plan

```json
{
  "plan": "business",
  "features": {
    "sites": 50,
    "pageviews": 1000000,
    "dataRetention": "5 years",
    "teamMembers": 20,
    "goals": 200,
    "annotations": 500,
    "exports": true,
    "customDomains": true,
    "apiAccess": true,
    "support": "Priority"
  }
}
```

### Enterprise Plan

```json
{
  "plan": "enterprise",
  "features": {
    "sites": "Unlimited",
    "pageviews": "Unlimited",
    "dataRetention": "Unlimited",
    "teamMembers": "Unlimited",
    "goals": "Unlimited",
    "annotations": "Unlimited",
    "exports": true,
    "customDomains": true,
    "apiAccess": true,
    "support": "Dedicated"
  }
}
```

## Usage Examples

### Check Trial Status

Determine if user is in trial and how many days remain:

```bash
curl "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '{status: .status, daysLeft: .daysLeft}'
```

**Response:**

```json
{
  "status": "trial",
  "daysLeft": 14
}
```

### Verify Access

Check if user can access the platform:

```bash
curl "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.canAccess'
```

**Response:**

```json
true
```

### Show Trial Reminder

Display a trial reminder in your application:

```javascript
// Fetch account status
const response = await fetch('https://ztas.io/api/user/status', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();

// Show trial reminder
if (data.status === 'trial' && data.daysLeft <= 7) {
  console.log(`Your trial expires in ${data.daysLeft} days. Upgrade now!`);
}
```

### Check Plan Limits

Verify if user has reached plan limits:

```bash
# Get current usage
usage=$(curl -s "https://ztas.io/api/usage" -H "Authorization: Bearer YOUR_TOKEN")

# Get account status
status=$(curl -s "https://ztas.io/api/user/status" -H "Authorization: Bearer YOUR_TOKEN")

# Check if approaching limits
echo "$usage" | jq '.sites.used'
echo "$status" | jq '.plan'
```

## Upgrade Prompts

Use account status to show upgrade prompts:

```javascript
async function checkUpgradeNeeded(token) {
  const response = await fetch('https://ztas.io/api/user/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { plan, status, daysLeft } = await response.json();

  // Trial expiring soon
  if (status === 'trial' && daysLeft <= 3) {
    return {
      show: true,
      message: `Trial expires in ${daysLeft} days. Upgrade to continue using ZTA.`,
      urgency: 'high'
    };
  }

  // Free plan user
  if (plan === 'free' && status === 'active') {
    return {
      show: true,
      message: 'Upgrade to Pro for unlimited sites and advanced features.',
      urgency: 'low'
    };
  }

  // Past due payment
  if (status === 'past_due') {
    return {
      show: true,
      message: 'Please update your payment method to continue service.',
      urgency: 'high'
    };
  }

  return { show: false };
}
```

## Billing Integration

Combine with billing endpoints to manage subscriptions:

```bash
# 1. Check current status
curl "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Upgrade to Pro plan
curl -X POST "https://ztas.io/api/billing/subscribe" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "interval": "monthly"
  }'

# 3. Verify new status
curl "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Invalid or missing authentication token"
}
```

### 404 Not Found

```json
{
  "error": "User not found"
}
```

This can happen if the user account was deleted.

### 500 Internal Server Error

```json
{
  "error": "Failed to get user status"
}
```

## Monitoring Account Status

### Daily Status Check

Automate daily status checks:

```bash
#!/bin/bash

TOKEN="YOUR_TOKEN"
EMAIL="alerts@example.com"

status=$(curl -s "https://ztas.io/api/user/status" \
  -H "Authorization: Bearer $TOKEN")

canAccess=$(echo "$status" | jq -r '.canAccess')
daysLeft=$(echo "$status" | jq -r '.daysLeft')

# Alert if access is denied
if [ "$canAccess" = "false" ]; then
  echo "Account access denied!" | mail -s "ZTA Account Alert" $EMAIL
fi

# Alert if trial expires soon
if [ "$daysLeft" != "null" ] && [ "$daysLeft" -le 3 ]; then
  echo "Trial expires in $daysLeft days" | mail -s "ZTA Trial Expiring" $EMAIL
fi
```

### Status Dashboard

Create a simple status dashboard:

```javascript
async function displayAccountStatus(token) {
  const response = await fetch('https://ztas.io/api/user/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();

  console.log('=== Account Status ===');
  console.log(`Plan: ${data.plan.toUpperCase()}`);
  console.log(`Status: ${data.status}`);
  console.log(`Access: ${data.canAccess ? 'Enabled' : 'Disabled'}`);

  if (data.trialEndsAt) {
    console.log(`Trial ends: ${new Date(data.trialEndsAt).toLocaleDateString()}`);
    console.log(`Days left: ${data.daysLeft}`);
  }

  if (data.subscription) {
    console.log(`Subscription: ${data.subscription.status}`);
    console.log(`Renews: ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}`);
  }
}
```

## Rate Limits

The account status endpoint has generous rate limits:
- **1,000 requests per hour** per user

## Related Endpoints

- [Billing](/docs/api/billing/) - Manage subscriptions and payments
- [Usage](/docs/api/usage/) - View current usage and limits
- [Authentication](/docs/api/authentication/) - Manage API tokens
- [Teams](/docs/api/teams/) - Manage team members (requires appropriate plan)

## Best Practices

### 1. Cache Status Information

Don't fetch status on every page load. Cache for at least 5 minutes:

```javascript
class AccountStatusCache {
  constructor(ttl = 300000) { // 5 minutes
    this.ttl = ttl;
    this.cache = null;
    this.timestamp = null;
  }

  async get(token) {
    const now = Date.now();

    if (this.cache && (now - this.timestamp) < this.ttl) {
      return this.cache;
    }

    const response = await fetch('https://ztas.io/api/user/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    this.cache = await response.json();
    this.timestamp = now;

    return this.cache;
  }
}
```

### 2. Handle Status Changes Gracefully

Account status can change at any time (payment fails, trial expires):

```javascript
if (!accountStatus.canAccess) {
  // Redirect to upgrade page
  window.location.href = '/upgrade';
} else if (accountStatus.status === 'past_due') {
  // Show warning banner
  showBanner('Please update your payment method');
}
```

### 3. Show Trial Progress

Keep users informed about their trial status:

```javascript
if (accountStatus.status === 'trial') {
  const progress = ((14 - accountStatus.daysLeft) / 14) * 100;
  updateProgressBar(progress);
  showMessage(`${accountStatus.daysLeft} days remaining in trial`);
}
```

### 4. Prefetch Before Gated Actions

Check status before allowing access to premium features:

```javascript
async function enablePremiumFeature(token) {
  const status = await fetchAccountStatus(token);

  if (status.plan === 'free') {
    showUpgradePrompt('This feature requires a Pro plan');
    return false;
  }

  return true;
}
```
