# DRAFT — Terms of Service (Zero Trust Analytics)

> **DRAFT for review — not legal advice.** A starting outline for counsel, not a
> finished contract. Replace every `[BRACKETED]` placeholder. Replaces the
> current `hugo/content/terms-of-use.html`, which contains another company's
> terms.

_Last updated: [DATE]_

These terms are an agreement between you and [LEGAL ENTITY NAME] ("ZTA", "we")
for use of the Zero Trust Analytics service, the ztas.io website, the dashboard
at app.ztas.io and the tracking script (together, the "Service").

## 1. Accounts
You must provide accurate account information and keep your sign-in secure.
You are responsible for activity under your account and your team members'
accounts.

## 2. Your sites and your data
- You may only add the tracking script to websites you own or are authorized to
  operate.
- You own the analytics data collected from your sites ("Customer Data"). We
  process it only to provide the Service, as described in our Privacy Policy
  [and Data Processing Agreement].
- You are responsible for any notice your website must give its visitors about
  analytics, and for not sending personal data to the Service through custom
  events, labels or URLs. The Service redacts common patterns but cannot
  guarantee it catches everything.

## 3. Plans, usage limits and retention
- Each plan includes a monthly event allowance (page views plus custom events),
  a number of sites, and a data-retention period, as shown on the pricing page.
- If you exceed your allowance, we may stop recording new events until the next
  month or until you upgrade. We will notify you as you approach the limit.
- Individual event records older than your plan's retention period are deleted;
  aggregate statistics remain available.

## 4. Fees and payment
Paid plans are billed in advance [monthly/annually] through Stripe. Fees are
non-refundable except [where required by law / as stated here]. We may change
prices with [30] days' notice; changes apply from your next billing period.

## 5. Acceptable use
You may not use the Service to: track people on sites you do not control;
attempt to identify individual visitors; send unlawful content; overload,
probe or attack the Service; or resell it without our written permission.

## 6. API
API access is subject to these terms and any published rate limits. Keep API
keys confidential.

## 7. Availability and changes
We aim for high availability but the Service is provided without a guaranteed
uptime [unless an SLA is agreed in writing]. We may change or discontinue
features with reasonable notice.

## 8. Termination
You can cancel at any time from the dashboard. We may suspend or terminate
accounts that breach these terms. After termination you may export your data
for [30] days, after which it is deleted.

## 9. Disclaimers
The Service is provided "as is" without warranties of any kind, to the extent
permitted by law.

## 10. Limitation of liability
To the extent permitted by law, ZTA's total liability is limited to the fees
you paid in the [12] months before the claim, and ZTA is not liable for
indirect or consequential damages.

## 11. Governing law
These terms are governed by the laws of [JURISDICTION], and disputes are
resolved in [VENUE].

## 12. Contact
[LEGAL ENTITY NAME], [ADDRESS]. Email: [CONTACT EMAIL].

---

**Reviewer notes (delete before publishing)**
- There is also a HIPAA page at `hugo/layouts/terms/hipaa.html` advertising
  plans ("Starter $50/month – 100K pageviews") that match neither the pricing
  page nor the app's configured limits. Review whether ZTA can make HIPAA
  claims at all (BAA, hosting, audit requirements) before keeping that page.
