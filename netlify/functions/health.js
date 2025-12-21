import { checkConfig, getConfigSummary } from './lib/config.js';

export default async function handler(req, context) {
  const startTime = Date.now();

  // Check configuration status
  const configStatus = checkConfig();

  // Basic health check response
  const health = {
    status: configStatus.isValid ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.round(process.uptime()) : null,
    version: '1.0.0',
    checks: {
      api: 'ok',
      config: configStatus.isValid ? 'ok' : 'error'
    }
  };

  // Add configuration details if requested (only in non-production)
  if (req.url.includes('?verbose=true') && process.env.NODE_ENV !== 'production') {
    health.config = getConfigSummary();
  }

  // Add missing config vars if any
  if (!configStatus.isValid) {
    health.missingConfig = configStatus.missing;
  }

  // Calculate response time
  health.responseTime = Date.now() - startTime;

  return new Response(JSON.stringify(health), {
    status: configStatus.isValid ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

export const config = {
  path: '/api/health'
};
