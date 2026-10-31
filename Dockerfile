# Zero Trust Analytics - Self-Hosted Dockerfile (app + API)
# Multi-stage build for optimal image size and security.
# Serves: Next.js dashboard + Express API (wrapping the functions).
# NOTE: the Hugo marketing site and the analytics beacon script are hosted
# separately on Netlify (split hosting) and are intentionally NOT in this image.

# ============================================
# Stage 1: Next.js Build (Dashboard)
# ============================================
FROM node:20-alpine AS nextjs-builder

WORKDIR /app

# Copy Next.js app manifest and install deps
COPY app/package*.json ./
RUN npm ci

# Copy source
COPY app/ ./

# Build-time config (overridable via --build-arg). NEXT_PUBLIC_* is baked into
# the client bundle, so it must be set at build time, not runtime.
# Default to gatekeep SSO (oidc). MUST match the runtime AUTH_MODE below — if the
# client is built for oidc it sends the gatekeep Bearer token, so the API must
# also run in oidc mode. Empty NEXT_PUBLIC_API_URL => same-origin relative /api.
ARG NEXT_PUBLIC_AUTH_MODE=oidc
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build Next.js (standalone output)
RUN npm run build

# ============================================
# Stage 2: Node.js Dependencies (API)
# ============================================
FROM node:20-alpine AS node-deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY netlify/functions/package*.json ./netlify/functions/
COPY server/package*.json ./server/

# Install production dependencies
RUN npm ci --omit=dev && \
    cd netlify/functions && \
    npm ci --omit=dev && \
    cd ../../server && \
    npm ci --omit=dev

# ============================================
# Stage 3: Runtime
# ============================================
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy Next.js standalone build. The standalone output does not include
# public/ (self-hosted fonts, Tally illustrations), so copy it alongside.
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/.next/standalone ./dashboard
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/.next/static ./dashboard/.next/static
COPY --from=nextjs-builder --chown=nodejs:nodejs /app/public ./dashboard/public

# Copy Node.js dependencies for API
COPY --from=node-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=node-deps --chown=nodejs:nodejs /app/netlify/functions/node_modules ./netlify/functions/node_modules
COPY --from=node-deps --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# Copy application code
COPY --chown=nodejs:nodejs netlify/functions ./netlify/functions
COPY --chown=nodejs:nodejs server ./server

# Create data directory for the local libSQL/SQLite database
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Runtime environment (override via compose/.env as needed).
# AUTH_MODE=oidc must match the NEXT_PUBLIC_AUTH_MODE the client was built with.
# GATEKEEP_* + AUTH_SECRET are consumed at runtime by both the API (lib/auth.js)
# and the spawned Next process (src/auth.ts) — provide real values via compose.
ENV NODE_ENV=production \
    PORT=3000 \
    SELF_HOSTED=true \
    AUTH_MODE=oidc \
    GATEKEEP_ISSUER="" \
    GATEKEEP_CLIENT_ID=zta \
    AUTH_SECRET="" \
    TURSO_DATABASE_URL=file:/app/data/analytics.db \
    TURSO_AUTH_TOKEN=""

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
