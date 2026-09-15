#!/bin/sh
set -e

# Zero Trust Analytics - Docker Entrypoint Script
# ================================================
# This script handles initialization and startup for the containerized app.

echo "=================================="
echo "Zero Trust Analytics - Starting..."
echo "=================================="

# Display configuration
echo ""
echo "Configuration:"
echo "  Database: ${DATABASE_PATH:-/app/data/analytics.db}"
echo "  Port: ${PORT:-3000}"
echo "  Environment: ${NODE_ENV:-production}"
echo ""

# Ensure data directory exists and has correct permissions
DATA_DIR=$(dirname "${DATABASE_PATH:-/app/data/analytics.db}")
if [ ! -d "$DATA_DIR" ]; then
  echo "Creating data directory: $DATA_DIR"
  mkdir -p "$DATA_DIR"
fi

# Check if database exists
DB_PATH="${DATABASE_PATH:-/app/data/analytics.db}"
if [ ! -f "$DB_PATH" ]; then
  echo "Database not found. Initializing..."
  node /app/server/init-db.js

  if [ $? -eq 0 ]; then
    echo "✓ Database initialized successfully"
  else
    echo "✗ Database initialization failed"
    exit 1
  fi
else
  echo "✓ Database already exists at $DB_PATH"
fi

# Validate required environment variables
if [ -z "$HASH_SECRET" ]; then
  echo "WARNING: HASH_SECRET is not set. Using default (INSECURE!)"
  export HASH_SECRET="change-me-in-production"
fi

if [ -z "$JWT_SECRET" ]; then
  echo "WARNING: JWT_SECRET is not set. Using default (INSECURE!)"
  export JWT_SECRET="change-me-in-production"
fi

# Check email configuration
if [ -z "$RESEND_API_KEY" ] && [ -z "$SENDGRID_API_KEY" ]; then
  echo "WARNING: No email service configured. Password reset will not work."
fi

echo ""
echo "Starting application..."
echo "=================================="
echo ""

# Execute the main command (passed as arguments to this script)
exec "$@"
