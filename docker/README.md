# Zero Trust Analytics - Docker Deployment

Quick reference for deploying Zero Trust Analytics with Docker.

## Quick Start

```bash
# 1. Copy environment template
cp docker/.env.example docker/.env

# 2. Edit configuration (set HASH_SECRET and JWT_SECRET)
nano docker/.env

# 3. Start the application
docker-compose up -d

# 4. Visit http://localhost:3000
```

## Files in this Directory

- **`.env.example`** - Environment variable template (copy to `.env`)
- **`entrypoint.sh`** - Container startup script
- **`nginx.conf`** - Nginx reverse proxy configuration for SSL/HTTPS
- **`README.md`** - This file

## Production Deployment

For production with SSL/HTTPS:

```bash
# 1. Configure production settings
cp docker/.env.example docker/.env
nano docker/.env

# 2. Update nginx.conf with your domain

# 3. Get SSL certificate
mkdir -p docker/certbot/conf docker/certbot/www
docker-compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourdomain.com \
  --agree-tos \
  -d analytics.yourdomain.com

# 4. Start with production config
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Useful Commands

```bash
# View logs
docker-compose logs -f

# Restart application
docker-compose restart zta

# Stop everything
docker-compose down

# Update to latest version
git pull && docker-compose up -d --build

# Backup database
docker cp zero-trust-analytics:/app/data/analytics.db ./backup.db

# Access database
docker-compose exec zta sqlite3 /app/data/analytics.db
```

## Environment Variables

Key variables to configure in `.env`:

- `SITE_URL` - Your instance URL (e.g., `https://analytics.yourdomain.com`)
- `HASH_SECRET` - Secret for hashing visitor IDs (generate with `openssl rand -hex 32`)
- `JWT_SECRET` - Secret for JWT tokens (generate with `openssl rand -hex 32`)
- `RESEND_API_KEY` or `SENDGRID_API_KEY` - For password reset emails
- `ENABLE_REGISTRATION` - Set to `false` after creating accounts

## Documentation

Full documentation: `/docs/self-hosting` on your running instance

Or visit: https://zero-trust-analytics.netlify.app/docs/self-hosting

## Support

- GitHub Issues: https://github.com/jasonsutter87/zero-trust-analytics/issues
- Discussions: https://github.com/jasonsutter87/zero-trust-analytics/discussions
