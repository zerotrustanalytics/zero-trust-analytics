---
title: "Billing"
description: "Stripe integration endpoints for subscription management and payment processing"
weight: 35
priority: 0.7
---

# Billing API

The billing API provides Stripe integration for subscription management, payment processing, and webhook handling. All billing operations use Stripe as the payment processor.

## Endpoints

### Create Checkout Session

Create a Stripe checkout session for subscription purchase.

**Endpoint:** `POST /api/stripe/checkout`

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Response (Success):**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

**Response (Error - Already Subscribed):**
```json
{
  "error": "Already subscribed"
}
```

**Status Codes:**
- `200` - Checkout session created successfully
- `400` - User already has an active subscription
- `401` - Authentication failed
- `500` - Internal server error

**Details:**
- Creates a Stripe checkout session in `subscription` mode
- Accepts card payments only
- Redirects to dashboard on success/cancel
- Stores user metadata (userId, email) with the session
- Uses `STRIPE_PRICE_ID` environment variable for pricing

**Example Usage:**
```javascript
const response = await fetch('/api/stripe/checkout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
if (data.url) {
  window.location.href = data.url; // Redirect to Stripe checkout
}
```

---

### Access Billing Portal

Create a Stripe billing portal session for subscription management.

**Endpoint:** `POST /api/stripe/portal`

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Response (Success):**
```json
{
  "url": "https://billing.stripe.com/..."
}
```

**Response (Error - No Subscription):**
```json
{
  "error": "No active subscription"
}
```

**Status Codes:**
- `200` - Portal session created successfully
- `400` - User has no active subscription
- `401` - Authentication failed
- `500` - Internal server error

**Details:**
- Creates a Stripe billing portal session for existing customers
- Allows users to manage subscriptions, update payment methods, and view invoices
- Requires user to have a valid Stripe customer ID
- Returns to dashboard after portal actions

**Example Usage:**
```javascript
const response = await fetch('/api/stripe/portal', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
if (data.url) {
  window.location.href = data.url; // Redirect to billing portal
}
```

---

### Stripe Webhooks

Handle Stripe webhook events for subscription lifecycle management.

**Endpoint:** `POST /api/stripe/webhook`

**Authentication:** Stripe signature verification

**Request Headers:**
```
stripe-signature: <webhook_signature>
Content-Type: application/json
```

**Response:**
```json
{
  "received": true
}
```

**Status Codes:**
- `200` - Webhook processed successfully
- `400` - Invalid signature
- `405` - Method not allowed
- `500` - Webhook handler failed

**Supported Events:**

#### checkout.session.completed
Triggered when a customer completes the checkout process.

**Action:** Updates user subscription status to 'active' and stores:
- Subscription status
- Stripe customer ID
- Stripe subscription ID
- Creation timestamp

#### customer.subscription.updated
Triggered when a subscription is updated (e.g., plan change, renewal).

**Action:** Logs subscription update (full implementation pending)

#### customer.subscription.deleted
Triggered when a subscription is canceled or expires.

**Action:** Logs subscription cancellation (full implementation pending)

#### invoice.payment_failed
Triggered when an invoice payment attempt fails.

**Action:** Logs payment failure (full implementation pending)

**Security:**
- All webhooks are verified using `STRIPE_WEBHOOK_SECRET`
- Invalid signatures are rejected with 400 status
- Events are processed idempotently

**Example Webhook Payload (checkout.session.completed):**
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "customer": "cus_xxx",
      "customer_email": "user@example.com",
      "subscription": "sub_xxx",
      "metadata": {
        "userId": "user_123",
        "email": "user@example.com"
      }
    }
  }
}
```

---

## Pricing Tiers

Subscription pricing is configured in Stripe and referenced via the `STRIPE_PRICE_ID` environment variable. The checkout session automatically uses this pricing configuration.

**Typical Subscription Features:**
- Privacy-focused web analytics
- Unlimited tracked sites
- Real-time dashboard access
- Custom event tracking
- Advanced filtering and segmentation
- Share dashboard access
- API access

---

## Configuration

The billing system requires the following environment variables:

```bash
STRIPE_SECRET_KEY=sk_live_xxx      # Stripe secret API key
STRIPE_PRICE_ID=price_xxx          # Stripe price ID for subscription
STRIPE_WEBHOOK_SECRET=whsec_xxx    # Webhook signing secret
URL=https://your-domain.com        # Application URL for redirects
```

---

## Error Handling

All billing endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common error scenarios:
- **401 Unauthorized** - Missing or invalid authentication token
- **400 Bad Request** - Invalid request (e.g., already subscribed, no subscription)
- **500 Internal Server Error** - Stripe API errors or server issues

---

## CORS Support

All billing endpoints support CORS with:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

OPTIONS preflight requests are handled automatically.

---

## Best Practices

1. **Always verify authentication** before calling billing endpoints
2. **Handle redirect URLs** from checkout and portal sessions
3. **Monitor webhook events** for subscription status changes
4. **Implement retry logic** for failed API calls
5. **Never expose** Stripe secret keys in client-side code
6. **Use HTTPS** for all webhook endpoints in production

---

## Related Documentation

- [Authentication API](/docs/api/authentication/)
- [Dashboard Access](/docs/features/dashboard/)
- [Stripe Documentation](https://stripe.com/docs)
