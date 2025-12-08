import crypto from 'crypto';

// Get daily salt (rotates daily for privacy)
export function getDailySalt() {
  const today = new Date().toISOString().split('T')[0];
  const secret = process.env.HASH_SECRET || 'zta-default-secret-change-me';
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
