---
title: "Authentication"
description: "How to authenticate with the Zero Trust Analytics API"
weight: 10
priority: 0.7
---

## Overview

There are two ways to authenticate, depending on who is calling:

| Caller | Credential | Works with |
|---|---|---|
| Your code, scripts and integrations | An **API key** (`zta_live_…`) | The [Stats API](/docs/api/stats-api/) |
| The ZTA dashboard | Your **gatekeep sign-in** (passkey) | The dashboard's own endpoints |

There is no username and password to send to the API: ZTA accounts sign in with a passkey through [gatekeep](https://gatekeepauth.com), and programs use API keys.

## API keys

### Create a key

1. In the dashboard, open **API Keys**.
2. Choose **Create API Key**, give it a name, and pick its permissions.
3. Copy the key. It is shown **once**; ZTA stores only a hash of it.

### Use a key

Send it as a Bearer token:

```bash
curl "https://app.ztas.io/api/stats-api?site_id=site_abc123&period=7d" \
  -H "Authorization: Bearer zta_live_your_key_here"
```

A key can read the sites owned by the account that created it, and nothing else.

### Revoke a key

Delete it on the **API Keys** page. Requests with a revoked key are refused straight away.

## The dashboard's endpoints

The other endpoints in this reference (sites, goals, teams, reports, …) are what the dashboard calls. They authenticate with the signed-in user's gatekeep ID token, which the dashboard sends as `Authorization: Bearer` on every request. They do not accept API keys yet; key access to them is planned.

## Error responses

### 401 Unauthorized

```json
{ "error": "Invalid or inactive API key" }
```

No credential was sent, or it is not valid (wrong, revoked or expired).

### 403 Forbidden

```json
{ "error": "Access denied. Site not found or unauthorized." }
```

The credential is valid, but the site does not belong to its account.

### 429 Too Many Requests

The Stats API allows **100 requests per minute per API key**. The response includes a `Retry-After` header with the seconds to wait.

## Best practices

1. **Keep keys server-side.** Never put an API key in browser code, a mobile app or a URL.
2. **One key per integration,** so you can revoke one without breaking the others.
3. **Use HTTPS.** The API is only served over HTTPS.
