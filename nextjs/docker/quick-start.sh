#!/bin/bash
set -e

# Zero Trust Analytics - Quick Start Script
# ==========================================
# Automated setup for self-hosting Zero Trust Analytics

echo "╔════════════════════════════════════════════╗"
echo "║  Zero Trust Analytics - Quick Start       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "✗ Docker is not installed. Please install Docker first:"
    echo "  https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "✗ Docker Compose is not installed. Please install Docker Compose first:"
    echo "  https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker and Docker Compose are installed"
echo ""

# Check if .env exists
if [ -f "docker/.env" ]; then
    echo "⚠ docker/.env already exists. Using existing configuration."
    echo ""
else
    echo "Creating docker/.env from template..."
    cp docker/.env.example docker/.env

    # Generate random secrets
    if command -v openssl &> /dev/null; then
        echo "Generating secure random secrets..."
        HASH_SECRET=$(openssl rand -hex 32)
        JWT_SECRET=$(openssl rand -hex 32)

        # Update .env file with generated secrets
        sed -i.bak "s/HASH_SECRET=.*/HASH_SECRET=$HASH_SECRET/" docker/.env
        sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" docker/.env
        rm docker/.env.bak 2>/dev/null || true

        echo "✓ Secrets generated and configured"
    else
        echo "⚠ OpenSSL not found. Please manually set HASH_SECRET and JWT_SECRET in docker/.env"
    fi
    echo ""
fi

# Ask for deployment type
echo "Select deployment type:"
echo "  1) Development (HTTP only, localhost)"
echo "  2) Production (with SSL/HTTPS)"
read -p "Enter choice [1-2]: " DEPLOY_TYPE

if [ "$DEPLOY_TYPE" == "2" ]; then
    # Production setup
    read -p "Enter your domain name (e.g., analytics.example.com): " DOMAIN
    read -p "Enter your email for Let's Encrypt: " EMAIL

    if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
        echo "✗ Domain and email are required for production setup"
        exit 1
    fi

    # Update SITE_URL in .env
    sed -i.bak "s|SITE_URL=.*|SITE_URL=https://$DOMAIN|" docker/.env
    rm docker/.env.bak 2>/dev/null || true

    echo ""
    echo "Production setup selected. Steps:"
    echo "  1. Make sure DNS is pointed to this server"
    echo "  2. Update docker/nginx.conf with your domain"
    echo "  3. Obtain SSL certificate"
    echo ""

    read -p "Have you completed these steps? (y/N): " READY
    if [ "$READY" != "y" ] && [ "$READY" != "Y" ]; then
        echo ""
        echo "Please complete the production setup steps first."
        echo "See documentation: /docs/self-hosting"
        exit 0
    fi

    # Get SSL certificate
    echo ""
    echo "Obtaining SSL certificate from Let's Encrypt..."
    mkdir -p docker/certbot/conf docker/certbot/www

    docker-compose run --rm certbot certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$DOMAIN" || {
            echo "✗ Failed to obtain SSL certificate"
            echo "Make sure:"
            echo "  - DNS is pointing to this server"
            echo "  - Port 80 is open and accessible"
            exit 1
        }

    echo "✓ SSL certificate obtained"
    echo ""

    # Start with production config
    echo "Starting Zero Trust Analytics (production mode)..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║  Zero Trust Analytics is now running!     ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "Access your instance at: https://$DOMAIN"
    echo ""

else
    # Development setup
    echo ""
    echo "Starting Zero Trust Analytics (development mode)..."
    docker-compose up -d

    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║  Zero Trust Analytics is now running!     ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "Access your instance at: http://localhost:3000"
    echo ""
fi

echo "Next steps:"
echo "  1. Visit the URL above"
echo "  2. Create an account at /register"
echo "  3. Add your first website"
echo "  4. Install the tracking script"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Stop:         docker-compose down"
echo "  Restart:      docker-compose restart"
echo ""
echo "Documentation: /docs/self-hosting"
echo "Support: https://github.com/jasonsutter87/zero-trust-analytics"
echo ""
