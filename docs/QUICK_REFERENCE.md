# Zero Trust Analytics API - Quick Reference

## Base URL
```
https://ztas.io/api
```

## Authentication Header
```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Common Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Register new account |
| POST | `/auth/login` | No | Login to account |
| POST | `/auth/forgot` | No | Request password reset |
| POST | `/auth/reset` | No | Reset password with token |
| GET | `/auth/verify-reset-token` | No | Verify reset token |
| POST | `/auth/2fa` | Yes* | Manage 2FA |

*Auth required for setup/verify/disable, not for validate

### Sites

| Method | Endpoint | Auth | CSRF | Description |
|--------|----------|------|------|-------------|
| GET | `/sites/list` | Yes | No | List user's sites |
| POST | `/sites/create` | Yes | Yes | Create new site |
| POST | `/sites/update` | Yes | Yes | Update site |
| POST | `/sites/delete` | Yes | Yes | Delete site |
| POST | `/sites/share` | Yes | Yes | Create share link |

### Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/track` | No | Track events |
| GET | `/stats` | Yes | Get analytics |
| GET | `/public-stats` | No | Get public stats |

### User

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/user/status` | Yes | Get user status |
| GET | `/user/sessions` | Yes | List sessions |

### Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/stripe/checkout` | Yes | Create checkout |
| POST | `/stripe/portal` | Yes | Customer portal |

## Request Examples

### Register
```bash
curl -X POST https://ztas.io/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecureP@ssw0rd123","plan":"pro"}'
```

### Login
```bash
curl -X POST https://ztas.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecureP@ssw0rd123"}'
```

### Create Site
```bash
curl -X POST https://ztas.io/api/sites/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -H "X-CSRF-Token: CSRF_TOKEN" \
  -d '{"domain":"example.com"}'
```

### Track Pageview
```bash
curl -X POST https://ztas.io/api/track \
  -H "Content-Type: application/json" \
  -d '{"siteId":"site_abc123","type":"pageview","path":"/home"}'
```

### Get Stats
```bash
curl https://ztas.io/api/stats?siteId=site_abc123&period=7d \
  -H "Authorization: Bearer TOKEN"
```

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Rate Limited |
| 500 | Server Error |

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Register | 5 | 1 min |
| Login | 10 | 1 min |
| Forgot Password | 3 | 1 min |
| Track | 1000 | 1 min |

## Event Types

- `pageview` - Page view
- `engagement` - Time on page, bounce
- `event` - Custom events
- `heartbeat` - Session keepalive

## Time Periods

- `24h` - Last 24 hours
- `7d` - Last 7 days (default)
- `30d` - Last 30 days
- `90d` - Last 90 days
- `365d` - Last year

## Password Requirements

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Error Response Format

```json
{
  "error": "Error message",
  "details": ["Optional array of details"]
}
```

## Success Response Format

```json
{
  "success": true,
  "data": {...}
}
```

## Environment Variables

```bash
JWT_SECRET=your-secret
HASH_SECRET=your-hash-secret
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...
STRIPE_SECRET_KEY=sk_...
```

## Testing Tools

- **Postman**: Import `postman-collection.json`
- **Swagger UI**: Open `openapi.yaml`
- **cURL**: See examples above
- **HTTPie**: `http POST https://ztas.io/api/auth/login email=user@example.com password=pass`

## Common Use Cases

### 1. Complete Registration Flow
```
1. POST /auth/register
2. Receive token and csrfToken
3. POST /sites/create (with both tokens)
4. Receive siteId and embedCode
5. Add embedCode to website
```

### 2. Analytics Tracking
```
1. Load page
2. POST /track with pageview event
3. User interacts
4. POST /track with custom event
5. User leaves
6. POST /track with engagement event
```

### 3. View Analytics
```
1. POST /auth/login
2. Receive token
3. GET /sites/list
4. GET /stats?siteId=X&period=7d
```

### 4. Share Analytics
```
1. POST /sites/share
2. Receive shareToken
3. Share URL: /public?token=X
4. Anyone: GET /public-stats?token=X
```

## Support

- Docs: https://ztas.io/docs
- OpenAPI: `/docs/openapi.yaml`
- Human Guide: `/docs/API.md`
- Postman: `/docs/postman-collection.json`
