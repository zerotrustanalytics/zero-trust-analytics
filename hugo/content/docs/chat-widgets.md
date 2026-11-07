---
title: "Chat Widgets"
description: "Measure a chat widget or on-page assistant without collecting what people type"
weight: 5
priority: 0.6
---

## Overview

Send events whose names start with `chat_` and your site gets a **Chat widget** report: how often the
chat is used, how often it understands people, and how fast it answers.

## Never send what people type

Messages to a chat can be deeply personal. Send labels you chose in advance, never the message itself.
ZTA redacts text that looks like an email address, phone number or IP address, but it can't recognize
everything private.

## Events

| Event | `category` | `label` | `value` |
|-------|------------|---------|---------|
| `chat_opened` | | | |
| `chat_model_load` | | `ready` or `failed` | Load time (ms) |
| `chat_model_answer` | Step in the conversation | `need`, `faq`, `crisis` or `no_answer` | Answer time (ms) |
| `chat_need_found` | `phrase` or `model` | The need | |
| `chat_not_understood` | Step in the conversation | | |
| `chat_results` | | `found` or `none` | Number of results |
| `chat_crisis_rule` | | | |

Only `chat_opened` is needed to get started. The report shows whatever it receives.

## Sending events

On sensitive sites, a page's address can reveal what someone needs. Report a fixed path so it isn't
attached to the event:

```javascript
zta.track('chat_model_answer', { category: 'need', label: 'faq', value: 240, path: '/chat' })
```

To avoid loading the script at all, call the [Track Endpoint](/docs/api/track/) directly from your
registered domain:

```javascript
fetch('https://app.ztas.io/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'omit',
  keepalive: true,
  body: JSON.stringify({ type: 'event', siteId: 'YOUR_SITE_ID', path: '/chat', action: 'chat_opened' })
})
```
