# Zero Trust Analytics - Docker Self-Hosting Setup

Complete guide to get Zero Trust Analytics running on your own infrastructure in minutes.

## What You Get

A fully-functional, privacy-focused analytics platform running on your infrastructure:

- **Complete Data Control**: All analytics data stays on your server
- **No Limits**: Track unlimited sites and pageviews
- **Cost Effective**: $12-50/month for unlimited usage
- **Privacy Compliant**: GDPR/CCPA ready out of the box
- **Production Ready**: SSL, backups, monitoring included

## Prerequisites

Before starting, ensure you have:

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **2GB RAM** minimum (4GB recommended for production)
- **10GB disk space**
- **A domain name** (optional, only needed for SSL/HTTPS)

### Install Docker

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**macOS:**
```bash
brew install --cask docker
```

**Windows:**
Download Docker Desktop from https://docker.com/products/docker-desktop

## Quick Start (Local Development)

Get up and running in under 5 minutes:

### Step 1: Clone Repository

```bash
git clone https://github.com/jasonsutter87/zero-trust-analytics.git
cd zero-trust-analytics
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp docker/.env.example docker/.env

# Generate secure secrets
export HASH_SECRET=$(openssl rand -hex 32)
export JWT_SECRET=$(openssl rand -hex 32)

# Update configuration (macOS/Linux)
sed -i.bak "s/HASH_SECRET=.*/HASH_SECRET=$HASH_SECRET/" docker/.env
sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" docker/.env
rm docker/.env.bak

# Or edit manually
nano docker/.env
```

**Minimum Required Configuration:**
```bash
SITE_URL=http://localhost:3000
HASH_SECRET=your-generated-secret-here
JWT_SECRET=your-generated-secret-here
```

### Step 3: Start Docker Containers

```bash
docker-compose up -d
```

### Step 4: Verify Installation

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f zta

# Test health endpoint
curl http://localhost:3000/api/health
```

### Step 5: Access Your Instance

Open your browser and visit:
```
http://localhost:3000
```

### Step 6: Create Your Account

1. Navigate to `http://localhost:3000/register`
2. Create your admin account
3. Add your first website
4. Copy the tracking script

**Congratulations!** You now have Zero Trust Analytics running locally.

## Production Deployment (with SSL)

For production deployments with automatic SSL certificates:

### Prerequisites

1. A domain name pointing to your server (e.g., `analytics.yourdomain.com`)
2. DNS A record configured
3. Ports 80 and 443 open in your firewall

### Automated Setup

Use the interactive setup wizard:

```bash
./docker/quick-start.sh
```

Follow the prompts to:
- Choose deployment type (development or production)
- Enter your domain name
- Provide email for Let's Encrypt
- Automatically obtain SSL certificate
- Start with production configuration

### Manual Setup

If you prefer manual control:

#### 1. Update Environment Configuration

Edit `docker/.env`:

```bash
# Production URL
SITE_URL=https://analytics.yourdomain.com

# Strong secrets (CHANGE THESE!)
HASH_SECRET=your-production-secret-minimum-32-chars
JWT_SECRET=your-production-jwt-secret-minimum-32-chars

# Email service for password resets
RESEND_API_KEY=re_your_resend_api_key
FROM_EMAIL=noreply@yourdomain.com

# Security: Disable registration after creating accounts
ENABLE_REGISTRATION=false
```

#### 2. Configure Nginx with Your Domain

Edit `docker/nginx.conf`:

```nginx
# Find these lines and replace with your domain:
ssl_certificate /etc/letsencrypt/live/analytics.yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/analytics.yourdomain.com/privkey.pem;
```

#### 3. Obtain SSL Certificate

```bash
# Create directories
mkdir -p docker/certbot/conf docker/certbot/www

# Start nginx temporarily for Let's Encrypt verification
docker-compose up -d nginx

# Get certificate
docker-compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email \
  -d analytics.yourdomain.com

# Restart nginx with SSL
docker-compose restart nginx
```

#### 4. Start Production Stack

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 5. Verify Deployment

```bash
# Check all containers are running
docker-compose ps

# Test HTTPS
curl https://analytics.yourdomain.com/api/health

# View logs
docker-compose logs -f
```

## Using PostgreSQL (Optional)

For higher traffic volumes (10M+ pageviews/month), use PostgreSQL:

### 1. Configure PostgreSQL

Edit `docker/.env`:

```bash
# Comment out SQLite
# DATABASE_PATH=/app/data/analytics.db

# Enable PostgreSQL
DATABASE_URL=postgresql://zta:yourpassword@postgres:5432/zta
POSTGRES_USER=zta
POSTGRES_PASSWORD=your-secure-password-change-me
POSTGRES_DB=zta
```

### 2. Start with PostgreSQL Profile

```bash
docker-compose --profile postgres -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Email Configuration (For Password Resets)

Configure at least one email service:

### Option 1: Resend (Recommended)

1. Sign up at https://resend.com
2. Get your API key
3. Add to `docker/.env`:

```bash
RESEND_API_KEY=re_your_api_key
FROM_EMAIL=noreply@yourdomain.com
```

### Option 2: SendGrid

1. Sign up at https://sendgrid.com
2. Get your API key
3. Add to `docker/.env`:

```bash
SENDGRID_API_KEY=SG.your_api_key
FROM_EMAIL=noreply@yourdomain.com
```

## Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f zta
docker-compose logs -f nginx
```

### Restart Services

```bash
# Restart application
docker-compose restart zta

# Restart all services
docker-compose restart
```

### Stop Services

```bash
# Stop but keep data
docker-compose stop

# Stop and remove containers (data is preserved in volumes)
docker-compose down
```

### Update to Latest Version

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Or with production config
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Backup Database

#### SQLite Backup

```bash
# Create backup
docker-compose exec zta sqlite3 /app/data/analytics.db ".backup '/app/data/backup.db'"

# Copy to host
docker cp zero-trust-analytics:/app/data/backup.db ./backup-$(date +%Y%m%d).db

# Automated backups with cron (add to crontab)
0 2 * * * cd /path/to/zero-trust-analytics && docker cp zero-trust-analytics:/app/data/analytics.db ./backups/backup-$(date +%Y%m%d).db
```

#### PostgreSQL Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U zta zta > backup-$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U zta zta < backup-20251212.sql
```

### Restore Database

```bash
# Stop application
docker-compose stop zta

# Restore SQLite backup
docker cp backup-20251212.db zero-trust-analytics:/app/data/analytics.db

# Start application
docker-compose start zta
```

### Access Database Shell

```bash
# SQLite
docker-compose exec zta sqlite3 /app/data/analytics.db

# PostgreSQL
docker-compose exec postgres psql -U zta zta
```

## Monitoring

### Health Checks

Built-in health check endpoint:

```bash
curl http://localhost:3000/api/health
```

### Container Resource Usage

```bash
docker stats zero-trust-analytics
```

### Database Size

```bash
# SQLite
docker-compose exec zta du -sh /app/data/

# PostgreSQL
docker-compose exec postgres psql -U zta zta -c "
  SELECT pg_size_pretty(pg_database_size('zta'));
"
```

### Set Up External Monitoring

Use services like:
- **UptimeRobot** (free): https://uptimerobot.com
- **Better Uptime**: https://betteruptime.com
- **Pingdom**: https://pingdom.com

Monitor endpoint: `https://analytics.yourdomain.com/api/health`

## Security

### Change Default Secrets

**Critical:** Never use default secrets in production!

```bash
# Generate new secrets
openssl rand -hex 32

# Update docker/.env with generated values
HASH_SECRET=your-generated-secret
JWT_SECRET=your-generated-secret
```

### Disable Registration

After creating admin accounts:

```bash
# Edit docker/.env
ENABLE_REGISTRATION=false

# Restart
docker-compose restart zta
```

### Firewall Configuration

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Verify
sudo ufw status
```

### SSL Certificate Auto-Renewal

Certbot automatically renews certificates. Verify:

```bash
# Test renewal
docker-compose run --rm certbot renew --dry-run

# Manual renewal if needed
docker-compose run --rm certbot renew
docker-compose restart nginx
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs zta

# Verify configuration
docker-compose config

# Check port conflicts
sudo lsof -i :3000
```

### Database Errors

```bash
# Reinitialize database
docker-compose exec zta node /app/server/init-db.js

# Check database file
docker-compose exec zta ls -la /app/data/

# Check permissions
docker-compose exec zta stat /app/data/analytics.db
```

### SSL/HTTPS Issues

```bash
# Test nginx configuration
docker-compose exec nginx nginx -t

# Check certificate files
docker-compose exec nginx ls -la /etc/letsencrypt/live/

# Reload nginx
docker-compose exec nginx nginx -s reload
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Update limits in docker-compose.prod.yml
# Then restart with new limits
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Analytics Not Tracking

1. Verify tracking script loads: Check browser console for errors
2. Test API endpoint: `curl http://localhost:3000/api/track -X POST -d '{"siteId":"test"}'`
3. Check CORS: Ensure site domain matches registration
4. Review logs: `docker-compose logs -f zta`

## Performance Tuning

### For High Traffic Sites

#### 1. Use PostgreSQL Instead of SQLite

See "Using PostgreSQL" section above.

#### 2. Increase Resource Limits

Edit `docker-compose.prod.yml`:

```yaml
services:
  zta:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
```

#### 3. Enable Nginx Caching

Edit `docker/nginx.conf` - caching configuration already included.

#### 4. Optimize Database

```bash
# SQLite
docker-compose exec zta sqlite3 /app/data/analytics.db "VACUUM; PRAGMA optimize;"

# PostgreSQL
docker-compose exec postgres psql -U zta zta -c "VACUUM ANALYZE;"
```

## Next Steps

1. **Add Tracking to Your Sites**: Copy the script from the dashboard
2. **Explore Features**: Goals, funnels, real-time analytics
3. **Set Up Backups**: Automate daily database backups
4. **Monitor Uptime**: Configure external monitoring
5. **Read Full Docs**: Visit `/docs/self-hosting` on your instance

## Support

- **Documentation**: Full guide at `/docs/self-hosting`
- **GitHub Issues**: https://github.com/jasonsutter87/zero-trust-analytics/issues
- **Discussions**: https://github.com/jasonsutter87/zero-trust-analytics/discussions
- **Email**: support@zerotrust.analytics (for commercial support)

## FAQs

**Q: How much does self-hosting cost?**
A: Just server costs - typically $12-50/month for unlimited pageviews.

**Q: Can I migrate from hosted to self-hosted?**
A: Yes! Export your data and import it into your self-hosted instance.

**Q: What if I need help?**
A: Open a GitHub issue or check our community discussions.

**Q: How many pageviews can it handle?**
A: SQLite: 1M+/month. PostgreSQL: 10M+/month and beyond.

**Q: Is it truly private?**
A: Yes! All visitor IPs are hashed, never stored raw. Data stays on your server.

---

**Ready to get started?** Run `docker-compose up -d` or use the quick-start wizard: `./docker/quick-start.sh`

**Questions?** Open an issue: https://github.com/jasonsutter87/zero-trust-analytics/issues
