---
title: "Self-Hosting Guide"
date: 2025-12-12
description: "Complete guide to self-hosting Zero Trust Analytics using Docker"
weight: 100
---

# Self-Hosting Zero Trust Analytics

Take full control of your analytics data by hosting Zero Trust Analytics on your own infrastructure. This guide will help you deploy and manage your own instance using Docker.

## Why Self-Host?

- **Complete Data Control**: Your analytics data never leaves your infrastructure
- **No Usage Limits**: Track unlimited sites and pageviews
- **Customization**: Modify the platform to fit your needs
- **Cost Savings**: Free for unlimited use (just pay for hosting)
- **Privacy Compliance**: Keep data in your jurisdiction for GDPR/CCPA

## Prerequisites

Before you begin, ensure you have:

- **Docker** (20.10 or higher) and **Docker Compose** (2.0 or higher)
- **2GB RAM** minimum (4GB recommended)
- **10GB disk space** minimum
- **Linux, macOS, or Windows** with WSL2
- A **domain name** (optional, for HTTPS/SSL)

## Quick Start

Get Zero Trust Analytics running in under 5 minutes:

### 1. Clone the Repository

```bash
git clone https://github.com/jasonsutter87/zero-trust-analytics.git
cd zero-trust-analytics
```

### 2. Configure Environment

Copy the example environment file and edit it:

```bash
cp docker/.env.example docker/.env
nano docker/.env
```

**Required Settings** (minimum for local testing):

```bash
# Generate secure secrets (run: openssl rand -hex 32)
HASH_SECRET=your-random-secret-here
JWT_SECRET=your-jwt-secret-here

# Your domain or IP
SITE_URL=http://localhost:3000
```

### 3. Start the Application

```bash
docker-compose up -d
```

That's it! Zero Trust Analytics is now running at `http://localhost:3000`

### 4. Create Your First Account

1. Visit `http://localhost:3000/register`
2. Create an account (no email verification needed for self-hosted)
3. Add your first website in the dashboard
4. Install the tracking script on your site

## Production Deployment

For production deployments with SSL/HTTPS, follow these steps:

### 1. Configure Production Settings

Edit `docker/.env` with production values:

```bash
# Production URL
SITE_URL=https://analytics.yourdomain.com

# Strong secrets (CHANGE THESE!)
HASH_SECRET=your-production-secret-minimum-32-chars
JWT_SECRET=your-production-jwt-secret-minimum-32-chars

# Email service (for password resets)
RESEND_API_KEY=re_your_resend_api_key
FROM_EMAIL=noreply@yourdomain.com

# Disable registration after creating accounts
ENABLE_REGISTRATION=false
```

### 2. Configure Domain and SSL

Edit `docker/nginx.conf` and replace `your-domain` with your actual domain:

```nginx
ssl_certificate /etc/letsencrypt/live/analytics.yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/analytics.yourdomain.com/privkey.pem;
```

### 3. Obtain SSL Certificate

```bash
# Create directories for Let's Encrypt
mkdir -p docker/certbot/conf docker/certbot/www

# Get initial certificate
docker-compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email \
  -d analytics.yourdomain.com
```

### 4. Start with Production Configuration

```bash
# Stop if already running
docker-compose down

# Start with production overrides
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 5. Verify Deployment

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f zta

# Test health endpoint
curl https://analytics.yourdomain.com/api/health
```

## Configuration Options

### Environment Variables

Full list of configuration options in `docker/.env`:

#### Required Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `SITE_URL` | Your instance URL | `https://analytics.yourdomain.com` |
| `HASH_SECRET` | Secret for hashing visitor IDs | Generate with `openssl rand -hex 32` |
| `JWT_SECRET` | Secret for JWT tokens | Generate with `openssl rand -hex 32` |

#### Database Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | SQLite database location | `/app/data/analytics.db` |
| `DATABASE_URL` | PostgreSQL URL (optional) | - |

#### Email Configuration (Optional)

Configure at least one email provider for password reset functionality:

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key ([get one](https://resend.com)) |
| `SENDGRID_API_KEY` | SendGrid API key (alternative) |
| `FROM_EMAIL` | Sender email address |

#### Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_REGISTRATION` | Allow new user registrations | `true` |
| `MAX_SITES_PER_USER` | Maximum sites per user | `999` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |

### Using PostgreSQL Instead of SQLite

For higher traffic volumes, use PostgreSQL:

1. Edit `docker/.env`:

```bash
# Comment out SQLite
# DATABASE_PATH=/app/data/analytics.db

# Enable PostgreSQL
DATABASE_URL=postgresql://zta:yourpassword@postgres:5432/zta
POSTGRES_USER=zta
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=zta
```

2. Start with PostgreSQL profile:

```bash
docker-compose --profile postgres -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## SSL/HTTPS Setup

### Automated Certificate Renewal

Let's Encrypt certificates expire every 90 days. The `certbot` container automatically renews them.

Verify auto-renewal is working:

```bash
# Test renewal process (dry run)
docker-compose run --rm certbot renew --dry-run
```

### Manual Certificate Renewal

```bash
docker-compose run --rm certbot renew
docker-compose restart nginx
```

## Maintenance

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f zta
docker-compose logs -f nginx
```

### Database Backup

#### SQLite Backup

```bash
# Manual backup
docker-compose exec zta sqlite3 /app/data/analytics.db ".backup '/app/data/backup.db'"

# Copy backup to host
docker cp zero-trust-analytics:/app/data/backup.db ./backup-$(date +%Y%m%d).db
```

#### Automated Backups

Use the backup service in docker-compose.prod.yml:

```bash
# Run backup manually
docker-compose --profile backup run --rm backup

# Schedule with cron (add to crontab)
0 2 * * * cd /path/to/zero-trust-analytics && docker-compose --profile backup run --rm backup
```

#### PostgreSQL Backup

```bash
docker-compose exec postgres pg_dump -U zta zta > backup-$(date +%Y%m%d).sql
```

### Database Restore

#### SQLite Restore

```bash
# Stop the application
docker-compose stop zta

# Copy backup into container
docker cp backup-20251212.db zero-trust-analytics:/app/data/analytics.db

# Start application
docker-compose start zta
```

#### PostgreSQL Restore

```bash
docker-compose exec -T postgres psql -U zta zta < backup-20251212.sql
```

### Updating to Latest Version

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Or with production config
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Performance Tuning

### Resource Limits

Adjust resources in `docker-compose.prod.yml`:

```yaml
services:
  zta:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Database Optimization

#### SQLite

The database uses WAL (Write-Ahead Logging) mode for better concurrency. For very high traffic:

```bash
# Access database
docker-compose exec zta sqlite3 /app/data/analytics.db

# Optimize
PRAGMA optimize;
VACUUM;
.exit
```

#### PostgreSQL

Add connection pooling and tune settings in `docker-compose.prod.yml`:

```yaml
postgres:
  environment:
    POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
  command:
    - "postgres"
    - "-c"
    - "max_connections=200"
    - "-c"
    - "shared_buffers=256MB"
```

### Nginx Caching

Enable caching for better performance:

```nginx
# Add to docker/nginx.conf
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=zta_cache:10m max_size=1g inactive=60m;

location /api/stats {
    proxy_cache zta_cache;
    proxy_cache_valid 200 5m;
    # ... rest of config
}
```

## Troubleshooting

### Container Won't Start

Check logs for errors:

```bash
docker-compose logs zta
```

Common issues:

- **Port already in use**: Change `PORT` in docker/.env
- **Permission denied**: Ensure data directory is writable
- **Missing secrets**: Check `HASH_SECRET` and `JWT_SECRET` are set

### Database Errors

```bash
# Check database exists
docker-compose exec zta ls -la /app/data/

# Reinitialize database
docker-compose exec zta node /app/server/init-db.js
```

### SSL Certificate Issues

```bash
# Check certificate files
docker-compose exec nginx ls -la /etc/letsencrypt/live/your-domain/

# Test nginx configuration
docker-compose exec nginx nginx -t

# Reload nginx
docker-compose exec nginx nginx -s reload
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Restart with memory limits
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Analytics Not Tracking

1. **Check CORS**: Ensure your website domain matches the site configuration
2. **Check tracking script**: Verify `/js/analytics.js` is loading
3. **Check API endpoint**: Visit `/api/health` to verify API is running
4. **Check logs**: `docker-compose logs -f zta` for error messages

## Security Best Practices

### 1. Change Default Secrets

```bash
# Generate secure secrets
openssl rand -hex 32

# Update in docker/.env
HASH_SECRET=your-generated-secret
JWT_SECRET=your-generated-secret
```

### 2. Disable Registration

After creating accounts:

```bash
ENABLE_REGISTRATION=false
```

### 3. Firewall Configuration

```bash
# Allow only HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 4. Regular Updates

```bash
# Weekly security updates
docker-compose pull
docker-compose up -d
```

### 5. Restrict Database Access

The database should only be accessible from the application container. Default configuration already isolates it.

## Monitoring

### Health Checks

Built-in health check endpoint:

```bash
curl http://localhost:3000/api/health
```

### Uptime Monitoring

Use external monitoring services:

- [UptimeRobot](https://uptimerobot.com) (free)
- [Pingdom](https://pingdom.com)
- [Better Uptime](https://betteruptime.com)

Monitor: `https://analytics.yourdomain.com/api/health`

### System Monitoring

```bash
# Container resource usage
docker stats

# Disk usage
docker system df

# Database size
docker-compose exec zta du -sh /app/data/
```

## Scaling

### Vertical Scaling

Increase resources for single server:

1. Increase VPS/server size
2. Update resource limits in `docker-compose.prod.yml`
3. Restart services

### Horizontal Scaling

For very high traffic (multiple servers):

1. Use PostgreSQL instead of SQLite
2. Deploy multiple application containers with load balancer
3. Share database across all containers
4. Use Redis for session storage (requires code modification)

## Migration

### From Hosted to Self-Hosted

1. Export data from hosted instance (Dashboard → Export)
2. Set up self-hosted instance
3. Import data using API or database import

### From Self-Hosted to Hosted

Contact support for migration assistance.

## Support

### Community Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/jasonsutter87/zero-trust-analytics/issues)
- **Discussions**: [Community forum](https://github.com/jasonsutter87/zero-trust-analytics/discussions)

### Commercial Support

For enterprise support, customization, or migration assistance:
- Email: support@zerotrust.analytics
- Custom SLA available

## FAQ

### How much does self-hosting cost?

Free! You only pay for your server/VPS costs. Recommended providers:

- **DigitalOcean**: $12/month (2GB RAM)
- **Linode**: $12/month (2GB RAM)
- **Hetzner**: €4.51/month (2GB RAM)

### Can I use this for multiple websites?

Yes! Each user can track up to 999 sites (configurable via `MAX_SITES_PER_USER`).

### What's the difference from hosted version?

Self-hosted is identical in features. You manage infrastructure and updates.

### How many pageviews can it handle?

With default SQLite: **1M+ pageviews/month** comfortably.
With PostgreSQL: **10M+ pageviews/month** and beyond.

### Is visitor data truly private?

Yes! Visitor IPs are hashed with your secret, never stored in raw form. All data stays on your server.

### Can I modify the code?

Yes! Zero Trust Analytics is open source. Fork and customize as needed.

### How do I get updates?

```bash
git pull origin main
docker-compose up -d --build
```

### What if I need help?

Open an issue on GitHub or check the Discussions forum.

## Next Steps

- [Installation Guide](/docs/installation) - Add tracking to your website
- [API Documentation](/docs/api) - Integrate with other tools
- [Privacy Model](/docs/privacy-model) - Understand how privacy works

---

**Need help?** Open an issue on [GitHub](https://github.com/jasonsutter87/zero-trust-analytics/issues) or join our [community discussions](https://github.com/jasonsutter87/zero-trust-analytics/discussions).
