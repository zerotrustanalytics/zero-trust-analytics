---
title: "GDPR & CCPA Compliance"
description: "How Zero Trust Analytics helps you stay compliant"
weight: 22
priority: 0.7
---

## GDPR Compliance

The General Data Protection Regulation (GDPR) protects the personal data of EU residents. Here's how Zero Trust Analytics helps you comply:

### No Personal Data = No GDPR Concerns

GDPR applies to "personal data" - information that can identify an individual. Because we don't collect personal data, most GDPR requirements don't apply:

| GDPR Requirement | Our Status |
|-----------------|------------|
| Consent for data collection | **Not required** - no personal data collected |
| Cookie consent banner | **Not required** - we don't use cookies |
| Data subject access requests | **Not applicable** - no personal data to provide |
| Right to erasure | **Not applicable** - nothing personal to delete |
| Data portability | **Not applicable** - no personal data to export |
| Data Protection Impact Assessment | **Likely not required** - no high-risk processing |

### No Cookie Banner Needed

Under GDPR's ePrivacy Directive, consent is required for cookies that track users. Since we don't use cookies:

- No cookie consent popup needed
- No "Accept All" / "Reject All" buttons
- Better user experience
- Faster page loads

### What About IP Addresses?

IP addresses can be personal data under GDPR. Here's our approach:

1. **We receive the IP** (unavoidable with HTTP)
2. **We immediately hash it** with a daily-rotating salt
3. **We discard the raw IP** - it's never stored
4. **The hash cannot identify anyone** - it's a one-way function

This is similar to GDPR's "anonymization" concept. Once data is truly anonymized, GDPR no longer applies.

## CCPA Compliance

The California Consumer Privacy Act (CCPA) gives California residents rights over their "personal information."

### No Personal Information Collected

CCPA defines "personal information" broadly, but we don't collect any of it:

- No names, aliases, or identifiers
- No IP addresses (hashed and discarded)
- No biometric data
- No browsing history that identifies individuals
- No geolocation (beyond country/region from edge server)

### No Sale of Personal Information

CCPA's "Do Not Sell My Personal Information" requirement doesn't apply because:

1. We don't collect personal information
2. We don't sell any data to anyone
3. We don't share data with third parties

### Your Visitors' Rights

Under CCPA, consumers have rights to:
- Know what personal information is collected → We collect none
- Delete their personal information → There's nothing to delete
- Opt-out of sale → We don't sell anything
- Non-discrimination → Not applicable

## HIPAA Considerations

For healthcare organizations, HIPAA protects Protected Health Information (PHI).

### Why Google Analytics Is a HIPAA Risk

Google Analytics collects IP addresses and can link them to health-related website visits. This combination can constitute PHI, requiring:

- A Business Associate Agreement with Google
- HIPAA-compliant data handling
- Potential liability for breaches

### Why We're Different

Zero Trust Analytics doesn't collect PHI because:

- No IP addresses stored (only anonymous hashes)
- No cookies or persistent identifiers
- No way to link visits to individuals
- No third-party data sharing

**Note:** We're not providing legal advice. Consult your compliance team for your specific situation.

## Compliance Documentation

Need documentation for your compliance team? Here's what we can provide:

### Data Processing Agreement

Available for Business and Scale plans. Covers:

- Nature and purpose of processing
- Types of data processed
- Security measures
- Sub-processor list

### Security Documentation

- SOC 2 Type II report (available on request)
- Penetration test results
- Infrastructure security overview

### Privacy Assessment Support

We can provide:

- Technical documentation of our privacy model
- Data flow diagrams
- Answers to security questionnaires

Contact [support@ztas.io](mailto:support@ztas.io) for compliance documentation.

## Best Practices

Even with privacy-first analytics, we recommend:

1. **Update your privacy policy** - Mention that you use Zero Trust Analytics for website analytics without collecting personal data

2. **Be transparent** - Let visitors know you track aggregate statistics but not individuals

3. **Document your choices** - Keep records of why you chose privacy-first analytics

Example privacy policy text:

> *"We use Zero Trust Analytics for website analytics. This service does not use cookies, does not collect IP addresses, and does not track individual visitors. We only see aggregate statistics like total pageviews and general geographic regions."*
