/**
 * ZERO TRUST ANALYTICS - SELF-HOSTED SERVER
 * ==========================================
 * Express server that wraps Netlify Functions for self-hosting.
 * Serves: Marketing site (Hugo), Dashboard (Next.js), API (Netlify Functions)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
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

// Serve static files (Hugo marketing site)
const marketingDir = path.join(__dirname, '..', 'public', 'marketing');
app.use(express.static(marketingDir));

// Dashboard directory (Next.js standalone)
const dashboardDir = path.join(__dirname, '..', 'dashboard');

/**
 * Proxy requests to Next.js dashboard
 */
function proxyToNextjs(req, res) {
  const options = {
    hostname: 'localhost',
    port: NEXTJS_PORT,
    path: req.url,
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

/**
 * Register all API routes
 * Each Netlify function becomes an Express route
 */
async function registerRoutes() {
  const functionsDir = path.join(__dirname, '..', 'netlify', 'functions');

  // Define route mappings (path -> function file)
  const routes = [
    // Analytics tracking
    { path: '/api/track', file: 'track.js' },
    { path: '/api/stats', file: 'stats.js' },
    { path: '/api/realtime', file: 'realtime.js' },
    { path: '/api/export', file: 'export.js' },
    { path: '/api/public-stats', file: 'public-stats.js' },

    // Authentication
    { path: '/api/auth/config', file: 'auth-config.js' },
    { path: '/api/auth/login', file: 'auth-login.js' },
    { path: '/api/auth/register', file: 'auth-register.js' },
    { path: '/api/auth/forgot', file: 'auth-forgot.js' },
    { path: '/api/auth/reset', file: 'auth-reset.js' },
    { path: '/api/auth/verify-reset-token', file: 'auth-verify-reset-token.js' },

    // Sites management
    { path: '/api/sites/list', file: 'sites-list.js' },
    { path: '/api/sites/create', file: 'sites-create.js' },
    { path: '/api/sites/update', file: 'sites-update.js' },
    { path: '/api/sites/delete', file: 'sites-delete.js' },
    { path: '/api/sites/share', file: 'sites-share.js' },

    // User management
    { path: '/api/user/status', file: 'user-status.js' },
    { path: '/api/user/sessions', file: 'user-sessions.js' },

    // Features
    { path: '/api/goals', file: 'goals.js' },
    { path: '/api/funnels', file: 'funnels.js' },
    { path: '/api/annotations', file: 'annotations.js' },
    { path: '/api/alerts', file: 'alerts.js' },
    { path: '/api/heatmaps', file: 'heatmaps.js' },
    { path: '/api/activity-log', file: 'activity-log.js' },
    { path: '/api/api-keys', file: 'api-keys.js' },
    { path: '/api/teams', file: 'teams.js' },
    { path: '/api/invite', file: 'invite.js' },
    { path: '/api/webhooks', file: 'webhooks.js' },

    // Stripe integration (optional)
    { path: '/api/stripe/checkout', file: 'stripe-checkout.js' },
    { path: '/api/stripe/portal', file: 'stripe-portal.js' },
    { path: '/api/stripe/webhook', file: 'stripe-webhook.js' },

    // Utilities
    { path: '/api/health', file: 'health.js' },
    { path: '/api/debug', file: 'debug.js' },
  ];

  // Register each route
  for (const route of routes) {
    try {
      const functionPath = path.join(functionsDir, route.file);
      const functionModule = await import(functionPath);

      // Register all HTTP methods
      app.all(route.path, netlifyToExpress(functionModule));
      console.log(`Registered: ${route.path} -> ${route.file}`);
    } catch (error) {
      console.error(`Failed to register ${route.path}:`, error.message);
    }
  }
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

// Fallback: Serve index.html for client-side routing (marketing site)
app.get('*', (req, res) => {
  res.sendFile(path.join(marketingDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
async function start() {
  try {
    // Initialize database
    await initializeDatabase();

    // Register API routes
    await registerRoutes();

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
  → Marketing:  http://localhost:${PORT}
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
