---
title: "Authentication"
description: "How to authenticate with the Zero Trust Analytics API"
weight: 10
priority: 0.7
---

## Overview

The Zero Trust Analytics API uses JWT (JSON Web Tokens) for authentication. You'll need to obtain a token by logging in, then include it in subsequent requests.

## Getting a Token

### Login Endpoint

```
POST /api/auth/login
```

**Request Body:**

```json
{
  "email": "you@example.com",
  "password": "your-password"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_abc123",
    "email": "you@example.com"
  }
}
```

### Example

```bash
curl -X POST https://ztas.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'
```

## Using the Token

Include the JWT token in the `Authorization` header for all API requests:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Example

```bash
curl https://ztas.io/api/stats?siteId=site_abc123&period=7d \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Token Expiration

Tokens expire after **7 days**. When your token expires, you'll receive a `401 Unauthorized` response. Simply log in again to get a new token.

## Forgot Password

If a user forgets their password, use the password reset flow to securely reset it.

### Step 1: Request Password Reset

```
POST /api/auth/forgot
```

**Request Body:**

```json
{
  "email": "you@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "If an account with that email exists, we sent a password reset link."
}
```

> **Security Note:** This endpoint always returns success, even if the email doesn't exist. This prevents attackers from enumerating valid email addresses.

**Example:**

```bash
curl -X POST https://ztas.io/api/auth/forgot \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

### Step 2: Verify Reset Token (Optional)

Before showing the password reset form, you can verify the token is valid:

```
GET /api/auth/verify-reset-token?token=YOUR_RESET_TOKEN
```

**Success Response:**

```json
{
  "valid": true,
  "expiresAt": "2025-01-15T12:00:00.000Z"
}
```

**Error Response (invalid/expired token):**

```json
{
  "valid": false,
  "error": "Invalid or expired reset link"
}
```

**Example:**

```bash
curl "https://ztas.io/api/auth/verify-reset-token?token=abc123def456..."
```

### Step 3: Reset Password

```
POST /api/auth/reset
```

**Request Body:**

```json
{
  "token": "abc123def456...",
  "password": "new-secure-password"
}
```

**Success Response:**

```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Error Responses:**

```json
{
  "error": "Token and password are required"
}
```

```json
{
  "error": "Password must be at least 8 characters"
}
```

```json
{
  "error": "Invalid or expired reset link"
}
```

**Example:**

```bash
curl -X POST https://ztas.io/api/auth/reset \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123def456...", "password": "new-secure-password"}'
```

### Password Reset Flow Diagram

```
User clicks "Forgot Password"
         │
         ▼
POST /api/auth/forgot (email)
         │
         ▼
User receives email with reset link
         │
         ▼
User clicks link → /reset/?token=xxx
         │
         ▼
GET /api/auth/verify-reset-token (validate)
         │
         ▼
User enters new password
         │
         ▼
POST /api/auth/reset (token + new password)
         │
         ▼
Success! User can now log in
```

### Security Features

- **One-time tokens**: Reset tokens can only be used once
- **Token expiration**: Tokens expire after a set time period
- **Rate limiting**: Prevent brute-force attempts
- **No email enumeration**: Always returns success regardless of email existence

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Invalid or expired token"
}
```

The token is missing, invalid, or expired. Log in again to get a new token.

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```

You don't have permission to access this resource (e.g., trying to access another user's site).

## Best Practices

1. **Store tokens securely** - Never expose tokens in client-side code or URLs
2. **Use HTTPS** - Always make API requests over HTTPS
3. **Handle expiration** - Implement token refresh logic in your application
4. **Limit scope** - Only request data for sites you own

## Rate Limits

API requests are limited to:

- **100 requests per minute** per user
- **1000 requests per hour** per user

Exceeding these limits returns a `429 Too Many Requests` response.
