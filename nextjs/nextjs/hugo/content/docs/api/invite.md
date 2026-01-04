---
title: "Invite"
description: "Accept and manage team invitations"
weight: 33
priority: 0.7
---

## Overview

The Invite API allows users to view and respond to team invitations. When a team owner or admin invites you to join their team, you'll receive an email with an invitation link. Use this API to view invitation details, accept, or decline the invitation.

**Invitation flow:**

1. **Invitation sent** - Team owner/admin sends invitation (see [Teams](/docs/api/teams/))
2. **Email received** - You receive invitation email with unique token
3. **View details** - Preview invitation details before accepting
4. **Accept or decline** - Join the team or decline the invitation

## Endpoints

```
GET /api/invite
POST /api/invite
```

**Note:** `GET /api/invite` does not require authentication. `POST /api/invite` requires authentication.

## Get Invitation Details

View invitation details before accepting (public endpoint).

### Request

```bash
curl "https://ztas.io/api/invite?token=inv_abc123xyz"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Invitation token from email link |

### Response

```json
{
  "invite": {
    "email": "newmember@example.com",
    "role": "member",
    "expiresAt": "2024-12-19T16:00:00.000Z"
  },
  "team": {
    "name": "Acme Analytics Team"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `invite.email` | string | Email address the invitation was sent to |
| `invite.role` | string | Assigned role: `admin`, `member`, or `viewer` |
| `invite.expiresAt` | string | Invitation expiration date (ISO 8601) |
| `team.name` | string | Name of the team you're invited to |

**Note:** Invitation tokens expire after 7 days. Expired invitations cannot be accepted.

## Accept Invitation

Accept a team invitation and join the team.

### Request

```bash
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "inv_abc123xyz"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Invitation token from email |

**Authentication required:** You must be logged in to accept an invitation. The invitation must be sent to your account's email address.

### Response

```json
{
  "success": true,
  "message": "Invite accepted",
  "team": {
    "id": "team_abc123",
    "name": "Acme Analytics Team",
    "role": "member",
    "siteCount": 5
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always true on success |
| `message` | string | Success message |
| `team.id` | string | Team ID |
| `team.name` | string | Team name |
| `team.role` | string | Your role in the team |
| `team.siteCount` | number | Number of sites the team has access to |

## Decline Invitation

Decline a team invitation without joining.

### Request

```bash
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "inv_abc123xyz",
    "action": "decline"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Invitation token from email |
| `action` | string | Yes | Must be `"decline"` |

### Response

```json
{
  "success": true,
  "message": "Invite declined"
}
```

**Note:** Declining an invitation removes it permanently. The team owner/admin will need to send a new invitation if you change your mind.

## Invitation Lifecycle

### 1. Invitation Created

A team owner or admin invites you:

```bash
# (Performed by team owner/admin)
curl -X POST "https://ztas.io/api/teams" \
  -H "Authorization: Bearer OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "email": "newmember@example.com",
    "role": "member"
  }'
```

### 2. Email Notification

You receive an email with:
- Who invited you
- Team name
- Your assigned role
- Invitation link with unique token
- Expiration date (7 days)

### 3. Preview Invitation

Click the link to preview details:

```bash
curl "https://ztas.io/api/invite?token=inv_abc123xyz"
```

### 4. Accept or Decline

Make your decision:

```bash
# Accept
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "inv_abc123xyz"
  }'

# OR Decline
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "inv_abc123xyz",
    "action": "decline"
  }'
```

### 5. Invitation Resolved

Once accepted or declined, the invitation is removed and cannot be used again.

## Email Matching

The invitation must be accepted by the user whose email matches the invitation:

**Example:**

```bash
# Invitation sent to: alice@example.com
# Must be accepted by user logged in as: alice@example.com

# This will succeed:
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer TOKEN_FOR_alice@example.com" \
  -d '{"token": "inv_123"}'

# This will fail:
curl -X POST "https://ztas.io/api/invite" \
  -H "Authorization: Bearer TOKEN_FOR_bob@example.com" \
  -d '{"token": "inv_123"}'
# Error: "This invitation is for a different email address"
```

## New User Flow

If you don't have an account yet:

1. Click invitation link
2. You'll be prompted to create an account
3. Create account with the **same email** the invitation was sent to
4. Automatically redirected to accept invitation
5. Join team immediately

## Error Responses

### 400 Bad Request

```json
{
  "error": "Token required"
}
```

Missing invitation token.

```json
{
  "error": "This invitation is for a different email address"
}
```

The logged-in user's email doesn't match the invitation email.

```json
{
  "error": "Invitation has already been accepted"
}
```

This invitation was already used.

```json
{
  "error": "Invitation has expired"
}
```

The invitation is more than 7 days old.

### 404 Not Found

```json
{
  "error": "Invalid or expired invite"
}
```

The invitation token doesn't exist or has been deleted.

### 500 Internal Server Error

```json
{
  "error": "Failed to get invite"
}
```

```json
{
  "error": "Failed to process invite"
}
```

## Team Roles

When accepting an invitation, you'll be assigned one of these roles:

### Viewer

Read-only access:
- View analytics data
- View existing reports and dashboards
- Cannot create or modify anything
- Cannot export data

### Member

Standard team member:
- View all analytics data
- Create and share reports
- Create custom dashboards
- Export data
- Cannot modify site settings

### Admin

Team administrator:
- All member permissions
- Manage site settings
- Invite/remove members and viewers
- Create/edit goals, funnels, and alerts
- Manage API keys and webhooks
- Cannot delete the site or manage billing

See [Teams](/docs/api/teams/) for complete role permissions.

## Example: Invitation Workflow

Complete example showing the full workflow:

```bash
#!/bin/bash

# Step 1: User receives email and extracts token
TOKEN="inv_abc123xyz"

# Step 2: Preview invitation details
echo "Fetching invitation details..."
invite=$(curl -s "https://ztas.io/api/invite?token=$TOKEN")

echo "Invitation details:"
echo "$invite" | jq '.'

# Show team name and role
team_name=$(echo "$invite" | jq -r '.team.name')
role=$(echo "$invite" | jq -r '.invite.role')
expires=$(echo "$invite" | jq -r '.invite.expiresAt')

echo ""
echo "You've been invited to: $team_name"
echo "Role: $role"
echo "Expires: $expires"

# Step 3: User logs in (or creates account)
# Assume we have auth token: YOUR_TOKEN

# Step 4: Accept invitation
echo ""
read -p "Accept invitation? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Accepting invitation..."
  result=$(curl -s -X POST "https://ztas.io/api/invite" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"token\": \"$TOKEN\"}")

  echo "$result" | jq '.'

  # Check if successful
  success=$(echo "$result" | jq -r '.success')
  if [ "$success" = "true" ]; then
    echo "Successfully joined the team!"
  else
    echo "Failed to accept invitation"
  fi
else
  echo "Declining invitation..."
  result=$(curl -s -X POST "https://ztas.io/api/invite" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"token\": \"$TOKEN\", \"action\": \"decline\"}")

  echo "$result" | jq '.'
fi
```

## Invitation Security

### Token Security

- Invitation tokens are single-use
- Tokens expire after 7 days
- Tokens are cryptographically secure random strings
- Cannot be guessed or enumerated

### Email Verification

- Invitations are tied to specific email addresses
- Must accept with matching email account
- Prevents token sharing or unauthorized access

### Audit Trail

All invitation actions are logged:

```bash
curl "https://ztas.io/api/activity-log?type=team" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Logged events:
- `invitation.sent`
- `invitation.viewed`
- `invitation.accepted`
- `invitation.declined`
- `invitation.expired`

## Resending Invitations

If an invitation expires, the team owner/admin can send a new one:

```bash
curl -X POST "https://ztas.io/api/teams" \
  -H "Authorization: Bearer OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "email": "newmember@example.com",
    "role": "member"
  }'
```

This generates a new invitation token and sends a new email.

## Best Practices

### 1. Check Expiration

Always check the expiration date before attempting to accept:

```javascript
async function checkInvitation(token) {
  const response = await fetch(`https://ztas.io/api/invite?token=${token}`);
  const data = await response.json();

  const expiresAt = new Date(data.invite.expiresAt);
  const now = new Date();

  if (now > expiresAt) {
    console.log('This invitation has expired. Please request a new one.');
    return false;
  }

  console.log(`Invitation expires in ${Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))} days`);
  return true;
}
```

### 2. Verify Email Match

Ensure you're logged in with the correct email:

```javascript
async function verifyEmailMatch(inviteToken, authToken) {
  // Get invitation details
  const inviteRes = await fetch(`https://ztas.io/api/invite?token=${inviteToken}`);
  const inviteData = await inviteRes.json();

  // Get current user
  const userRes = await fetch('https://ztas.io/api/user/status', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const userData = await userRes.json();

  if (inviteData.invite.email !== userData.email) {
    console.log('This invitation is for a different email address');
    console.log(`Invited: ${inviteData.invite.email}`);
    console.log(`Current: ${userData.email}`);
    return false;
  }

  return true;
}
```

### 3. Handle Errors Gracefully

Provide clear feedback on errors:

```javascript
async function acceptInvitation(token, authToken) {
  try {
    const response = await fetch('https://ztas.io/api/invite', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`Success! Joined ${data.team.name} as ${data.team.role}`);
      return true;
    } else {
      console.error(`Error: ${data.error}`);
      return false;
    }
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    return false;
  }
}
```

## Related Endpoints

- [Teams](/docs/api/teams/) - Manage team members (for owners/admins)
- [Account](/docs/api/account/) - View your account status
- [Activity Log](/docs/api/activity-log/) - View team activity
- [Authentication](/docs/api/authentication/) - Create account and log in
