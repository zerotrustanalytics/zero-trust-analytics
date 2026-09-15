/**
 * ZERO TRUST ANALYTICS - SELF-HOSTED SERVER
 * ==========================================
 * Express server that wraps the API functions for self-hosting.
 * Serves: Dashboard (Next.js) + API (functions). The Hugo marketing site is
 * hosted separately on Netlify (split hosting).
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import { readdir } from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NEXTJS_PORT = process.env.NEXTJS_PORT || 3001;

// Track Next.js process for graceful shutdown
let nextjsProcess = null;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS middleware for analytics tracking
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Site-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Dashboard directory (Next.js standalone). The Hugo marketing site is hosted
// separately on Netlify (split hosting) and is intentionally not served here.
const dashboardDir = path.join(__dirname, '..', 'dashboard');

/**
 * Proxy requests to Next.js dashboard
 */
function proxyToNextjs(req, res) {
  const options = {
    hostname: 'localhost',
    port: NEXTJS_PORT,
    // Use originalUrl (full path) — app.use('/dashboard', ...) strips the mount
    // prefix from req.url, which would send Next the wrong path (/sites instead
    // of /dashboard/sites). Next has no basePath, so it needs the full path.
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${NEXTJS_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('Dashboard proxy error:', err.message);
    res.status(502).json({ error: 'Dashboard unavailable' });
  });

  req.pipe(proxyReq, { end: true });
}

// Proxy dashboard routes to Next.js
app.use('/dashboard', proxyToNextjs);
app.use('/_next', proxyToNextjs);  // Next.js static assets

// In gatekeep OIDC mode, Auth.js (next-auth) owns the entire /api/auth/*
// namespace (session, signin, signout, callback, csrf, providers) and is served
// by Next. Proxy it here — registered BEFORE the function router (registerRoutes
// in start()) so the legacy ZTA /api/auth/* functions never shadow Auth.js.
// In none/password modes this is skipped and the function router keeps serving
// /api/auth/config for the password gate.
if ((process.env.AUTH_MODE || 'none') === 'oidc') {
  app.use('/api/auth', proxyToNextjs);
}

/**
 * Convert Netlify Function to Express middleware
 * Netlify functions use a different signature than Express handlers
 */
function netlifyToExpress(netlifyFunction) {
  return async (req, res) => {
    try {
      // Create Netlify-compatible context object
      const context = {
        ip: req.ip || req.connection.remoteAddress,
        geo: {
          country: { code: req.headers['cf-ipcountry'] || '' },
          subdivision: { code: req.headers['cf-region'] || '' }
        }
      };

      // Create Netlify-compatible request object
      const netlifyReq = {
        method: req.method,
        headers: {
          get: (name) => req.headers[name.toLowerCase()],
        },
        json: async () => req.body,
        url: req.originalUrl,
      };

      // Call the Netlify function
      const response = await netlifyFunction.default(netlifyReq, context);

      // Convert Netlify Response to Express response
      if (response instanceof Response) {
        // Handle Web API Response object
        const status = response.status;
        const body = await response.text();

        // Set headers
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        // Send response
        res.status(status);
        if (response.headers.get('content-type')?.includes('application/json')) {
          res.json(JSON.parse(body));
        } else {
          res.send(body);
        }
      } else {
        // Fallback for non-standard responses
        res.status(response.statusCode || 200)
           .set(response.headers || {})
           .send(response.body);
      }
    } catch (error) {
      console.error('Function error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  };
}

// Maintenance/internal functions that must NOT be exposed as public HTTP routes.
const NON_ROUTE_FUNCTIONS = new Set([
  'init-db',              // invoked internally at startup
  'migrate-db',
  'migrate-sites-to-turso',
  // Legacy social-OAuth login — replaced by gatekeep OIDC (Auth.js). Dead in
  // every self-host mode; denylisted so they can't claim /api/auth/callback/*.
  'auth-oauth-callback',
  'auth-google',
  'auth-github',
]);

// Explicit path overrides for functions whose HTTP path does not follow the
// dashes<->slashes convention. (None currently — the old auth-oauth-callback
// override is gone; gatekeep OIDC handles /api/auth/callback via Auth.js.)
const ROUTE_OVERRIDES = {};

/**
 * Compute the Express paths a function answers on. The frontend uses mixed
 * conventions — /api/sites/list (slashes) AND /api/page-value-rules (dashes) —
 * so we register BOTH the dash form and the slash form of each name, each with
 * a wildcard suffix so sub-routes fall through (e.g. /api/admin/usage/customer
 * -> admin-usage). Unused aliases are harmless.
 */
function pathsForFunction(name) {
  if (ROUTE_OVERRIDES[name]) return ROUTE_OVERRIDES[name];
  const dash = `/api/${name}`;
  const slash = `/api/${name.replace(/-/g, '/')}`;
  return [...new Set([dash, slash, `${dash}/*`, `${slash}/*`])];
}

/**
 * Auto-register every API function as an Express route.
 * Replaces the old hand-maintained list, which had drifted out of sync with the
 * ~60 functions and the paths the dashboard actually calls.
 */
async function registerRoutes() {
  const functionsDir = path.join(__dirname, '..', 'netlify', 'functions');

  const names = (await readdir(functionsDir))
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
    .filter((name) => !NON_ROUTE_FUNCTIONS.has(name))
    .sort();

  const owner = new Map(); // base path -> function name (collision guard)
  let count = 0;

  for (const name of names) {
    let mod;
    try {
      mod = await import(path.join(functionsDir, `${name}.js`));
    } catch (error) {
      console.error(`Failed to import ${name}.js:`, error.message);
      continue;
    }
    if (typeof mod.default !== 'function') continue; // not an HTTP handler

    const handler = netlifyToExpress(mod);
    for (const p of pathsForFunction(name)) {
      const base = p.replace(/\/\*$/, '');
      const prior = owner.get(base);
      if (prior && prior !== name) {
        console.warn(`Route conflict: ${p} (${name}.js) already owned by ${prior}.js — skipping`);
        continue;
      }
      app.all(p, handler);
      owner.set(base, name);
    }
    count += 1;
  }

  console.log(`Registered ${count} API functions across ${owner.size} route paths`);
}

// Initialize database on startup
async function initializeDatabase() {
  try {
    const initDbPath = path.join(__dirname, '..', 'netlify', 'functions', 'init-db.js');
    const initDb = await import(initDbPath);

    const initSecret = process.env.INIT_DB_SECRET || 'init-secret-change-me';

    // Create a mock request for initialization
    const mockReq = {
      method: 'POST',
      headers: {
        get: (name) => {
          if (name.toLowerCase() === 'x-init-secret') return initSecret;
          return null;
        }
      },
      url: 'http://localhost/api/init-db',
      json: async () => ({}),
    };
    const mockContext = { ip: 'localhost' };

    await initDb.default(mockReq, mockContext);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    // Continue anyway - database might already be initialized
  }
}

/**
 * Start Next.js dashboard server
 * Runs the standalone Next.js build on a separate port
 */
async function startNextjsDashboard() {
  const serverPath = path.join(dashboardDir, 'server.js');

  // Check if dashboard exists
  try {
    await import('fs').then(fs => fs.promises.access(serverPath));
  } catch {
    console.log('Dashboard not found - running in API-only mode');
    return false;
  }

  return new Promise((resolve) => {
    nextjsProcess = spawn('node', [serverPath], {
      cwd: dashboardDir,
      env: {
        ...process.env,
        PORT: NEXTJS_PORT,
        HOSTNAME: 'localhost',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    nextjsProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready') || output.includes('started')) {
        console.log(`Dashboard server ready on port ${NEXTJS_PORT}`);
        resolve(true);
      }
    });

    nextjsProcess.stderr.on('data', (data) => {
      console.error(`Dashboard error: ${data}`);
    });

    nextjsProcess.on('error', (err) => {
      console.error('Failed to start dashboard:', err.message);
      resolve(false);
    });

    nextjsProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Dashboard exited with code ${code}`);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('Dashboard startup timeout - assuming ready');
      resolve(true);
    }, 30000);
  });
}

// Start server
async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    // Register API routes
    await registerRoutes();

    // Non-API routes fall through to the Next.js dashboard (app-only origin).
    // Registered AFTER the API routes so /api/* is matched first — the old
    // module-level catch-all ran before registerRoutes() and shadowed GET APIs.
    app.use((req, res) => proxyToNextjs(req, res));

    // Error handling middleware (registered last)
    app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    // Start Next.js dashboard
    const dashboardStarted = await startNextjsDashboard();

    // Start listening
    app.listen(PORT, '0.0.0.0', () => {
      const authMode = process.env.AUTH_MODE || 'none';
      const selfHosted = process.env.SELF_HOSTED === 'true';

      console.log(`
╔════════════════════════════════════════════╗
║   Zero Trust Analytics - Self-Hosted      ║
╚════════════════════════════════════════════╝

Server running at:
  → App root:   http://localhost:${PORT}/  (proxied to Next dashboard)
  → Dashboard:  http://localhost:${PORT}/dashboard${dashboardStarted ? '' : ' (unavailable)'}
  → API:        http://localhost:${PORT}/api

Configuration:
  → Auth Mode:  ${authMode}
  → Self-Hosted: ${selfHosted ? 'Yes' : 'No'}
  → Database:   ${process.env.TURSO_DATABASE_URL || 'SQLite (default)'}
  → Environment: ${process.env.NODE_ENV || 'development'}

Ready to track analytics with privacy!
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);

  // Kill Next.js process if running
  if (nextjsProcess) {
    console.log('Stopping dashboard server...');
    nextjsProcess.kill('SIGTERM');
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
start();
