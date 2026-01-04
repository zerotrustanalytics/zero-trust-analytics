---
title: "Sessions"
description: "Manage active user sessions and enhance account security"
weight: 31
priority: 0.7
---

## Overview

The Sessions API allows you to view and manage your active login sessions across different devices and browsers. This is a critical security feature that helps you monitor account access and revoke sessions from untrusted devices.

**Security benefits:**

- **View all active sessions** - See where you're logged in
- **Identify suspicious logins** - Detect unauthorized access
- **Revoke access remotely** - Sign out from lost or stolen devices
- **Bulk revocation** - Sign out from all devices except current one

## Endpoints

```
GET /api/user/sessions
DELETE /api/user/sessions
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Active Sessions

Get all active sessions for your account.

### Request

```bash
curl "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "createdAt": "2024-12-10T09:00:00.000Z",
      "lastActiveAt": "2024-12-12T15:30:00.000Z",
      "device": "Chrome on macOS",
      "ipAddress": "192.168.***.***.***",
      "isCurrent": true
    },
    {
      "id": "sess_def456",
      "createdAt": "2024-12-11T14:00:00.000Z",
      "lastActiveAt": "2024-12-12T10:15:00.000Z",
      "device": "Safari on iPhone",
      "ipAddress": "10.0.***.***.***",
      "isCurrent": false
    },
    {
      "id": "sess_ghi789",
      "createdAt": "2024-12-08T08:30:00.000Z",
      "lastActiveAt": "2024-12-11T18:45:00.000Z",
      "device": "Firefox on Windows",
      "ipAddress": "172.16.***.***.***",
      "isCurrent": false
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique session identifier |
| `createdAt` | string | When the session was created (ISO 8601) |
| `lastActiveAt` | string | Last activity timestamp (ISO 8601) |
| `device` | string | Browser and operating system |
| `ipAddress` | string | Masked IP address (for privacy) |
| `isCurrent` | boolean | Whether this is your current session |

**Privacy Note:** IP addresses are partially masked (e.g., `192.168.***.***`) to protect privacy while still allowing you to identify general locations.

## Revoke Session

Sign out from a specific device or browser.

### Request

```bash
curl -X DELETE "https://ztas.io/api/user/sessions?sessionId=sess_def456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Conditional | Session ID to revoke (required if `all` is not true) |
| `all` | boolean | Conditional | Set to `true` to revoke all sessions except current |

### Response

```json
{
  "success": true
}
```

**Note:** You cannot revoke your current session using this endpoint. To sign out from your current device, use the logout endpoint.

## Revoke All Sessions

Sign out from all devices except the one you're currently using.

### Request

```bash
curl -X DELETE "https://ztas.io/api/user/sessions?all=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response

```json
{
  "success": true,
  "message": "Revoked 3 session(s)"
}
```

This is useful when:
- You suspect your account has been compromised
- You've lost a device and want to secure your account
- You want to sign out from all public/shared computers

## Security Scenarios

### Scenario 1: Lost Phone

If you lose your phone or it's stolen:

```bash
# 1. List all sessions to find the phone's session
curl "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Revoke the phone's session
curl -X DELETE "https://ztas.io/api/user/sessions?sessionId=sess_def456" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Consider changing your password
curl -X PATCH "https://ztas.io/api/user/password" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "old_password",
    "newPassword": "new_secure_password"
  }'
```

### Scenario 2: Suspicious Activity

If you notice unfamiliar sessions:

```bash
# 1. Review all active sessions
curl "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Revoke all sessions except current
curl -X DELETE "https://ztas.io/api/user/sessions?all=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Change password immediately
# 4. Enable two-factor authentication (if not already enabled)
```

### Scenario 3: Left Logged In

If you forgot to sign out from a public computer:

```bash
# Revoke specific session
curl -X DELETE "https://ztas.io/api/user/sessions?sessionId=sess_ghi789" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Session Management Best Practices

### 1. Regularly Review Sessions

Check your active sessions weekly:

```bash
curl "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.sessions[] | "\(.device) - Last active: \(.lastActiveAt)"'
```

### 2. Revoke Old Sessions

Remove sessions that haven't been active recently:

```bash
# Example: Revoke sessions older than 30 days
curl "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq -r '.sessions[] | select(.lastActiveAt < "2024-11-12") | .id' \
  | while read session_id; do
    curl -X DELETE "https://ztas.io/api/user/sessions?sessionId=$session_id" \
      -H "Authorization: Bearer YOUR_TOKEN"
  done
```

### 3. Sign Out After Using Shared Computers

Always sign out when using public or shared devices:

- Use the UI logout button (signs out current session)
- Or revoke the session remotely after leaving

### 4. Enable Alerts

Set up alerts for new session creation (if available in your plan):

```bash
curl -X POST "https://ztas.io/api/alerts" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security",
    "event": "new_session",
    "notificationMethod": "email"
  }'
```

### 5. Use Strong Authentication

Combine session management with other security features:

- Enable two-factor authentication (2FA)
- Use a password manager for unique, strong passwords
- Review security logs regularly

## Session Lifecycle

### Session Creation

Sessions are created when you:
1. Log in with email/password
2. Log in via OAuth (Google, GitHub, etc.)
3. Use an API token to authenticate

### Session Duration

- Sessions expire after **30 days of inactivity**
- Active sessions are renewed automatically
- Revoking a session immediately invalidates it

### Session Renewal

Each API request updates the `lastActiveAt` timestamp and renews the session for another 30 days.

## Device Detection

The `device` field is detected from the User-Agent header:

| User-Agent | Detected Device |
|------------|----------------|
| Chrome on macOS | `Chrome on macOS` |
| Safari on iPhone | `Safari on iPhone` |
| Firefox on Windows | `Firefox on Windows` |
| Edge on Windows | `Edge on Windows` |
| Chrome on Android | `Chrome on Android` |

Unknown or custom User-Agents display as `Unknown Device`.

## IP Address Privacy

IP addresses are partially masked to balance security with privacy:

### IPv4 Masking
```
Full IP:    192.168.1.100
Masked IP:  192.168.***.***
```

The first two octets are shown, allowing you to identify:
- Network type (e.g., 192.168 = private network, 10.0 = private network)
- General location (same network or different)

### IPv6 Masking
```
Full IP:    2001:0db8:85a3:0000:0000:8a2e:0370:7334
Masked IP:  2001:0db8:***
```

Only the first segment is shown.

## Error Responses

### 400 Bad Request

```json
{
  "error": "Session ID or all=true required"
}
```

### 404 Not Found

```json
{
  "error": "Session not found"
}
```

This can happen if:
- The session ID doesn't exist
- The session was already revoked
- The session belongs to a different user

### 500 Internal Server Error

```json
{
  "error": "Failed to get sessions"
}
```

```json
{
  "error": "Failed to revoke session"
}
```

## Security Monitoring

### Activity Log Integration

All session management actions are logged in the [Activity Log](/docs/api/activity-log/):

```bash
curl "https://ztas.io/api/activity-log?type=security" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Logged events:
- `session.created` - New session started
- `session.revoked` - Session manually revoked
- `session.expired` - Session expired due to inactivity
- `sessions.bulk_revoked` - Multiple sessions revoked

### Email Notifications

You may receive email notifications for:
- New session from unrecognized device
- Session from unusual location
- Multiple failed login attempts

## Example: Security Audit Script

Automate session monitoring:

```bash
#!/bin/bash

# security-audit.sh - Check for suspicious sessions

TOKEN="YOUR_TOKEN"
THRESHOLD_DAYS=7

echo "Fetching active sessions..."
sessions=$(curl -s "https://ztas.io/api/user/sessions" \
  -H "Authorization: Bearer $TOKEN")

echo "Active sessions:"
echo "$sessions" | jq -r '.sessions[] |
  "\(.device) - Last active: \(.lastActiveAt) - Current: \(.isCurrent)"'

echo ""
echo "Sessions inactive for more than $THRESHOLD_DAYS days:"
echo "$sessions" | jq -r --arg days "$THRESHOLD_DAYS" '.sessions[] |
  select(.isCurrent == false) |
  select((.lastActiveAt | fromdateiso8601) < (now - ($days | tonumber) * 86400)) |
  "\(.id) - \(.device) - \(.lastActiveAt)"'

read -p "Revoke all old sessions? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "$sessions" | jq -r --arg days "$THRESHOLD_DAYS" '.sessions[] |
    select(.isCurrent == false) |
    select((.lastActiveAt | fromdateiso8601) < (now - ($days | tonumber) * 86400)) |
    .id' | while read session_id; do
    echo "Revoking $session_id..."
    curl -s -X DELETE "https://ztas.io/api/user/sessions?sessionId=$session_id" \
      -H "Authorization: Bearer $TOKEN"
  done
  echo "Done!"
fi
```

## Rate Limits

Session management endpoints have standard rate limits:
- **100 requests per minute** per user
- **1,000 requests per hour** per user

Excessive requests may temporarily lock your account for security reasons.

## Related Endpoints

- [Authentication](/docs/api/authentication/) - Log in and create sessions
- [Account](/docs/api/account/) - Manage account settings
- [Activity Log](/docs/api/activity-log/) - View security events
- [Two-Factor Authentication](/docs/api/2fa/) - Additional security layer
