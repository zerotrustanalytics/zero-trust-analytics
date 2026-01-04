# Operational Runbooks

**Version:** 1.0
**Last Updated:** 2024-12-21
**Classification:** Internal Operations
**Audience:** DevOps, SRE, Engineering Teams

## Document Purpose

This document provides step-by-step operational procedures for responding to common incidents and performing routine operations on Zero Trust Analytics infrastructure. Each runbook follows a standardized format for consistent incident response.

**Related Documents:**
- [Incident Response Plan](./INCIDENT_RESPONSE.md) - Incident classification and escalation
- [Service Level Agreement](./SLA.md) - Service commitments and response times
- [API Documentation](./API.md) - API endpoints and usage

---

## Table of Contents

1. [Database Operations](#1-database-operations)
2. [API Outage Response](#2-api-outage-response)
3. [Cache & Performance](#3-cache--performance)
4. [Common Issues](#4-common-issues)
5. [Monitoring & Alerts](#5-monitoring--alerts)
6. [Emergency Contacts](#6-emergency-contacts)

---

## 1. Database Operations

### 1.1 Turso Database Failover

**Severity:** P1 (Critical)
**Expected Duration:** 15-30 minutes

#### Symptoms/Detection
- Database connection errors in Netlify function logs
- Error messages containing: `LIBSQL_CLIENT_ERROR`, `ECONNREFUSED`, `Connection timeout`
- Health check endpoint `/api/health` returning database failures
- User-facing errors: "Unable to load analytics data"
- Monitoring alerts: Database connection pool exhausted

#### Impact Assessment
- **Complete Outage:** Analytics tracking stopped, dashboard unavailable
- **Customer Impact:** All customers affected, no data collection
- **Data Loss Risk:** Events not persisted until database restored
- **SLA Impact:** Violates 99.9% uptime commitment

#### Prerequisites
- Turso CLI installed: `curl -sSfL https://get.tur.so/install.sh | bash`
- Turso authentication configured: `turso auth login`
- Database credentials in environment variables
- Access to Netlify deployment settings

#### Resolution Steps

1. **Verify Database Status**
   ```bash
   # Check database health from Turso CLI
   turso db show <database-name>

   # Test connection
   turso db shell <database-name> "SELECT 1"

   # Check for active connections
   turso db inspect <database-name>
   ```

2. **Identify Root Cause**
   - Primary database down: Turso infrastructure issue
   - Auth token expired: Token rotation needed
   - Connection limit reached: Too many concurrent connections
   - Network partition: Netlify to Turso connectivity issue

3. **Create Database Replica (if primary is down)**
   ```bash
   # Create a replica in different region
   turso db replicate <database-name> --location <region>

   # Wait for replication to complete
   turso db show <database-name>
   ```

4. **Rotate Database Credentials**
   ```bash
   # Generate new auth token
   turso db tokens create <database-name>

   # Update Netlify environment variable
   netlify env:set TURSO_AUTH_TOKEN <new-token>

   # Trigger redeploy
   netlify deploy --prod
   ```

5. **Update Database URL (if switching to replica)**
   ```bash
   # Get replica URL
   turso db show <database-name>

   # Update environment variable
   netlify env:set TURSO_DATABASE_URL <replica-url>

   # Redeploy functions
   netlify deploy --prod
   ```

6. **Verify Connection**
   ```bash
   # Test health endpoint
   curl https://your-domain.com/api/health

   # Check function logs
   netlify functions:log
   ```

#### Verification Steps
- [ ] Health endpoint returns 200 status
- [ ] Analytics tracking accepts new events
- [ ] Dashboard loads without errors
- [ ] No database errors in function logs (5 min observation)
- [ ] Connection pool metrics normalized

#### Rollback Procedure
```bash
# Revert to previous database URL
netlify env:set TURSO_DATABASE_URL <previous-url>
netlify env:set TURSO_AUTH_TOKEN <previous-token>
netlify deploy --prod
```

#### Post-Incident Actions
1. Document timeline in incident report
2. Review database monitoring alerts
3. Adjust connection pool settings if needed
4. Consider implementing database connection retry logic
5. Update runbook with lessons learned

#### Escalation Criteria
- Database unavailable for >15 minutes
- Unable to create replica or rotate credentials
- Data corruption suspected
- Escalate to: CTO + Turso Support (support@turso.tech)

---

### 1.2 Connection Pool Exhaustion

**Severity:** P2 (High)
**Expected Duration:** 10-20 minutes

#### Symptoms/Detection
- Intermittent database timeouts
- Slow API responses (>5s for dashboard endpoints)
- Error logs: `Connection pool exhausted`, `Too many connections`
- Increased P99 latency on database queries
- Some requests succeed, others fail

#### Impact Assessment
- **Partial Outage:** Service degraded but functional
- **Customer Impact:** Slow dashboards, some tracking failures
- **Data Loss Risk:** Minimal - events may be dropped during spikes
- **SLA Impact:** May affect P99 response time SLA

#### Resolution Steps

1. **Identify Connection Leak**
   ```bash
   # Check active functions and their status
   netlify functions:list

   # Review recent function invocations
   netlify functions:log --filter "error"

   # Check for long-running queries in logs
   grep "query duration" netlify-functions.log
   ```

2. **Check Current Connection Count**
   ```bash
   # Via Turso CLI
   turso db inspect <database-name>

   # Look for: active_connections, max_connections
   ```

3. **Identify Problematic Functions**
   ```bash
   # Grep for database connection patterns
   grep -r "createClient" netlify/functions/*.js

   # Check for missing connection cleanup
   grep -r "turso.close()" netlify/functions/*.js
   ```

4. **Temporary Mitigation**
   ```bash
   # Scale down rate limits temporarily
   netlify env:set RATE_LIMIT_TRACK_MAX 500
   netlify env:set RATE_LIMIT_API_MAX 50

   # Redeploy to apply limits
   netlify deploy --prod
   ```

5. **Review Connection Management**
   - Verify `netlify/functions/lib/turso.js` uses singleton pattern
   - Check for connection created per request (anti-pattern)
   - Ensure connections are properly pooled

6. **Implement Circuit Breaker (if needed)**
   ```javascript
   // Add to lib/turso.js
   let connectionErrors = 0;
   const MAX_ERRORS = 5;

   async function executeWithCircuitBreaker(query) {
     if (connectionErrors >= MAX_ERRORS) {
       throw new Error('Circuit breaker open');
     }
     try {
       return await turso.execute(query);
     } catch (err) {
       connectionErrors++;
       throw err;
     }
   }
   ```

#### Verification Steps
- [ ] Connection count below 80% of max
- [ ] API response times returned to normal (<1s P99)
- [ ] No connection errors in logs (10 min observation)
- [ ] All endpoints responding correctly
- [ ] Rate limit metrics show controlled traffic

#### Preventive Measures
1. Implement connection pooling monitoring
2. Add connection count alerts at 70% threshold
3. Review and optimize slow queries
4. Consider implementing query caching for hot paths
5. Document connection best practices for team

#### Escalation Criteria
- Connection exhaustion persists >20 minutes
- Unable to identify root cause
- Requires code changes to resolve
- Escalate to: Senior Engineer + CTO

---

### 1.3 Data Recovery from Backups

**Severity:** P1 (Critical)
**Expected Duration:** 1-4 hours

#### Symptoms/Detection
- Data corruption detected in analytics tables
- Accidental deletion of customer data
- Schema migration failure requiring rollback
- Data integrity check failures

#### Impact Assessment
- **Data Loss:** Potential loss of analytics data
- **Customer Impact:** Missing or incorrect analytics
- **Compliance Risk:** May trigger GDPR data breach notification
- **SLA Impact:** Critical violation requiring service credits

#### Prerequisites
- Turso CLI with authentication
- Point-in-time to restore from
- Maintenance mode capability
- Customer communication template prepared

#### Resolution Steps

1. **Enable Maintenance Mode**
   ```bash
   # Create maintenance page
   echo "Service temporarily unavailable" > public/_redirects

   # Deploy maintenance mode
   netlify deploy --prod

   # Notify customers via status page
   ```

2. **Assess Data Loss Scope**
   ```bash
   # Query affected records
   turso db shell <database-name> \
     "SELECT COUNT(*) FROM pageviews WHERE timestamp > '2024-12-20'"

   # Identify affected customers
   turso db shell <database-name> \
     "SELECT DISTINCT site_id FROM pageviews WHERE timestamp > '2024-12-20'"
   ```

3. **Create Current Database Snapshot**
   ```bash
   # Snapshot current state before restore
   turso db snapshot <database-name> snapshot-pre-recovery

   # Export recent data for comparison
   turso db shell <database-name> \
     ".dump pageviews" > pre-recovery-dump.sql
   ```

4. **List Available Backups**
   ```bash
   # Turso automatic point-in-time recovery
   turso db show <database-name> --backups

   # Identify restore point (before corruption)
   ```

5. **Perform Point-in-Time Recovery**
   ```bash
   # Option A: Restore to specific timestamp
   turso db restore <database-name> --timestamp "2024-12-20T10:00:00Z"

   # Option B: Create new database from backup
   turso db create <database-name>-restored \
     --from-backup <backup-id> \
     --timestamp "2024-12-20T10:00:00Z"
   ```

6. **Validate Restored Data**
   ```bash
   # Check record counts
   turso db shell <database-name> \
     "SELECT COUNT(*) FROM pageviews"

   # Verify data integrity
   turso db shell <database-name> \
     "SELECT site_id, COUNT(*) as count
      FROM pageviews
      GROUP BY site_id
      ORDER BY count DESC
      LIMIT 10"

   # Check for missing records
   turso db shell <database-name> \
     "SELECT MAX(timestamp) as latest FROM pageviews"
   ```

7. **Merge Recent Data (if applicable)**
   ```bash
   # If restoration lost recent valid data
   # Export from snapshot
   turso db shell snapshot-pre-recovery \
     "SELECT * FROM pageviews WHERE timestamp > '2024-12-20T10:00:00Z'" \
     > recent-data.json

   # Import into restored database
   turso db shell <database-name> < import-recent.sql
   ```

8. **Update Application to Use Restored Database**
   ```bash
   # If created new database
   netlify env:set TURSO_DATABASE_URL <restored-url>

   # Generate new auth token
   turso db tokens create <database-name>-restored
   netlify env:set TURSO_AUTH_TOKEN <new-token>

   # Redeploy
   netlify deploy --prod
   ```

#### Verification Steps
- [ ] Record counts match expected values
- [ ] Sample queries return correct data
- [ ] Data integrity constraints satisfied
- [ ] No orphaned records or foreign key violations
- [ ] Customer-reported issues resolved
- [ ] Application functions normally (30 min soak test)

#### Customer Communication
```
Subject: Service Restored - Data Recovery Complete

We experienced a data issue affecting analytics from [START_TIME] to [END_TIME].
Our team has successfully recovered all data from backups.

Timeline:
- [TIME]: Issue detected
- [TIME]: Recovery initiated
- [TIME]: Service restored

Impact: [Describe specific impact]
Resolution: [Describe recovery process]

We apologize for any inconvenience. If you have questions, contact support@zta.io.
```

#### Post-Recovery Actions
1. Document root cause of data loss
2. Implement additional validation checks
3. Review backup retention policies
4. Consider implementing write-ahead logging
5. Update monitoring to detect corruption earlier
6. Conduct post-mortem within 48 hours

#### Escalation Criteria
- Backups unavailable or corrupted
- Data loss exceeds backup retention
- Customer PII potentially exposed
- Recovery fails after 2 attempts
- Escalate to: CTO + CEO + Legal Counsel

---

### 1.4 Schema Migration Procedures

**Severity:** P3 (Medium)
**Expected Duration:** 30-60 minutes

#### Symptoms/Detection
- Need to add new columns or tables
- Need to modify existing schema
- Performance optimization requires index changes
- New feature requires database structure changes

#### Impact Assessment
- **Downtime Required:** Potentially yes for large migrations
- **Customer Impact:** Brief service interruption (if needed)
- **Data Risk:** Risk of migration failure
- **Rollback Complexity:** High - requires tested rollback script

#### Prerequisites
- Migration script tested on development database
- Rollback script prepared and tested
- Backup created before migration
- Off-peak maintenance window scheduled

#### Migration Steps

1. **Prepare Migration Environment**
   ```bash
   # Create development database for testing
   turso db create test-migration --from-dump production-backup.sql

   # Test migration on development database
   turso db shell test-migration < migration.sql
   ```

2. **Create Migration Scripts**
   ```sql
   -- migration.sql
   -- Add new column for session tracking

   BEGIN TRANSACTION;

   -- Add column with default value
   ALTER TABLE pageviews
   ADD COLUMN session_duration INTEGER DEFAULT 0;

   -- Create index for new column
   CREATE INDEX IF NOT EXISTS idx_session_duration
   ON pageviews(site_id, session_duration)
   WHERE session_duration > 0;

   -- Verify migration
   SELECT COUNT(*) FROM pageviews WHERE session_duration IS NOT NULL;

   COMMIT;
   ```

3. **Create Rollback Script**
   ```sql
   -- rollback.sql
   BEGIN TRANSACTION;

   -- Drop index
   DROP INDEX IF EXISTS idx_session_duration;

   -- Remove column (SQLite limitation: requires table recreation)
   CREATE TABLE pageviews_backup AS
   SELECT id, timestamp, site_id, identity_hash, session_hash,
          event_type, payload, context_device, context_browser,
          context_os, context_country, context_region,
          meta_is_bounce, meta_duration
   FROM pageviews;

   DROP TABLE pageviews;
   ALTER TABLE pageviews_backup RENAME TO pageviews;

   -- Recreate indexes
   CREATE INDEX idx_pageviews_site_timestamp ON pageviews(site_id, timestamp);
   -- ... (recreate all other indexes)

   COMMIT;
   ```

4. **Pre-Migration Backup**
   ```bash
   # Create snapshot
   turso db snapshot <database-name> pre-migration-$(date +%Y%m%d-%H%M%S)

   # Export schema for comparison
   turso db shell <database-name> ".schema" > pre-migration-schema.sql
   ```

5. **Schedule Maintenance Window**
   ```bash
   # Notify customers 72 hours in advance
   # Update status page
   # Send email notification
   ```

6. **Execute Migration**
   ```bash
   # Enable maintenance mode (if needed)
   netlify env:set MAINTENANCE_MODE true
   netlify deploy --prod

   # Run migration
   turso db shell <database-name> < migration.sql

   # Verify success
   echo $?  # Should be 0
   ```

7. **Verify Migration**
   ```bash
   # Check schema changes applied
   turso db shell <database-name> ".schema pageviews"

   # Verify data integrity
   turso db shell <database-name> \
     "SELECT COUNT(*) as total,
             COUNT(session_duration) as has_duration
      FROM pageviews"

   # Test application queries
   curl https://your-domain.com/api/stats?site_id=test
   ```

8. **Disable Maintenance Mode**
   ```bash
   netlify env:unset MAINTENANCE_MODE
   netlify deploy --prod

   # Update status page
   # Notify customers of completion
   ```

#### Verification Steps
- [ ] Migration script executed successfully (exit code 0)
- [ ] New columns/tables present in schema
- [ ] Indexes created successfully
- [ ] Sample queries return expected results
- [ ] Application functions normally
- [ ] No foreign key violations
- [ ] Performance metrics within acceptable range

#### Rollback Procedure
```bash
# If migration fails
turso db shell <database-name> < rollback.sql

# Verify rollback
turso db shell <database-name> ".schema"

# Or restore from snapshot
turso db restore <database-name> --snapshot pre-migration-YYYYMMDD-HHMMSS
```

#### Common Migration Patterns

**Adding a Column:**
```sql
ALTER TABLE pageviews ADD COLUMN new_field TEXT DEFAULT '';
```

**Adding an Index:**
```sql
CREATE INDEX IF NOT EXISTS idx_new_field
ON pageviews(site_id, new_field);
```

**Modifying Data:**
```sql
-- Use batched updates for large tables
UPDATE pageviews
SET new_field = 'default_value'
WHERE id IN (
  SELECT id FROM pageviews
  WHERE new_field IS NULL
  LIMIT 1000
);
```

**Creating New Table:**
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_hash TEXT NOT NULL UNIQUE,
  site_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  pageview_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0
);

CREATE INDEX idx_sessions_site ON sessions(site_id);
```

#### Post-Migration Actions
1. Monitor database performance for 24 hours
2. Document migration in change log
3. Update database schema documentation
4. Archive migration and rollback scripts
5. Review and optimize new indexes if needed

#### Escalation Criteria
- Migration fails and rollback not working
- Data corruption detected post-migration
- Performance degradation >50% after migration
- Escalate to: Senior Engineer + Database Specialist

---

## 2. API Outage Response

### 2.1 Netlify Function Failures

**Severity:** P1-P2 (depends on scope)
**Expected Duration:** 15-45 minutes

#### Symptoms/Detection
- HTTP 500/502/503 errors from API endpoints
- Function logs showing unhandled exceptions
- Netlify status: "Function execution failed"
- Error tracking showing spike in errors
- Customer reports: "Dashboard not loading"

#### Impact Assessment
- **Single Function:** Partial feature outage (P2)
- **Multiple Functions:** Major degradation (P1)
- **All Functions:** Complete outage (P1)
- **Customer Impact:** Varies by affected endpoints
- **Data Loss Risk:** Tracking events may be lost

#### Resolution Steps

1. **Identify Affected Functions**
   ```bash
   # Check function status
   netlify functions:list

   # Review recent logs
   netlify functions:log --since 1h

   # Check specific function
   netlify functions:log auth-login
   ```

2. **Review Error Patterns**
   ```bash
   # Count errors by type
   netlify functions:log | grep -i error | sort | uniq -c

   # Check for deployment issues
   netlify status

   # Review recent deploys
   netlify deploy:list
   ```

3. **Check Environment Variables**
   ```bash
   # List all environment variables
   netlify env:list

   # Verify critical variables
   netlify env:get TURSO_DATABASE_URL
   netlify env:get JWT_SECRET
   netlify env:get STRIPE_SECRET_KEY
   ```

4. **Test Function Locally**
   ```bash
   # Clone repository
   git clone <repo-url>
   cd zero-trust-analytics

   # Install dependencies
   npm install
   cd netlify/functions && npm install && cd ../..

   # Run local dev server
   netlify dev

   # Test problematic function
   curl http://localhost:8888/api/auth/login \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

5. **Common Failure Causes**

   **A. Missing Dependencies**
   ```bash
   # Check package.json in functions directory
   cat netlify/functions/package.json

   # Reinstall dependencies
   cd netlify/functions
   rm -rf node_modules package-lock.json
   npm install
   cd ../..

   # Redeploy
   git add netlify/functions/package-lock.json
   git commit -m "Update function dependencies"
   git push
   ```

   **B. Environment Variable Missing**
   ```bash
   # Add missing variable
   netlify env:set MISSING_VAR value

   # Trigger rebuild
   netlify build --trigger
   ```

   **C. Timeout Exceeded**
   ```javascript
   // Check function timeout setting
   // In netlify.toml:
   [functions]
     node_bundler = "esbuild"
     timeout = 10  # Increase if needed (max 26 seconds)
   ```

   **D. Memory Limit Exceeded**
   ```bash
   # Check function logs for memory issues
   netlify functions:log | grep -i "memory"

   # Optimize function or split into smaller functions
   ```

6. **Rollback Deployment (if recent deploy caused issue)**
   ```bash
   # List recent deploys
   netlify deploy:list

   # Get previous deploy ID
   PREVIOUS_DEPLOY_ID=<deploy-id>

   # Rollback
   netlify deploy:restore $PREVIOUS_DEPLOY_ID

   # Or rollback via Git
   git revert HEAD
   git push
   ```

7. **Force Redeploy**
   ```bash
   # Clear build cache and redeploy
   netlify build --clear-cache
   netlify deploy --prod

   # Or trigger via Git
   git commit --allow-empty -m "Force redeploy"
   git push
   ```

#### Verification Steps
- [ ] Function returns 200 status code
- [ ] Response body contains expected data
- [ ] Function logs show no errors (5 min observation)
- [ ] Related functions working correctly
- [ ] End-to-end user flow functional

#### Common Error Codes

| Code | Meaning | Common Cause | Solution |
|------|---------|--------------|----------|
| 500 | Internal Server Error | Unhandled exception | Check function logs |
| 502 | Bad Gateway | Function timeout | Increase timeout or optimize |
| 503 | Service Unavailable | Cold start timeout | Warm functions or increase memory |
| 403 | Forbidden | CORS misconfiguration | Check CORS headers |
| 401 | Unauthorized | JWT validation failed | Check JWT_SECRET |

#### Post-Incident Actions
1. Add error handling for identified edge case
2. Implement better logging around failure point
3. Add monitoring alert for this error pattern
4. Update tests to cover failure scenario
5. Document fix in knowledge base

#### Escalation Criteria
- Functions failing for >30 minutes
- Unable to identify root cause
- Affects critical path (authentication, tracking)
- Rollback unsuccessful
- Escalate to: Senior Engineer + Netlify Support

---

### 2.2 Rate Limit Exceeded

**Severity:** P2-P3 (depends on customer impact)
**Expected Duration:** 10-30 minutes

#### Symptoms/Detection
- HTTP 429 "Too Many Requests" responses
- Customer reports: "Unable to load dashboard"
- Spike in traffic from single IP or site_id
- Legitimate users blocked by rate limiting
- Monitoring shows elevated 429 response rate

#### Impact Assessment
- **False Positive:** Legitimate traffic blocked (P2)
- **True Positive:** Attack mitigated (P3)
- **Customer Impact:** Intermittent access issues
- **Data Loss Risk:** Tracking events may be dropped

#### Resolution Steps

1. **Identify Rate Limit Source**
   ```bash
   # Check function logs for rate limit messages
   netlify functions:log | grep -i "rate limit"

   # Identify affected IPs or identifiers
   netlify functions:log | grep "429" | \
     awk '{print $5}' | sort | uniq -c | sort -rn
   ```

2. **Analyze Traffic Pattern**
   ```bash
   # Check if legitimate spike or attack
   # Look at:
   # - Request frequency per IP
   # - User-Agent patterns
   # - Request endpoints
   # - Geographic distribution

   # Export recent requests
   netlify functions:log --since 1h > recent-traffic.log

   # Analyze patterns
   grep "POST /api/track" recent-traffic.log | wc -l
   grep "User-Agent" recent-traffic.log | sort | uniq -c
   ```

3. **Determine Legitimacy**

   **Legitimate Traffic (Increase Limits):**
   ```bash
   # Temporarily increase rate limits
   netlify env:set RATE_LIMIT_TRACK_MAX 2000
   netlify env:set RATE_LIMIT_API_MAX 200

   # Redeploy
   netlify deploy --prod
   ```

   **Attack Traffic (Tighten Limits):**
   ```bash
   # Implement IP blocking (if persistent attacker)
   # Add to function code:
   const BLOCKED_IPS = ['1.2.3.4', '5.6.7.8'];
   if (BLOCKED_IPS.includes(clientIP)) {
     return { statusCode: 403, body: 'Forbidden' };
   }

   # Or use Netlify Edge Functions for blocking
   ```

4. **Review Current Rate Limits**
   ```bash
   # Check configured limits
   netlify env:list | grep RATE_LIMIT

   # Expected values:
   # RATE_LIMIT_TRACK_MAX=1000    (tracking endpoint)
   # RATE_LIMIT_API_MAX=100       (dashboard APIs)
   # RATE_LIMIT_LOGIN_MAX=10      (login)
   # RATE_LIMIT_REGISTER_MAX=5    (register)
   ```

5. **Adjust Limits Per Endpoint**
   ```bash
   # For high-traffic tracking endpoint
   netlify env:set RATE_LIMIT_TRACK_MAX 2000
   netlify env:set RATE_LIMIT_TRACK_WINDOW 60000

   # For dashboard API (authenticated users)
   netlify env:set RATE_LIMIT_API_MAX 200

   # For authentication (security-sensitive)
   netlify env:set RATE_LIMIT_LOGIN_MAX 10
   netlify env:set RATE_LIMIT_REGISTER_MAX 5

   # Redeploy
   netlify deploy --prod
   ```

6. **Implement Custom Rate Limiting**
   ```javascript
   // In netlify/functions/lib/rate-limiter.js

   // Whitelist specific IPs or API keys
   const WHITELIST = [
     '10.0.0.1',  // Internal monitoring
     'api_key_xyz'  // Enterprise customer
   ];

   // Dynamic rate limits based on plan
   function getRateLimit(user) {
     if (user.plan === 'enterprise') return 10000;
     if (user.plan === 'pro') return 1000;
     return 100;
   }
   ```

7. **Monitor After Adjustment**
   ```bash
   # Watch for 429 responses
   netlify functions:log --follow | grep "429"

   # Check error rate
   netlify functions:log --since 10m | \
     grep -c "429" && \
     netlify functions:log --since 10m | wc -l
   ```

#### Verification Steps
- [ ] Legitimate users can access service
- [ ] 429 response rate returned to baseline
- [ ] No degradation in service performance
- [ ] Attack traffic still blocked (if applicable)
- [ ] Monitoring shows healthy request patterns

#### Rate Limit Configuration Guide

| Endpoint | Default Max | Window | Recommended Max | Notes |
|----------|-------------|--------|-----------------|-------|
| `/api/track` | 1000 | 1 min | 1000-5000 | High volume expected |
| `/api/stats` | 100 | 1 min | 100-500 | Per authenticated user |
| `/api/auth/login` | 10 | 1 min | 5-10 | Security-sensitive |
| `/api/auth/register` | 5 | 1 min | 5-10 | Prevent abuse |
| `/api/export` | 10 | 15 min | 10-20 | Resource-intensive |

#### Post-Incident Actions
1. Document traffic pattern that triggered limit
2. Review rate limit settings for adequacy
3. Consider implementing tiered rate limits by plan
4. Add monitoring for abnormal traffic patterns
5. Update documentation with new limits

#### Escalation Criteria
- Suspected DDoS attack
- Rate limits affecting >10% of users
- Unable to distinguish legitimate from attack traffic
- Requires infrastructure-level mitigation
- Escalate to: Senior Engineer + Netlify Support

---

### 2.3 Authentication System Down

**Severity:** P1 (Critical)
**Expected Duration:** 15-30 minutes

#### Symptoms/Detection
- Login endpoint returning errors
- JWT validation failures
- User reports: "Cannot log in"
- Session management failures
- 401 Unauthorized errors across dashboard

#### Impact Assessment
- **Complete Auth Failure:** No user access (P1)
- **Partial Failure:** Some auth methods work (P2)
- **Customer Impact:** All users unable to access dashboards
- **Data Loss Risk:** None (tracking still works)
- **SLA Impact:** Critical violation

#### Resolution Steps

1. **Verify Auth Service Status**
   ```bash
   # Test login endpoint
   curl -X POST https://your-domain.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}' \
     -v

   # Check function logs
   netlify functions:log auth-login --since 30m
   netlify functions:log auth-register --since 30m
   ```

2. **Common Auth Failures**

   **A. JWT Secret Misconfiguration**
   ```bash
   # Verify JWT_SECRET is set
   netlify env:get JWT_SECRET

   # If missing or wrong, update
   netlify env:set JWT_SECRET "$(openssl rand -base64 32)"

   # IMPORTANT: This will invalidate all existing sessions
   # Notify users they need to re-login
   netlify deploy --prod
   ```

   **B. JWT Token Validation Failing**
   ```bash
   # Check token expiry settings
   netlify env:get JWT_EXPIRY

   # Verify auth library version
   cat netlify/functions/package.json | grep jsonwebtoken

   # Test token generation locally
   node -e "
   const jwt = require('jsonwebtoken');
   const token = jwt.sign({userId: 'test'}, 'secret', {expiresIn: '7d'});
   console.log(jwt.verify(token, 'secret'));
   "
   ```

   **C. Database Connection Issues**
   ```bash
   # Auth requires database for user lookup
   # Check database connectivity
   turso db shell <database-name> "SELECT COUNT(*) FROM users"

   # Verify user table exists
   turso db shell <database-name> ".schema users"
   ```

   **D. OAuth Provider Issues**
   ```bash
   # Test GitHub OAuth
   curl https://github.com/login/oauth/authorize \
     ?client_id=$GITHUB_CLIENT_ID

   # Test Google OAuth
   curl https://accounts.google.com/o/oauth2/v2/auth \
     ?client_id=$GOOGLE_CLIENT_ID

   # Verify OAuth credentials
   netlify env:get GITHUB_CLIENT_ID
   netlify env:get GITHUB_CLIENT_SECRET
   netlify env:get GOOGLE_CLIENT_ID
   netlify env:get GOOGLE_CLIENT_SECRET
   ```

3. **Check CORS Configuration**
   ```bash
   # Verify allowed origins
   netlify env:get ALLOWED_ORIGINS

   # Test CORS preflight
   curl -X OPTIONS https://your-domain.com/api/auth/login \
     -H "Origin: https://your-frontend.com" \
     -H "Access-Control-Request-Method: POST" \
     -v
   ```

4. **Review Password Hashing**
   ```bash
   # Verify bcrypt is working
   node -e "
   const bcrypt = require('bcryptjs');
   const hash = bcrypt.hashSync('test123', 10);
   console.log('Hash:', hash);
   console.log('Verify:', bcrypt.compareSync('test123', hash));
   "
   ```

5. **Check Session Storage**
   ```bash
   # If using database sessions
   turso db shell <database-name> \
     "SELECT COUNT(*) FROM sessions WHERE expires_at > datetime('now')"

   # Clean up expired sessions
   turso db shell <database-name> \
     "DELETE FROM sessions WHERE expires_at < datetime('now')"
   ```

6. **Emergency Auth Bypass (Development Only)**
   ```bash
   # NEVER USE IN PRODUCTION
   # For emergency testing only
   netlify env:set DEBUG_AUTH_BYPASS true

   # Remove immediately after testing
   netlify env:unset DEBUG_AUTH_BYPASS
   ```

7. **Test Full Auth Flow**
   ```bash
   # Register new user
   curl -X POST https://your-domain.com/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email":"test@example.com",
       "password":"Test123!@#",
       "name":"Test User"
     }'

   # Login
   TOKEN=$(curl -X POST https://your-domain.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"Test123!@#"}' \
     -s | jq -r '.token')

   # Use token to access protected endpoint
   curl https://your-domain.com/api/sites/list \
     -H "Authorization: Bearer $TOKEN"
   ```

#### Verification Steps
- [ ] Login endpoint returns 200 with valid token
- [ ] Register endpoint creates new users
- [ ] Token validation works across all endpoints
- [ ] OAuth providers redirecting correctly
- [ ] CORS headers present in responses
- [ ] No auth errors in logs (10 min observation)

#### Auth Flow Checklist

```
[ ] User submits credentials
[ ] Function validates input
[ ] Database query finds user
[ ] Password hash compared
[ ] JWT token generated with secret
[ ] Token returned to client
[ ] Client stores token
[ ] Subsequent requests include token in Authorization header
[ ] Token validated against JWT_SECRET
[ ] User identity extracted from token
[ ] Protected resource accessed
```

#### Rollback Procedure
```bash
# If recent deploy broke auth
netlify deploy:list
netlify deploy:restore <previous-deploy-id>

# If environment variable change broke auth
netlify env:set JWT_SECRET <previous-value>
netlify deploy --prod
```

#### Post-Incident Actions
1. Add auth system health check
2. Implement auth monitoring alerts
3. Document auth dependencies
4. Review auth error handling
5. Consider implementing auth status page

#### Escalation Criteria
- Auth down for >30 minutes
- Unable to identify root cause
- Requires third-party OAuth provider support
- Suspected security breach
- Escalate to: CTO + Security Lead

---

### 2.4 Third-Party API Failures

**Severity:** P2-P3 (depends on service)
**Expected Duration:** 5-60 minutes

#### Symptoms/Detection
- Stripe payment processing failures
- OAuth login failures (GitHub, Google)
- Email delivery failures (SendGrid, Resend)
- Third-party service status showing issues
- Timeout errors connecting to external APIs

#### Impact Assessment
- **Stripe Down:** Cannot process payments (P2)
- **OAuth Down:** Social login unavailable (P3)
- **Email Down:** Password reset unavailable (P2)
- **Customer Impact:** Feature-specific
- **Data Loss Risk:** Minimal (queue and retry)

#### Resolution Steps

1. **Identify Affected Service**
   ```bash
   # Check function logs for external API errors
   netlify functions:log | grep -i "stripe\|github\|google\|sendgrid\|resend"

   # Common error patterns:
   # - ECONNREFUSED
   # - ETIMEDOUT
   # - 503 Service Unavailable
   # - Invalid API key
   ```

2. **Check Third-Party Status Pages**
   - Stripe: https://status.stripe.com
   - GitHub: https://www.githubstatus.com
   - Google: https://status.cloud.google.com
   - SendGrid: https://status.sendgrid.com
   - Netlify: https://www.netlifystatus.com

3. **Stripe Payment Failures**
   ```bash
   # Test Stripe API
   curl https://api.stripe.com/v1/charges \
     -u ${STRIPE_SECRET_KEY}: \
     -d amount=2000 \
     -d currency=usd \
     -d source=tok_visa

   # Check webhook endpoint
   curl https://your-domain.com/api/stripe/webhook \
     -X POST \
     -H "Content-Type: application/json" \
     -H "Stripe-Signature: test" \
     -d '{}'

   # Verify environment variables
   netlify env:get STRIPE_SECRET_KEY
   netlify env:get STRIPE_WEBHOOK_SECRET
   netlify env:get STRIPE_PRICE_ID

   # Enable fallback payment method (if available)
   netlify env:set PAYMENT_FALLBACK_ENABLED true
   netlify deploy --prod
   ```

4. **OAuth Provider Failures**
   ```bash
   # Test GitHub OAuth
   curl https://api.github.com/user \
     -H "Authorization: token ${GITHUB_TOKEN}"

   # Verify OAuth credentials
   netlify env:get GITHUB_CLIENT_ID
   netlify env:get GITHUB_CLIENT_SECRET
   netlify env:get GITHUB_REDIRECT_URI

   # Disable OAuth provider temporarily
   netlify env:set OAUTH_GITHUB_ENABLED false

   # Update login page to show status
   # "GitHub login temporarily unavailable.
   #  Please use email/password login."
   ```

5. **Email Service Failures**
   ```bash
   # Test SendGrid
   curl https://api.sendgrid.com/v3/mail/send \
     -X POST \
     -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "personalizations": [{"to": [{"email": "test@example.com"}]}],
       "from": {"email": "noreply@yourdomain.com"},
       "subject": "Test",
       "content": [{"type": "text/plain", "value": "Test"}]
     }'

   # Test Resend (fallback)
   curl https://api.resend.com/emails \
     -X POST \
     -H "Authorization: Bearer ${RESEND_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "noreply@yourdomain.com",
       "to": "test@example.com",
       "subject": "Test",
       "text": "Test"
     }'

   # Switch to fallback email provider
   netlify env:set EMAIL_PROVIDER resend
   netlify deploy --prod
   ```

6. **Implement Circuit Breaker**
   ```javascript
   // Add to netlify/functions/lib/circuit-breaker.js
   const circuitBreakers = {};

   function getCircuitBreaker(service) {
     if (!circuitBreakers[service]) {
       circuitBreakers[service] = {
         failures: 0,
         lastFailure: null,
         state: 'CLOSED'  // CLOSED, OPEN, HALF_OPEN
       };
     }
     return circuitBreakers[service];
   }

   async function callWithCircuitBreaker(service, fn) {
     const breaker = getCircuitBreaker(service);

     // If circuit is OPEN, fail fast
     if (breaker.state === 'OPEN') {
       const timeSinceFailure = Date.now() - breaker.lastFailure;
       if (timeSinceFailure < 60000) {  // 1 minute
         throw new Error(`Circuit breaker OPEN for ${service}`);
       }
       breaker.state = 'HALF_OPEN';
     }

     try {
       const result = await fn();
       breaker.failures = 0;
       breaker.state = 'CLOSED';
       return result;
     } catch (error) {
       breaker.failures++;
       breaker.lastFailure = Date.now();

       if (breaker.failures >= 5) {
         breaker.state = 'OPEN';
       }
       throw error;
     }
   }
   ```

7. **Queue Failed Requests**
   ```javascript
   // For critical operations, queue for retry
   async function sendEmailWithRetry(email, subject, body) {
     try {
       await sendEmail(email, subject, body);
     } catch (error) {
       // Store in database for retry
       await turso.execute({
         sql: `INSERT INTO email_queue (email, subject, body, created_at)
               VALUES (?, ?, ?, ?)`,
         args: [email, subject, body, new Date().toISOString()]
       });
     }
   }
   ```

8. **Update Status Page**
   ```bash
   # Communicate to users
   # Status: Known Issue - Third-Party Service Degradation
   # Impact: [Feature] temporarily unavailable
   # Workaround: [Alternative method if available]
   # ETA: Monitoring third-party status for resolution
   ```

#### Verification Steps
- [ ] Third-party service status page shows resolved
- [ ] Test API calls successful
- [ ] Function logs show no errors (10 min observation)
- [ ] Customer-reported issues resolved
- [ ] Queued requests processed (if applicable)

#### Service-Specific Contacts

| Service | Support | Status Page | SLA |
|---------|---------|-------------|-----|
| Stripe | https://support.stripe.com | status.stripe.com | 99.99% |
| GitHub | https://support.github.com | githubstatus.com | 99.95% |
| Google | https://support.google.com | status.cloud.google.com | 99.95% |
| SendGrid | https://support.sendgrid.com | status.sendgrid.com | 99.95% |
| Netlify | https://support.netlify.com | netlifystatus.com | 99.95% |

#### Post-Incident Actions
1. Review dependency on third-party services
2. Implement fallback providers where possible
3. Add circuit breaker pattern to prevent cascading failures
4. Improve error messaging for third-party failures
5. Document escalation process for each provider

#### Escalation Criteria
- Third-party service down >1 hour
- No ETA from provider
- Affects critical business function
- Need to engage provider support directly
- Escalate to: CTO + Third-Party Account Manager

---

## 3. Cache & Performance

### 3.1 Cache Invalidation Procedures

**Severity:** P3 (Medium)
**Expected Duration:** 5-15 minutes

#### Symptoms/Detection
- Stale data showing in dashboard
- Recent analytics not appearing
- Configuration changes not reflected
- CDN serving outdated static assets

#### Impact Assessment
- **Customer Impact:** Seeing outdated data
- **Data Loss Risk:** None
- **Service Availability:** Unaffected
- **User Experience:** Degraded

#### Resolution Steps

1. **Identify Cached Resources**
   ```bash
   # Check Netlify CDN cache headers
   curl -I https://your-domain.com/js/analytics.js

   # Look for:
   # Cache-Control: public, max-age=3600
   # X-Nf-Request-Id: ...
   ```

2. **Clear Netlify CDN Cache**
   ```bash
   # Clear all cached assets
   netlify cache:clear

   # Trigger new deployment (clears cache)
   netlify deploy --prod

   # Or via API
   curl -X POST https://api.netlify.com/api/v1/sites/${SITE_ID}/purge \
     -H "Authorization: Bearer ${NETLIFY_TOKEN}"
   ```

3. **Clear Application-Level Cache**
   ```javascript
   // If using in-memory cache in functions
   // Add cache clear endpoint

   // netlify/functions/admin-clear-cache.js
   const caches = require('./lib/cache');

   exports.handler = async (event) => {
     // Verify admin authorization
     const authHeader = event.headers.authorization;
     if (!isAdmin(authHeader)) {
       return { statusCode: 403 };
     }

     // Clear all caches
     caches.clear();

     return {
       statusCode: 200,
       body: JSON.stringify({ success: true })
     };
   };
   ```

4. **Clear Client-Side Cache**
   ```javascript
   // Update analytics.js version to force reload
   // In HTML:
   <script src="/js/analytics.js?v=2024-12-21"></script>

   // Or use cache busting in filename
   // webpack.config.js:
   output: {
     filename: '[name].[contenthash].js'
   }
   ```

5. **Invalidate Specific Resources**
   ```bash
   # Clear specific paths only
   # Create _headers file:
   /api/stats/*
     Cache-Control: no-cache, no-store, must-revalidate

   /js/analytics.js
     Cache-Control: public, max-age=3600, stale-while-revalidate=86400
   ```

6. **Verify Cache Cleared**
   ```bash
   # Check cache headers after clear
   curl -I https://your-domain.com/api/stats?site_id=test

   # Should show:
   # Age: 0 (fresh from origin)
   # X-Cache: MISS

   # After some time:
   # Age: 123 (seconds since cached)
   # X-Cache: HIT
   ```

#### Cache Strategy by Resource Type

| Resource | Strategy | Max-Age | Reasoning |
|----------|----------|---------|-----------|
| Analytics Script | Public, long TTL | 1 hour | Changes infrequently |
| Dashboard API | No-cache | 0 | Always fresh data |
| Static Assets | Public, immutable | 1 year | Versioned filenames |
| User Sessions | Private | 0 | User-specific |
| Public Stats | Public, short TTL | 5 min | Shareable, updates frequently |

#### Verification Steps
- [ ] New data appearing in dashboard
- [ ] Cache headers show fresh content
- [ ] Configuration changes reflected
- [ ] Static assets updated
- [ ] No stale data complaints

#### Post-Action Tasks
1. Review cache strategy for affected resources
2. Document cache invalidation process
3. Consider implementing cache versioning
4. Add cache monitoring/alerts

#### Escalation Criteria
- Cache corruption affecting multiple resources
- Unable to clear cache through normal means
- Requires Netlify support intervention
- Escalate to: Senior Engineer + Netlify Support

---

### 3.2 Performance Degradation Response

**Severity:** P2 (High)
**Expected Duration:** 30-120 minutes

#### Symptoms/Detection
- Slow API response times (>5s for dashboard)
- High database query times
- Increased function execution duration
- Customer complaints about slowness
- Monitoring alerts: P99 latency exceeded

#### Impact Assessment
- **Customer Impact:** Slow but functional service
- **SLA Risk:** May violate response time SLA
- **User Experience:** Significantly degraded
- **Churn Risk:** Moderate

#### Resolution Steps

1. **Establish Performance Baseline**
   ```bash
   # Check current response times
   curl -w "@curl-format.txt" -o /dev/null -s \
     https://your-domain.com/api/stats?site_id=test

   # curl-format.txt:
   # time_namelookup: %{time_namelookup}
   # time_connect: %{time_connect}
   # time_appconnect: %{time_appconnect}
   # time_pretransfer: %{time_pretransfer}
   # time_redirect: %{time_redirect}
   # time_starttransfer: %{time_starttransfer}
   # time_total: %{time_total}
   ```

2. **Identify Performance Bottleneck**

   **A. Database Query Performance**
   ```bash
   # Enable query logging
   # Check function logs for slow queries
   netlify functions:log | grep "query duration"

   # Identify slow queries
   turso db shell <database-name> "EXPLAIN QUERY PLAN
     SELECT * FROM pageviews
     WHERE site_id = 'test'
     AND timestamp >= '2024-12-01'"

   # Check index usage
   turso db shell <database-name> ".indexes pageviews"
   ```

   **B. Function Cold Starts**
   ```bash
   # Check for cold start delays
   netlify functions:log | grep "Cold start"

   # Typical cold start: 1-3 seconds
   # If >5 seconds, optimize:
   # - Reduce function size
   # - Remove unnecessary dependencies
   # - Use esbuild bundler
   ```

   **C. External API Calls**
   ```bash
   # Identify slow third-party calls
   netlify functions:log | grep -E "stripe|github|google" | \
     grep "duration"

   # Add timeouts to external calls
   # Default timeout: 10 seconds
   ```

3. **Optimize Database Queries**
   ```sql
   -- Add missing indexes
   CREATE INDEX IF NOT EXISTS idx_pageviews_site_event_ts
   ON pageviews(site_id, event_type, timestamp);

   -- Optimize query
   -- Bad: SELECT * FROM pageviews
   -- Good: SELECT id, timestamp, event_type FROM pageviews

   -- Use EXPLAIN to verify index usage
   EXPLAIN QUERY PLAN
   SELECT COUNT(*) FROM pageviews
   WHERE site_id = 'test'
   AND timestamp >= '2024-12-01';

   -- Should show: "USING INDEX idx_pageviews_site_event_ts"
   ```

4. **Implement Query Caching**
   ```javascript
   // netlify/functions/lib/cache.js
   const cache = new Map();
   const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

   async function getCachedStats(siteId, startDate, endDate) {
     const key = `stats:${siteId}:${startDate}:${endDate}`;

     const cached = cache.get(key);
     if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
       return cached.data;
     }

     const data = await getStats(siteId, startDate, endDate);
     cache.set(key, { data, timestamp: Date.now() });

     return data;
   }

   // Clear cache periodically
   setInterval(() => {
     const now = Date.now();
     for (const [key, value] of cache.entries()) {
       if (now - value.timestamp > CACHE_TTL) {
         cache.delete(key);
       }
     }
   }, 60000);  // Every minute
   ```

5. **Optimize Function Bundle Size**
   ```bash
   # Check function bundle sizes
   ls -lh .netlify/functions-internal/*.js

   # Analyze bundle composition
   cd netlify/functions
   npm install --save-dev webpack-bundle-analyzer

   # Remove unused dependencies
   npm prune

   # Use tree-shaking
   # Change: const _ = require('lodash')
   # To: const { pick } = require('lodash/pick')
   ```

6. **Implement Parallel Query Execution**
   ```javascript
   // Bad: Sequential queries (slow)
   const daily = await getDailyStats(siteId, startDate, endDate);
   const pages = await getTopPages(siteId, startDate, endDate);
   const devices = await getDevices(siteId, startDate, endDate);

   // Good: Parallel queries (fast)
   const [daily, pages, devices] = await Promise.all([
     getDailyStats(siteId, startDate, endDate),
     getTopPages(siteId, startDate, endDate),
     getDevices(siteId, startDate, endDate)
   ]);
   ```

7. **Add Query Timeouts**
   ```javascript
   // Prevent long-running queries
   async function executeWithTimeout(query, timeoutMs = 5000) {
     return Promise.race([
       turso.execute(query),
       new Promise((_, reject) =>
         setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
       )
     ]);
   }
   ```

8. **Enable Database Read Replicas**
   ```bash
   # Create read replica in edge location
   turso db replicate <database-name> --location <closest-region>

   # Update read queries to use replica
   # Write queries still use primary
   ```

#### Performance Optimization Checklist

```
Database:
[ ] Indexes on frequently queried columns
[ ] Query results cached appropriately
[ ] Using SELECT only needed columns
[ ] Batch operations instead of individual queries
[ ] Connection pooling configured

Functions:
[ ] Dependencies minimized
[ ] Using esbuild bundler
[ ] Parallel execution where possible
[ ] Timeouts on external calls
[ ] Response streaming for large data

Frontend:
[ ] Assets minified and compressed
[ ] Code splitting implemented
[ ] Lazy loading for heavy components
[ ] CDN caching configured
[ ] HTTP/2 or HTTP/3 enabled
```

#### Verification Steps
- [ ] Response times returned to baseline
- [ ] P99 latency under SLA threshold
- [ ] Database query times <500ms
- [ ] Function execution times <2s
- [ ] No customer complaints (24h observation)

#### Performance Targets

| Metric | Target | Maximum | Current |
|--------|--------|---------|---------|
| Dashboard Load | <1s | 3s | ___ |
| API Response (P99) | <1s | 5s | ___ |
| Database Query | <200ms | 1s | ___ |
| Analytics Ingest | <50ms | 500ms | ___ |
| Function Cold Start | <2s | 5s | ___ |

#### Post-Incident Actions
1. Document performance bottleneck found
2. Add performance monitoring for affected path
3. Create performance regression tests
4. Review and optimize similar code paths
5. Schedule capacity planning review

#### Escalation Criteria
- Performance not improved after 2 hours
- Requires architectural changes
- Database performance degradation persistent
- Suspected infrastructure issue
- Escalate to: Senior Engineer + Database Specialist

---

### 3.3 High Load Mitigation

**Severity:** P2 (High)
**Expected Duration:** 15-60 minutes

#### Symptoms/Detection
- Sudden spike in traffic (>10x normal)
- Function invocations hitting limits
- Increased error rates under load
- Database connections maxing out
- Potential DDoS attack

#### Impact Assessment
- **Service Degradation:** Slow or failing responses
- **Customer Impact:** All users affected
- **Cost Impact:** Increased function invocations
- **Infrastructure Risk:** Potential cascade failures

#### Resolution Steps

1. **Assess Traffic Spike**
   ```bash
   # Check current traffic levels
   netlify functions:log --since 5m | wc -l

   # Compare to normal baseline
   # Normal: ~100 requests/min
   # High load: >1000 requests/min

   # Identify traffic sources
   netlify functions:log | grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" | \
     sort | uniq -c | sort -rn | head -20
   ```

2. **Determine If Legitimate or Attack**
   ```bash
   # Check User-Agent distribution
   netlify functions:log | grep "User-Agent" | sort | uniq -c

   # Check endpoint distribution
   netlify functions:log | grep -oE "GET|POST /api/[a-z-]+" | \
     sort | uniq -c | sort -rn

   # Legitimate: Distributed across many IPs, normal User-Agents
   # Attack: Few IPs, suspicious User-Agents, same endpoint
   ```

3. **Immediate Mitigation - Rate Limiting**
   ```bash
   # Tighten rate limits temporarily
   netlify env:set RATE_LIMIT_TRACK_MAX 500
   netlify env:set RATE_LIMIT_API_MAX 50
   netlify env:set RATE_LIMIT_MAX 50

   # Apply immediately
   netlify deploy --prod --trigger
   ```

4. **Block Malicious Traffic**
   ```javascript
   // Add to netlify/functions/lib/security.js

   const BLOCKED_IPS = new Set();
   const SUSPICIOUS_USER_AGENTS = [
     'bot', 'crawler', 'spider', 'scraper'
   ];

   function shouldBlockRequest(event) {
     const ip = event.headers['x-nf-client-connection-ip'];
     const userAgent = event.headers['user-agent'] || '';

     // Block known bad IPs
     if (BLOCKED_IPS.has(ip)) return true;

     // Block suspicious user agents
     if (SUSPICIOUS_USER_AGENTS.some(ua =>
       userAgent.toLowerCase().includes(ua))) {
       return true;
     }

     return false;
   }
   ```

5. **Enable Aggressive Caching**
   ```bash
   # Update _headers file
   /api/stats/*
     Cache-Control: public, max-age=300, stale-while-revalidate=3600

   /api/realtime/*
     Cache-Control: public, max-age=60

   # Deploy headers
   git add public/_headers
   git commit -m "Enable aggressive caching during high load"
   git push
   ```

6. **Implement Queue for Non-Critical Operations**
   ```javascript
   // For analytics ingestion under load
   const eventQueue = [];
   const MAX_QUEUE_SIZE = 10000;

   async function queueEvent(event) {
     if (eventQueue.length >= MAX_QUEUE_SIZE) {
       // Drop oldest events
       eventQueue.shift();
     }
     eventQueue.push(event);

     // Process queue in batches
     if (eventQueue.length >= 100) {
       await flushQueue();
     }
   }

   async function flushQueue() {
     const batch = eventQueue.splice(0, 100);
     await ingestEvents('pageviews', batch);
   }
   ```

7. **Scale Database Connections**
   ```bash
   # Add read replicas for read-heavy load
   turso db replicate <database-name> --location us-east-1
   turso db replicate <database-name> --location eu-west-1

   # Configure function to use nearest replica
   const TURSO_REGIONS = {
     'us-east-1': process.env.TURSO_URL_EAST,
     'eu-west-1': process.env.TURSO_URL_WEST
   };
   ```

8. **Enable Maintenance Mode (Last Resort)**
   ```bash
   # If load is overwhelming
   # Create maintenance page
   cat > public/503.html <<EOF
   <!DOCTYPE html>
   <html>
   <head><title>Service Temporarily Unavailable</title></head>
   <body>
     <h1>We'll be right back</h1>
     <p>Our service is experiencing high traffic.
        Please try again in a few minutes.</p>
   </body>
   </html>
   EOF

   # Redirect all traffic
   echo "/* /503.html 503" > public/_redirects

   # Deploy
   git add public/503.html public/_redirects
   git commit -m "Enable maintenance mode"
   git push
   ```

#### Load Testing

```bash
# Simulate high load (development only)
# Install Apache Bench
brew install httpd

# Test endpoint capacity
ab -n 10000 -c 100 https://your-domain.com/api/track

# Analyze results:
# - Requests per second
# - Time per request
# - Failed requests
# - Connection times
```

#### Verification Steps
- [ ] Traffic levels manageable
- [ ] Error rate below 1%
- [ ] Response times within SLA
- [ ] Database connections healthy
- [ ] No function timeout errors

#### Cost Impact Assessment

```bash
# Calculate function invocation costs
# Netlify pricing: $25 per 100K function runs (above free tier)
#
# Normal: 100K requests/day = $25/day (above free tier)
# High load: 1M requests/day = $250/day
# Attack: 10M requests/day = $2500/day
#
# Monitor Netlify usage:
netlify status
```

#### Post-Incident Actions
1. Analyze traffic patterns to identify cause
2. Implement permanent rate limiting improvements
3. Add DDoS protection service if needed
4. Review and optimize expensive endpoints
5. Create load testing suite
6. Document cost impact and mitigation

#### Escalation Criteria
- Sustained DDoS attack
- Traffic exceeding infrastructure capacity
- Cost impact >$500/day
- Requires Netlify or Cloudflare DDoS protection
- Escalate to: CTO + Netlify Support + Legal (if attack)

---

## 4. Common Issues

### 4.1 User Authentication Failures

**Severity:** P2-P3 (depends on scope)
**Expected Duration:** 10-30 minutes

#### Symptoms/Detection
- Individual users unable to login
- "Invalid credentials" for correct password
- Session expires immediately
- 2FA verification failures
- OAuth login redirects fail

#### Impact Assessment
- **Single User:** P3 (Low priority)
- **Multiple Users:** P2 (High priority)
- **All Users:** P1 (See section 2.3)
- **Account Lockout Risk:** User frustration, support tickets

#### Resolution Steps

1. **Verify User Exists**
   ```bash
   # Query user table
   turso db shell <database-name> \
     "SELECT id, email, created_at, last_login
      FROM users
      WHERE email = 'user@example.com'"
   ```

2. **Check Account Status**
   ```bash
   # Verify account not locked or disabled
   turso db shell <database-name> \
     "SELECT id, email, is_active, is_verified, failed_login_attempts
      FROM users
      WHERE email = 'user@example.com'"
   ```

3. **Reset Failed Login Attempts**
   ```bash
   # If account locked due to failed attempts
   turso db shell <database-name> \
     "UPDATE users
      SET failed_login_attempts = 0,
          locked_until = NULL
      WHERE email = 'user@example.com'"
   ```

4. **Verify Password Hash**
   ```bash
   # Test password hashing (locally, not production password)
   node -e "
   const bcrypt = require('bcryptjs');
   const password = 'test123';
   const hash = bcrypt.hashSync(password, 10);
   console.log('Hash:', hash);
   console.log('Verify:', bcrypt.compareSync(password, hash));
   "
   ```

5. **Check 2FA Status**
   ```bash
   # Verify 2FA settings
   turso db shell <database-name> \
     "SELECT id, email, mfa_enabled, mfa_secret
      FROM users
      WHERE email = 'user@example.com'"

   # Disable 2FA temporarily (emergency only)
   turso db shell <database-name> \
     "UPDATE users
      SET mfa_enabled = false
      WHERE email = 'user@example.com'"
   ```

6. **Reset Password (Admin)**
   ```bash
   # Generate password reset token
   curl -X POST https://your-domain.com/api/auth/admin/reset-password \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com"}'

   # Or manually set new password
   NEW_HASH=$(node -e "
   const bcrypt = require('bcryptjs');
   console.log(bcrypt.hashSync('TempPassword123!', 10));
   ")

   turso db shell <database-name> \
     "UPDATE users
      SET password_hash = '${NEW_HASH}'
      WHERE email = 'user@example.com'"
   ```

7. **Verify OAuth Connections**
   ```bash
   # Check OAuth linked accounts
   turso db shell <database-name> \
     "SELECT provider, provider_user_id, created_at
      FROM oauth_connections
      WHERE user_id = 'user-id'"

   # Unlink problematic OAuth account
   turso db shell <database-name> \
     "DELETE FROM oauth_connections
      WHERE user_id = 'user-id'
      AND provider = 'github'"
   ```

8. **Check Session Storage**
   ```bash
   # Verify active sessions
   turso db shell <database-name> \
     "SELECT id, user_id, created_at, expires_at
      FROM sessions
      WHERE user_id = 'user-id'
      AND expires_at > datetime('now')"

   # Clear all user sessions (force re-login)
   turso db shell <database-name> \
     "DELETE FROM sessions WHERE user_id = 'user-id'"
   ```

#### Common User Auth Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Forgot Password | "Invalid credentials" | Send password reset email |
| Account Locked | "Too many attempts" | Reset `failed_login_attempts` |
| 2FA Lost Device | "Invalid code" | Disable 2FA, use backup codes |
| OAuth Mismatch | "Account not found" | Link OAuth to existing account |
| Session Expired | "Please login again" | Normal behavior, extend session |
| Email Not Verified | "Verify your email" | Resend verification email |

#### Verification Steps
- [ ] User can login successfully
- [ ] Session persists correctly
- [ ] 2FA works (if enabled)
- [ ] OAuth login works (if used)
- [ ] User data accessible

#### User Communication Template
```
Hi [User Name],

We've resolved the login issue with your account. You should now be
able to access your dashboard normally.

Actions taken:
- [Specific fix applied]

If you continue to experience issues, please:
1. Clear your browser cache and cookies
2. Try an incognito/private window
3. Contact support@zta.io with your user ID: [USER_ID]

Thank you for your patience.
```

#### Post-Resolution Actions
1. Document root cause for user issue
2. Check for patterns across multiple users
3. Update documentation if user error
4. Add validation to prevent future occurrences

#### Escalation Criteria
- Account compromise suspected
- Multiple users with same issue
- Data integrity concern
- Escalate to: Senior Engineer + Security Lead

---

### 4.2 Analytics Tracking Issues

**Severity:** P2 (High)
**Expected Duration:** 20-45 minutes

#### Symptoms/Detection
- Events not appearing in dashboard
- Tracking script not loading
- CORS errors in browser console
- Customer reports: "Analytics not tracking"
- Zero pageviews for active site

#### Impact Assessment
- **Single Site:** P2 (Customer-specific)
- **Multiple Sites:** P1 (Platform issue)
- **Data Loss:** Yes - events not recorded
- **Revenue Impact:** Customer churn risk

#### Resolution Steps

1. **Verify Tracking Script Installation**
   ```bash
   # Check if script is accessible
   curl -I https://your-domain.com/js/analytics.js

   # Verify script content
   curl https://your-domain.com/js/analytics.js | head -20

   # Check for minification/corruption
   ```

2. **Test Tracking Endpoint**
   ```bash
   # Send test event
   curl -X POST https://your-domain.com/api/track \
     -H "Content-Type: application/json" \
     -d '{
       "site_id": "test-site-id",
       "event_type": "pageview",
       "page_path": "/test",
       "referrer": "https://example.com"
     }'

   # Expected response: 200 OK
   ```

3. **Check CORS Configuration**
   ```bash
   # Test CORS preflight
   curl -X OPTIONS https://your-domain.com/api/track \
     -H "Origin: https://customer-site.com" \
     -H "Access-Control-Request-Method: POST" \
     -v

   # Should return:
   # Access-Control-Allow-Origin: *
   # Access-Control-Allow-Methods: POST, OPTIONS
   ```

4. **Verify Site ID**
   ```bash
   # Check if site exists in database
   turso db shell <database-name> \
     "SELECT id, domain, created_at
      FROM sites
      WHERE id = 'test-site-id'"

   # Verify site is active
   turso db shell <database-name> \
     "SELECT id, domain, is_active
      FROM sites
      WHERE id = 'test-site-id'"
   ```

5. **Check Recent Events**
   ```bash
   # Query recent pageviews
   turso db shell <database-name> \
     "SELECT COUNT(*) as count, MAX(timestamp) as latest
      FROM pageviews
      WHERE site_id = 'test-site-id'"

   # If count is 0 but script is installed, tracking is broken
   ```

6. **Review Function Logs**
   ```bash
   # Check track function logs
   netlify functions:log track --since 1h

   # Look for:
   # - Validation errors
   # - Database errors
   # - Rate limit rejections
   # - CORS rejections
   ```

7. **Validate Tracking Script Integration**
   ```javascript
   // Customer should have this in their HTML:
   <script defer src="https://your-domain.com/js/analytics.js"
           data-site-id="their-site-id"></script>

   // Common mistakes:
   // - Wrong site_id
   // - Script not deferred
   // - Script blocked by ad blocker
   // - Content Security Policy blocking script
   ```

8. **Test End-to-End Tracking**
   ```bash
   # Create test HTML page
   cat > test-tracking.html <<EOF
   <!DOCTYPE html>
   <html>
   <head>
     <title>Analytics Test</title>
     <script defer src="https://your-domain.com/js/analytics.js"
             data-site-id="test-site-id"></script>
   </head>
   <body>
     <h1>Test Page</h1>
     <script>
       // Manually trigger event
       setTimeout(() => {
         if (window.zta) {
           window.zta.track('test_event', { test: true });
         }
       }, 1000);
     </script>
   </body>
   </html>
   EOF

   # Serve locally
   python3 -m http.server 8000

   # Open http://localhost:8000/test-tracking.html
   # Check browser console for errors
   # Verify event appears in dashboard
   ```

9. **Check Ad Blocker Interference**
   ```bash
   # Ad blockers may block analytics scripts
   # Common blocklists:
   # - EasyList
   # - EasyPrivacy
   # - uBlock Origin

   # Mitigation: Use custom script name
   # Instead of: analytics.js
   # Use: script.js or main.js

   # Or use first-party proxy
   # /collect -> /.netlify/functions/track
   ```

10. **Verify Data Pipeline**
    ```bash
    # Test each component:

    # 1. Script loads
    curl -I https://your-domain.com/js/analytics.js

    # 2. Events sent
    # (Check browser network tab)
    #  POST /api/track

    # 3. Function receives event
    netlify functions:log track | tail -10

    # 4. Database stores event
    turso db shell <database-name> \
      "SELECT * FROM pageviews
       WHERE site_id = 'test-site-id'
       ORDER BY timestamp DESC
       LIMIT 5"

    # 5. Dashboard displays event
    curl https://your-domain.com/api/stats?site_id=test-site-id
    ```

#### Verification Steps
- [ ] Tracking script loads without errors
- [ ] Events sent to /api/track endpoint
- [ ] Events stored in database
- [ ] Events appear in dashboard (may take 1-5 min)
- [ ] No CORS errors in browser console

#### Common Tracking Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Script 404 | Script not found | Verify deployment includes analytics.js |
| CORS Error | Blocked by CORS policy | Add domain to ALLOWED_ORIGINS |
| Ad Blocker | Script blocked | Rename script or use proxy |
| Wrong Site ID | Events not appearing | Verify data-site-id attribute |
| CSP Blocking | Script not executing | Update Content-Security-Policy |
| Rate Limited | 429 responses | Adjust rate limits |

#### Customer Guidance Template
```
Hi [Customer],

To troubleshoot analytics tracking issues, please verify:

1. Script Installation:
   <script defer src="https://your-domain.com/js/analytics.js"
           data-site-id="YOUR_SITE_ID"></script>

2. Check Browser Console:
   - Open Developer Tools (F12)
   - Check Console for errors
   - Check Network tab for failed requests

3. Verify Site ID:
   - Your site ID is: [SITE_ID]
   - Ensure it matches the data-site-id attribute

4. Test Page:
   Visit this URL to test: https://your-domain.com/test/tracking

If issues persist, please provide:
- Your website URL
- Screenshot of browser console errors
- Screenshot of Network tab showing /api/track request

We'll investigate further.

Support Team
```

#### Post-Resolution Actions
1. Document root cause
2. Update tracking documentation
3. Add monitoring for tracking failures
4. Create automated tracking health checks
5. Update customer onboarding guide

#### Escalation Criteria
- Tracking broken for multiple customers
- Infrastructure issue suspected
- Script loading issues from CDN
- Requires code changes to fix
- Escalate to: Senior Engineer + Frontend Lead

---

### 4.3 Webhook Failures

**Severity:** P2-P3 (depends on webhook type)
**Expected Duration:** 15-30 minutes

#### Symptoms/Detection
- Stripe webhook events not processing
- Payment status not updating
- Subscription changes not reflected
- Webhook endpoint returning errors
- Customer billing issues

#### Impact Assessment
- **Payment Webhooks:** P2 (Revenue impact)
- **Notification Webhooks:** P3 (Feature degradation)
- **Data Loss Risk:** Webhook events may be lost
- **Compliance Risk:** Subscription management affected

#### Resolution Steps

1. **Check Webhook Endpoint Health**
   ```bash
   # Test webhook endpoint
   curl -X POST https://your-domain.com/api/stripe/webhook \
     -H "Content-Type: application/json" \
     -H "Stripe-Signature: test" \
     -d '{}'

   # Should return 200 or validation error
   # Not 500 or timeout
   ```

2. **Review Webhook Logs**
   ```bash
   # Check Stripe webhook logs
   netlify functions:log stripe-webhook --since 6h

   # Look for:
   # - Signature validation failures
   # - Processing errors
   # - Database errors
   ```

3. **Verify Webhook Secret**
   ```bash
   # Check webhook secret is set
   netlify env:get STRIPE_WEBHOOK_SECRET

   # Compare with Stripe Dashboard:
   # https://dashboard.stripe.com/webhooks
   # Should match webhook signing secret
   ```

4. **Test Webhook Signature Validation**
   ```javascript
   // Test locally
   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

   const payload = JSON.stringify({ type: 'test' });
   const signature = stripe.webhooks.generateTestHeaderString({
     payload,
     secret: process.env.STRIPE_WEBHOOK_SECRET
   });

   try {
     const event = stripe.webhooks.constructEvent(
       payload,
       signature,
       process.env.STRIPE_WEBHOOK_SECRET
     );
     console.log('Valid signature');
   } catch (err) {
     console.error('Invalid signature:', err.message);
   }
   ```

5. **Check Stripe Webhook Configuration**
   ```bash
   # Via Stripe CLI
   stripe webhooks list

   # Verify:
   # - Endpoint URL is correct
   # - Events subscribed to required events:
   #   - customer.subscription.created
   #   - customer.subscription.updated
   #   - customer.subscription.deleted
   #   - invoice.payment_succeeded
   #   - invoice.payment_failed
   ```

6. **Replay Failed Webhook Events**
   ```bash
   # Via Stripe Dashboard:
   # https://dashboard.stripe.com/webhooks/[WEBHOOK_ID]
   # Click "..." on failed event
   # Click "Resend"

   # Or via Stripe CLI
   stripe events resend evt_1234567890
   ```

7. **Review Webhook Processing Logic**
   ```javascript
   // Common webhook issues:

   // A. Missing event type handler
   switch (event.type) {
     case 'customer.subscription.created':
       await handleSubscriptionCreated(event.data.object);
       break;
     case 'customer.subscription.updated':
       await handleSubscriptionUpdated(event.data.object);
       break;
     // ... other events
     default:
       console.log(`Unhandled event type: ${event.type}`);
   }

   // B. Database errors
   try {
     await turso.execute({
       sql: 'UPDATE users SET plan = ? WHERE stripe_customer_id = ?',
       args: [plan, customerId]
     });
   } catch (err) {
     console.error('Database error:', err);
     throw err;  // Return 500 to trigger retry
   }

   // C. Missing idempotency check
   const processedEvents = new Set();

   if (processedEvents.has(event.id)) {
     console.log(`Event ${event.id} already processed`);
     return { statusCode: 200 };
   }

   // Process event...
   processedEvents.add(event.id);
   ```

8. **Enable Webhook Logging**
   ```javascript
   // Add detailed logging to webhook handler
   exports.handler = async (event) => {
     console.log('Webhook received:', {
       type: event.type,
       id: event.id,
       timestamp: new Date().toISOString()
     });

     try {
       // Process webhook
       console.log('Processing webhook:', event.type);
       await processWebhook(event);
       console.log('Webhook processed successfully');

       return { statusCode: 200, body: 'OK' };
     } catch (err) {
       console.error('Webhook processing error:', {
         type: event.type,
         id: event.id,
         error: err.message,
         stack: err.stack
       });

       return { statusCode: 500, body: 'Error' };
     }
   };
   ```

9. **Implement Webhook Queue**
   ```javascript
   // For reliable webhook processing
   const webhookQueue = [];

   exports.handler = async (event) => {
     // Validate and queue immediately
     const webhookEvent = stripe.webhooks.constructEvent(...);

     // Store in database for processing
     await turso.execute({
       sql: `INSERT INTO webhook_queue
             (event_id, event_type, payload, status, created_at)
             VALUES (?, ?, ?, ?, ?)`,
       args: [
         webhookEvent.id,
         webhookEvent.type,
         JSON.stringify(webhookEvent),
         'pending',
         new Date().toISOString()
       ]
     });

     // Return 200 immediately
     return { statusCode: 200, body: 'Queued' };
   };

   // Separate processor function
   async function processWebhookQueue() {
     const pending = await turso.execute({
       sql: `SELECT * FROM webhook_queue
             WHERE status = 'pending'
             ORDER BY created_at ASC
             LIMIT 10`
     });

     for (const row of pending.rows) {
       try {
         await processWebhook(JSON.parse(row.payload));

         await turso.execute({
           sql: `UPDATE webhook_queue
                 SET status = 'processed', processed_at = ?
                 WHERE id = ?`,
           args: [new Date().toISOString(), row.id]
         });
       } catch (err) {
         await turso.execute({
           sql: `UPDATE webhook_queue
                 SET status = 'failed', error = ?
                 WHERE id = ?`,
           args: [err.message, row.id]
         });
       }
     }
   }
   ```

#### Verification Steps
- [ ] Webhook endpoint returns 200 for test events
- [ ] Signature validation working
- [ ] Events processing correctly
- [ ] Database updates reflected
- [ ] Customer subscriptions updated
- [ ] No failed webhooks in Stripe Dashboard

#### Webhook Troubleshooting Checklist

```
Configuration:
[ ] Webhook URL is correct
[ ] HTTPS endpoint (not HTTP)
[ ] Webhook secret matches Stripe dashboard
[ ] Required events are subscribed

Processing:
[ ] Signature validation succeeds
[ ] Event type handlers implemented
[ ] Database operations succeed
[ ] Idempotency implemented
[ ] Error handling in place

Monitoring:
[ ] Webhook failures logged
[ ] Alerts for failed webhooks
[ ] Retry mechanism for failures
[ ] Dead letter queue for persistent failures
```

#### Post-Resolution Actions
1. Document webhook failure cause
2. Add monitoring for webhook health
3. Implement webhook event replay mechanism
4. Add idempotency checks if missing
5. Create webhook testing suite

#### Escalation Criteria
- Webhook secret compromised
- Persistent webhook failures
- Payment processing affected
- Requires Stripe support assistance
- Escalate to: Senior Engineer + Stripe Support

---

## 5. Monitoring & Alerts

### 5.1 Monitoring Stack

**Infrastructure Monitoring:**
- Netlify Analytics (function metrics, error rates)
- Turso Console (database performance, connection counts)
- Stripe Dashboard (payment webhook status)

**Application Monitoring:**
- Function logs via `netlify functions:log`
- Error tracking in function responses
- Custom metrics logged to console

**Alert Triggers:**
```javascript
// Add to monitoring function
const ALERT_THRESHOLDS = {
  errorRate: 0.01,        // 1% error rate
  responseTime: 5000,      // 5 seconds
  dbConnections: 80,       // 80% of max connections
  rateLimitHits: 100       // 100 rate limit rejections/min
};
```

### 5.2 Key Metrics to Monitor

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| API Response Time (P99) | <1s | 1-5s | >5s |
| Database Query Time | <200ms | 200ms-1s | >1s |
| Error Rate | <0.1% | 0.1-1% | >1% |
| Function Invocations | Baseline | +50% | +200% |
| Database Connections | <50 | 50-80 | >80 |
| Failed Webhooks | 0 | 1-5/hr | >5/hr |

### 5.3 Health Check Endpoint

```javascript
// netlify/functions/health.js
exports.handler = async () => {
  const checks = {
    database: await checkDatabase(),
    functions: await checkFunctions(),
    externalAPIs: await checkExternalAPIs()
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok');

  return {
    statusCode: allHealthy ? 200 : 503,
    body: JSON.stringify({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    })
  };
};
```

---

## 6. Emergency Contacts

### 6.1 Internal Team

| Role | Primary | Backup | Escalation Path |
|------|---------|--------|-----------------|
| On-Call Engineer | [Name/Email/Phone] | [Name/Email/Phone] | → Senior Engineer |
| Senior Engineer | [Name/Email/Phone] | [Name/Email/Phone] | → CTO |
| CTO | [Name/Email/Phone] | - | → CEO |
| Security Lead | [Name/Email/Phone] | [Name/Email/Phone] | → CTO + Legal |

### 6.2 External Support

| Service | Support Contact | Status Page | Account Manager |
|---------|----------------|-------------|-----------------|
| Netlify | support@netlify.com | netlifystatus.com | [Name/Email] |
| Turso | support@turso.tech | status.turso.tech | [Name/Email] |
| Stripe | support@stripe.com | status.stripe.com | [Name/Email] |
| GitHub | support@github.com | githubstatus.com | - |

### 6.3 Escalation Matrix

**P1 Incidents:**
- 0-15 min: On-call Engineer responds
- 15-30 min: Escalate to Senior Engineer + CTO
- 30-60 min: Engage external support
- >60 min: CEO involved + customer communication

**P2 Incidents:**
- 0-60 min: On-call Engineer handles
- 1-4 hours: Escalate to Senior Engineer
- >4 hours: CTO involved

---

## Document Maintenance

### Review Schedule
- **Monthly:** Review and update contact information
- **Quarterly:** Test runbook procedures
- **After Incidents:** Update with lessons learned
- **Annually:** Comprehensive runbook review

### Version History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-12-21 | Initial creation | [Author] |

### Contributing
To update this runbook:
1. Test procedures in development environment
2. Document changes in version history
3. Get review from Senior Engineer
4. Update related documentation

---

**Document End**

For additional operational procedures, see:
- [Incident Response Plan](./INCIDENT_RESPONSE.md)
- [Service Level Agreement](./SLA.md)
- [API Documentation](./API.md)
