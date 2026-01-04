# Disaster Recovery Plan

**Version:** 1.0
**Last Updated:** 2024-12-20
**Classification:** Internal
**Owner:** CTO / Infrastructure Team

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Recovery Objectives](#2-recovery-objectives)
3. [Critical Services Classification](#3-critical-services-classification)
4. [Backup Procedures](#4-backup-procedures)
5. [Disaster Scenarios](#5-disaster-scenarios)
6. [Recovery Procedures](#6-recovery-procedures)
7. [Communication Plan](#7-communication-plan)
8. [Testing & Maintenance](#8-testing--maintenance)
9. [Appendices](#9-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This Disaster Recovery (DR) Plan defines the procedures, responsibilities, and resources required to recover Zero Trust Analytics (ZTA) operations in the event of a catastrophic failure or disaster. It ensures business continuity, data protection, and rapid service restoration.

### 1.2 Scope

This plan covers:
- Complete infrastructure failures
- Database corruption or loss
- Security breaches requiring system reset
- Third-party vendor outages (Netlify, Turso, Stripe)
- Data center failures
- Natural disasters affecting operations

### 1.3 Key Metrics

| Metric | Target | Definition |
|--------|--------|------------|
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable downtime |
| **RPO** (Recovery Point Objective) | 24 hours | Maximum acceptable data loss |
| **Service Restoration** | 2 hours | Time to restore critical services |
| **Full Recovery** | 4 hours | Time to restore all services |

---

## 2. Recovery Objectives

### 2.1 Recovery Time Objective (RTO)

**Target: 4 hours maximum downtime**

| Service Tier | RTO | Description |
|--------------|-----|-------------|
| Critical | 2 hours | Analytics tracking, API endpoints |
| High Priority | 4 hours | Dashboard, authentication, reporting |
| Standard | 8 hours | Marketing site, documentation |
| Low Priority | 24 hours | Admin tools, analytics reports |

### 2.2 Recovery Point Objective (RPO)

**Target: Maximum 24 hours of data loss**

| Data Type | RPO | Backup Frequency |
|-----------|-----|------------------|
| Analytics Events | 1 hour | Continuous (streaming) |
| User Accounts | 24 hours | Daily snapshots |
| Site Configurations | 24 hours | Daily snapshots |
| Application Code | 0 (No loss) | Git version control |
| Configuration Files | 24 hours | Daily snapshots |

### 2.3 Recovery Priorities

**Restoration Order (Critical Path):**

```
1. Database Infrastructure (Turso)
   ↓
2. Authentication Services (JWT validation)
   ↓
3. Analytics Tracking API (/api/track)
   ↓
4. Dashboard & API (/api/stats, /api/sites)
   ↓
5. Marketing Site & Documentation
   ↓
6. Payment Processing (Stripe)
   ↓
7. Email Services (Password Reset)
```

---

## 3. Critical Services Classification

### 3.1 Critical Services (Tier 1)

**Must be restored within 2 hours**

| Service | Description | Dependencies | Business Impact |
|---------|-------------|--------------|-----------------|
| `/api/track` | Analytics event ingestion | Turso DB | 100% - Core product function |
| `/api/stats` | Real-time analytics retrieval | Turso DB, Auth | 90% - Customer cannot view data |
| Turso Database | Primary data store | Turso infrastructure | 100% - Complete service failure |
| Authentication | JWT-based auth system | JWT_SECRET, Turso DB | 90% - No dashboard access |

### 3.2 High Priority Services (Tier 2)

**Must be restored within 4 hours**

| Service | Description | Dependencies | Business Impact |
|---------|-------------|--------------|-----------------|
| `/api/sites/*` | Site management APIs | Auth, Turso DB | 70% - Cannot add/edit sites |
| Dashboard UI | Customer analytics interface | Netlify CDN, APIs | 80% - Cannot access analytics |
| `/api/auth/*` | Login, registration, password reset | Turso DB, Email services | 70% - New users cannot sign up |
| Netlify Functions | Serverless API infrastructure | Netlify platform | 100% - All APIs unavailable |

### 3.3 Standard Services (Tier 3)

**Must be restored within 8 hours**

| Service | Description | Dependencies | Business Impact |
|---------|-------------|--------------|-----------------|
| Marketing Site | Public-facing website | Netlify CDN, Hugo build | 30% - Cannot acquire new users |
| Documentation | API docs, integration guides | Netlify CDN | 20% - Integration difficulties |
| Email Services | Transactional emails | Resend/SendGrid | 40% - Password reset unavailable |

### 3.4 Non-Critical Services (Tier 4)

**Must be restored within 24 hours**

| Service | Description | Dependencies | Business Impact |
|---------|-------------|--------------|-----------------|
| Stripe Billing | Subscription management | Stripe platform | 20% - New subscriptions affected |
| Analytics Reports | Historical exports | Turso DB | 10% - Historical data access |
| Admin Tools | Internal management tools | Auth, Turso DB | 5% - Internal operations only |

---

## 4. Backup Procedures

### 4.1 Database Backup Strategy (Turso)

#### 4.1.1 Automated Backups

**Turso Native Backups:**

```bash
# Turso provides automatic point-in-time recovery (PITR)
# Retention: 24 hours for free tier, 30 days for paid tier

# Create manual backup snapshot
turso db shell <database-name> ".backup /tmp/backup-$(date +%Y%m%d-%H%M%S).db"

# Upload to backup storage
aws s3 cp /tmp/backup-*.db s3://zta-backups/database/
```

**Backup Schedule:**

| Frequency | Retention | Storage Location | Automation |
|-----------|-----------|------------------|------------|
| Continuous | 24 hours | Turso PITR | Automatic |
| Daily | 30 days | S3 Bucket | Cron job |
| Weekly | 90 days | S3 Glacier | Cron job |
| Monthly | 1 year | S3 Glacier Deep Archive | Cron job |

#### 4.1.2 Backup Verification

**Daily Verification Checklist:**

- [ ] Verify backup completion logs
- [ ] Check backup file size (should match database size ±10%)
- [ ] Test restore to staging environment (weekly)
- [ ] Validate data integrity checksums

**Automated Verification Script:**

```bash
#!/bin/bash
# Location: /scripts/verify-backups.sh

BACKUP_DIR="/backups/daily"
LATEST_BACKUP=$(ls -t $BACKUP_DIR/*.db | head -n1)

# Check file exists and is recent (< 25 hours old)
if [ ! -f "$LATEST_BACKUP" ] || [ $(find "$LATEST_BACKUP" -mmin +1500 | wc -l) -gt 0 ]; then
    echo "ERROR: No recent backup found" | mail -s "BACKUP ALERT" ops@zta.io
    exit 1
fi

# Verify database integrity
sqlite3 "$LATEST_BACKUP" "PRAGMA integrity_check;" | grep -q "ok"
if [ $? -eq 0 ]; then
    echo "Backup verification successful: $LATEST_BACKUP"
else
    echo "ERROR: Backup integrity check failed" | mail -s "BACKUP ALERT" ops@zta.io
    exit 1
fi
```

**Schedule:** Daily at 02:00 UTC via cron

### 4.2 Configuration Backup

#### 4.2.1 Environment Variables

**Backup Procedure:**

```bash
# Export all environment variables (redacted)
# Store in encrypted vault (AWS Secrets Manager / 1Password)

# Critical secrets to backup:
- JWT_SECRET
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- HASH_SECRET
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY / SENDGRID_API_KEY
```

**Backup Locations:**

1. **Primary:** AWS Secrets Manager (encrypted)
2. **Secondary:** 1Password Enterprise Vault (offline)
3. **Tertiary:** Encrypted USB drive (physical security)

**Backup Schedule:** After any configuration change, minimum weekly

#### 4.2.2 Netlify Configuration

**Files to Backup:**

```bash
# Configuration files
netlify.toml
package.json
package-lock.json

# Build configurations
build.js
hugo/config.toml

# Function dependencies
netlify/functions/package.json
netlify/functions/package-lock.json
```

**Backup Method:** Git version control + daily snapshot to S3

### 4.3 Code Repository Backup

#### 4.3.1 Primary Repository (GitHub)

**Protection:**

- Branch protection rules on `main` and `production`
- Required pull request reviews
- Status checks required before merge
- Signed commits enforced

#### 4.3.2 Mirror Repositories

**Backup Locations:**

| Location | Update Frequency | Purpose |
|----------|------------------|---------|
| GitLab Mirror | Hourly sync | Redundant Git hosting |
| S3 Versioned Bucket | Daily | Archive storage |
| Local Archive | Weekly | Offline backup |

**Sync Script:**

```bash
#!/bin/bash
# Location: /scripts/sync-git-mirrors.sh

REPO_URL="https://github.com/jasonsutter87/zero-trust-analytics.git"
MIRROR_GITLAB="git@gitlab.com:zta/zero-trust-analytics.git"

# Create bare clone
git clone --mirror $REPO_URL /tmp/zta-mirror
cd /tmp/zta-mirror

# Push to GitLab mirror
git push --mirror $MIRROR_GITLAB

# Archive to S3
tar -czf zta-repo-$(date +%Y%m%d).tar.gz .
aws s3 cp zta-repo-*.tar.gz s3://zta-backups/repository/

# Cleanup
rm -rf /tmp/zta-mirror zta-repo-*.tar.gz
```

**Schedule:** Daily at 01:00 UTC

### 4.4 Analytics Data Export

#### 4.4.1 Incremental Exports

**Daily Export Procedure:**

```sql
-- Export yesterday's analytics events
-- Location: /scripts/export-analytics.sql

.mode csv
.output /backups/analytics/events-$(date +%Y%m%d).csv

SELECT
    event_id,
    site_id,
    visitor_hash,
    page_path,
    referrer,
    timestamp,
    user_agent,
    custom_data
FROM pageviews
WHERE DATE(timestamp) = DATE('now', '-1 day');

.output stdout
```

**Automation:**

```bash
#!/bin/bash
# Location: /scripts/export-daily-analytics.sh

EXPORT_DIR="/backups/analytics"
DATE=$(date +%Y%m%d)

turso db shell <database-name> < /scripts/export-analytics.sql

# Compress and upload to S3
gzip "$EXPORT_DIR/events-$DATE.csv"
aws s3 cp "$EXPORT_DIR/events-$DATE.csv.gz" s3://zta-backups/analytics/

# Cleanup local files older than 7 days
find $EXPORT_DIR -name "*.csv.gz" -mtime +7 -delete
```

**Schedule:** Daily at 03:00 UTC

---

## 5. Disaster Scenarios

### 5.1 Scenario 1: Complete Infrastructure Failure

**Description:** Total Netlify platform outage affecting all functions and hosting.

#### 5.1.1 Detection Indicators

- All Netlify endpoints returning 503/504 errors
- Netlify status page shows major outage
- Health check endpoints unreachable
- Customer reports of complete unavailability

#### 5.1.2 Impact Assessment

| Component | Impact | Mitigation |
|-----------|--------|------------|
| Analytics Tracking | 100% - No data collection | Deploy to alternate platform |
| Dashboard | 100% - Inaccessible | Redirect to backup hosting |
| API Functions | 100% - Unavailable | Activate backup functions |
| Marketing Site | 100% - Offline | Deploy static cache |

**Estimated Downtime:** 2-4 hours
**Data Loss Risk:** Low (Turso database unaffected)

#### 5.1.3 Pre-Disaster Preparation

**Prerequisites:**

- [ ] Maintain active Vercel account (alternate deployment target)
- [ ] Pre-configured deployment pipeline to Vercel
- [ ] DNS failover automation configured
- [ ] Regular testing of alternate deployment (quarterly)

**Alternate Infrastructure:**

```yaml
# Vercel deployment configuration
# Location: vercel.json

{
  "version": 2,
  "builds": [
    {
      "src": "netlify/functions/**/*.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/netlify/functions/$1"
    }
  ],
  "env": {
    "JWT_SECRET": "@jwt-secret",
    "TURSO_DATABASE_URL": "@turso-url",
    "TURSO_AUTH_TOKEN": "@turso-token"
  }
}
```

#### 5.1.4 Recovery Procedure

**Recovery Checklist:**

```markdown
## Phase 1: Assessment (0-15 minutes)
- [ ] Confirm Netlify outage via status page
- [ ] Verify scope (all regions vs. specific regions)
- [ ] Check Netlify's ETA for restoration
- [ ] Activate DR team via Slack #disaster-recovery
- [ ] Post initial status update to customers

## Phase 2: Failover Decision (15-30 minutes)
- [ ] If ETA > 2 hours, proceed with failover
- [ ] If ETA < 2 hours, monitor and standby
- [ ] Get approval from Incident Commander
- [ ] Notify team of failover decision

## Phase 3: Deploy to Vercel (30-90 minutes)
- [ ] Retrieve latest code from GitHub
- [ ] Update environment variables in Vercel dashboard
- [ ] Deploy functions: `vercel --prod`
- [ ] Verify deployment health checks
- [ ] Test critical endpoints (auth, track, stats)

## Phase 4: DNS Cutover (90-120 minutes)
- [ ] Update DNS CNAME: zerotrustanalytics.com → vercel.app
- [ ] Monitor DNS propagation (15-60 min)
- [ ] Update analytics.js CDN URL if needed
- [ ] Verify traffic routing to new infrastructure

## Phase 5: Validation (120-150 minutes)
- [ ] Test complete user journey (register → add site → track)
- [ ] Verify database connectivity
- [ ] Check error rates in Vercel logs
- [ ] Monitor performance metrics
- [ ] Update status page: "Migrated to backup infrastructure"

## Phase 6: Monitoring (Ongoing)
- [ ] 24/7 monitoring of alternate infrastructure
- [ ] Hourly checks of Netlify status
- [ ] Plan cutback when Netlify restored
```

**Estimated Recovery Time:** 2.5 hours

#### 5.1.5 Rollback Procedure

**When Netlify Restores:**

```markdown
## Cutback Checklist (Netlify Restored)
- [ ] Verify Netlify full functionality (2+ hours stable)
- [ ] Deploy latest code to Netlify
- [ ] Run smoke tests on Netlify deployment
- [ ] Update DNS CNAME back to Netlify
- [ ] Monitor traffic migration
- [ ] Verify no errors in Netlify functions
- [ ] Deactivate Vercel deployment (keep as standby)
- [ ] Post-incident review within 48 hours
```

---

### 5.2 Scenario 2: Database Corruption/Loss

**Description:** Turso database corruption, data loss, or complete database unavailability.

#### 5.2.1 Detection Indicators

- Database queries returning errors
- Data integrity check failures
- Turso status page alerts
- Duplicate or missing records
- Application errors: "Database connection failed"

#### 5.2.2 Impact Assessment

| Data Type | Impact | Recovery Method |
|-----------|--------|-----------------|
| Analytics Events | Critical | Restore from PITR or daily backup |
| User Accounts | Critical | Restore from daily backup |
| Site Configs | High | Restore from daily backup |
| Session Tokens | Low | Users must re-authenticate |

**Estimated Downtime:** 1-3 hours
**Data Loss:** Up to 24 hours (depending on last backup)

#### 5.2.3 Recovery Procedure

**Recovery Checklist:**

```markdown
## Phase 1: Damage Assessment (0-15 minutes)
- [ ] Identify scope of corruption (full vs. partial)
- [ ] Check Turso status page for platform issues
- [ ] Verify most recent backup timestamp
- [ ] Calculate potential data loss window (current time - backup time)
- [ ] Enable maintenance mode on application

## Phase 2: Database Recovery (15-60 minutes)

### Option A: Point-in-Time Recovery (Turso PITR)
- [ ] Identify last known good timestamp
- [ ] Contact Turso support for PITR assistance
- [ ] Request restore to specific point in time
- [ ] Wait for Turso to complete restore
- [ ] Verify database integrity

### Option B: Manual Backup Restore
- [ ] Identify latest verified backup file
- [ ] Create new Turso database instance
- [ ] Restore from backup file:
      ```bash
      turso db create zta-recovery
      turso db shell zta-recovery < /backups/daily/backup-YYYYMMDD.db
      ```
- [ ] Verify row counts match expected values
- [ ] Run integrity checks: `PRAGMA integrity_check;`

## Phase 3: Data Reconciliation (60-120 minutes)
- [ ] Compare restored data with pre-corruption snapshot
- [ ] Identify any data loss gap
- [ ] Check if incremental exports can fill gap
- [ ] Merge incremental data if available
- [ ] Validate critical user accounts exist

## Phase 4: Application Cutover (120-150 minutes)
- [ ] Update TURSO_DATABASE_URL environment variable
- [ ] Deploy updated configuration to Netlify
- [ ] Restart all function instances
- [ ] Test database connectivity
- [ ] Verify read/write operations

## Phase 5: Validation (150-180 minutes)
- [ ] Run full test suite against restored database
- [ ] Verify user login functionality
- [ ] Test analytics tracking end-to-end
- [ ] Check data consistency (no duplicate IDs)
- [ ] Disable maintenance mode
- [ ] Monitor error rates for 2 hours

## Phase 6: Communication
- [ ] Notify affected users of data loss window (if any)
- [ ] Update status page: "Database restored"
- [ ] Document data loss impact for post-mortem
```

**Estimated Recovery Time:** 3 hours

#### 5.2.4 Data Loss Mitigation

**If data loss occurred (e.g., 12 hours of analytics):**

```markdown
## Data Recovery from Alternate Sources
- [ ] Check Netlify function logs for raw tracking requests
- [ ] Parse logs to extract pageview events
- [ ] Replay events into restored database
- [ ] Mark replayed data with flag: `is_replayed=true`
- [ ] Notify customers of partial data reconstruction
```

**Log Parsing Script:**

```bash
#!/bin/bash
# Extract tracking events from Netlify logs

netlify functions:logs track --since "12 hours ago" > /tmp/logs.txt

# Parse JSON events
grep -o '"siteId":"[^"]*"' /tmp/logs.txt | \
  # Convert to INSERT statements
  awk '{print "INSERT INTO pageviews (...) VALUES (" $0 ");"}' > /tmp/replay.sql

# Execute replay
turso db shell zta-recovery < /tmp/replay.sql
```

---

### 5.3 Scenario 3: Security Breach Requiring Full Reset

**Description:** Complete compromise of secrets (JWT_SECRET, database credentials) requiring full system reset.

#### 5.3.1 Detection Indicators

- Unauthorized database access detected
- JWT secret exposed in logs/public repository
- Mass unauthorized account access
- Unusual API traffic patterns (credential stuffing)
- Security scanner alerts on exposed secrets

#### 5.3.2 Impact Assessment

| Component | Impact | Required Action |
|-----------|--------|-----------------|
| All User Sessions | 100% - Invalidated | Force logout all users |
| JWT Tokens | 100% - Compromised | Rotate JWT_SECRET |
| Database Access | 100% - Exposed | Rotate Turso credentials |
| API Endpoints | High Risk | Rate limiting, IP blocking |

**Estimated Downtime:** 2-4 hours
**Data Loss:** None (security rotation only)

#### 5.3.3 Recovery Procedure

**Recovery Checklist:**

```markdown
## Phase 1: Immediate Containment (0-15 minutes)
- [ ] Enable maintenance mode immediately
- [ ] Revoke all Turso auth tokens
- [ ] Rotate JWT_SECRET to new random value
- [ ] Block suspicious IPs at Netlify level
- [ ] Disable OAuth integrations (GitHub, Google)
- [ ] Alert all users via email: "Security incident - please reset password"

## Phase 2: Credential Rotation (15-60 minutes)

### Generate New Secrets
```bash
# Generate new JWT secret
NEW_JWT_SECRET=$(openssl rand -hex 64)

# Generate new hash secret
NEW_HASH_SECRET=$(openssl rand -hex 64)

# Create new Turso auth token
turso db tokens create zta-production --expiration none
```

### Update Environment Variables
- [ ] Netlify: Update JWT_SECRET, HASH_SECRET
- [ ] Netlify: Update TURSO_AUTH_TOKEN
- [ ] Vercel (backup): Update all secrets
- [ ] 1Password: Document new secrets with timestamps
- [ ] AWS Secrets Manager: Update all keys

## Phase 3: Database Security Reset (60-120 minutes)
- [ ] Audit all database access logs
- [ ] Identify unauthorized queries (if any)
- [ ] Reset all user passwords via database:
      ```sql
      UPDATE users SET
        password_hash = NULL,
        must_reset_password = 1,
        password_reset_token = randomblob(32);
      ```
- [ ] Invalidate all MFA tokens:
      ```sql
      UPDATE users SET mfa_secret = NULL;
      ```
- [ ] Delete all active sessions:
      ```sql
      DELETE FROM sessions;
      ```

## Phase 4: Application Redeployment (120-150 minutes)
- [ ] Deploy updated environment variables to Netlify
- [ ] Restart all Netlify functions
- [ ] Clear Netlify CDN cache
- [ ] Verify new JWT_SECRET working
- [ ] Test user registration with new secrets
- [ ] Test login flow (should fail with old password)

## Phase 5: User Communication (150-180 minutes)
- [ ] Send password reset emails to ALL users
- [ ] Post incident notice on status page
- [ ] Prepare FAQ document for support
- [ ] Update security documentation
- [ ] Offer extended support hours

## Phase 6: Security Audit (Ongoing)
- [ ] Full code review for other exposed secrets
- [ ] Scan public GitHub commits for leaked keys
- [ ] Review access logs for unauthorized access
- [ ] Implement secret scanning in CI/CD
- [ ] Schedule external security audit
```

**Estimated Recovery Time:** 3 hours

#### 5.3.4 User Password Reset Procedure

**Email Template:**

```
Subject: URGENT: Security Notice - Password Reset Required

Dear Zero Trust Analytics User,

We have detected a security incident that may have compromised
authentication credentials. Out of an abundance of caution, we
have reset all user passwords.

REQUIRED ACTION:
1. Click the link below to set a new password
2. Choose a strong, unique password
3. Re-enable two-factor authentication (if previously enabled)

Password Reset Link: https://zerotrustanalytics.com/reset/[TOKEN]

This link expires in 24 hours.

What Happened:
[Brief, transparent explanation of the incident]

What We've Done:
- Rotated all system credentials
- Forced password reset for all accounts
- Enhanced monitoring and security controls
- Engaged third-party security audit

We apologize for the inconvenience and thank you for your
understanding.

Security Team
security@zta.io
```

---

### 5.4 Scenario 4: Vendor Outage (Netlify, Turso, Stripe)

**Description:** Extended outage of critical third-party services.

#### 5.4.1 Netlify Outage

**See Scenario 5.1** - Covered in complete infrastructure failure

**Key Actions:**
- Failover to Vercel within 2 hours
- DNS cutover to alternate infrastructure
- Maintain service continuity

#### 5.4.2 Turso Database Outage

**Detection:**
- All database queries timeout
- Turso status page reports outage
- `TURSO_DATABASE_URL` unreachable

**Recovery Procedure:**

```markdown
## Turso Outage Response

### Option A: Wait for Turso Restore (ETA < 2 hours)
- [ ] Enable maintenance mode
- [ ] Display status message: "Analytics temporarily unavailable"
- [ ] Cache dashboard data from last successful load
- [ ] Queue analytics events in Netlify Blobs for later processing
- [ ] Monitor Turso status page

### Option B: Failover to Backup Database (ETA > 2 hours)
- [ ] Restore latest backup to temporary SQLite database
- [ ] Deploy SQLite database to Netlify Edge Functions
- [ ] Update connection code to use local database
- [ ] Enable read-only mode (no writes until Turso restored)
- [ ] Display notice: "Running on backup database"

### Event Queuing Script (for write operations during outage)
```javascript
// Location: netlify/functions/track.js

async function queueEventDuringOutage(event) {
  const { store } = await import('@netlify/blobs');
  const eventQueue = store('event-queue');

  const queueKey = `event-${Date.now()}-${Math.random()}`;
  await eventQueue.set(queueKey, JSON.stringify(event));

  return { queued: true, key: queueKey };
}
```

### When Turso Restores:
- [ ] Verify Turso connectivity
- [ ] Process queued events from Netlify Blobs
- [ ] Cutover traffic back to Turso
- [ ] Validate data consistency
```

**Estimated Recovery Time:** 1-2 hours (queuing mode) or 2-4 hours (backup database)

#### 5.4.3 Stripe Outage

**Detection:**
- Subscription creation failures
- Webhook delivery failures
- Stripe dashboard unreachable

**Impact:** New subscriptions and billing operations affected. Existing service continues.

**Recovery Procedure:**

```markdown
## Stripe Outage Response

### Immediate Actions (0-30 minutes)
- [ ] Verify Stripe status page
- [ ] Disable "Upgrade" buttons in dashboard
- [ ] Display notice: "Payment processing temporarily unavailable"
- [ ] Log failed payment attempts to database
- [ ] Queue subscription requests for later processing

### Temporary Workaround (30-120 minutes)
- [ ] Enable "Request Invoice" option for urgent upgrades
- [ ] Manual billing via PayPal/wire transfer
- [ ] Track manual payments in spreadsheet
- [ ] Grant temporary access pending payment confirmation

### When Stripe Restores
- [ ] Process queued subscription requests
- [ ] Reconcile manual payments
- [ ] Re-enable automatic billing
- [ ] Send confirmation emails to queued users
```

**Estimated Recovery Time:** 0 hours (degraded functionality, core service unaffected)

---

## 6. Recovery Procedures

### 6.1 Service Restoration Order

**Critical Path (must follow this sequence):**

```
┌─────────────────────────────────────────────┐
│ 1. Database Connectivity (Turso)            │ [30 min]
│    - Verify database accessible             │
│    - Test read/write operations             │
│    - Validate data integrity                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Core API Functions                       │ [30 min]
│    - Deploy /api/track                      │
│    - Deploy /api/auth/login                 │
│    - Test authentication flow               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Analytics Retrieval                      │ [30 min]
│    - Deploy /api/stats                      │
│    - Deploy /api/sites                      │
│    - Verify dashboard data loads            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Dashboard UI                             │ [30 min]
│    - Deploy static assets                   │
│    - Test complete user flow                │
│    - Verify charts render correctly         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. Secondary Services                       │ [60 min]
│    - Marketing site                         │
│    - Documentation                          │
│    - Email services                         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 6. Billing & Admin                          │ [60 min]
│    - Stripe integration                     │
│    - Admin panels                           │
│    - Reporting tools                        │
└─────────────────────────────────────────────┘
```

**Total Time to Full Recovery:** 4 hours (worst case)

### 6.2 Validation Checklist

**After each service restoration, validate:**

```markdown
## Service Validation Checklist

### Database (Turso)
- [ ] Connection test: `turso db shell <db-name> "SELECT 1"`
- [ ] Row count verification: `SELECT COUNT(*) FROM pageviews;`
- [ ] Integrity check: `PRAGMA integrity_check;`
- [ ] Write test: Insert and read back test record
- [ ] Performance: Query response time < 100ms

### Analytics Tracking (/api/track)
- [ ] POST request accepts valid payload
- [ ] Returns 200 OK status
- [ ] Event appears in database within 1 minute
- [ ] Visitor hash generated correctly
- [ ] Rate limiting functional

### Authentication (/api/auth/*)
- [ ] Login with valid credentials succeeds
- [ ] JWT token generated and validated
- [ ] Invalid credentials rejected
- [ ] Password reset email sends
- [ ] Session persistence works

### Dashboard UI
- [ ] Dashboard loads without errors
- [ ] Charts render with real data
- [ ] Navigation works (all pages accessible)
- [ ] JavaScript console has no errors
- [ ] Mobile responsive view functional

### Full User Journey
- [ ] New user registration
- [ ] Email verification (if enabled)
- [ ] Login with new account
- [ ] Add new site
- [ ] Generate analytics tracking code
- [ ] Embed code on test page
- [ ] Verify pageview tracked
- [ ] View stats in dashboard
```

**Validation must pass 100% before declaring service restored.**

### 6.3 Rollback Criteria

**Abort recovery and rollback if:**

- Data integrity checks fail
- Error rate > 5% after 30 minutes
- Critical functionality unavailable
- Security vulnerability introduced
- Performance degradation > 50%

**Rollback Procedure:**

```bash
# Immediate rollback steps
1. Revert DNS to previous state
2. Redeploy previous working version from Git tag
3. Restore database from pre-recovery snapshot
4. Re-enable maintenance mode
5. Escalate to senior engineering team
```

---

## 7. Communication Plan

### 7.1 Communication Protocols

#### 7.1.1 Internal Communication

**Primary Channel:** Slack #disaster-recovery

**Escalation Chain:**

```
Initial Alert → On-Call Engineer
     ↓ (10 min)
Senior Engineer + CTO
     ↓ (30 min for P1)
Full Engineering Team
     ↓ (60 min for critical)
CEO + External Consultants
```

**Status Update Frequency:**

| Severity | Update Frequency | Channels |
|----------|------------------|----------|
| Critical (P1) | Every 15 minutes | Slack, Email, SMS |
| High (P2) | Every 30 minutes | Slack, Email |
| Medium (P3) | Every 60 minutes | Slack |

#### 7.1.2 External Communication

**Status Page:** https://status.zerotrustanalytics.com

**Customer Notification Channels:**

1. **Status Page** - Real-time updates
2. **Email** - Sent to all users for P1/P2 incidents
3. **Twitter/X** - @ZeroTrustAnalytics
4. **In-App Banner** - Displayed in dashboard

**Communication Templates:**

**Initial Incident Notice:**

```
Subject: Service Disruption - Zero Trust Analytics

We are currently experiencing a service disruption affecting
[affected services]. Our engineering team is actively working
to restore full functionality.

Impact: [brief description]
Current Status: Investigating
Next Update: [timestamp]

You can monitor real-time updates at:
https://status.zerotrustanalytics.com

We apologize for the inconvenience.
```

**Progress Update:**

```
UPDATE: We have identified the root cause and are implementing
a fix. Expected restoration time: [ETA]

What we know:
- [Finding 1]
- [Finding 2]

What we're doing:
- [Action 1]
- [Action 2]

Next update: [timestamp]
```

**Resolution Notice:**

```
RESOLVED: All services have been restored.

Incident Summary:
- Duration: [start] to [end] ([total time])
- Root Cause: [brief explanation]
- Impact: [what was affected]

Data Impact: [None / Describe any data loss]

Actions Taken:
- [Action 1]
- [Action 2]

We are conducting a full post-mortem and will share our
findings within 72 hours.

Thank you for your patience.
```

### 7.2 Stakeholder Matrix

| Stakeholder | Notification Trigger | Method | SLA |
|-------------|---------------------|--------|-----|
| Customers (All) | P1, P2 incidents | Email, Status Page | 30 min |
| Enterprise Customers | All incidents | Email, Phone | 15 min |
| Board/Investors | P1 incidents > 2 hours | Email, Call | 60 min |
| Payment Providers | Billing system issues | Email | 2 hours |
| Regulatory Bodies | Data breach | Formal notice | 72 hours (GDPR) |

### 7.3 Post-Incident Communication

**Post-Mortem Report (Published within 72 hours):**

```markdown
# Incident Post-Mortem: [Title]

**Incident ID:** INC-YYYYMMDD-XXX
**Date:** [Date]
**Duration:** [X hours Y minutes]
**Impact:** [Description]

## What Happened
[Chronological narrative of the incident]

## Root Cause
[Technical explanation of what caused the incident]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | [Event] |

## Resolution
[What was done to fix it]

## Impact
- **Users Affected:** [Number/Percentage]
- **Data Lost:** [None/Description]
- **Financial Impact:** [If applicable]

## What Went Well
- [Item 1]
- [Item 2]

## What Could Be Improved
- [Item 1]
- [Item 2]

## Action Items
| ID | Description | Owner | Due Date | Status |
|----|-------------|-------|----------|--------|
| 1 | [Action] | [Name] | [Date] | Open |

## Prevention
[How we're preventing this from happening again]
```

---

## 8. Testing & Maintenance

### 8.1 DR Testing Schedule

#### 8.1.1 Quarterly DR Tests (Mandatory)

**Schedule:** Last Friday of each quarter (Jan, Apr, Jul, Oct)

**Test Scope:**

| Quarter | Test Focus | Scenario |
|---------|------------|----------|
| Q1 | Database Recovery | Restore from backup, validate data |
| Q2 | Infrastructure Failover | Deploy to Vercel, DNS cutover |
| Q3 | Security Incident | Rotate all secrets, force password reset |
| Q4 | Full DR Simulation | Combined scenario, full team participation |

#### 8.1.2 Test Procedures

**Pre-Test Checklist:**

```markdown
## 2 Weeks Before Test
- [ ] Schedule test date/time (avoid business-critical periods)
- [ ] Notify team of upcoming test
- [ ] Prepare test environment (staging/sandbox)
- [ ] Review test plan with team
- [ ] Assign roles (Incident Commander, Technical Lead, etc.)

## 1 Week Before Test
- [ ] Confirm participant availability
- [ ] Prepare test scenario document
- [ ] Set up monitoring/observation tools
- [ ] Brief stakeholders (internal only, customers not affected)

## Day of Test
- [ ] Morning: Final team briefing
- [ ] Start time: Begin scenario simulation
- [ ] Document all actions in real-time
- [ ] Time each phase of recovery
- [ ] Note any deviations from plan

## Post-Test (Within 48 hours)
- [ ] Debrief meeting with all participants
- [ ] Document lessons learned
- [ ] Update DR plan based on findings
- [ ] Create action items for improvements
- [ ] Schedule follow-up review in 30 days
```

**Test Execution Template:**

```markdown
# DR Test Execution Log

**Test Date:** [Date]
**Test Type:** [Quarterly/Annual/Ad-hoc]
**Scenario:** [Description]
**Participants:** [Names and roles]

## Test Timeline
| Time | Event | Notes |
|------|-------|-------|
| T+0 | Scenario initiated | |
| T+X | [Action] | |

## Success Criteria
- [ ] RTO met (< 4 hours)
- [ ] RPO met (< 24 hours data loss)
- [ ] All critical services restored
- [ ] Data integrity validated
- [ ] Communication plan executed

## Issues Encountered
1. [Issue description] - Severity: [High/Med/Low]
2. [Issue description] - Severity: [High/Med/Low]

## Action Items
| ID | Description | Owner | Due Date |
|----|-------------|-------|----------|
| 1 | [Action] | [Name] | [Date] |

## Test Result: [PASS / FAIL / PARTIAL]

**Signature:** _______________  **Date:** ___________
```

### 8.2 Maintenance Activities

#### 8.2.1 Weekly Maintenance

**Every Monday at 09:00 UTC:**

```markdown
## Weekly DR Maintenance Checklist
- [ ] Verify last 7 days of backups completed successfully
- [ ] Check backup file sizes for anomalies
- [ ] Test restore of most recent backup to staging
- [ ] Verify secret rotation logs (no expiring secrets)
- [ ] Review incident log for patterns
- [ ] Update DR contact list if needed
- [ ] Check Netlify/Turso/Stripe status history
```

#### 8.2.2 Monthly Maintenance

**First Monday of each month:**

```markdown
## Monthly DR Maintenance Checklist
- [ ] Full backup integrity verification (random sampling)
- [ ] Test alternate infrastructure deployment (Vercel)
- [ ] Review and update environment variables documentation
- [ ] Audit access to backup storage (S3, 1Password)
- [ ] Test emergency contact list (send test message)
- [ ] Review DR plan for outdated information
- [ ] Check vendor SLA compliance (uptime reports)
- [ ] Update runbook with any new procedures discovered
```

#### 8.2.3 Annual Maintenance

**Every January:**

```markdown
## Annual DR Maintenance Checklist
- [ ] Full DR plan review and update
- [ ] Tabletop exercise with entire team
- [ ] External audit of DR procedures (optional)
- [ ] Review and renew backup storage retention policies
- [ ] Update vendor contact information
- [ ] Review insurance coverage for data loss/business interruption
- [ ] Validate compliance with regulatory requirements (GDPR, etc.)
- [ ] Benchmark RTO/RPO against industry standards
- [ ] Train new team members on DR procedures
```

### 8.3 Documentation Updates

**Trigger for Updates:**

- After any DR test (pass or fail)
- After any actual disaster recovery event
- When infrastructure changes (new vendors, architecture updates)
- When team changes (new Incident Commander, etc.)
- Regulatory requirement changes
- At least annually (even if no changes)

**Update Procedure:**

```markdown
## DR Plan Update Process
1. Create Git branch: `dr-plan-update-YYYYMMDD`
2. Make necessary changes to docs/DISASTER_RECOVERY.md
3. Document reason for update in commit message
4. Create pull request with detailed description
5. Require approval from: CTO + 1 Senior Engineer
6. Update version number and last updated date
7. Notify team of changes via Slack/email
8. Archive previous version in /docs/archive/
```

**Version Control:**

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-12-20 | Initial version | CTO |
| | | | |

---

## 9. Appendices

### 9.1 Appendix A: Contact Information

#### Critical Contacts

| Role | Name | Email | Phone | Hours |
|------|------|-------|-------|-------|
| CTO | [Name] | cto@zta.io | +1-XXX-XXX-XXXX | 24/7 |
| CEO | [Name] | ceo@zta.io | +1-XXX-XXX-XXXX | Business hours |
| Senior Engineer | [Name] | engineer@zta.io | +1-XXX-XXX-XXXX | On-call rotation |
| DevOps Lead | [Name] | devops@zta.io | +1-XXX-XXX-XXXX | Business hours |

#### Vendor Support

| Vendor | Support Email | Phone | Portal | SLA |
|--------|---------------|-------|--------|-----|
| Netlify | support@netlify.com | N/A | https://app.netlify.com/support | Business tier: 1 hour |
| Turso | support@turso.tech | N/A | https://turso.tech/support | Best effort |
| Stripe | https://support.stripe.com | N/A | Dashboard | 24/7 for critical |
| AWS (S3) | aws-support | N/A | Console | Depends on plan |
| Resend | support@resend.com | N/A | Dashboard | Email only |
| SendGrid | support@sendgrid.com | N/A | Dashboard | Email only |

#### Emergency Services

| Service | Contact | When to Call |
|---------|---------|--------------|
| Legal Counsel | legal@firm.com | Data breach, regulatory issues |
| PR/Communications | pr@agency.com | Public incidents, media inquiries |
| Cybersecurity Firm | security@firm.com | Security breaches, forensics |
| Data Recovery Specialist | recovery@firm.com | Hardware failure, data loss |

### 9.2 Appendix B: Environment Variables Reference

**Critical Secrets (Must be backed up securely):**

```bash
# Authentication
JWT_SECRET=[64-character hex string]
JWT_EXPIRY=7d

# Database
TURSO_DATABASE_URL=libsql://[db-name]-[org].turso.io
TURSO_AUTH_TOKEN=[auth-token]

# Security
HASH_SECRET=[64-character hex string]

# Payment
STRIPE_SECRET_KEY=sk_live_[key]
STRIPE_WEBHOOK_SECRET=whsec_[secret]
STRIPE_PRICE_ID=price_[id]

# Email
RESEND_API_KEY=re_[key]
SENDGRID_API_KEY=SG.[key]
FROM_EMAIL=noreply@zerotrustanalytics.com

# Optional - OAuth
GITHUB_CLIENT_ID=[id]
GITHUB_CLIENT_SECRET=[secret]
GOOGLE_CLIENT_ID=[id].apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=[secret]
```

**Backup Locations:**

1. **Primary:** AWS Secrets Manager (encrypted, versioned)
2. **Secondary:** 1Password Enterprise Vault (team vault: DR-Secrets)
3. **Tertiary:** Encrypted USB drive in safe (office location)

### 9.3 Appendix C: Backup Storage Details

#### S3 Bucket Configuration

```bash
# Bucket: zta-backups
# Region: us-east-1
# Encryption: AES-256 (SSE-S3)
# Versioning: Enabled
# Lifecycle Rules:
#   - /database/daily/  → Delete after 30 days
#   - /database/weekly/ → Glacier after 90 days
#   - /database/monthly/ → Glacier Deep Archive after 1 year
#   - /repository/      → Delete after 90 days
#   - /analytics/       → Delete after 90 days
```

**Access Control:**

- IAM User: `zta-backup-user` (programmatic access only)
- Permissions: s3:PutObject, s3:GetObject, s3:ListBucket
- MFA Delete: Enabled (requires MFA to delete objects)

**Bucket Structure:**

```
s3://zta-backups/
├── database/
│   ├── daily/
│   │   └── backup-YYYYMMDD-HHMMSS.db
│   ├── weekly/
│   │   └── backup-YYYYMMDD.db
│   └── monthly/
│       └── backup-YYYY-MM.db
├── repository/
│   └── zta-repo-YYYYMMDD.tar.gz
└── analytics/
    └── events-YYYYMMDD.csv.gz
```

### 9.4 Appendix D: Recovery Scripts

#### D.1 Database Restore Script

```bash
#!/bin/bash
# Location: /scripts/restore-database.sh
# Purpose: Restore Turso database from backup

set -euo pipefail

BACKUP_FILE="${1:-}"
NEW_DB_NAME="${2:-zta-recovery-$(date +%Y%m%d)}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file> [new-db-name]"
    exit 1
fi

echo "=== Turso Database Restore ==="
echo "Backup file: $BACKUP_FILE"
echo "New database: $NEW_DB_NAME"
echo ""

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify backup integrity
echo "Verifying backup integrity..."
sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"
if [ $? -ne 0 ]; then
    echo "ERROR: Backup file failed integrity check"
    exit 1
fi

# Create new Turso database
echo "Creating new Turso database..."
turso db create "$NEW_DB_NAME"

# Restore from backup
echo "Restoring from backup..."
turso db shell "$NEW_DB_NAME" < "$BACKUP_FILE"

# Verify restoration
echo "Verifying restoration..."
RECORD_COUNT=$(turso db shell "$NEW_DB_NAME" "SELECT COUNT(*) FROM pageviews;")
echo "Records restored: $RECORD_COUNT"

# Generate new auth token
echo "Generating auth token..."
AUTH_TOKEN=$(turso db tokens create "$NEW_DB_NAME" --expiration none)

echo ""
echo "=== Restore Complete ==="
echo "New database: $NEW_DB_NAME"
echo "Auth token: $AUTH_TOKEN"
echo ""
echo "Next steps:"
echo "1. Update TURSO_DATABASE_URL in Netlify"
echo "2. Update TURSO_AUTH_TOKEN in Netlify"
echo "3. Deploy updated configuration"
echo "4. Verify connectivity"
```

#### D.2 Failover to Vercel Script

```bash
#!/bin/bash
# Location: /scripts/failover-to-vercel.sh
# Purpose: Deploy to Vercel in disaster scenario

set -euo pipefail

echo "=== Disaster Recovery: Failover to Vercel ==="
echo ""

# Verify Vercel CLI installed
if ! command -v vercel &> /dev/null; then
    echo "ERROR: Vercel CLI not installed"
    echo "Install: npm install -g vercel"
    exit 1
fi

# Pull latest code
echo "Pulling latest code from GitHub..."
git pull origin main

# Verify environment variables set in Vercel
echo "Verifying environment variables..."
REQUIRED_VARS="JWT_SECRET TURSO_DATABASE_URL TURSO_AUTH_TOKEN"
for VAR in $REQUIRED_VARS; do
    vercel env ls | grep -q "$VAR" || {
        echo "ERROR: Missing environment variable: $VAR"
        echo "Set with: vercel env add $VAR"
        exit 1
    }
done

# Deploy to production
echo "Deploying to Vercel production..."
vercel --prod --yes

# Get deployment URL
DEPLOYMENT_URL=$(vercel inspect --wait 2>&1 | grep -oP 'https://\S+')
echo ""
echo "Deployment URL: $DEPLOYMENT_URL"
echo ""

# Test deployment
echo "Testing deployment..."
curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/api/health" | grep -q "200"
if [ $? -eq 0 ]; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed"
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Update DNS CNAME to point to Vercel"
echo "2. Monitor error rates"
echo "3. Update status page"
echo "4. Notify team in Slack #disaster-recovery"
```

#### D.3 Secret Rotation Script

```bash
#!/bin/bash
# Location: /scripts/rotate-secrets.sh
# Purpose: Rotate all secrets in security breach scenario

set -euo pipefail

echo "=== Security Incident: Secret Rotation ==="
echo ""
echo "This will rotate ALL secrets and invalidate ALL user sessions."
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Generate new secrets
echo "Generating new secrets..."
NEW_JWT_SECRET=$(openssl rand -hex 64)
NEW_HASH_SECRET=$(openssl rand -hex 64)

echo "New JWT_SECRET: $NEW_JWT_SECRET"
echo "New HASH_SECRET: $NEW_HASH_SECRET"
echo ""

# Backup old secrets to 1Password
echo "Backup current secrets to 1Password..."
# (Manual step - document in 1Password with timestamp)

# Update Netlify environment variables
echo "Updating Netlify environment variables..."
netlify env:set JWT_SECRET "$NEW_JWT_SECRET"
netlify env:set HASH_SECRET "$NEW_HASH_SECRET"

# Redeploy Netlify functions
echo "Redeploying Netlify functions..."
netlify deploy --prod

# Invalidate all sessions in database
echo "Invalidating all user sessions..."
turso db shell zta-production <<EOF
DELETE FROM sessions;
UPDATE users SET must_reset_password = 1;
EOF

echo ""
echo "=== Secret Rotation Complete ==="
echo ""
echo "Next steps:"
echo "1. Send password reset emails to all users"
echo "2. Update backup systems with new secrets"
echo "3. Monitor for unauthorized access attempts"
echo "4. Schedule security audit"
```

### 9.5 Appendix E: Compliance Matrix

| Regulation | Requirement | ZTA Compliance | Evidence Location |
|------------|-------------|----------------|-------------------|
| GDPR Art. 32 | Security measures | Encryption, backups, DR plan | This document |
| GDPR Art. 33 | Breach notification (72h) | Incident response plan | docs/INCIDENT_RESPONSE.md |
| GDPR Art. 5(1)(f) | Data integrity & availability | Backups, redundancy | Section 4 |
| SOC 2 CC9.1 | Risk mitigation | DR testing, backups | Section 8 |
| SOC 2 CC7.5 | Backup restoration | Quarterly tests | Test logs |
| ISO 27001 A.17 | Business continuity | RTO/RPO defined | Section 2 |

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| CTO | _____________ | _____________ | _______ |
| CEO | _____________ | _____________ | _______ |
| Legal Counsel | _____________ | _____________ | _______ |

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-12-20 | Initial disaster recovery plan | CTO |
| | | | |
| | | | |

---

**Next Review Date:** 2025-03-20 (Quarterly)

**Distribution List:**
- CTO
- CEO
- All Engineering Team
- Legal Counsel
- Board of Directors (summary version)

---

**Classification:** Internal - Handle with care
**Retention:** Permanent - Update as needed
**Storage:** Git repository (encrypted), 1Password vault (PDF backup)
