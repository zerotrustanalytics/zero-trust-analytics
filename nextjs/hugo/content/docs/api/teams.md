---
title: "Teams"
description: "Manage team members and collaborate on analytics"
weight: 21
priority: 0.7
---

## Overview

The Teams API allows you to invite team members, manage access permissions, and collaborate on your analytics sites. Team members can view analytics data, manage sites, and configure settings based on their role.

**Roles:**

- **Owner** - Full access, can delete sites and manage billing
- **Admin** - Can manage sites, invite members, and configure settings
- **Member** - Can view analytics and create reports
- **Viewer** - Read-only access to analytics data

## Endpoints

```
GET /api/teams
POST /api/teams
DELETE /api/teams
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Team Members

Get all team members with access to a site.

### Request

```bash
curl "https://ztas.io/api/teams?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list team members for |

### Response

```json
{
  "members": [
    {
      "id": "user_abc123",
      "email": "owner@example.com",
      "name": "Alice Johnson",
      "role": "owner",
      "avatar": "https://gravatar.com/avatar/abc123",
      "joinedAt": "2024-01-15T10:00:00.000Z",
      "lastActive": "2024-12-12T15:30:00.000Z"
    },
    {
      "id": "user_def456",
      "email": "admin@example.com",
      "name": "Bob Smith",
      "role": "admin",
      "avatar": "https://gravatar.com/avatar/def456",
      "joinedAt": "2024-03-20T14:00:00.000Z",
      "lastActive": "2024-12-11T09:15:00.000Z"
    },
    {
      "id": "invite_xyz789",
      "email": "newmember@example.com",
      "role": "member",
      "status": "pending",
      "invitedAt": "2024-12-10T16:00:00.000Z",
      "invitedBy": "user_abc123"
    }
  ]
}
```

## Invite Team Member

Send an invitation to a new team member.

### Request

```bash
curl -X POST "https://ztas.io/api/teams" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "email": "newmember@example.com",
    "role": "member",
    "message": "Join our analytics team!"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to invite member to |
| `email` | string | Yes | Email address of the invitee |
| `role` | string | Yes | Role: `admin`, `member`, or `viewer` |
| `message` | string | No | Optional personal message to include in the invitation email |

**Note:** Only owners and admins can invite team members. You cannot invite someone with the `owner` role.

### Response

```json
{
  "invitation": {
    "id": "invite_xyz789",
    "email": "newmember@example.com",
    "role": "member",
    "status": "pending",
    "invitedAt": "2024-12-12T16:00:00.000Z",
    "expiresAt": "2024-12-19T16:00:00.000Z",
    "inviteUrl": "https://ztas.io/accept-invite?token=abc123"
  }
}
```

The invitee will receive an email with a link to accept the invitation. Invitations expire after 7 days.

## Remove Team Member

Remove a team member or cancel a pending invitation.

### Request

```bash
curl -X DELETE "https://ztas.io/api/teams?siteId=site_abc123&userId=user_def456" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `userId` | string | Yes | User ID or invitation ID to remove |

**Note:** Only owners and admins can remove team members. You cannot remove the site owner.

### Response

```json
{
  "success": true,
  "message": "Team member removed successfully"
}
```

## Update Team Member Role

Change a team member's role.

### Request

```bash
curl -X PATCH "https://ztas.io/api/teams" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "userId": "user_def456",
    "role": "admin"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID |
| `userId` | string | Yes | User ID to update |
| `role` | string | Yes | New role: `admin`, `member`, or `viewer` |

**Note:** Only owners can change roles. You cannot change the owner's role.

### Response

```json
{
  "member": {
    "id": "user_def456",
    "email": "admin@example.com",
    "role": "admin",
    "updatedAt": "2024-12-12T16:00:00.000Z"
  }
}
```

## Permission Levels

### Owner

- Full access to all features
- Can delete the site
- Can manage billing and subscriptions
- Can transfer ownership
- Can invite/remove any team member
- Can change team member roles

### Admin

- Can manage site settings
- Can invite/remove members and viewers
- Can create/edit goals, funnels, and alerts
- Can manage API keys and webhooks
- Cannot delete the site
- Cannot manage billing

### Member

- Can view all analytics data
- Can create and share reports
- Can create custom dashboards
- Can export data
- Cannot modify site settings
- Cannot invite team members

### Viewer

- Read-only access to analytics data
- Can view existing reports and dashboards
- Cannot create or modify anything
- Cannot export data

## Invitation Flow

### 1. Send Invitation

An owner or admin sends an invitation:

```bash
POST /api/teams
{
  "siteId": "site_abc123",
  "email": "newmember@example.com",
  "role": "member"
}
```

### 2. Email Sent

The invitee receives an email with:

- Who invited them
- Which site they're invited to
- Their assigned role
- A link to accept the invitation

### 3. Accept Invitation

The invitee clicks the link and creates an account (if new) or logs in (if existing). Once accepted, they gain access to the site.

### 4. Invitation Expires

Invitations expire after 7 days. You can resend an invitation by inviting the same email again.

## Example: List All Teams

Get all sites where you're a team member:

```bash
curl "https://ztas.io/api/teams" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**

```json
{
  "sites": [
    {
      "siteId": "site_abc123",
      "siteName": "example.com",
      "role": "owner",
      "memberCount": 5
    },
    {
      "siteId": "site_def456",
      "siteName": "blog.example.com",
      "role": "admin",
      "memberCount": 3
    }
  ]
}
```

## Audit Trail

All team management actions are logged in the [Activity Log](/docs/api/activity-log/):

- Team member invited
- Invitation accepted
- Invitation declined
- Team member removed
- Role changed

```bash
curl "https://ztas.io/api/activity-log?siteId=site_abc123&type=team" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Email address is required"
}
```

```json
{
  "error": "Invalid role. Must be: admin, member, or viewer"
}
```

```json
{
  "error": "User is already a team member"
}
```

### 403 Forbidden

```json
{
  "error": "Only owners and admins can invite team members"
}
```

```json
{
  "error": "Cannot remove the site owner"
}
```

```json
{
  "error": "Cannot change the owner's role"
}
```

### 404 Not Found

```json
{
  "error": "Site not found"
}
```

```json
{
  "error": "Team member not found"
}
```

## Rate Limits

Team invitation endpoints have stricter rate limits to prevent spam:

- **10 invitations per hour** per user
- **50 invitations per day** per site

## Best Practices

### 1. Use Appropriate Roles

Assign the minimum role necessary for each team member:

- **Viewers** for stakeholders who need to see metrics
- **Members** for analysts who create reports
- **Admins** for team leads who manage settings
- **Owner** for the account holder only

### 2. Regularly Audit Team Members

Remove team members who no longer need access:

```bash
# List all members
curl "https://ztas.io/api/teams?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Remove inactive members
curl -X DELETE "https://ztas.io/api/teams?siteId=site_abc123&userId=user_xyz" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Monitor Team Activity

Check the activity log for suspicious team member actions:

```bash
curl "https://ztas.io/api/activity-log?siteId=site_abc123&type=team&period=7d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Resend Expired Invitations

If an invitation expires, simply send a new one to the same email:

```bash
curl -X POST "https://ztas.io/api/teams" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "email": "newmember@example.com",
    "role": "member"
  }'
```

## Transfer Ownership

To transfer site ownership to another team member, contact support at support@ztas.io. Ownership transfers require:

1. The new owner must already be a team member
2. Email confirmation from both parties
3. Billing information update

## Team Member Limits

| Plan | Max Team Members |
|------|------------------|
| Free | 1 (owner only) |
| Pro | 5 |
| Business | 20 |
| Enterprise | Unlimited |

## Webhooks

Subscribe to team events via [Webhooks](/docs/api/webhooks/):

```javascript
{
  "event": "team.member_added",
  "data": {
    "siteId": "site_abc123",
    "userId": "user_xyz789",
    "email": "newmember@example.com",
    "role": "member",
    "invitedBy": "user_abc123"
  }
}
```

Available events:
- `team.member_added`
- `team.member_removed`
- `team.role_changed`
- `team.invitation_sent`
