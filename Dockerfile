# Zero Trust Analytics - Self-Hosted Dockerfile
# Multi-stage build for optimal image size and security
# Includes: Hugo (marketing), Next.js (dashboard), Express (API)

# ============================================
# Stage 1: Hugo Build (Marketing Site)
# ============================================
FROM hugomods/hugo:exts-0.147.4 AS hugo-builder

WORKDIR /site

# Copy Hugo configuration and content from hugo/ directory
COPY hugo/config.toml hugo/hugo.toml ./
COPY hugo/archetypes ./archetypes/
COPY hugo/assets ./assets/
COPY hugo/content ./content/
COPY hugo/layouts ./layouts/
COPY hugo/static ./static/
COPY hugo/resources ./resources/

# Build static site
RUN hugo --gc --minify

# ============================================
# Stage 2: Next.js Build (Dashboard)
# ============================================
FROM node:20-alpine AS nextjs-builder

WORKDIR /app

# Copy Next.js app
COPY nextjs/nextjs/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY nextjs/nextjs/ ./

# Set build-time environment variables for self-hosted
ENV NEXT_PUBLIC_AUTH_MODE=none
ENV NEXT_PUBLIC_API_URL=""

# Build Next.js
RUN npm run build

# ============================================
# Stage 3: Node.js Dependencies (API)
# ============================================
FROM node:20-alpine AS node-deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY netlify/functions/package*.json ./netlify/functions/
COPY nextjs/server/package*.json ./server/

# Install production dependencies
RUN npm ci --omit=dev && \
    cd netlify/functions && \
    npm ci --omit=dev && \
    cd ../../server && \
    npm ci --omit=dev

# ============================================
# Stage 4: Build Analytics Script
# ============================================
FROM node:20-alpine AS script-builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY src ./src/
COPY build.js ./
RUN npm run build

# ============================================
# Stage 5: Runtime
# ============================================
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy Hugo marketing site
COPY --from=hugo-builder --chown=nodejs:nodejs /site/public ./public/marketing

# Copy Next.js standalone build
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/.next/standalone ./dashboard
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/.next/static ./dashboard/.next/static
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/public ./dashboard/public

# Copy analytics scripts
COPY --from=script-builder --chown=nodejs:nodejs /app/static/js/*.js ./public/marketing/js/

# Copy Node.js dependencies for API
COPY --from=node-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=node-deps --chown=nodejs:nodejs /app/netlify/functions/node_modules ./netlify/functions/node_modules
COPY --from=node-deps --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# Copy application code
COPY --chown=nodejs:nodejs netlify/functions ./netlify/functions
COPY --chown=nodejs:nodejs nextjs/server ./server

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    SELF_HOSTED=true \
    AUTH_MODE=none

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
