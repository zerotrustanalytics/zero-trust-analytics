# Service Level Agreement (SLA)

**Version:** 1.0
**Effective Date:** 2024-12-20
**Classification:** Customer-Facing

## 1. Overview

This Service Level Agreement ("SLA") describes the service commitments for Zero Trust Analytics ("Service"). This SLA applies to all Enterprise plan customers.

## 2. Service Availability

### 2.1 Uptime Commitment

| Plan | Monthly Uptime Target | Maximum Downtime/Month |
|------|----------------------|------------------------|
| Pro | 99.5% | 3.6 hours |
| Enterprise | 99.9% | 43.2 minutes |

**Uptime Calculation:**
```
Uptime % = ((Total Minutes - Downtime Minutes) / Total Minutes) × 100
```

### 2.2 Exclusions

Downtime does not include:
- Scheduled maintenance (with 72-hour notice)
- Issues caused by customer actions or configurations
- Third-party service outages outside our control
- Force majeure events

### 2.3 Scheduled Maintenance Windows

- **Primary Window:** Sundays 02:00-06:00 UTC
- **Emergency Patches:** As needed with minimum 4-hour notice
- **Notification Method:** Email + Status Page

## 3. Service Response Times

### 3.1 Support Response Times

| Priority | Enterprise SLA | Pro SLA | Description |
|----------|---------------|---------|-------------|
| P1 - Critical | 15 minutes | 1 hour | Service completely unavailable |
| P2 - High | 1 hour | 4 hours | Major feature unavailable |
| P3 - Medium | 4 hours | 24 hours | Partial degradation |
| P4 - Low | 24 hours | 48 hours | Minor issues |

### 3.2 Resolution Targets

| Priority | Target Resolution | Maximum Resolution |
|----------|-------------------|-------------------|
| P1 | 4 hours | 8 hours |
| P2 | 8 hours | 24 hours |
| P3 | 24 hours | 72 hours |
| P4 | 72 hours | 1 week |

## 4. Performance Metrics

### 4.1 API Response Times

| Endpoint Category | Target P50 | Target P99 | Maximum |
|-------------------|------------|------------|---------|
| Authentication | 100ms | 500ms | 2s |
| Dashboard Data | 200ms | 1s | 5s |
| Analytics Ingest | 50ms | 200ms | 1s |
| Data Export | 500ms | 2s | 10s |

### 4.2 Tracking Script Performance

| Metric | Target | Maximum |
|--------|--------|---------|
| Script Load Time | <10ms | 50ms |
| Event Send Time | <20ms | 100ms |
| Script Size | <5KB | 10KB |

### 4.3 Data Processing

| Metric | Target |
|--------|--------|
| Event Ingestion | Real-time (<1 minute) |
| Dashboard Refresh | 5-minute intervals |
| Data Retention | Per plan limits |

## 5. Security Commitments

### 5.1 Security Standards

- **Encryption in Transit:** TLS 1.2+ required
- **Encryption at Rest:** AES-256 for stored data
- **Authentication:** JWT with configurable expiration
- **API Keys:** SHA-256 hashed storage

### 5.2 Security Response

| Issue Type | Response Time |
|------------|---------------|
| Critical Vulnerability | 4 hours |
| High Vulnerability | 24 hours |
| Medium Vulnerability | 72 hours |
| Low Vulnerability | 2 weeks |

### 5.3 Compliance

- GDPR Article 17 (Right to Erasure) - Available
- GDPR Article 20 (Data Portability) - Available
- Data Processing Agreement - Available on request

## 6. Support Channels

### 6.1 Enterprise Support

| Channel | Availability | Response Time |
|---------|--------------|---------------|
| Email (support@zta.io) | 24/7 | Per SLA |
| Priority Queue | 24/7 | 15 min (P1) |
| Phone (on request) | Business hours | Scheduled |
| Slack Connect | Business hours | 1 hour |

### 6.2 Pro Support

| Channel | Availability | Response Time |
|---------|--------------|---------------|
| Email (support@zta.io) | Business hours | Per SLA |
| Documentation | 24/7 | Self-service |

## 7. Service Credits

### 7.1 Credit Eligibility

Enterprise customers are eligible for service credits when uptime falls below the committed SLA:

| Monthly Uptime | Credit (% of Monthly Bill) |
|----------------|---------------------------|
| 99.0% - 99.9% | 10% |
| 95.0% - 99.0% | 25% |
| 90.0% - 95.0% | 50% |
| Below 90.0% | 100% |

### 7.2 Credit Request Process

1. Submit request within 30 days of incident
2. Include incident reference number
3. Credits applied to next billing cycle
4. Maximum credit: 100% of monthly fee

### 7.3 Credit Exclusions

Credits do not apply to:
- Incidents caused by customer actions
- Scheduled maintenance
- Beta features or preview releases
- Third-party integrations

## 8. Data Handling

### 8.1 Data Retention

| Plan | Analytics Data | Audit Logs | Backups |
|------|---------------|------------|---------|
| Pro | 12 months | 90 days | Daily |
| Enterprise | 24 months | 365 days | Continuous |

### 8.2 Data Export

- **Format:** JSON
- **Availability:** On-demand via API
- **Time to Complete:** <24 hours for full export

### 8.3 Data Deletion

- **Request Method:** API endpoint or support request
- **Time to Complete:** 30 days maximum
- **Confirmation:** Written confirmation provided

## 9. Change Management

### 9.1 Change Categories

| Type | Notice Period | Approval |
|------|---------------|----------|
| Emergency | ASAP | Post-implementation |
| Standard | 72 hours | Pre-implementation |
| Major | 2 weeks | Customer notification |
| Breaking | 90 days | Major version release |

### 9.2 API Versioning

- Current version supported for minimum 12 months
- Deprecated versions: 6-month sunset period
- Breaking changes only in major versions

## 10. Escalation Procedures

### 10.1 Customer Escalation Path

```
Level 1: Support Team (initial contact)
    ↓ (no resolution in SLA time)
Level 2: Support Manager
    ↓ (continued issues)
Level 3: Technical Director
    ↓ (critical business impact)
Level 4: Executive Team
```

### 10.2 Escalation Contacts

| Level | Contact | When to Use |
|-------|---------|-------------|
| 1 | support@zta.io | All initial requests |
| 2 | support-escalation@zta.io | SLA breach |
| 3 | technical@zta.io | Technical impasse |
| 4 | executive@zta.io | Business-critical |

## 11. Reporting

### 11.1 Monthly Reports (Enterprise)

- Uptime percentage
- Incident summary
- Response time metrics
- API performance metrics

### 11.2 Quarterly Business Reviews (Enterprise)

- SLA performance review
- Roadmap preview
- Feature requests review
- Security posture update

## 12. Amendments

- SLA changes require 30-day notice
- Material changes require customer acknowledgment
- Emergency security updates exempt from notice

---

**Contact Information:**

- **Support:** support@zta.io
- **Sales:** sales@zta.io
- **Security:** security@zta.io
- **Status Page:** status.zta.io

**Last Review:** 2024-12-20
**Next Review:** 2025-03-20
