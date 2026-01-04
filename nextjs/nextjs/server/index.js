/**
 * ZERO TRUST ANALYTICS - SELF-HOSTED SERVER
 * ==========================================
 * Express server that wraps Netlify Functions for self-hosting.
 * Converts Netlify Function format to Express routes.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// Serve static files (Hugo build output)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

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

    // Create a mock request for initialization
    const mockReq = {
      method: 'POST',
      headers: { get: () => null },
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

// Fallback: Serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
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

    // Start listening
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════════╗
║   Zero Trust Analytics - Self-Hosted      ║
╚════════════════════════════════════════════╝

Server running at:
  → http://localhost:${PORT}

Database: ${process.env.DATABASE_PATH || 'SQLite (default)'}
Environment: ${process.env.NODE_ENV || 'development'}

Ready to track analytics with privacy! 🔒
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
start();
