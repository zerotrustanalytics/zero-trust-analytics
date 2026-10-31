# DRAFT — Privacy Policy (Zero Trust Analytics)

> **DRAFT for review — not legal advice.** Written to describe what the product
> actually does as of the October 2026 tracking changes (storage-free tracker,
> server-side sessions, retention purge). Have counsel review before publishing.
> Replace every `[BRACKETED]` placeholder. Replaces the current
> `hugo/content/privacy-policy.html`, which contains another company's policy.

_Last updated: [DATE]_

This policy explains what [LEGAL ENTITY NAME] ("ZTA", "we") collects when you
(a) visit a website that uses Zero Trust Analytics, or (b) use ztas.io and the
ZTA dashboard as a customer.

## 1. Visitors to websites that use ZTA

Website owners ("customers") add our script to their sites. For that data the
customer is the controller and we process it on their behalf.

**What the script does not do**
- It sets no cookies and writes nothing to your device (no localStorage,
  sessionStorage or similar).
- It does not collect names, email addresses, form contents, full URLs, page
  titles, or screen/device fingerprints.

**What is collected for each page view or event**
- The page path (the part of the URL after the domain), with any query string
  or fragment removed. Text that looks like an email address, phone number or
  IP address is redacted before storage.
- The referring website's domain (not the full referring URL).
- Campaign tags in the URL (`utm_source`, `utm_medium`, `utm_campaign`,
  `utm_content`, `utm_term`).
- Approximate location — country, region and city — derived from network
  information by our infrastructure provider (Cloudflare). We do not perform
  our own IP lookups.
- Device category (desktop/mobile/tablet), browser name and operating system
  name, derived from the browser's user-agent string. The user-agent string
  itself is not stored.
- Time spent on the page, and, where the website owner has configured them,
  named events (for example "signup") with an optional short label and number.

**How visitors are counted without identifying you**
Your IP address and user-agent are combined with a secret value that changes
every day and run through a one-way hash (SHA-256). We store only the hash. The
IP address is never stored. Because the daily value changes, the same visitor
produces an unrelated hash the next day, so visits cannot be linked across days.
Sessions are grouped from that hash and 30 minutes of inactivity.

**Error reports** (only if the website owner enables them): the page path,
referring domain, browser/OS category, and the error message and stack trace,
with email-, phone- and IP-like text redacted and lengths limited.

**Retention.** Individual event records are deleted after the retention period
of the website owner's plan (30 days to 2 years, or longer on plans that
include unlimited retention). Aggregate counts (for example "120 visitors on
1 May") are kept for as long as the website owner keeps the site in ZTA.

To exercise rights over this data, contact the website you visited — they
control it. We will assist them as their processor.

## 2. ZTA customers (dashboard users)

- **Account:** your email address and name, provided through our sign-in
  service.
- **Sites and settings:** the domains you register and your dashboard
  configuration (goals, rules, team members, API keys).
- **Billing:** handled by Stripe. We store your Stripe customer and subscription
  identifiers, not your card details.
- **Email:** we send transactional email (account, billing, usage alerts)
  through [Resend / SendGrid].
- **Usage of our own site:** [describe whether ZTA's own marketing site or
  dashboard runs ZTA analytics on itself; if so, the same section 1 applies].

We keep account data while your account is active and delete it [N] days after
you delete your account, except where we must keep records (for example
invoices) by law.

## 3. Service providers

| Provider | Purpose | Location |
|---|---|---|
| Cloudflare | Network edge, TLS, approximate location headers | [Global] |
| [Hosting provider / own hardware in JURISDICTION] | Application and database hosting | [JURISDICTION] |
| Netlify | Hosting of the ztas.io marketing site and script file | [US] |
| Stripe | Payments | [US] |
| [Resend / SendGrid] | Transactional email | [US] |

## 4. Your rights

Depending on where you live (for example under the GDPR or CCPA), you may have
the right to access, correct, delete or export your personal data, and to
object to or restrict processing. Customers can export and delete their data
from the dashboard. For anything else, contact us at [PRIVACY CONTACT EMAIL].
[If applicable: EU/UK representative details.]

We do not sell personal data, and we do not use visitor data for advertising.

## 5. Security

Data is transmitted over TLS. Access to production systems is restricted to
[who]. [Describe backups and their retention.]

## 6. Changes

We will post changes to this policy here and update the date above. Material
changes will be emailed to customers.

## 7. Contact

[LEGAL ENTITY NAME], [ADDRESS]. Email: [PRIVACY CONTACT EMAIL].

---

**Reviewer notes (delete before publishing)**
- GDPR: customers will need a Data Processing Agreement (DPA) with ZTA as
  processor; consider publishing one alongside this policy.
- City-level location is stored per event. If you want a stronger privacy
  claim, consider dropping city and keeping country/region only.
- Confirm where the SR8 server physically sits — that is the hosting
  jurisdiction for section 3.
- The homepage claims "GDPR compliant by design" and "No cookies". After these
  changes "No cookies" is accurate; "GDPR compliant" is a legal conclusion —
  counsel should confirm the wording.
