---
title: "Analytics for healthcare"
PageTitle: "Analytics for healthcare websites · Zero Trust Analytics"
description: "Why ZTA's design keeps patient-identifying data out of your analytics: no IP addresses, no cookies, no query strings."
heading: "Analytics that can't tell who your patients are."
eyebrow: "Healthcare"
layout: article
zt: true
cta: "Questions about your practice's setup?"
priority: 0.8
---

Many analytics tools record IP addresses, set cookies and capture full URLs. On a healthcare website, that combination can link a person to the conditions or services they looked at. ZTA is built so that link never forms in the first place.

> This page explains how ZTA handles data. It is not legal advice; whether your use of any tool meets HIPAA's requirements is a question for your compliance advisor.

## What ZTA never stores

- **IP addresses.** A visitor's IP and browser are combined with a secret that changes every day and run through a one-way hash. Only the hash is kept, and it can't be reversed.
- **Cookies or device storage.** The script writes nothing to the visitor's device.
- **Query strings and fragments.** Everything after `?` or `#` in a URL is removed before storage, and text that looks like an email address, phone number or IP address is redacted from paths.
- **Names, emails or form contents.** The script never reads form fields.
- **Fingerprints.** No canvas, font, WebGL or audio fingerprinting.

## What a stored visit looks like

```json
{
  "event_type": "pageview",
  "page_path": "/services/physical-therapy",
  "referrer_domain": "google.com",
  "country": "US", "region": "TX", "city": "Austin",
  "device": "mobile", "browser": "safari", "os": "ios",
  "visitor": "8f3a…c21e"
}
```

The `visitor` value is the daily hash. It groups one person's visits within a single day so you can see sessions and unique visitors, and it changes the next day, so visits can't be linked across days or across websites.

## Keep identifying details out of URLs

ZTA removes query strings and redacts obvious identifiers, but it can't recognise every name. If your site puts patient names or record numbers in URL paths (for example `/patients/jane-doe`), change those URLs, or exclude those pages from tracking. See [Data collected](/docs/data-collected/) and [Tracking script](/docs/tracking-script/) for how.

## Retention and deletion

Individual events are deleted after your plan's retention period; daily totals stay for your charts. You can export or delete your site's data from the dashboard at any time.
