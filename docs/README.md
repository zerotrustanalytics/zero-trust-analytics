# Zero Trust Analytics API Documentation

This directory contains comprehensive API documentation for the Zero Trust Analytics platform.

## Documentation Files

### 📄 [openapi.yaml](./openapi.yaml)

Complete OpenAPI 3.0 specification for the API. Use this file with tools like:

- **Swagger UI**: Interactive API documentation
- **Postman**: Import to test endpoints
- **Code Generators**: Generate client SDKs in various languages
- **API Validators**: Validate requests and responses

**View in Swagger Editor**: [https://editor.swagger.io/](https://editor.swagger.io/) (paste the content)

### 📘 [API.md](./API.md)

Human-readable API guide with:

- Complete endpoint documentation
- Authentication and security details
- Code examples in JavaScript, Python, and cURL
- Best practices and usage patterns
- Error handling guidelines

## Quick Start

### 1. Authentication

```bash
# Register a new account
curl -X POST https://ztas.io/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecureP@ssw0rd123",
    "plan": "pro"
  }'
```

### 2. Create a Site

```bash
curl -X POST https://ztas.io/api/sites/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"domain": "example.com"}'
```

### 3. Track Events

```bash
curl -X POST https://ztas.io/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "site_abc123",
    "type": "pageview",
    "path": "/home"
  }'
```

### 4. Get Analytics

```bash
curl https://ztas.io/api/stats?siteId=site_abc123&period=7d \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## API Endpoint Categories

### Authentication (`/api/auth/*`)

- `POST /auth/register` - Create account
- `POST /auth/login` - Login
- `POST /auth/forgot` - Request password reset
- `POST /auth/reset` - Reset password
- `GET /auth/verify-reset-token` - Verify reset token
- `POST /auth/2fa` - Manage 2FA (setup, verify, disable, validate)
- `GET /auth/google` - Google OAuth
- `GET /auth/github` - GitHub OAuth
- `GET /auth/oauth-callback` - OAuth callback handler

### Sites Management (`/api/sites/*`)

- `GET /sites/list` - List user's sites
- `POST /sites/create` - Create new site
- `POST /sites/update` - Update site settings
- `POST /sites/delete` - Delete site
- `POST /sites/share` - Create public share link

### Analytics (`/api/*`)

- `POST /track` - Track events (pageviews, custom events)
- `GET /stats` - Get analytics statistics
- `GET /public-stats` - Get public shared statistics

### User Management (`/api/user/*`)

- `GET /user/status` - Get account status
- `GET /user/sessions` - List active sessions

### Billing (`/api/stripe/*`)

- `POST /stripe/checkout` - Create checkout session
- `POST /stripe/portal` - Create customer portal session

## Security Features

### Zero-Trust Privacy

- All IP addresses are cryptographically hashed
- User agents are hashed before storage
- No PII is stored in plain text
- Session IDs are temporary and hashed

### Authentication

- JWT (JSON Web Tokens) for API authentication
- CSRF tokens for state-changing operations
- Optional Two-Factor Authentication (TOTP)
- OAuth support (Google, GitHub)

### Rate Limiting

- Registration: 5 requests/minute
- Login: 10 requests/minute
- Password reset: 3 requests/minute
- Analytics tracking: 1000 requests/minute

### CORS Protection

- Origin validation against registered site domains
- Automatic bot filtering
- Strict CORS headers

## Using the OpenAPI Specification

### With Swagger UI (Docker)

```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/docs/openapi.yaml \
  -v $(pwd)/docs:/docs \
  swaggerapi/swagger-ui
```

Then visit: http://localhost:8080

### With Postman

1. Open Postman
2. Click "Import"
3. Select `openapi.yaml`
4. All endpoints will be imported as a collection

### Generate Client SDK

#### TypeScript/JavaScript

```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g typescript-axios \
  -o ./sdk/typescript
```

#### Python

```bash
docker run --rm \
  -v $(pwd):/local openapitools/openapi-generator-cli generate \
  -i /local/docs/openapi.yaml \
  -g python \
  -o /local/sdk/python
```

#### Go

```bash
docker run --rm \
  -v $(pwd):/local openapitools/openapi-generator-cli generate \
  -i /local/docs/openapi.yaml \
  -g go \
  -o /local/sdk/go
```

## Validation

Validate API requests and responses against the schema:

### Using Spectral (API linter)

```bash
npm install -g @stoplight/spectral-cli
spectral lint docs/openapi.yaml
```

### Using OpenAPI Validator

```bash
npm install -g openapi-schema-validator
openapi-schema-validator docs/openapi.yaml
```

## Testing

### Using Bruno (Open Source API Client)

1. Install Bruno: https://www.usebruno.com/
2. Create a new collection
3. Import `openapi.yaml`
4. Set environment variables for `baseUrl`, `token`, `csrfToken`

### Using HTTPie

```bash
# Register
http POST https://ztas.io/api/auth/register \
  email=user@example.com \
  password=SecureP@ssw0rd123 \
  plan=pro

# Login
http POST https://ztas.io/api/auth/login \
  email=user@example.com \
  password=SecureP@ssw0rd123

# Get stats
http GET https://ztas.io/api/stats \
  siteId==site_abc123 \
  period==7d \
  "Authorization: Bearer TOKEN"
```

## Response Examples

All responses are in JSON format.

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "error": "Error message"
}
```

### Validation Error

```json
{
  "error": "Validation failed",
  "details": [
    "Password must be at least 12 characters",
    "Email is required"
  ]
}
```

### Rate Limit Error

```json
{
  "error": "Rate limit exceeded",
  "resetIn": 45000
}
```

## Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 204 | No Content | Success with no response body |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## Environment Variables

When self-hosting, configure these environment variables:

```bash
# Authentication
JWT_SECRET=your-secret-key-here
HASH_SECRET=your-hash-secret-here

# Database
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Storage
NETLIFY_BLOBS_CONTEXT=deploy

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...

# Email (optional)
SENDGRID_API_KEY=SG...
FROM_EMAIL=noreply@ztas.io

# Application
URL=https://ztas.io
```

## Best Practices

### Security

1. ✅ Always use HTTPS in production
2. ✅ Store JWT tokens securely (HttpOnly cookies recommended)
3. ✅ Never commit secrets to version control
4. ✅ Rotate JWT_SECRET regularly
5. ✅ Implement proper session management

### Performance

1. ✅ Use batch tracking for multiple events
2. ✅ Cache analytics responses (5 minutes recommended)
3. ✅ Implement request debouncing
4. ✅ Use appropriate time periods in queries

### Error Handling

1. ✅ Handle rate limits with exponential backoff
2. ✅ Validate input client-side before API calls
3. ✅ Log errors for debugging
4. ✅ Show user-friendly error messages

## Support

- **Documentation**: https://ztas.io/docs
- **GitHub**: https://github.com/your-repo
- **Email**: support@ztas.io

## License

MIT License - See [LICENSE](../LICENSE.txt) for details

---

**Last Updated**: December 2024
**API Version**: 1.0.0
