# Zero Trust Analytics - Self-Hosted Dockerfile
# Multi-stage build for optimal image size and security

# ============================================
# Stage 1: Hugo Build (Static Site Generator)
# ============================================
FROM hugomods/hugo:exts-0.147.4 AS hugo-builder

WORKDIR /site

# Copy Hugo configuration and content
COPY config.toml hugo.toml ./
COPY archetypes ./archetypes/
COPY assets ./assets/
COPY content ./content/
COPY layouts ./layouts/
COPY static ./static/
COPY resources ./resources/

# Build static site
RUN hugo --gc --minify

# ============================================
# Stage 2: Node.js Dependencies
# ============================================
FROM node:20-alpine AS node-deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY netlify/functions/package*.json ./netlify/functions/

# Install production dependencies
RUN npm ci --omit=dev && \
    cd netlify/functions && \
    npm ci --omit=dev

# ============================================
# Stage 3: Build Analytics Script
# ============================================
FROM node:20-alpine AS script-builder

WORKDIR /app

# Copy package files and install obfuscator
COPY package*.json ./
RUN npm install javascript-obfuscator

# Copy source and build
COPY src ./src/
RUN npm run obfuscate

# ============================================
# Stage 4: Runtime
# ============================================
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built static site from Hugo
COPY --from=hugo-builder --chown=nodejs:nodejs /site/public ./public

# Copy built analytics script
COPY --from=script-builder --chown=nodejs:nodejs /app/static/js/analytics.js ./public/js/

# Copy Node.js dependencies
COPY --from=node-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=node-deps --chown=nodejs:nodejs /app/netlify/functions/node_modules ./netlify/functions/node_modules

# Copy application code
COPY --chown=nodejs:nodejs netlify/functions ./netlify/functions
COPY --chown=nodejs:nodejs server ./server
COPY --chown=nodejs:nodejs package*.json ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/analytics.db

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "server/index.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
