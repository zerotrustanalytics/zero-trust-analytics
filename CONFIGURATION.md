# Configuration Guide

This document explains how environment variables are validated and managed in the Zero Trust Analytics application.

## Environment Variable Validation

The application uses a centralized configuration system in `/netlify/functions/lib/config.js` that:

1. **Validates all required environment variables on startup**
2. **Provides sensible defaults for optional variables**
3. **Fails fast with clear error messages if configuration is invalid**
4. **Exports a typed, validated Config object**

## Required Environment Variables

These variables **MUST** be set for the application to start:

### `JWT_SECRET`
- **Description**: Secret key for JWT token signing
- **Validation**: Must be at least 32 characters long
- **Generate**: `openssl rand -base64 32`
- **Example**: `your-jwt-secret-key-at-least-32-characters-long`

### `TURSO_DATABASE_URL`
- **Description**: Turso database connection URL
- **Validation**: Must start with `libsql://`, `file:`, or `http`
- **Example**:
  - Production: `libsql://my-database.turso.io`
  - Local: `file:local.db`

### `TURSO_AUTH_TOKEN`
- **Description**: Turso database authentication token
- **Validation**: Must be provided (can be empty string for local file databases)
- **Get**: `turso db tokens create [DATABASE_NAME]`
- **Example**: `eyJhbGc...` (empty string for local file)

## Optional Environment Variables

These variables have validated defaults:

### `JWT_EXPIRY` (default: `7d`)
- **Description**: JWT token expiry time
- **Format**: number + unit (m=minutes, h=hours, d=days, w=weeks, y=years)
- **Examples**: `30m`, `24h`, `7d`, `4w`, `1y`

### `ALLOWED_ORIGINS` (default: `http://localhost:3000,http://localhost:8888`)
- **Description**: Comma-separated list of allowed CORS origins
- **Format**: Comma-separated URLs
- **Example**: `https://yourdomain.com,https://www.yourdomain.com`

### `NODE_ENV` (default: `development`)
- **Description**: Node environment
- **Options**: `development`, `production`, `test`

### `RATE_LIMIT_MAX` (default: `100`)
- **Description**: Maximum number of requests per window
- **Format**: Positive integer

### `RATE_LIMIT_WINDOW` (default: `900000`)
- **Description**: Rate limit window in milliseconds
- **Format**: Positive integer (default is 15 minutes)

### `SESSION_MAX_AGE` (default: `604800`)
- **Description**: Maximum session age in seconds
- **Format**: Positive integer (default is 7 days)

### `MFA_ISSUER` (default: `Zero Trust Analytics`)
- **Description**: MFA/2FA issuer name shown in authenticator apps
- **Format**: Non-empty string

## Using the Config Object

Import the validated configuration in your code:

```javascript
import { Config } from './lib/config.js';

// Access validated configuration
const jwtSecret = Config.jwt.secret;
const dbUrl = Config.database.url;
const allowedOrigins = Config.cors.allowedOrigins;

// Check environment
if (Config.isProduction) {
  // Production-only logic
}
```

## Configuration Structure

```javascript
Config = {
  // Authentication
  jwt: {
    secret: string,
    expiry: string
  },

  // Database
  database: {
    url: string,
    authToken: string
  },

  // CORS
  cors: {
    allowedOrigins: string[],
    allowedOriginsString: string
  },

  // Environment
  env: 'development' | 'production' | 'test',
  isDevelopment: boolean,
  isProduction: boolean,
  isTest: boolean,

  // Rate Limiting
  rateLimit: {
    max: number,
    window: number
  },

  // Session
  session: {
    maxAge: number
  },

  // MFA
  mfa: {
    issuer: string
  }
}
```

## Health Check

The `/api/health` endpoint now includes configuration validation:

```bash
# Basic health check
curl http://localhost:8888/api/health

# Response includes config status
{
  "status": "healthy",  # or "degraded" if config invalid
  "checks": {
    "api": "ok",
    "config": "ok"  # or "error"
  }
}

# Verbose health check (development only)
curl http://localhost:8888/api/health?verbose=true

# Response includes redacted config summary
{
  "config": {
    "jwt": {
      "expiry": "7d",
      "secretConfigured": true
    },
    "database": {
      "url": "libsql://...",
      "authTokenConfigured": true
    }
  }
}
```

## Error Messages

If required environment variables are missing or invalid, you'll see clear error messages:

```
================================================================================
CONFIGURATION ERROR
================================================================================
Environment configuration validation failed:

Missing required environment variable: JWT_SECRET
Description: Secret key for JWT token signing
Please set this variable in your .env file or environment.

Invalid value for environment variable: JWT_EXPIRY
JWT_EXPIRY must be in format like "7d", "24h", "30m"
Current value: invalid
================================================================================
```

## Utility Functions

### `checkConfig()`
Check if all required environment variables are set:

```javascript
import { checkConfig } from './lib/config.js';

const status = checkConfig();
// { isValid: true/false, missing: [...], timestamp: "..." }
```

### `getConfigSummary()`
Get redacted configuration summary for debugging:

```javascript
import { getConfigSummary } from './lib/config.js';

const summary = getConfigSummary();
// Returns config with sensitive values redacted
```

## Setup Instructions

1. **Copy the example file**:
   ```bash
   cp .env.example .env
   ```

2. **Generate a JWT secret**:
   ```bash
   openssl rand -base64 32
   ```

3. **Set up Turso database**:
   ```bash
   # Install Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash

   # Create database
   turso db create zero-trust-analytics

   # Get connection URL
   turso db show zero-trust-analytics

   # Create auth token
   turso db tokens create zero-trust-analytics
   ```

4. **Update your .env file** with the generated values

5. **Start the application**:
   ```bash
   npm run dev
   ```

## CI/CD Integration

The GitHub Actions workflow automatically sets test environment variables:

```yaml
env:
  JWT_SECRET: test-secret-key-for-ci
  TURSO_DATABASE_URL: file:test.db
  TURSO_AUTH_TOKEN: test-token
```

In test mode, the config system uses mock values if environment variables are not set.

## Best Practices

1. **Never commit .env files** - They're in .gitignore for a reason
2. **Use strong secrets** - At least 32 characters for JWT_SECRET
3. **Rotate secrets regularly** - Especially in production
4. **Use environment-specific .env files** - .env.development, .env.production
5. **Validate early** - The config system fails fast to prevent runtime errors
6. **Monitor health checks** - Set up alerts for degraded status

## Troubleshooting

### "Missing required environment variable: JWT_SECRET"
- Generate a secret: `openssl rand -base64 32`
- Add to .env: `JWT_SECRET=<generated-secret>`

### "TURSO_DATABASE_URL must be a valid libsql:// URL"
- Check URL format: `libsql://database-name.turso.io`
- For local: Use `file:local.db`

### "JWT_SECRET must be at least 32 characters long"
- Your secret is too short
- Generate a new one: `openssl rand -base64 32`

### Health check shows "degraded"
- Check the `missingConfig` field in the response
- Set the missing environment variables
- Restart the application
