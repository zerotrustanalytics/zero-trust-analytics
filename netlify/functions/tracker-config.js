/**
 * TRACKER CONFIG ENDPOINT
 * =======================
 * Returns site-specific configuration for the analytics tracker.
 * This allows per-site features like Real-time Analytics add-on.
 *
 * GET /api/tracker-config?siteId=xxx
 *
 * Response:
 * {
 *   siteId: "xxx",
 *   enableHeartbeat: false,
 *   heartbeatInterval: 300000,
 *   sampleRate: 1.0
 * }
 */

import { getSite } from './lib/storage.js';
import { Config } from './lib/config.js';

// In-memory cache for config (reduces Blob reads)
const configCache = new Map();
const CONFIG_CACHE_TTL = 60000; // 60 seconds

async function getCachedSiteConfig(siteId) {
  const now = Date.now();
  const cached = configCache.get(siteId);

  if (cached && now - cached.timestamp < CONFIG_CACHE_TTL) {
    return cached.config;
  }

  const site = await getSite(siteId);
  if (!site) return null;

  // Build tracker config from site settings
  const config = {
    siteId: site.id,
    // Real-time settings (from add-on)
    enableHeartbeat: site.realtimeEnabled || false,
    heartbeatInterval: site.realtimeEnabled
      ? Config.addons.realtime.config.heartbeatInterval
      : 300000,
    // Sampling (if configured per-site)
    sampleRate: site.sampleRate ?? 1.0,
    // Other optional per-site settings
    trackScrollMilestones: site.trackScrollMilestones || false
  };

  configCache.set(siteId, { config, timestamp: now });
  return config;
}

export default async function handler(req, context) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');

  // CORS headers for cross-origin requests from tracker
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60' // Cache for 60 seconds
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!siteId) {
    return new Response(JSON.stringify({ error: 'siteId required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const config = await getCachedSiteConfig(siteId);

  if (!config) {
    // Return default config for unknown sites (fail open)
    return new Response(JSON.stringify({
      siteId,
      enableHeartbeat: false,
      heartbeatInterval: 300000,
      sampleRate: 1.0
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/api/tracker-config'
};
