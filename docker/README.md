# Zero Trust Analytics - Self-Hosted Deployment

Run your own privacy-focused analytics instance. Your data stays on your infrastructure.

## Quick Start (Recommended: Turso)

The easiest way to self-host is using [Turso](https://turso.tech) for the database (free tier: 9GB, 500M reads/month).

### 1. Create a Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign up (free)
turso auth signup

# Create database
turso db create zta-analytics

# Get connection info
turso db show zta-analytics --url
turso db tokens create zta-analytics
```

### 2. Configure Environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env`:
```env
# Database (from Turso)
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-token-here

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=your-random-64-character-secret-here
HASH_SECRET=your-random-64-character-secret-here

# Your domain
SITE_URL=https://analytics.yourdomain.com
```

### 3. Run

```bash
docker-compose up -d
```

Visit `http://localhost:3000` and create your first account.

---

## Alternative: Local SQLite

If you prefer fully self-contained deployment with no external services:

```env
# Use local SQLite instead of Turso
TURSO_DATABASE_URL=file:/app/data/analytics.db
TURSO_AUTH_TOKEN=
```

Data is stored in a Docker volume (`zta-data`).

---

## Architecture

### What's Included
- **Analytics tracking** - Same tracking script as the hosted service
- **Dashboard** - Full analytics dashboard
- **Built-in auth** - JWT-based authentication (no third-party auth needed)
- **API** - Full REST API for programmatic access

### What's NOT Shared
Your self-hosted instance is completely isolated:
- ✅ Your own database (Turso or SQLite)
- ✅ Your own user accounts
- ✅ Your own JWT secrets
- ✅ Zero connection to ztas.io infrastructure

### Self-Hosted Differences
Some features are disabled in self-hosted mode:
- **Email Reports**: Scheduled email reports are disabled (no background scheduler)
- **Stripe Billing**: Payment processing is disabled (self-hosting is free)
- **Clerk Auth**: Uses built-in auth instead of Clerk (see auth modes below)

---

## Deployment Options

| Option | Database | Auth | Best For |
|--------|----------|------|----------|
| Docker + Turso | Turso (free tier) | Built-in JWT | Most users |
| Docker + SQLite | Local file | Built-in JWT | Air-gapped/offline |
| Vercel/Railway | Turso | Built-in JWT | Serverless |

---

## Authentication Modes

Self-hosted supports multiple auth modes - choose based on your needs:

### `AUTH_MODE=none` (Default)
No login required. Dashboard is immediately accessible.
- Best for: Personal use, trusted networks, single user
- Set: `AUTH_MODE=none` in your `.env`

### `AUTH_MODE=password`
Single shared password protects the dashboard.
- Best for: Small teams, simple protection
- Set: `AUTH_MODE=password` and `AUTH_PASSWORD=your-password`

### `AUTH_MODE=jwt`
Full multi-user system with accounts and login.
- Best for: Enterprise self-hosting, multiple users
- Uses built-in JWT auth (no Clerk needed)
- Endpoints: `/api/auth/register`, `/api/auth/login`

### Features by Mode

| Feature | none | password | jwt |
|---------|------|----------|-----|
| Login required | No | Yes (shared) | Yes (per-user) |
| Multiple users | No | No | Yes |
| Password reset | N/A | N/A | Yes |
| Audit trail | No | No | Yes |

---

## Commands

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f zta

# Stop
docker-compose down

# Update to latest
git pull && docker-compose up -d --build

# Backup database (SQLite only)
docker cp zero-trust-analytics:/app/data/analytics.db ./backup-$(date +%Y%m%d).db
```

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` and `HASH_SECRET` (64+ characters)
- [ ] Configure `SITE_URL` with your actual domain
- [ ] Set up HTTPS (use nginx profile or external proxy)
- [ ] Configure email service for password resets (Resend or SendGrid)
- [ ] Disable registration after creating accounts: `ENABLE_REGISTRATION=false`

---

## With HTTPS (Nginx + Let's Encrypt)

```bash
# 1. Update DOMAIN in docker/.env
DOMAIN=analytics.yourdomain.com
LETSENCRYPT_EMAIL=admin@yourdomain.com

# 2. Start with nginx profile
docker-compose --profile with-nginx up -d

# 3. Get SSL certificate
docker-compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourdomain.com \
  --agree-tos \
  -d analytics.yourdomain.com
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Database URL (`libsql://...` or `file:...`) |
| `TURSO_AUTH_TOKEN` | Yes* | Turso token (empty for local SQLite) |
| `JWT_SECRET` | Yes | Secret for JWT signing (32+ chars) |
| `HASH_SECRET` | Yes | Secret for visitor hashing (32+ chars) |
| `SITE_URL` | Yes | Your instance URL |
| `RESEND_API_KEY` | No | For password reset emails |
| `SENDGRID_API_KEY` | No | Alternative email service |
| `ENABLE_REGISTRATION` | No | Set `false` to disable signups |

---

## Support

- GitHub Issues: https://github.com/zerotrustanalytics/zero-trust-analytics/issues
- Documentation: https://ztas.io/docs/self-hosting
