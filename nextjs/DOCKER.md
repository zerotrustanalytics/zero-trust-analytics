# Zero Trust Analytics - Docker Deployment

Complete Docker support for self-hosting Zero Trust Analytics with full data control.

## Quick Start (5 Minutes)

```bash
# 1. Copy environment template
cp docker/.env.example docker/.env

# 2. Generate secure secrets
export HASH_SECRET=$(openssl rand -hex 32)
export JWT_SECRET=$(openssl rand -hex 32)

# 3. Update .env file with secrets
sed -i '' "s/HASH_SECRET=.*/HASH_SECRET=$HASH_SECRET/" docker/.env
sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" docker/.env

# 4. Start the application
docker-compose up -d

# 5. Visit http://localhost:3000
```

That's it! You now have Zero Trust Analytics running locally.

## What's Included

This Docker setup provides a complete, production-ready analytics platform:

### Core Components

1. **Dockerfile** - Multi-stage build optimized for size and security
   - Hugo stage: Builds static site
   - Node.js stage: Builds analytics script
   - Runtime stage: Minimal Alpine image with Express server

2. **docker-compose.yml** - Development/local setup
   - Application container
   - SQLite database (in volume)
   - Health checks
   - Auto-restart

3. **docker-compose.prod.yml** - Production overrides
   - Nginx reverse proxy
   - Let's Encrypt SSL/HTTPS
   - Resource limits
   - Automated backups
   - Optional PostgreSQL

### Server Components

Located in `/server/`:

- **index.js** - Express server that wraps Netlify Functions
- **db-adapter.js** - Database abstraction (SQLite or PostgreSQL)
- **init-db.js** - Database initialization script
- **package.json** - Server dependencies

### Docker Utilities

Located in `/docker/`:

- **entrypoint.sh** - Container startup script with validation
- **nginx.conf** - Production-ready Nginx configuration
- **.env.example** - Complete environment variable template
- **quick-start.sh** - Interactive setup wizard
- **README.md** - Quick reference guide

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Client Browser                                 │
│  └── /js/analytics.js (tracking script)        │
└─────────────────────────────────────────────────┘
                    ↓ HTTPS
┌─────────────────────────────────────────────────┐
│  Nginx (Optional - Production Only)             │
│  ├── SSL/TLS Termination (Let's Encrypt)        │
│  ├── Reverse Proxy                              │
│  └── Rate Limiting & Caching                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Express Server (Node.js)                       │
│  ├── Static Files (Hugo build)                  │
│  ├── API Routes (/api/*)                        │
│  └── Netlify Functions (wrapped)                │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Database Layer                                  │
│  ├── SQLite (default - single server)           │
│  └── PostgreSQL (optional - scalable)           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Persistent Storage                              │
│  └── Docker Volume (zta-data)                   │
└─────────────────────────────────────────────────┘
```

## Deployment Options

### Local Development

Perfect for testing and development:

```bash
docker-compose up -d
```

Access at: `http://localhost:3000`

### Production (HTTP Only)

For internal networks or behind another reverse proxy:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Production (HTTPS with SSL)

Complete setup with automated SSL certificates:

```bash
# Interactive setup wizard
./docker/quick-start.sh

# Or manual setup
docker-compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourdomain.com \
  --agree-tos \
  -d analytics.yourdomain.com

docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Database Options

### SQLite (Default)

Best for:
- Single server deployments
- Up to 1M pageviews/month
- Simple setup with no external dependencies

Configuration:
```bash
DATABASE_PATH=/app/data/analytics.db
```

### PostgreSQL (Optional)

Best for:
- Multi-server deployments
- 10M+ pageviews/month
- Horizontal scaling

Configuration:
```bash
DATABASE_URL=postgresql://user:password@postgres:5432/zta
```

Start with PostgreSQL:
```bash
docker-compose --profile postgres -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Environment Configuration

Key environment variables (set in `docker/.env`):

### Required
- `HASH_SECRET` - Visitor identity hashing (32+ chars)
- `JWT_SECRET` - JWT token signing (32+ chars)
- `SITE_URL` - Your instance URL

### Optional
- `DATABASE_PATH` - SQLite database location
- `DATABASE_URL` - PostgreSQL connection string
- `RESEND_API_KEY` - Email service for password resets
- `SENDGRID_API_KEY` - Alternative email service
- `STRIPE_SECRET_KEY` - Payment processing (optional)
- `ENABLE_REGISTRATION` - Allow new signups (true/false)
- `MAX_SITES_PER_USER` - Site limit per user

## Common Tasks

### View Logs
```bash
docker-compose logs -f zta
```

### Restart Application
```bash
docker-compose restart zta
```

### Backup Database
```bash
# SQLite
docker cp zero-trust-analytics:/app/data/analytics.db ./backup-$(date +%Y%m%d).db

# PostgreSQL
docker-compose exec postgres pg_dump -U zta zta > backup-$(date +%Y%m%d).sql
```

### Restore Database
```bash
# SQLite
docker cp backup-20251212.db zero-trust-analytics:/app/data/analytics.db
docker-compose restart zta

# PostgreSQL
docker-compose exec -T postgres psql -U zta zta < backup-20251212.sql
```

### Update to Latest Version
```bash
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

### Access Database Shell
```bash
# SQLite
docker-compose exec zta sqlite3 /app/data/analytics.db

# PostgreSQL
docker-compose exec postgres psql -U zta zta
```

## Security

### Generated Secrets

The system uses two critical secrets:

1. **HASH_SECRET** - Hashes visitor IPs (privacy protection)
2. **JWT_SECRET** - Signs authentication tokens

Generate with:
```bash
openssl rand -hex 32
```

**Never use default values in production!**

### Firewall

Recommended firewall rules:
```bash
ufw allow 80/tcp   # HTTP (for Let's Encrypt)
ufw allow 443/tcp  # HTTPS
ufw deny 3000/tcp  # Block direct app access
ufw enable
```

### Disable Registration

After creating admin accounts:
```bash
ENABLE_REGISTRATION=false
```

## Performance

### Resource Limits

Default limits (adjust in `docker-compose.prod.yml`):
- CPU: 2 cores
- Memory: 2GB
- Storage: Based on pageview volume

### Scaling Guidelines

| Pageviews/Month | Setup | Resources |
|----------------|-------|-----------|
| < 100K | SQLite, 1 server | 2GB RAM, 1 CPU |
| 100K - 1M | SQLite, 1 server | 4GB RAM, 2 CPU |
| 1M - 10M | PostgreSQL, 1 server | 8GB RAM, 4 CPU |
| 10M+ | PostgreSQL, multiple servers | 16GB+ RAM, load balancer |

## Monitoring

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Container Stats
```bash
docker stats zero-trust-analytics
```

### Database Size
```bash
docker-compose exec zta du -sh /app/data/
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs zta

# Verify configuration
docker-compose config

# Check port conflicts
lsof -i :3000
```

### Database errors
```bash
# Reinitialize database
docker-compose exec zta node /app/server/init-db.js

# Check permissions
docker-compose exec zta ls -la /app/data/
```

### SSL certificate issues
```bash
# Test nginx config
docker-compose exec nginx nginx -t

# Check certificates
docker-compose exec nginx ls -la /etc/letsencrypt/live/
```

## Migration

### From Netlify to Self-Hosted

1. Export data from Netlify Blobs (or use API)
2. Set up self-hosted instance
3. Import data into SQLite/PostgreSQL
4. Update tracking script URLs

### From SQLite to PostgreSQL

1. Export data: `sqlite3 analytics.db .dump > export.sql`
2. Convert schema to PostgreSQL format
3. Import to PostgreSQL
4. Update `DATABASE_URL` in `.env`
5. Restart containers

## Cost Comparison

### Self-Hosted (Docker)
- Server: $12-50/month (DigitalOcean, Linode, Hetzner)
- Domain: $10-15/year
- Total: ~$15-60/month for unlimited pageviews

### Cloud (Netlify + Turso)
- Netlify: Free tier or $19/month
- Turso: Free tier or $29/month
- Total: Free to $48/month

### Plausible (Comparison)
- $9/month (10K pageviews)
- $19/month (100K pageviews)
- $99/month (1M pageviews)

**Self-hosting wins for high-volume sites!**

## Support

- Documentation: `/docs/self-hosting`
- GitHub Issues: https://github.com/jasonsutter87/zero-trust-analytics/issues
- Discussions: https://github.com/jasonsutter87/zero-trust-analytics/discussions

## Next Steps

1. [Read the Full Self-Hosting Guide](content/docs/self-hosting.md)
2. [Configure Your Instance](docker/.env.example)
3. [Set Up SSL/HTTPS](docker/README.md)
4. [Monitor Your Deployment](#monitoring)

---

**Ready to deploy?** Start with `docker-compose up -d` or use the interactive setup: `./docker/quick-start.sh`
