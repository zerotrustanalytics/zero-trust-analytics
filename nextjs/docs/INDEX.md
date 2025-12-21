# Zero Trust Analytics API Documentation Index

Complete API documentation for the Zero Trust Analytics platform.

## Documentation Files

### 📋 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
**Quick reference guide** - Start here for a rapid overview.

- Common endpoints at a glance
- cURL examples for every endpoint
- Response codes and rate limits
- Event types and time periods
- Common use case workflows

**Best for**: Quick lookups, command-line testing, learning the API structure

---

### 📘 [API.md](./API.md)
**Complete API guide** - Human-readable documentation.

- Detailed endpoint documentation
- Request/response examples
- Authentication and security details
- Code examples in JavaScript, Python, cURL
- Best practices and error handling
- Real-world usage patterns

**Best for**: Developers integrating the API, understanding security model, implementation guidance

---

### 📄 [openapi.yaml](./openapi.yaml)
**OpenAPI 3.0 specification** - Machine-readable API definition.

- Complete API specification
- All endpoints with request/response schemas
- Security schemes and authentication
- Validation rules and constraints
- Component schemas

**Best for**: Generating client SDKs, API validation, tooling integration (Swagger UI, Postman)

**Use with**:
- Swagger Editor: https://editor.swagger.io/
- Swagger UI: `docker run -p 8080:8080 -e SWAGGER_JSON=/docs/openapi.yaml -v $(pwd)/docs:/docs swaggerapi/swagger-ui`
- Code generators: `npx @openapitools/openapi-generator-cli generate -i docs/openapi.yaml -g typescript-axios -o ./sdk`

---

### 🔧 [postman-collection.json](./postman-collection.json)
**Postman collection** - Ready-to-import API requests.

- All API endpoints organized by category
- Pre-configured request bodies
- Auto-extraction of tokens and IDs
- Collection variables for easy testing

**Best for**: Interactive API testing, debugging, manual testing workflows

**Import to**:
1. Postman: File → Import → Select file
2. Bruno: Collection → Import → OpenAPI/Postman
3. Insomnia: Import → From File

---

### 🌍 [postman-environment.json](./postman-environment.json)
**Postman environment** - Environment variables template.

- Pre-configured environment for production
- Variables: baseUrl, authToken, csrfToken, siteId
- Create additional environments for staging/local

**Usage**:
1. Import into Postman: Environments → Import
2. Modify baseUrl for local development
3. Tokens auto-populate when running Login/Register

---

### 📖 [README.md](./README.md)
**Documentation overview** - Getting started guide.

- Quick start examples
- Tool setup instructions
- SDK generation guides
- Validation and testing tools
- Security best practices
- Environment variables reference

**Best for**: First-time setup, understanding documentation structure, choosing the right tool

---

## Quick Start Guide

### 1. Browse the API
**Option A: Swagger UI** (Interactive docs)
```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/docs/openapi.yaml \
  -v $(pwd)/docs:/docs \
  swaggerapi/swagger-ui
```
Open: http://localhost:8080

**Option B: VS Code** (YAML preview)
- Install "OpenAPI (Swagger) Editor" extension
- Open `openapi.yaml`
- Click "Preview" icon

### 2. Test the API
**Option A: Postman**
1. Import `postman-collection.json`
2. Import `postman-environment.json`
3. Run "Register" request
4. Explore other endpoints

**Option B: cURL** (See QUICK_REFERENCE.md)
```bash
# Register
curl -X POST https://ztas.io/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecureP@ssw0rd123","plan":"pro"}'
```

### 3. Integrate the API
**Option A: Generate SDK**
```bash
# TypeScript
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g typescript-axios \
  -o ./sdk/typescript

# Python
docker run --rm -v $(pwd):/local openapitools/openapi-generator-cli generate \
  -i /local/docs/openapi.yaml \
  -g python \
  -o /local/sdk/python
```

**Option B: Use Fetch/Axios** (See API.md examples)
```javascript
const response = await fetch('https://ztas.io/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'pass' })
});
```

## File Sizes

| File | Size | Lines |
|------|------|-------|
| openapi.yaml | 42 KB | 1,546 |
| API.md | 22 KB | 1,217 |
| postman-collection.json | 18 KB | 659 |
| README.md | 7.8 KB | 366 |
| QUICK_REFERENCE.md | 4.8 KB | 221 |
| postman-environment.json | 571 B | 31 |
| **Total** | **95 KB** | **4,040** |

## API Overview

### Endpoint Categories

1. **Authentication** (9 endpoints)
   - Registration, login, password reset
   - Two-factor authentication (2FA)
   - OAuth (Google, GitHub)

2. **Sites Management** (5 endpoints)
   - Create, read, update, delete sites
   - Share analytics publicly

3. **Analytics** (3 endpoints)
   - Event tracking (pageviews, custom events)
   - Statistics retrieval
   - Public statistics

4. **User Management** (2 endpoints)
   - User status and account info
   - Active sessions

5. **Billing** (2 endpoints)
   - Stripe checkout
   - Customer portal

**Total**: 21 documented endpoints

### Key Features

- **Zero-trust privacy**: All PII hashed before storage
- **Rate limiting**: Prevents abuse (3-1000 requests/min)
- **CSRF protection**: Required for state-changing operations
- **Bot filtering**: Automatic crawler detection
- **Batch processing**: Efficient event tracking
- **OAuth support**: Google and GitHub

## Development Workflow

### Typical Integration Steps

1. **Read** QUICK_REFERENCE.md for overview
2. **Review** API.md for detailed endpoint docs
3. **Import** postman-collection.json for testing
4. **Test** endpoints with Postman/cURL
5. **Generate** SDK from openapi.yaml (optional)
6. **Implement** client code
7. **Validate** requests against openapi.yaml

### Common Tasks

**View interactive docs**:
```bash
npx @redocly/cli preview-docs docs/openapi.yaml
```

**Validate OpenAPI spec**:
```bash
npx @stoplight/spectral-cli lint docs/openapi.yaml
```

**Generate TypeScript SDK**:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.yaml \
  -g typescript-axios \
  -o ./sdk/typescript
```

**Test with HTTPie**:
```bash
http POST https://ztas.io/api/auth/login \
  email=user@example.com \
  password=SecureP@ssw0rd123
```

## Security Notes

### Authentication Flow

1. User registers or logs in
2. Server returns JWT token + CSRF token
3. Client stores tokens securely
4. Client includes tokens in subsequent requests:
   - `Authorization: Bearer JWT_TOKEN`
   - `X-CSRF-Token: CSRF_TOKEN` (for POST/PUT/DELETE)

### Best Practices

- Store JWT in HttpOnly cookies (not localStorage)
- Never commit tokens to version control
- Rotate JWT_SECRET regularly
- Use HTTPS in production
- Implement proper session management

## Support

- **Documentation**: https://ztas.io/docs
- **GitHub**: https://github.com/your-repo
- **Email**: support@ztas.io
- **Issues**: https://github.com/your-repo/issues

## License

MIT License - See [LICENSE](../LICENSE.txt)

---

**Last Updated**: December 20, 2024
**API Version**: 1.0.0
**Documentation Version**: 1.0.0
