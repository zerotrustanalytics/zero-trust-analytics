# Zero Trust Analytics API Documentation

**Version:** 1.0.0
**Base URL:** `https://ztas.io/api`

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Authentication](#authentication-endpoints)
  - [Sites Management](#sites-management-endpoints)
  - [Analytics](#analytics-endpoints)
  - [User Management](#user-management-endpoints)
  - [Billing](#billing-endpoints)
- [WebHooks](#webhooks)
- [Code Examples](#code-examples)

## Overview

Zero Trust Analytics provides a privacy-first analytics API that collects and analyzes website traffic without storing any personally identifiable information (PII). All sensitive data is hashed using cryptographic methods before storage.

### Key Features

- **Zero-trust security**: All PII is hashed, never stored in plain text
- **GDPR compliant**: No cookies, no personal data storage
- **Bot filtering**: Automatic bot and crawler detection
- **Real-time tracking**: Sub-second event processing
- **Batch processing**: Efficient bulk event tracking
- **OAuth support**: Google and GitHub authentication

## Authentication

Most API endpoints require authentication using JWT (JSON Web Tokens). Include the token in the `Authorization` header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Getting a Token

You can obtain a JWT token by:

1. **Registering a new account**: `POST /api/auth/register`
2. **Logging in**: `POST /api/auth/login`
3. **OAuth**: `GET /api/auth/google` or `GET /api/auth/github`

### CSRF Protection

State-changing operations (POST, PUT, DELETE) require a CSRF token in addition to the JWT token:

```http
X-CSRF-Token: YOUR_CSRF_TOKEN
```

The CSRF token is returned in the response when you authenticate (login or register).

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Registration | 5 requests | 1 minute |
| Login | 10 requests | 1 minute |
| Password Reset | 3 requests | 1 minute |
| Analytics Tracking | 1000 requests | 1 minute |
| General API | Standard limits | 1 minute |

When rate-limited, you'll receive a `429 Too Many Requests` response with a `resetIn` field indicating milliseconds until the limit resets:

```json
{
  "error": "Rate limit exceeded",
  "resetIn": 45000
}
```

## Error Handling

All error responses follow a consistent format:

### Standard Error Response

```json
{
  "error": "Error message describing what went wrong"
}
```

### Validation Error Response

```json
{
  "error": "Validation failed",
  "details": [
    "Password must be at least 12 characters",
    "Password must contain at least one special character"
  ]
}
```

### Common HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Valid authentication but insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Endpoints

## Authentication Endpoints

### Register New Account

Creates a new user account with email and password.

**Endpoint:** `POST /api/auth/register`

**Authentication:** None required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "plan": "pro"
}
```

**Password Requirements:**

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Response (201 Created):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "csrfToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "subscription": {
      "status": "trialing",
      "plan": "pro",
      "currentPeriodEnd": "2024-01-15T00:00:00Z"
    }
  }
}
```

**Errors:**

- `400` - Validation error (weak password, invalid email)
- `409` - Email already registered
- `429` - Rate limit exceeded

---

### Login

Authenticates user and returns JWT token.

**Endpoint:** `POST /api/auth/login`

**Authentication:** None required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123"
}
```

**Response (200 OK) - No 2FA:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "csrfToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "subscription": {
      "status": "active",
      "plan": "pro"
    }
  }
}
```

**Response (200 OK) - 2FA Enabled:**

```json
{
  "success": true,
  "requires_2fa": true,
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

When 2FA is enabled, you must complete the authentication by calling `/api/auth/2fa` with action `validate`.

**Errors:**

- `401` - Invalid credentials
- `429` - Rate limit exceeded

---

### Forgot Password

Initiates password reset process. Always returns success to prevent email enumeration.

**Endpoint:** `POST /api/auth/forgot`

**Authentication:** None required

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "If an account with that email exists, we sent a password reset link."
}
```

This response is returned regardless of whether the email exists in the system (security measure to prevent email enumeration).

**Errors:**

- `429` - Rate limit exceeded (3 requests/minute)

---

### Reset Password

Resets password using token from email.

**Endpoint:** `POST /api/auth/reset`

**Authentication:** None required

**Request Body:**

```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0...",
  "newPassword": "NewSecureP@ssw0rd123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Errors:**

- `400` - Invalid or expired token, or password doesn't meet requirements
- `429` - Rate limit exceeded

---

### Verify Reset Token

Validates a password reset token before allowing password change.

**Endpoint:** `GET /api/auth/verify-reset-token?token=TOKEN`

**Authentication:** None required

**Query Parameters:**

- `token` (required) - Reset token from email

**Response (200 OK) - Valid Token:**

```json
{
  "valid": true,
  "email": "user@example.com"
}
```

**Response (200 OK) - Invalid Token:**

```json
{
  "valid": false,
  "error": "Invalid or expired token"
}
```

---

### Two-Factor Authentication (2FA)

Manages two-factor authentication setup, verification, and validation.

**Endpoint:** `POST /api/auth/2fa`

**Authentication:** Required for setup, verify, and disable actions

#### Setup 2FA

**Request Body:**

```json
{
  "action": "setup"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "otpauth://totp/Zero%20Trust%20Analytics:user@example.com?secret=JBSWY3DPEHPK3PXP",
  "message": "Scan the QR code with your authenticator app, then verify with a code"
}
```

Use the `qrCode` URI to generate a QR code for the user to scan with their authenticator app.

#### Verify 2FA Code

**Request Body:**

```json
{
  "action": "verify",
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Two-factor authentication enabled successfully"
}
```

#### Disable 2FA

**Request Body:**

```json
{
  "action": "disable",
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Two-factor authentication disabled"
}
```

#### Validate 2FA During Login

**Request Body:**

```json
{
  "action": "validate",
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "subscription": {
      "status": "active",
      "plan": "pro"
    }
  }
}
```

**Errors:**

- `401` - Invalid verification code or temp token
- `400` - 2FA not set up or bad request

---

### OAuth Authentication

**Google OAuth:** `GET /api/auth/google`

**GitHub OAuth:** `GET /api/auth/github`

**OAuth Callback:** `GET /api/auth/oauth-callback?code=CODE&state=STATE`

These endpoints handle OAuth flows. Redirect users to the Google or GitHub endpoint, and they'll be redirected back to your callback URL with authentication tokens.

---

## Sites Management Endpoints

### List Sites

Returns all sites owned by the authenticated user.

**Endpoint:** `GET /api/sites/list`

**Authentication:** Required (Bearer token)

**Response (200 OK):**

```json
{
  "success": true,
  "sites": [
    {
      "id": "site_abc123",
      "userId": "user_123",
      "domain": "example.com",
      "nickname": "My Blog",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Errors:**

- `401` - Unauthorized

---

### Create Site

Creates a new site for tracking analytics.

**Endpoint:** `POST /api/sites/create`

**Authentication:** Required (Bearer token + CSRF token)

**Request Body:**

```json
{
  "domain": "example.com"
}
```

The domain will be normalized (protocol and trailing slash removed automatically).

**Response (201 Created):**

```json
{
  "success": true,
  "site": {
    "id": "site_abc123",
    "userId": "user_123",
    "domain": "example.com",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "embedCode": "<script src=\"https://ztas.io/js/analytics.js\" data-site-id=\"site_abc123\"></script>"
}
```

**Errors:**

- `400` - Domain required
- `401` - Unauthorized
- `403` - CSRF token invalid

---

### Update Site

Updates site settings (domain, nickname).

**Endpoint:** `POST /api/sites/update`

**Authentication:** Required (Bearer token + CSRF token)

**Request Body:**

```json
{
  "siteId": "site_abc123",
  "domain": "newdomain.com",
  "nickname": "My Awesome Blog"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "site": {
    "id": "site_abc123",
    "userId": "user_123",
    "domain": "newdomain.com",
    "nickname": "My Awesome Blog",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Errors:**

- `400` - Validation error
- `401` - Unauthorized
- `403` - Access denied or CSRF token invalid

---

### Delete Site

Permanently deletes a site and all associated analytics data.

**Endpoint:** `POST /api/sites/delete`

**Authentication:** Required (Bearer token + CSRF token)

**Request Body:**

```json
{
  "siteId": "site_abc123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Site deleted successfully"
}
```

**Errors:**

- `400` - Site ID required
- `401` - Unauthorized
- `403` - Access denied or CSRF token invalid

---

### Create Public Share Link

Creates a shareable public link for site analytics.

**Endpoint:** `POST /api/sites/share`

**Authentication:** Required (Bearer token + CSRF token)

**Request Body:**

```json
{
  "siteId": "site_abc123",
  "allowedPeriods": ["7d", "30d"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "shareToken": "share_xyz789",
  "url": "https://ztas.io/public?token=share_xyz789"
}
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied or CSRF token invalid

---

## Analytics Endpoints

### Track Events

Tracks analytics events with zero-trust privacy. Supports both single events and batch processing.

**Endpoint:** `POST /api/track`

**Authentication:** None required (uses site ID for validation)

**CORS:** Origin must match registered site domain

#### Single Event

**Request Body:**

```json
{
  "siteId": "site_abc123",
  "type": "pageview",
  "path": "/blog/article",
  "referrer": "https://google.com",
  "sessionId": "sess_xyz789",
  "isNewVisitor": true,
  "landingPage": "/home",
  "trafficSource": "organic",
  "utm": {
    "source": "newsletter",
    "medium": "email",
    "campaign": "spring-2024"
  }
}
```

#### Batch Events

For better performance, send multiple events in a single request:

**Request Body:**

```json
{
  "siteId": "site_abc123",
  "batch": true,
  "events": [
    {
      "type": "pageview",
      "path": "/home",
      "sessionId": "sess_xyz789",
      "isNewVisitor": true
    },
    {
      "type": "engagement",
      "path": "/home",
      "sessionId": "sess_xyz789",
      "timeOnPage": 45,
      "isBounce": false
    }
  ]
}
```

#### Event Types

- **`pageview`** - Page view event
- **`engagement`** - Engagement tracking (time on page, bounce)
- **`event`** - Custom events (clicks, form submissions, etc.)
- **`heartbeat`** - Session keep-alive

**Response (200 OK):**

```json
{
  "success": true,
  "count": 2
}
```

**Privacy Note:** All IP addresses and user agents are hashed before storage. No PII is stored.

**Bot Filtering:** Common bots and crawlers are automatically filtered and silently accepted.

**Errors:**

- `400` - Invalid request
- `403` - Origin not allowed (CORS violation)
- `404` - Invalid site ID
- `429` - Rate limit exceeded (1000/minute)

---

### Get Analytics Statistics

Retrieves analytics data for a specific site and time period.

**Endpoint:** `GET /api/stats`

**Authentication:** Required (Bearer token)

**Query Parameters:**

- `siteId` (required) - Site ID
- `period` (optional) - Time period: `24h`, `7d`, `30d`, `90d`, `365d` (default: `7d`)
- `startDate` (optional) - Custom start date (ISO 8601 format)
- `endDate` (optional) - Custom end date (ISO 8601 format)

**Example Request:**

```
GET /api/stats?siteId=site_abc123&period=30d
```

**Response (200 OK):**

```json
{
  "summary": {
    "unique_visitors": 1523,
    "pageviews": 4567,
    "bounce_rate": 45.2,
    "avg_duration": 185.5
  },
  "daily": [
    {
      "date": "2024-01-01",
      "visitors": 245,
      "pageviews": 678
    }
  ],
  "pages": [
    {
      "path": "/blog/article",
      "views": 456,
      "unique_visitors": 234
    }
  ],
  "referrers": [
    {
      "domain": "google.com",
      "visitors": 123
    }
  ],
  "devices": {
    "desktop": 800,
    "mobile": 650,
    "tablet": 73
  },
  "browsers": [
    {
      "name": "Chrome",
      "visitors": 890
    }
  ],
  "countries": [
    {
      "code": "US",
      "name": "United States",
      "visitors": 567
    }
  ]
}
```

**Errors:**

- `400` - Site ID required
- `401` - Unauthorized
- `403` - Access denied (user doesn't own site)

---

### Get Public Statistics

Retrieves analytics for publicly shared sites using a share token.

**Endpoint:** `GET /api/public-stats`

**Authentication:** None required

**Query Parameters:**

- `token` (required) - Share token
- `period` (optional) - Time period (must be in allowed periods)

**Example Request:**

```
GET /api/public-stats?token=share_xyz789&period=7d
```

**Response (200 OK):**

```json
{
  "site": {
    "domain": "example.com",
    "nickname": "My Blog"
  },
  "period": "7d",
  "allowedPeriods": ["7d", "30d"],
  "uniqueVisitors": 1523,
  "pageviews": 4567,
  "bounceRate": 45.2,
  "avgSessionDuration": 185.5,
  "pages": [...],
  "referrers": [...],
  "devices": {...},
  "browsers": [...],
  "countries": [...],
  "daily": [...]
}
```

**Errors:**

- `400` - Share token required
- `403` - Period not allowed for this share
- `404` - Invalid or expired share link

---

## User Management Endpoints

### Get User Status

Returns user account information including subscription status.

**Endpoint:** `GET /api/user/status`

**Authentication:** Required (Bearer token)

**Response (200 OK):**

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "plan": "pro",
  "status": "trial",
  "canAccess": true,
  "trialEndsAt": "2024-01-15T00:00:00Z",
  "daysLeft": 12,
  "subscription": {
    "status": "trialing",
    "currentPeriodEnd": "2024-01-15T00:00:00Z"
  }
}
```

**Errors:**

- `401` - Unauthorized

---

### Get User Sessions

Lists all active sessions for the authenticated user.

**Endpoint:** `GET /api/user/sessions`

**Authentication:** Required (Bearer token)

**Response (200 OK):**

```json
{
  "success": true,
  "sessions": [
    {
      "id": "sess_xyz789",
      "createdAt": "2024-01-01T12:00:00Z",
      "lastActive": "2024-01-01T14:30:00Z",
      "userAgent": "Mozilla/5.0...",
      "ipHash": "abc123..."
    }
  ]
}
```

**Errors:**

- `401` - Unauthorized

---

## Billing Endpoints

### Create Stripe Checkout Session

Creates a Stripe checkout session for subscription payment.

**Endpoint:** `POST /api/stripe/checkout`

**Authentication:** Required (Bearer token)

**Request Body (optional):**

```json
{
  "priceId": "price_xxxxx"
}
```

If `priceId` is not provided, uses the default from environment variables.

**Response (200 OK):**

```json
{
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

Redirect the user to this URL to complete payment.

**Errors:**

- `400` - Already subscribed
- `401` - Unauthorized

---

### Create Stripe Customer Portal Session

Creates a Stripe customer portal session for managing subscription.

**Endpoint:** `POST /api/stripe/portal`

**Authentication:** Required (Bearer token)

**Response (200 OK):**

```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

Redirect the user to this URL to manage their subscription.

**Errors:**

- `400` - No active subscription
- `401` - Unauthorized

---

## WebHooks

### Stripe Webhook

**Endpoint:** `POST /api/stripe/webhook`

This endpoint receives webhook events from Stripe for subscription lifecycle management. It's called by Stripe, not by your application.

**Supported Events:**

- `checkout.session.completed` - Payment successful
- `customer.subscription.updated` - Subscription changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_failed` - Payment failed

---

## Code Examples

### JavaScript/TypeScript

#### Register and Login

```javascript
// Register
const registerResponse = await fetch('https://ztas.io/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecureP@ssw0rd123',
    plan: 'pro'
  })
});

const { token, csrfToken, user } = await registerResponse.json();

// Store tokens for subsequent requests
localStorage.setItem('authToken', token);
localStorage.setItem('csrfToken', csrfToken);
```

#### Create a Site

```javascript
const token = localStorage.getItem('authToken');
const csrfToken = localStorage.getItem('csrfToken');

const response = await fetch('https://ztas.io/api/sites/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({
    domain: 'example.com'
  })
});

const { site, embedCode } = await response.json();
console.log('Add this to your site:', embedCode);
```

#### Track Events (Client-Side)

```javascript
// Single event
await fetch('https://ztas.io/api/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    siteId: 'site_abc123',
    type: 'pageview',
    path: window.location.pathname,
    referrer: document.referrer,
    sessionId: getSessionId() // Your session management
  })
});

// Batch events (more efficient)
await fetch('https://ztas.io/api/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    siteId: 'site_abc123',
    batch: true,
    events: [
      {
        type: 'pageview',
        path: '/home',
        sessionId: 'sess_xyz'
      },
      {
        type: 'event',
        action: 'click',
        category: 'button',
        label: 'signup'
      }
    ]
  })
});
```

#### Get Analytics

```javascript
const token = localStorage.getItem('authToken');

const response = await fetch(
  'https://ztas.io/api/stats?siteId=site_abc123&period=30d',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const stats = await response.json();
console.log('Unique visitors:', stats.summary.unique_visitors);
console.log('Pageviews:', stats.summary.pageviews);
```

### Python

```python
import requests

# Register
response = requests.post('https://ztas.io/api/auth/register', json={
    'email': 'user@example.com',
    'password': 'SecureP@ssw0rd123',
    'plan': 'pro'
})

data = response.json()
token = data['token']
csrf_token = data['csrfToken']

# Create site
response = requests.post(
    'https://ztas.io/api/sites/create',
    headers={
        'Authorization': f'Bearer {token}',
        'X-CSRF-Token': csrf_token
    },
    json={'domain': 'example.com'}
)

site = response.json()
print(f"Site ID: {site['site']['id']}")

# Get analytics
response = requests.get(
    'https://ztas.io/api/stats',
    headers={'Authorization': f'Bearer {token}'},
    params={'siteId': site['site']['id'], 'period': '7d'}
)

stats = response.json()
print(f"Visitors: {stats['summary']['unique_visitors']}")
```

### cURL

```bash
# Register
curl -X POST https://ztas.io/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecureP@ssw0rd123",
    "plan": "pro"
  }'

# Login
curl -X POST https://ztas.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecureP@ssw0rd123"
  }'

# Get stats (replace TOKEN with your JWT)
curl https://ztas.io/api/stats?siteId=site_abc123&period=7d \
  -H "Authorization: Bearer TOKEN"

# Track event
curl -X POST https://ztas.io/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "type": "pageview",
    "path": "/blog/article",
    "sessionId": "sess_xyz789"
  }'
```

---

## Best Practices

### Security

1. **Never expose tokens in client-side code** - Store JWT tokens securely (HttpOnly cookies recommended)
2. **Always use HTTPS** - Never send authentication tokens over HTTP
3. **Rotate CSRF tokens** - Get new CSRF tokens periodically
4. **Implement proper session management** - Track user sessions and implement logout

### Performance

1. **Use batch tracking** - Send multiple events in one request
2. **Implement request debouncing** - Don't send events on every user action
3. **Cache analytics data** - Cache stats responses for a few minutes
4. **Use appropriate time periods** - Don't request unnecessarily long date ranges

### Error Handling

1. **Handle rate limits gracefully** - Implement exponential backoff
2. **Validate input client-side** - Reduce API errors with client-side validation
3. **Log errors properly** - Track API errors for debugging
4. **Show user-friendly messages** - Don't expose raw API errors to users

---

## Support

For additional help:

- **Documentation**: https://ztas.io/docs
- **GitHub Issues**: https://github.com/your-repo/issues
- **Email**: support@ztas.io

---

**License:** MIT
