# Input Validation System

This directory contains a comprehensive input validation system that protects all API endpoints from malicious or malformed input.

## Files

### validators.js
Provides low-level validation functions for common data types. Each validator returns an object with:
- `valid` (boolean): Whether the input passed validation
- `error` (string, optional): Error message if validation failed
- `errors` (array, optional): Multiple error messages for complex validations
- `sanitized` (any, optional): Cleaned/normalized version of the input

#### Available Validators

**validateEmail(email)**
- RFC 5322 compliant email validation
- Normalizes to lowercase
- Checks length limits (254 chars max)
- Prevents consecutive dots

**validatePassword(password)**
- Minimum 12 characters, maximum 128
- Requires: uppercase, lowercase, number, special character
- Detects common passwords
- Returns strength rating (weak/medium/strong)

**validateDomain(domain)**
- Validates domain format
- Removes protocol, www, trailing slashes
- Checks length (253 chars max)
- Blocks localhost and internal domains

**validateSiteId(siteId)**
- Alphanumeric with hyphens/underscores
- Length: 8-64 characters

**validateUUID(uuid)**
- Validates UUID v4 format
- Normalizes to lowercase

**validateDateRange(start, end)**
- Validates both dates are valid
- Ensures end > start
- Prevents future dates
- Limits range to 1 year max
- Prevents dates older than 2 years

**sanitizeString(str, options)**
- XSS prevention through HTML entity encoding
- Removes control characters
- Truncates to maxLength (default 1000)
- Options:
  - `maxLength`: Maximum string length
  - `allowNewlines`: Keep newline characters
  - `trim`: Trim whitespace (default true)

**validatePlan(plan)**
- Valid plans: solo, starter, pro, business, scale
- Defaults to 'pro' if invalid

**validatePagination(page, limit)**
- Page: 1-10000
- Limit: 1-100

**validatePeriod(period)**
- Valid periods: 24h, 7d, 30d, 90d, 365d, custom
- Defaults to '7d' if invalid

**validateURL(url)**
- Only allows HTTP/HTTPS protocols
- Blocks localhost and private IPs
- Returns normalized URL

**validateBoolean(value)**
- Converts strings ('true', 'false', 'yes', 'no')
- Converts numbers (0 = false, non-zero = true)

**validateObjectKeys(obj, allowedKeys)**
- Ensures object only contains expected keys
- Returns list of unexpected keys

### schemas.js
Defines validation schemas for each API endpoint. Each schema maps field names to validation rules:

```javascript
{
  fieldName: {
    required: true/false,
    validator: validatorFunction,
    default: defaultValue, // if optional
    options: {}            // passed to validator
  }
}
```

#### Available Schemas

- **authRegisterSchema**: email, password, plan
- **authLoginSchema**: email, password
- **siteCreateSchema**: domain
- **statsQuerySchema**: siteId, period, startDate, endDate
- **siteUpdateSchema**: siteId, domain, name
- **siteDeleteSchema**: siteId
- **userUpdateSchema**: email, name
- **passwordChangeSchema**: currentPassword, newPassword
- **teamInviteSchema**: email, role
- **paginationSchema**: page, limit
- **goalCreateSchema**: siteId, name, type, value
- **funnelCreateSchema**: siteId, name, steps
- **exportDataSchema**: siteId, format, startDate, endDate
- **trackEventSchema**: siteId, event, url, referrer

### validateRequest Helper

The main validation function that applies a schema to incoming data:

```javascript
import { validateRequest, authLoginSchema } from './lib/schemas.js';

const validated = validateRequest(authLoginSchema, body, logger);
```

**Features:**
- Validates all required fields are present
- Runs validator functions for each field
- Applies default values for optional fields
- Returns sanitized data
- Throws `ValidationError` with details on failure
- Logs validation progress and failures

## Usage in Endpoints

### Before (Manual Validation)

```javascript
const { email, password } = await req.json();

if (!email || !password) {
  return Errors.validationError('Email and password required');
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return Errors.validationError('Invalid email format');
}
```

### After (Schema Validation)

```javascript
import { validateRequest, authLoginSchema } from './lib/schemas.js';

const body = await req.json();
const validated = validateRequest(authLoginSchema, body, logger);
const { email, password } = validated;
```

## Security Benefits

### XSS Prevention
All user-provided strings are sanitized before storage:
- HTML entities are encoded (`<`, `>`, `&`, `"`, `'`, `/`)
- Control characters are removed
- Length limits are enforced

### Injection Prevention
- Domain validation prevents protocol injection
- URL validation blocks malicious schemes
- String sanitization prevents script injection

### DoS Prevention
- Pagination limits prevent resource exhaustion
- Date range limits prevent expensive queries
- String length limits prevent memory attacks

### Data Integrity
- Type validation ensures correct data types
- Format validation ensures data is parseable
- Range validation prevents invalid values

## Best Practices

1. **Always validate at the edge**: Validate as soon as data enters the system
2. **Use schemas consistently**: Define a schema for every endpoint
3. **Sanitize before storage**: Never store unsanitized user input
4. **Log validation failures**: Track attempted attacks
5. **Return generic errors**: Don't leak schema details to attackers
6. **Keep validators pure**: No side effects in validation functions

## Examples

### Adding a New Endpoint

1. Create a schema in `schemas.js`:
```javascript
export const myEndpointSchema = {
  email: {
    required: true,
    validator: validateEmail
  },
  message: {
    required: true,
    validator: (msg) => {
      if (!msg) return { valid: false, error: 'Message required' };
      const sanitized = sanitizeString(msg, { maxLength: 500 });
      return { valid: true, sanitized };
    }
  }
};
```

2. Use it in your endpoint:
```javascript
import { validateRequest, myEndpointSchema } from './lib/schemas.js';

const body = await req.json();
const validated = validateRequest(myEndpointSchema, body, logger);
const { email, message } = validated;
```

### Creating a Custom Validator

```javascript
export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove non-digits
  const digits = phone.replace(/\D/g, '');

  // US phone numbers are 10 digits
  if (digits.length !== 10) {
    return { valid: false, error: 'Invalid phone number format' };
  }

  // Format as (XXX) XXX-XXXX
  const sanitized = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;

  return { valid: true, sanitized };
}
```

## Testing

Always test validators with:
- Valid input (happy path)
- Missing input (required fields)
- Invalid format
- Edge cases (empty strings, null, undefined)
- Malicious input (XSS attempts, injection attempts)
- Boundary values (min/max lengths)

## Error Handling

Validation errors are automatically caught and handled by the error handler:

```javascript
try {
  const validated = validateRequest(schema, data, logger);
  // ... use validated data
} catch (err) {
  return handleError(err, logger, origin);
}
```

The `handleError` function recognizes `ValidationError` and returns a 400 response with appropriate error messages.

## Performance Considerations

- Validators are synchronous (no async overhead)
- Regex patterns are compiled once
- String operations are efficient
- No external dependencies
- Schema validation is O(n) where n = number of fields

## Maintenance

When adding new validators:
1. Add the validator function to `validators.js`
2. Export it for use in schemas
3. Document parameters and return values
4. Add JSDoc comments
5. Test thoroughly
6. Update this documentation

## Migration Guide

For existing endpoints without validation:

1. Identify all user inputs
2. Create a schema with appropriate validators
3. Import `validateRequest` and your schema
4. Replace manual validation with `validateRequest`
5. Remove redundant validation code
6. Test thoroughly
7. Monitor logs for validation failures

## Security Checklist

- [ ] All user inputs are validated
- [ ] Validation happens before business logic
- [ ] Strings are sanitized for XSS
- [ ] Length limits are enforced
- [ ] Type checking is performed
- [ ] Range validation is applied
- [ ] Error messages don't leak information
- [ ] Validation failures are logged
- [ ] Schemas are complete (no missing fields)
- [ ] Default values are safe
