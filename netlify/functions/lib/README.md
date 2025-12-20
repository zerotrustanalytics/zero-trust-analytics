# Zero Trust Analytics - Function Library

## Architecture Improvements

This directory contains shared libraries used across all Netlify functions to enforce consistent patterns and improve code quality.

## Libraries

### 1. Logger (`logger.js`)

Structured logging system that replaces all `console.log` and `console.error` calls.

#### Features

- **Log Levels**: `debug`, `info`, `warn`, `error`
- **Request Tracing**: Automatic request ID generation for tracing requests across logs
- **Context-Aware**: Include context data with every log entry
- **Environment-Aware**: Pretty formatting in dev, JSON in production
- **PII-Safe**: Automatically sanitizes sensitive data (passwords, tokens, emails, IPs)
- **Timestamps**: ISO 8601 timestamps on all log entries

#### Usage

```javascript
import { createFunctionLogger } from './lib/logger.js';

export default async function handler(req, context) {
  // Create a logger for this function
  const logger = createFunctionLogger('my-function', req, context);

  // Log at different levels
  logger.debug('Debug information', { userId: '123' });
  logger.info('User logged in successfully', { userId: '123' });
  logger.warn('Rate limit approaching', { current: 95, limit: 100 });
  logger.error('Database connection failed', error, { query: 'SELECT...' });

  // Create child loggers with additional context
  const userLogger = logger.child({ userId: '123', email: 'user@example.com' });
  userLogger.info('Processing user action');

  return new Response('OK');
}
```

#### Log Output Examples

**Development (Pretty Format):**
```
[2025-12-20T10:30:45.123Z] INFO: User logged in successfully
{
  "function": "auth-login",
  "method": "POST",
  "path": "/api/auth/login",
  "userId": "123",
  "requestId": "req_abc123"
}
```

**Production (JSON Format):**
```json
{"timestamp":"2025-12-20T10:30:45.123Z","level":"INFO","message":"User logged in successfully","function":"auth-login","method":"POST","path":"/api/auth/login","userId":"123","requestId":"req_abc123"}
```

#### Best Practices

1. **Use appropriate log levels:**
   - `debug`: Detailed diagnostic info (not shown in production)
   - `info`: General informational messages (login success, data processed)
   - `warn`: Warning messages (rate limits, validation issues, business logic warnings)
   - `error`: Error messages with stack traces

2. **Include context, not details:**
   ```javascript
   // Good
   logger.info('User created', { userId: user.id, plan: 'pro' });

   // Bad - includes PII (will be sanitized)
   logger.info('User created', { email: 'user@example.com', password: 'secret' });
   ```

3. **Log business events, not implementation details:**
   ```javascript
   // Good
   logger.info('Payment processed successfully', { orderId, amount, currency });

   // Bad
   logger.debug('Entered function handler');
   logger.debug('Created variable x');
   ```

---

### 2. Error Handler (`error-handler.js`)

Centralized error handling with custom error types and sanitized responses.

#### Custom Error Types

- **ValidationError** (400): Invalid user input
- **AuthError** (401): Authentication required/failed
- **ForbiddenError** (403): Insufficient permissions
- **NotFoundError** (404): Resource not found
- **ConflictError** (409): Conflict with current state
- **RateLimitError** (429): Rate limit exceeded
- **ExternalServiceError** (502): External service failure
- **DatabaseError** (500): Database operation failure

#### Usage

**Basic Error Handling:**

```javascript
import { createFunctionLogger } from './lib/logger.js';
import {
  handleError,
  ValidationError,
  NotFoundError
} from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('my-function', req, context);
  const origin = req.headers.get('origin');

  try {
    const data = await req.json();

    // Throw typed errors
    if (!data.siteId) {
      throw new ValidationError('Site ID is required');
    }

    const site = await getSite(data.siteId);
    if (!site) {
      throw new NotFoundError('Site');
    }

    // Process request...
    return new Response(JSON.stringify({ success: true }));

  } catch (err) {
    // Centralized error handling
    return handleError(err, logger, origin);
  }
}
```

**Using Error Wrapper:**

```javascript
import { withErrorHandler } from './lib/error-handler.js';

async function myHandler(req, context) {
  // Your handler logic
  // Errors are automatically caught and handled
}

// Export wrapped handler
export default withErrorHandler(myHandler, 'my-function');
```

**Validation Helpers:**

```javascript
import { validateRequired, assert } from './lib/error-handler.js';

// Validate required fields
const data = await req.json();
validateRequired(data, ['email', 'password', 'siteId']);

// Assert conditions
assert(amount > 0, 'Amount must be positive');
assert(user.plan === 'pro', 'Feature requires Pro plan');
```

**External Service Calls:**

```javascript
import { withExternalService, withDatabase } from './lib/error-handler.js';

// Wrap external API calls
const stripeData = await withExternalService(
  () => stripe.customers.retrieve(customerId),
  'Stripe'
);

// Wrap database calls
const user = await withDatabase(
  () => db.query('SELECT * FROM users WHERE id = ?', [userId]),
  'fetch user'
);
```

#### Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": "Site ID is required",
  "code": "VALIDATION_ERROR",
  "details": {
    "missing": ["siteId"]
  }
}
```

#### Security Features

- **No Internal Details**: Stack traces and internal errors never exposed to clients
- **Sanitized Messages**: User-friendly error messages
- **Proper Status Codes**: HTTP status codes match error types
- **Security Headers**: HSTS, X-Frame-Options, etc. included
- **CORS Support**: Proper CORS headers for allowed origins

---

### 3. Migration Guide

#### Before (Old Pattern):

```javascript
export default async function handler(req, context) {
  try {
    const data = await req.json();

    if (!data.siteId) {
      return new Response(JSON.stringify({ error: 'Site ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const site = await getSite(data.siteId);
    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Process...

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

#### After (New Pattern):

```javascript
import { createFunctionLogger } from './lib/logger.js';
import { handleError, ValidationError, NotFoundError } from './lib/error-handler.js';

export default async function handler(req, context) {
  const logger = createFunctionLogger('my-function', req, context);
  const origin = req.headers.get('origin');

  try {
    const data = await req.json();

    if (!data.siteId) {
      logger.warn('Missing site ID in request');
      throw new ValidationError('Site ID required');
    }

    const site = await getSite(data.siteId);
    if (!site) {
      logger.warn('Site not found', { siteId: data.siteId });
      throw new NotFoundError('Site');
    }

    logger.info('Processing site request', { siteId: data.siteId });

    // Process...

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return handleError(err, logger, origin);
  }
}
```

#### Key Improvements

1. **Structured Logging**: Replace all `console.log`/`console.error` with logger
2. **Typed Errors**: Use custom error classes instead of manual Response creation
3. **Context**: Include relevant context with logs (but no PII)
4. **Centralized Handling**: Single error handler instead of scattered try/catch
5. **Request Tracing**: Automatic request IDs for debugging

---

### 4. Environment Variables

Configure logging behavior via environment variables:

```bash
# Log level (debug, info, warn, error)
LOG_LEVEL=info

# Environment (affects formatting)
NODE_ENV=production
NETLIFY_DEV=false  # Set by Netlify CLI in dev mode
```

---

### 5. Testing with Logger

**Test logs in development:**

```javascript
// Set environment for pretty logs
process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL = 'debug';

const logger = createLogger({ test: true });
logger.debug('This will show in dev');
logger.info('All logs visible');
```

**Test logs in production:**

```javascript
// Set environment for JSON logs
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'info';

const logger = createLogger();
logger.debug('This will NOT show (below threshold)');
logger.info('This will show as JSON');
```

---

### 6. Updated Functions

The following critical functions have been updated to use the new architecture:

1. **auth-login.js** - Authentication logging with security context
2. **auth-register.js** - Registration flow with validation logging
3. **track.js** - Event tracking with batch processing logs
4. **stats.js** - Analytics queries with performance logging
5. **stripe-webhook.js** - Payment webhook processing with detailed event logs

---

### 7. Remaining Work

**Functions still using console.log** (62 instances across ~30+ files):

To complete the migration, apply the same pattern to:
- activity-log.js
- alerts.js
- annotations.js
- api-keys.js
- auth-2fa.js
- auth-forgot.js
- auth-oauth-callback.js
- errors.js
- export.js
- funnels.js
- goals.js
- gsc.js
- And remaining functions...

Use the migration guide above as a reference.

---

### 8. Benefits

**Before:**
- ❌ Scattered console.log everywhere
- ❌ No request tracing
- ❌ Inconsistent error responses
- ❌ PII risks in logs
- ❌ No production/dev formatting
- ❌ Hard to debug distributed issues

**After:**
- ✅ Structured, searchable logs
- ✅ Request IDs for tracing
- ✅ Consistent error handling
- ✅ PII automatically sanitized
- ✅ Environment-aware formatting
- ✅ Easy debugging with context

---

### 9. Integration with Monitoring Tools

The JSON log format integrates seamlessly with:

- **CloudWatch Logs**: Parse JSON logs for metrics and alarms
- **Datadog**: Automatic field extraction from JSON
- **Splunk**: Index JSON fields for search
- **ELK Stack**: Direct JSON ingestion
- **Sentry**: Structured error context

Example CloudWatch Insights query:
```
fields @timestamp, message, level, function, userId, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

---

## Questions?

For questions or issues with the logging/error handling system, refer to:
- Logger source: `netlify/functions/lib/logger.js`
- Error handler source: `netlify/functions/lib/error-handler.js`
- Example usage: See updated functions listed in section 6
