---
title: "Webhooks"
description: "Receive real-time event notifications via webhooks"
weight: 20
priority: 0.7
---

## Overview

Webhooks allow you to receive real-time HTTP notifications when events occur in your Zero Trust Analytics account. Instead of polling the API, webhooks push data to your server instantly when events happen.

**Common use cases:**

- Send notifications to Slack when traffic spikes
- Trigger automation workflows on goal completions
- Sync analytics data to your own database
- Monitor site health in real-time

## Endpoint

```
GET /api/webhooks
POST /api/webhooks
DELETE /api/webhooks
```

**Requires authentication.** See [Authentication](/docs/api/authentication/).

## List Webhooks

Get all webhooks configured for your account.

### Request

```bash
curl "https://ztas.io/api/webhooks?siteId=site_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID to list webhooks for |

### Response

```json
{
  "webhooks": [
    {
      "id": "wh_abc123",
      "url": "https://your-server.com/webhook",
      "events": ["pageview", "event", "goal"],
      "secret": "whsec_xyz789",
      "active": true,
      "createdAt": "2024-12-01T10:00:00.000Z",
      "lastTriggered": "2024-12-12T15:30:00.000Z"
    }
  ]
}
```

## Create Webhook

Register a new webhook endpoint to receive event notifications.

### Request

```bash
curl -X POST "https://ztas.io/api/webhooks" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "url": "https://your-server.com/webhook",
    "events": ["pageview", "event", "goal"],
    "description": "Production webhook for analytics events"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site ID for the webhook |
| `url` | string | Yes | HTTPS URL to receive webhook POSTs |
| `events` | array | Yes | Array of event types to subscribe to |
| `description` | string | No | Optional description for the webhook |

### Event Types

Subscribe to one or more event types:

| Event | Description |
|-------|-------------|
| `pageview` | Triggered on each pageview |
| `event` | Triggered on custom events |
| `goal` | Triggered when a goal is completed |
| `alert` | Triggered when an alert fires |
| `session_end` | Triggered when a session ends |

### Response

```json
{
  "webhook": {
    "id": "wh_abc123",
    "url": "https://your-server.com/webhook",
    "events": ["pageview", "event", "goal"],
    "secret": "whsec_xyz789",
    "active": true,
    "createdAt": "2024-12-12T16:00:00.000Z"
  }
}
```

**Important:** Save the `secret` value - you'll need it to verify webhook signatures. It's only shown once during creation.

## Delete Webhook

Remove a webhook endpoint.

### Request

```bash
curl -X DELETE "https://ztas.io/api/webhooks?id=wh_abc123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Webhook ID to delete |

### Response

```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

## Webhook Payload

When events occur, Zero Trust Analytics sends an HTTP POST request to your webhook URL with the following structure:

### Headers

```
Content-Type: application/json
X-ZTA-Signature: sha256=abc123...
X-ZTA-Event: pageview
X-ZTA-Webhook-ID: wh_abc123
```

### Pageview Event

```json
{
  "event": "pageview",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "path": "/blog/my-article",
    "referrer": "https://google.com",
    "country": "US",
    "device": "desktop",
    "browser": "Chrome"
  }
}
```

### Custom Event

```json
{
  "event": "event",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "action": "signup_click",
    "category": "conversion",
    "label": "hero_button",
    "value": 1,
    "path": "/pricing"
  }
}
```

### Goal Completion

```json
{
  "event": "goal",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "goalId": "goal_abc123",
    "goalName": "Newsletter Signup",
    "path": "/thank-you",
    "value": 1
  }
}
```

### Alert Trigger

```json
{
  "event": "alert",
  "timestamp": "2024-12-12T16:30:00.000Z",
  "data": {
    "siteId": "site_abc123",
    "alertId": "alert_abc123",
    "alertName": "Traffic Spike",
    "condition": "pageviews > 1000",
    "currentValue": 1543,
    "threshold": 1000
  }
}
```

## Verifying Webhook Signatures

Always verify webhook signatures to ensure requests are from Zero Trust Analytics and haven't been tampered with.

### Signature Format

The `X-ZTA-Signature` header contains an HMAC-SHA256 hash:

```
sha256=abc123def456...
```

### Verification Code

#### Node.js

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = 'sha256=' +
    crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js example
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-zta-signature'];
  const secret = 'whsec_xyz789'; // Your webhook secret

  if (!verifyWebhook(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  // Process the webhook
  console.log('Event:', req.body.event);
  res.status(200).send('OK');
});
```

#### Python

```python
import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    expected_signature = 'sha256=' + hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)

# Flask example
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-ZTA-Signature')
    secret = 'whsec_xyz789'  # Your webhook secret

    if not verify_webhook(request.data.decode(), signature, secret):
        return 'Invalid signature', 401

    # Process the webhook
    data = request.json
    print(f"Event: {data['event']}")
    return 'OK', 200
```

## Best Practices

### 1. Return 200 Quickly

Respond with HTTP 200 within 5 seconds to avoid timeouts. Process webhooks asynchronously:

```javascript
app.post('/webhook', async (req, res) => {
  // Return 200 immediately
  res.status(200).send('OK');

  // Process asynchronously
  processWebhook(req.body).catch(console.error);
});
```

### 2. Handle Retries

Webhooks are retried up to 3 times with exponential backoff if your endpoint fails. Make your webhook handler idempotent to handle duplicate events:

```javascript
const processedEvents = new Set();

async function processWebhook(payload) {
  const eventId = `${payload.event}-${payload.timestamp}`;

  if (processedEvents.has(eventId)) {
    console.log('Event already processed:', eventId);
    return;
  }

  // Process the event
  await doSomething(payload);

  processedEvents.add(eventId);
}
```

### 3. Use HTTPS

Webhook URLs must use HTTPS. Self-signed certificates are not supported.

### 4. Monitor Webhook Health

Check the `lastTriggered` field to ensure your webhooks are receiving events. If a webhook fails repeatedly, it will be automatically disabled.

## Testing Webhooks

Use a service like [webhook.site](https://webhook.site) to test webhook delivery without writing code:

1. Go to webhook.site and copy your unique URL
2. Create a webhook with that URL
3. Trigger events in your site
4. View the webhook payloads in real-time

## Retry Behavior

| Attempt | Delay | Status Codes Retried |
|---------|-------|---------------------|
| 1 | Immediate | 5xx, timeout |
| 2 | 5 seconds | 5xx, timeout |
| 3 | 25 seconds | 5xx, timeout |

After 3 failed attempts, the webhook delivery is marked as failed. You can view failed deliveries in the [Activity Log](/docs/api/activity-log/).

## Error Responses

### 400 Bad Request

```json
{
  "error": "URL must use HTTPS"
}
```

```json
{
  "error": "Invalid event type: invalid_event"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```

You don't own this site.

### 404 Not Found

```json
{
  "error": "Webhook not found"
}
```

## Webhook Limits

- Maximum 10 webhooks per site
- Maximum 5 event types per webhook
- Payload size limited to 1MB
- Request timeout: 5 seconds

## Security Considerations

1. **Always verify signatures** - Don't trust unverified webhook requests
2. **Use HTTPS** - Encrypt webhook payloads in transit
3. **Protect your secret** - Store webhook secrets securely (environment variables, secret managers)
4. **Rate limit** - Implement rate limiting on your webhook endpoint to prevent abuse
5. **Log everything** - Keep logs of webhook deliveries for debugging

## Example: Slack Notifications

Send a Slack message when traffic spikes:

```javascript
app.post('/webhook', express.json(), async (req, res) => {
  res.status(200).send('OK');

  if (req.body.event === 'alert') {
    const { alertName, currentValue, threshold } = req.body.data;

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Alert: ${alertName}`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${alertName}*\nCurrent: ${currentValue}\nThreshold: ${threshold}`
          }
        }]
      })
    });
  }
});
```
