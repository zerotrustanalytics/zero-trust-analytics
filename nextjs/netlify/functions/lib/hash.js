import crypto from 'crypto';

// Validate required environment variables
function getHashSecret() {
  const secret = process.env.HASH_SECRET;
  if (!secret) {
    throw new Error('HASH_SECRET environment variable is required for zero-trust hashing');
  }
  return secret;
}

// Get daily salt (rotates daily for privacy)
export function getDailySalt() {
  const today = new Date().toISOString().split('T')[0];
  const secret = getHashSecret();
  return crypto.createHash('sha256').update(today + secret).digest('hex').slice(0, 16);
}

// Hash visitor identity (IP + User Agent + Daily Salt)
export function hashVisitor(ip, userAgent) {
  const salt = getDailySalt();
  const data = `${ip}|${userAgent}|${salt}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// Generate unique site ID
export function generateSiteId() {
  return 'site_' + crypto.randomBytes(8).toString('hex');
}

// Generate API key
export function generateApiKey() {
  return 'zta_' + crypto.randomBytes(16).toString('hex');
}
