---
title: "Privacy Policy"
description: "What Zero Trust Analytics collects, from whom, and how long we keep it."
layout: legal
zt: true
priority: 0.3
---

This policy explains what {{< param "legalName" >}} ("ZTA", "we") collects when you (a) visit a website that uses Zero Trust Analytics, or (b) use ztas.io and the ZTA dashboard as a customer.

## 1. Visitors to websites that use ZTA

Website owners ("customers") add our script to their sites. For that data the customer is the controller and we process it on their behalf.

**What the script does not do**

- It sets no cookies and writes nothing to your device (no localStorage, sessionStorage or similar).
- It does not collect names, email addresses, form contents, full URLs, page titles, or screen or device fingerprints.

**What is collected for each page view or event**

- The page path (the part of the URL after the domain), with any query string or fragment removed. Text that looks like an email address, phone number or IP address is redacted before storage.
- The referring website's domain (not the full referring URL).
- Campaign tags in the URL (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`).
- Approximate location (country, region and city) derived from network information by our infrastructure provider, Cloudflare. We do not perform our own IP lookups.
- Device category (desktop, mobile or tablet), browser name and operating system name, derived from the browser's user-agent string. The user-agent string itself is not stored.
- Time spent on the page, and, where the website owner has set them up, named events (for example "signup") with an optional short label and number.

**How visitors are counted without identifying you.** Your IP address and user-agent are combined with a secret value that changes every day and run through a one-way hash (SHA-256). We store only the hash; the IP address is never stored. Because the daily value changes, the same visitor produces an unrelated hash the next day, so visits cannot be linked across days. Sessions are grouped from that hash and 30 minutes of inactivity.

**Error reports** (only if the website owner enables them): the page path, referring domain, browser and operating system category, and the error message and stack trace, with email-, phone- and IP-like text redacted and lengths limited.

**Retention.** Individual event records are deleted after the retention period of the website owner's plan (30 days to 2 years, or unlimited on plans that include it). Aggregate counts (for example "120 visitors on 1 May") are kept for as long as the website owner keeps the site in ZTA.

To exercise rights over this data, contact the website you visited, since they control it. We will help them as their processor.

## 2. ZTA customers (dashboard users)

- **Account:** your email address, provided through our sign-in service (passkeys; we never handle a password).
- **Sites and settings:** the domains you register and your dashboard configuration (goals, rules, team members, API keys).
- **Billing:** handled by Stripe. We store your Stripe customer and subscription identifiers, not your card details.
- **Email:** we send transactional email (account, billing and usage alerts) through Resend.
- **Our own website:** ztas.io is counted with ZTA itself, so section 1 applies to your visits here.

We keep account data while your account is active and delete it when you delete your account, except records we must keep by law (such as invoices).

## 3. Service providers

| Provider | Purpose |
|---|---|
| Cloudflare | Network edge, TLS, approximate location headers, and hosting of ztas.io |
| Our own servers in {{< param "hostingLocation" >}} | Application and database hosting |
| Stripe | Payments |
| Resend | Transactional email |

## 4. Your rights

Depending on where you live (for example under the GDPR or CCPA), you may have the right to access, correct, delete or export your personal data, and to object to or restrict processing. Customers can export and delete their data from the dashboard. For anything else, [contact us](/contact/).

We do not sell personal data, and we do not use visitor data for advertising.

## 5. Security

Data is transmitted over TLS. Access to production systems is limited to the people who run ZTA.

## 6. Changes

We will post changes to this policy here and update the date above. Material changes will be emailed to customers.
