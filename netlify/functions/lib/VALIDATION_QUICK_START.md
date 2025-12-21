# Input Validation Quick Start Guide

## 5-Minute Integration Guide

### Step 1: Import the Schema

```javascript
import { validateRequest, yourEndpointSchema } from './lib/schemas.js';
```

### Step 2: Get Request Data

```javascript
// For POST/PUT/PATCH with JSON body
const body = await req.json();

// For GET with query parameters
const params = {
  field1: url.searchParams.get('field1'),
  field2: url.searchParams.get('field2')
};
```

### Step 3: Validate

```javascript
try {
  const validated = validateRequest(yourEndpointSchema, body, logger);
  const { field1, field2 } = validated;

  // Use validated data - it's already sanitized!

} catch (err) {
  return handleError(err, logger, origin);
}
```

## Common Schemas

```javascript
// User Registration
import { authRegisterSchema } from './lib/schemas.js';
// Fields: email, password, plan

// User Login
import { authLoginSchema } from './lib/schemas.js';
// Fields: email, password

// Site Creation
import { siteCreateSchema } from './lib/schemas.js';
// Fields: domain

// Stats Query
import { statsQuerySchema } from './lib/schemas.js';
// Fields: siteId, period, startDate, endDate
```

## Creating a Custom Schema

```javascript
// In schemas.js
export const myEndpointSchema = {
  email: {
    required: true,
    validator: validateEmail
  },
  name: {
    required: true,
    validator: (name) => {
      const sanitized = sanitizeString(name, { maxLength: 100 });
      if (sanitized.length < 2) {
        return { valid: false, error: 'Name too short' };
      }
      return { valid: true, sanitized };
    }
  },
  age: {
    required: false,
    validator: (age) => {
      const num = parseInt(age, 10);
      if (isNaN(num) || num < 0 || num > 150) {
        return { valid: false, error: 'Invalid age' };
      }
      return { valid: true, sanitized: num };
    },
    default: null
  }
};
```

## Common Validators

```javascript
import {
  validateEmail,       // RFC 5322 email validation
  validatePassword,    // Strong password (12+ chars, complexity)
  validateDomain,      // Domain format validation
  validateSiteId,      // Alphanumeric, 8-64 chars
  validateUUID,        // UUID v4 format
  validateDateRange,   // Date range validation
  sanitizeString,      // XSS prevention
  validatePlan,        // Subscription plan
  validatePagination,  // Page/limit validation
  validatePeriod,      // Time period (24h, 7d, etc)
  validateURL,         // URL format
  validateBoolean      // Boolean conversion
} from './lib/validators.js';
```

## Sanitizing User Input

```javascript
import { sanitizeString } from './lib/validators.js';

// Basic sanitization
const clean = sanitizeString(userInput);

// With options
const clean = sanitizeString(userInput, {
  maxLength: 500,
  allowNewlines: true,
  trim: true
});
```

## Validator Return Format

All validators return an object:

```javascript
// On success
{
  valid: true,
  sanitized: "cleaned@email.com"  // Optional
}

// On failure
{
  valid: false,
  error: "Invalid email format"   // Single error
}

// On failure (multiple errors)
{
  valid: false,
  errors: [                        // Multiple errors
    "Password must be 12+ characters",
    "Password must contain uppercase"
  ]
}
```

## Complete Endpoint Example

```javascript
import { authenticateRequest, corsPreflightResponse, successResponse, Errors, getSecurityHeaders } from './lib/auth.js';
import { createFunctionLogger } from './lib/logger.js';
import { handleError } from './lib/error-handler.js';
import { validateRequest, myEndpointSchema } from './lib/schemas.js';
import { doSomething } from './lib/storage.js';

export default async function handler(req, context) {
  const origin = req.headers.get('origin');
  const logger = createFunctionLogger('my-endpoint', req, context);

  logger.info('Request received');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(origin, 'POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    logger.warn('Invalid HTTP method', { method: req.method });
    return Errors.methodNotAllowed();
  }

  // Authenticate
  const auth = authenticateRequest(Object.fromEntries(req.headers));
  if (auth.error) {
    logger.warn('Authentication failed');
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: getSecurityHeaders(origin)
    });
  }

  try {
    const body = await req.json();

    // Validate and sanitize input
    const validated = validateRequest(myEndpointSchema, body, logger);
    const { field1, field2 } = validated;

    logger.debug('Input validated successfully');

    // Use validated data
    const result = await doSomething(field1, field2);

    logger.info('Operation successful');

    return successResponse({ success: true, result }, 200, origin);
  } catch (err) {
    return handleError(err, logger, origin);
  }
}

export const config = {
  path: '/api/my-endpoint'
};
```

## Testing Your Validation

Test with curl:

```bash
# Valid request
curl -X POST https://your-api.com/api/my-endpoint \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'

# Missing field (should fail)
curl -X POST https://your-api.com/api/my-endpoint \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Invalid format (should fail)
curl -X POST https://your-api.com/api/my-endpoint \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"short"}'

# XSS attempt (should be sanitized)
curl -X POST https://your-api.com/api/my-endpoint \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"<script>alert(1)</script>"}'
```

## Error Response Format

When validation fails, you'll get:

```json
{
  "error": "Validation failed",
  "details": [
    "Email is required",
    "Password must be at least 12 characters"
  ]
}
```

Status code: `400 Bad Request`

## Tips

1. **Always validate at the edge** - Validate immediately when data enters
2. **Use schemas consistently** - Don't mix manual and schema validation
3. **Trust sanitized data** - Once validated, the data is safe to use
4. **Log validation failures** - They might indicate attacks
5. **Don't leak schema details** - Keep error messages generic in production
6. **Test with malicious input** - XSS, SQL injection, etc.

## Common Mistakes

❌ **Don't do this:**
```javascript
// Validating after use (too late!)
const user = await getUser(email);
const validated = validateRequest(schema, { email });
```

✅ **Do this:**
```javascript
// Validate first
const validated = validateRequest(schema, { email });
const user = await getUser(validated.email);
```

❌ **Don't do this:**
```javascript
// Using unvalidated data
const { email } = await req.json();
await createUser(email);
```

✅ **Do this:**
```javascript
// Use validated data
const body = await req.json();
const { email } = validateRequest(schema, body, logger);
await createUser(email);
```

## Performance

- Validation adds ~1-2ms overhead per request
- Benefits far outweigh cost:
  - Prevents expensive DB queries on invalid data
  - Stops attacks before they reach business logic
  - Reduces error handling complexity

## Help

- Full documentation: `/netlify/functions/lib/VALIDATION.md`
- Implementation summary: `/VALIDATION_IMPLEMENTATION.md`
- Validators source: `/netlify/functions/lib/validators.js`
- Schemas source: `/netlify/functions/lib/schemas.js`
