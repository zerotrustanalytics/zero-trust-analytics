# Zero Trust Analytics - Self-Hosted Server

This directory contains the Express.js server for self-hosting Zero Trust Analytics.

## Overview

The server wraps all Netlify Functions as Express routes, allowing the application to run without Netlify's infrastructure.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Netlify Functions (Cloud)                  │
│  ├── auth-login.js                          │
│  ├── track.js                               │
│  └── stats.js (etc.)                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Express Server (Self-Hosted)               │
│  ├── index.js (wraps functions)             │
│  ├── db-adapter.js (SQLite/Turso adapter)   │
│  └── init-db.js (database initialization)   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Database                                    │
│  ├── SQLite (default for self-hosting)      │
│  └── PostgreSQL (optional, for scale)       │
└─────────────────────────────────────────────┘
```

## Files

### `index.js`

Main Express server that:
- Serves static Hugo-built files
- Converts Netlify Function calls to Express routes
- Handles CORS for analytics tracking
- Manages request/response translation

### `db-adapter.js`

Database abstraction layer that:
- Detects whether to use SQLite or Turso based on environment
- Provides unified API for both databases
- Handles query result normalization
- Manages connection lifecycle

### `init-db.js`

Database initialization script:
- Creates database schema
- Sets up indexes for performance
- Can be run standalone or during startup

### `package.json`

Server dependencies:
- `express` - Web server framework
- `dotenv` - Environment variable management
- `better-sqlite3` - SQLite database driver

## Database Adapter

The `db-adapter.js` automatically chooses the correct database:

**SQLite (Self-Hosted)**:
```bash
DATABASE_PATH=/app/data/analytics.db
```

**Turso (Cloud)**:
```bash
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-token
```

## Usage

### Development

```bash
cd server
npm install
npm run dev
```

### Production

```bash
npm run init-db  # Initialize database
npm start        # Start server
```

### Docker

The server runs automatically in Docker. See `../Dockerfile` and `../docker-compose.yml`.

## Environment Variables

Required:
- `HASH_SECRET` - Secret for hashing visitor identities
- `JWT_SECRET` - Secret for JWT token signing
- `DATABASE_PATH` - Path to SQLite database (self-hosted)
  OR
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` - Turso credentials (cloud)

Optional:
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `SITE_URL` - Base URL for the application
- Email service (for password resets)
- Stripe keys (for payments)

See `../docker/.env.example` for full list.

## Netlify to Express Translation

Each Netlify Function becomes an Express route:

| Netlify Function | Express Route |
|------------------|---------------|
| `track.js` | `POST /api/track` |
| `auth-login.js` | `POST /api/auth/login` |
| `stats.js` | `GET /api/stats` |
| `sites-list.js` | `GET /api/sites/list` |

The server translates:
- Request format (Netlify → Express)
- Context object (geo, IP)
- Response format (Web API Response → Express)

## Adding New Endpoints

To add a new API endpoint:

1. Create Netlify Function in `../netlify/functions/`
2. Add route mapping in `index.js`:

```javascript
{ path: '/api/your-endpoint', file: 'your-function.js' }
```

3. Restart server

## Database Migration

If you need to migrate from Turso to SQLite or vice versa:

1. Export data from old database
2. Update environment variables
3. Run `npm run init-db`
4. Import data to new database

## Performance Considerations

### SQLite

- Uses WAL (Write-Ahead Logging) mode
- Optimized indexes for common queries
- Suitable for 1M+ pageviews/month
- Single-server deployments

### PostgreSQL

- For higher scale (10M+ pageviews/month)
- Requires connection pooling
- Enables multi-server deployments
- Set `DATABASE_URL` instead of `DATABASE_PATH`

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Logs

```bash
# In Docker
docker-compose logs -f zta

# Local
npm start
```

### Database Stats

```bash
# SQLite
sqlite3 /app/data/analytics.db "SELECT COUNT(*) FROM pageviews;"

# PostgreSQL
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pageviews;"
```

## Troubleshooting

### Port Already in Use

```bash
# Change port
PORT=3001 npm start
```

### Database Locked

SQLite can lock under high concurrency. Use PostgreSQL for high traffic.

### Memory Issues

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

## Contributing

When adding features:

1. Keep Netlify Function compatibility
2. Update route mappings in `index.js`
3. Test both cloud (Netlify) and self-hosted (Express) deployments
4. Update documentation

## License

Same as parent project (see `../LICENSE.txt`)
