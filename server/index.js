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
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// init-db is only ever invoked in-process at startup (never routed), so its
// secret never needs to be known outside this process. Generate one per boot
// rather than shipping a guessable default.
if (!process.env.INIT_DB_SECRET) {
  process.env.INIT_DB_SECRET = crypto.randomBytes(32).toString('hex');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NEXTJS_PORT = process.env.NEXTJS_PORT || 3001;

// Max request body accepted by API functions (GA/CSV imports are the largest).
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// Track Next.js process for graceful shutdown
let nextjsProcess = null;

// No global body parsers: API functions read the raw body themselves (Stripe
// signature checks need the exact bytes), and proxied Next routes (Auth.js
// sign-in/sign-out POSTs) need the request stream left untouched.

// CORS preflight. Functions set their own (allowlisted) CORS headers on actual
// responses; this only answers preflights, and never with credentials — a
// wildcard origin is safe precisely because browsers refuse credentials on it.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Site-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
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
    // Keep the public origin visible to Next (the original Host is passed
    // through; Next overrides X-Forwarded-Host with Host): Auth.js (trustHost)
    // builds its OAuth callback URL from it, and gatekeep only accepts the
    // registered https://app.ztas.io/api/auth/callback/gatekeep.
    headers: {
      ...req.headers,
      'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host,
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || req.protocol,
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
/**
 * Real client IP. Behind the Cloudflare Tunnel every request arrives from
 * cloudflared, so the socket address is the same for all visitors — which
 * would collapse visitor hashing and per-IP rate limits into one bucket.
 * Cloudflare sets CF-Connecting-IP; fall back to the first X-Forwarded-For hop,
 * then the socket. (These headers are only trustworthy because the container
 * port is not exposed beyond the host — see docker-compose.yml.)
 */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/** Buffer the raw request body, refusing anything over MAX_BODY_BYTES. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Convert a Netlify Function (Web Request -> Web Response) to Express middleware.
 * Functions get a genuine Web `Request` — iterable headers, text()/json()/
 * arrayBuffer(), absolute url — exactly what Netlify hands them, so handler
 * code (e.g. Object.fromEntries(req.headers), Stripe's raw-body signature
 * check, new URL(req.url)) behaves the same in both environments.
 */
function netlifyToExpress(netlifyFunction) {
  return async (req, res) => {
    try {
      // Netlify-compatible context. Geo comes from Cloudflare headers
      // (city/region need the "visitor location headers" managed transform).
      const context = {
        ip: clientIp(req),
        geo: {
          country: { code: req.headers['cf-ipcountry'] || '' },
          subdivision: { code: req.headers['cf-region-code'] || req.headers['cf-region'] || '' },
          city: req.headers['cf-ipcity'] || '',
        },
      };

      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers.host || 'localhost';

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else if (value !== undefined) headers.set(key, value);
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const body = hasBody ? await readRawBody(req) : undefined;

      const webReq = new Request(`${proto}://${host}${req.originalUrl}`, {
        method: req.method,
        headers,
        body: body && body.length > 0 ? body : undefined,
      });

      const response = await netlifyFunction.default(webReq, context);

      if (response instanceof Response) {
        response.headers.forEach((value, key) => {
          if (key !== 'set-cookie') res.setHeader(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) res.setHeader('set-cookie', cookies);

        res.status(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
      } else {
        // Fallback for legacy { statusCode, headers, body } handlers
        res.status(response.statusCode || 200)
           .set(response.headers || {})
           .send(response.body);
      }
    } catch (error) {
      if (error.status === 413) {
        return res.status(413).json({ error: 'Request body too large' });
      }
      // Log the detail server-side only; never echo internals to the caller.
      console.error('Function error:', error);
      res.status(500).json({ error: 'Internal server error' });
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
  // Raw pageview dump guarded only by a shared secret — a Netlify-era debugging
  // aid with no place on a public origin.
  'debug',
]);

/**
 * Compute the Express paths a function answers on: the path(s) it declares in
 * `export const config = { path }` (what Netlify routes on — e.g. api-keys.js
 * serves /api/keys, activity-log.js serves /api/activity), plus the dash and
 * slash forms of its file name, since the frontend uses mixed conventions
 * (/api/sites/list AND /api/page-value-rules). Each gets a wildcard suffix so
 * sub-routes fall through (/api/admin/usage/customer -> admin-usage).
 */
function pathsForFunction(name, declared) {
  const dash = `/api/${name}`;
  const slash = `/api/${name.replace(/-/g, '/')}`;
  const own = declared ? [].concat(declared).map((p) => p.replace(/\/\*$/, '')) : [];
  return [...new Set([...own, dash, slash].flatMap((p) => [p, `${p}/*`]))];
}

// Netlify cron shorthands supported by the in-process scheduler.
const SCHEDULE_INTERVALS = {
  '@hourly': 60 * 60 * 1000,
  '@daily': 24 * 60 * 60 * 1000,
  '@weekly': 7 * 24 * 60 * 60 * 1000,
};
const SCHEDULE_FIRST_RUN_DELAY = 10 * 60 * 1000; // let the box settle after boot

/**
 * Run Netlify scheduled functions (config.schedule) in-process — there is no
 * Netlify scheduler off-platform. Invoked the way Netlify invokes them: a POST
 * with context.triggerType = 'scheduled'.
 */
function scheduleFunction(name, mod) {
  const schedule = mod.config && mod.config.schedule;
  const interval = SCHEDULE_INTERVALS[schedule];
  if (!interval) {
    console.warn(`Schedule "${schedule}" for ${name}.js is not supported — not scheduled`);
    return;
  }
  const run = async () => {
    try {
      const res = await mod.default(
        new Request(`http://localhost/internal/scheduled/${name}`, { method: 'POST' }),
        { triggerType: 'scheduled', ip: 'localhost', geo: {} }
      );
      console.log(`Scheduled ${name} finished with status ${res && res.status}`);
    } catch (error) {
      console.error(`Scheduled ${name} failed:`, error);
    }
  };
  setTimeout(() => {
    run();
    setInterval(run, interval).unref();
  }, SCHEDULE_FIRST_RUN_DELAY).unref();
  console.log(`Scheduled ${name}.js ${schedule}`);
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

  const failed = [];

  for (const name of names) {
    let mod;
    let handler;
    try {
      mod = await import(path.join(functionsDir, `${name}.js`));
      if (typeof mod.default !== 'function') continue; // not an HTTP handler
      handler = netlifyToExpress(mod);
      if (mod.config && mod.config.schedule) scheduleFunction(name, mod);
    } catch (error) {
      // Usually a missing env var at module load (e.g. the Stripe functions
      // without STRIPE_SECRET_KEY). Keep the route answering with an explicit
      // 503 instead of silently falling through to the dashboard.
      failed.push(name);
      console.error(`Failed to import ${name}.js:`, error.message);
      handler = (req, res) => res.status(503).json({ error: `${name} is not configured on this server` });
    }

    for (const p of pathsForFunction(name, mod && mod.config && mod.config.path)) {
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
  if (failed.length > 0) {
    console.error(`WARNING: ${failed.length} function(s) failed to load and answer 503: ${failed.join(', ')}`);
  }
}

// Initialize database on startup
async function initializeDatabase() {
  try {
    const initDbPath = path.join(__dirname, '..', 'netlify', 'functions', 'init-db.js');
    const initDb = await import(initDbPath);

    const initSecret = process.env.INIT_DB_SECRET;

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

    const res = await initDb.default(mockReq, mockContext);
    // init-db returns a Response; a non-2xx (e.g. 503 when INIT_DB_SECRET is
    // unset) means the schema was NOT created. Don't report false success —
    // that previously hid an empty-DB failure at startup.
    const status = res && typeof res.status === 'number' ? res.status : 200;
    if (status >= 200 && status < 300) {
      console.log('Database initialized successfully');
    } else {
      let detail = '';
      try { detail = await res.text(); } catch { /* ignore */ }
      console.error(`Database initialization FAILED (status ${status}): ${detail}`);
    }
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

    // Unknown /api/* paths are API 404s, not dashboard pages. (Auth.js's
    // /api/auth/* is proxied to Next above, before this point.)
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

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
