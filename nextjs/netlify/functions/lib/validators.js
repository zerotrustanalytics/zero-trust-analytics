/**
 * Input Validation Library
 * Provides comprehensive validation functions for all user inputs
 * Following OWASP security best practices
 */

/**
 * Validates email address using RFC 5322 compliant regex
 * @param {string} email - Email address to validate
 * @returns {Object} - {valid: boolean, error?: string, sanitized?: string}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  // Trim and convert to lowercase
  const sanitized = email.trim().toLowerCase();

  // RFC 5322 compliant email regex (simplified but secure)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(sanitized)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Additional checks
  if (sanitized.length > 254) {
    return { valid: false, error: 'Email address too long' };
  }

  const [localPart, domain] = sanitized.split('@');
  if (localPart.length > 64) {
    return { valid: false, error: 'Email local part too long' };
  }

  // Check for consecutive dots
  if (sanitized.includes('..')) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, sanitized };
}

/**
 * Validates password strength
 * Requirements: 12+ characters, uppercase, lowercase, number, special character
 * @param {string} password - Password to validate
 * @returns {Object} - {valid: boolean, errors?: string[], strength?: string}
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }

  const errors = [];

  // Length check
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  // Complexity checks
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common passwords (basic check)
  const commonPasswords = ['password123', 'admin123456', 'welcome12345'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password is too common');
  }

  // Calculate strength
  let strength = 'weak';
  if (errors.length === 0) {
    if (password.length >= 16) {
      strength = 'strong';
    } else if (password.length >= 12) {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    strength
  };
}

/**
 * Validates domain name
 * @param {string} domain - Domain to validate
 * @returns {Object} - {valid: boolean, error?: string, sanitized?: string}
 */
export function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Domain is required' };
  }

  // Sanitize: remove protocol, www., and trailing slash
  let sanitized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  // Remove port if present
  sanitized = sanitized.split(':')[0];

  // Domain regex (supports subdomains)
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (!domainRegex.test(sanitized)) {
    return { valid: false, error: 'Invalid domain format' };
  }

  // Length check
  if (sanitized.length > 253) {
    return { valid: false, error: 'Domain name too long' };
  }

  // Must have at least one dot (TLD)
  if (!sanitized.includes('.')) {
    return { valid: false, error: 'Domain must include a TLD (e.g., .com)' };
  }

  // Check for localhost or internal domains
  const invalidDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
  if (invalidDomains.some(invalid => sanitized.includes(invalid))) {
    return { valid: false, error: 'Invalid domain' };
  }

  return { valid: true, sanitized };
}

/**
 * Validates site ID
 * @param {string} siteId - Site ID to validate
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateSiteId(siteId) {
  if (!siteId || typeof siteId !== 'string') {
    return { valid: false, error: 'Site ID is required' };
  }

  const trimmed = siteId.trim();

  // Site IDs should be alphanumeric (may include hyphens or underscores)
  const siteIdRegex = /^[a-zA-Z0-9_-]+$/;

  if (!siteIdRegex.test(trimmed)) {
    return { valid: false, error: 'Site ID must be alphanumeric' };
  }

  // Length check (8-64 characters)
  if (trimmed.length < 8 || trimmed.length > 64) {
    return { valid: false, error: 'Site ID must be between 8 and 64 characters' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates UUID format (v4)
 * @param {string} uuid - UUID to validate
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return { valid: false, error: 'UUID is required' };
  }

  const trimmed = uuid.trim().toLowerCase();

  // UUID v4 regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  if (!uuidRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid UUID format' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates date range
 * @param {string|Date} start - Start date
 * @param {string|Date} end - End date
 * @returns {Object} - {valid: boolean, error?: string, startDate?: Date, endDate?: Date}
 */
export function validateDateRange(start, end) {
  if (!start || !end) {
    return { valid: false, error: 'Start and end dates are required' };
  }

  let startDate, endDate;

  try {
    startDate = new Date(start);
    endDate = new Date(end);
  } catch (err) {
    return { valid: false, error: 'Invalid date format' };
  }

  // Check if dates are valid
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  // End must be after start
  if (endDate <= startDate) {
    return { valid: false, error: 'End date must be after start date' };
  }

  // Prevent future dates
  const now = new Date();
  if (startDate > now || endDate > now) {
    return { valid: false, error: 'Dates cannot be in the future' };
  }

  // Prevent date ranges too far in the past (> 2 years)
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  if (startDate < twoYearsAgo) {
    return { valid: false, error: 'Start date cannot be more than 2 years ago' };
  }

  // Prevent date ranges that are too long (> 1 year)
  const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (endDate - startDate > maxRangeMs) {
    return { valid: false, error: 'Date range cannot exceed 1 year' };
  }

  return { valid: true, startDate, endDate };
}

/**
 * Sanitizes string to prevent XSS attacks
 * @param {string} str - String to sanitize
 * @param {Object} options - Options for sanitization
 * @returns {string} - Sanitized string
 */
export function sanitizeString(str, options = {}) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  const {
    maxLength = 1000,
    allowNewlines = false,
    trim = true
  } = options;

  let sanitized = str;

  // Trim if requested
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Remove control characters except newlines (if allowed)
  if (allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // HTML entity encoding for dangerous characters
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  sanitized = sanitized.replace(/[&<>"'\/]/g, char => htmlEntities[char]);

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Validates plan name
 * @param {string} plan - Plan name to validate
 * @returns {Object} - {valid: boolean, error?: string, sanitized?: string}
 */
export function validatePlan(plan) {
  const validPlans = ['solo', 'starter', 'pro', 'business', 'scale'];

  if (!plan || typeof plan !== 'string') {
    return { valid: true, sanitized: 'pro' }; // Default to pro
  }

  const sanitized = plan.trim().toLowerCase();

  if (!validPlans.includes(sanitized)) {
    return { valid: true, sanitized: 'pro' }; // Default to pro if invalid
  }

  return { valid: true, sanitized };
}

/**
 * Validates pagination parameters
 * @param {number|string} page - Page number
 * @param {number|string} limit - Items per page
 * @returns {Object} - {valid: boolean, error?: string, page?: number, limit?: number}
 */
export function validatePagination(page = 1, limit = 20) {
  let pageNum = parseInt(page, 10);
  let limitNum = parseInt(limit, 10);

  // Check if conversion was successful
  if (isNaN(pageNum)) {
    return { valid: false, error: 'Page must be a number' };
  }

  if (isNaN(limitNum)) {
    return { valid: false, error: 'Limit must be a number' };
  }

  // Validate ranges
  if (pageNum < 1) {
    return { valid: false, error: 'Page must be at least 1' };
  }

  if (pageNum > 10000) {
    return { valid: false, error: 'Page number too large' };
  }

  if (limitNum < 1) {
    return { valid: false, error: 'Limit must be at least 1' };
  }

  if (limitNum > 100) {
    return { valid: false, error: 'Limit cannot exceed 100' };
  }

  return { valid: true, page: pageNum, limit: limitNum };
}

/**
 * Validates time period
 * @param {string} period - Time period (e.g., '24h', '7d', '30d')
 * @returns {Object} - {valid: boolean, error?: string, sanitized?: string}
 */
export function validatePeriod(period) {
  const validPeriods = ['24h', '7d', '30d', '90d', '365d', 'custom'];

  if (!period || typeof period !== 'string') {
    return { valid: true, sanitized: '7d' }; // Default to 7 days
  }

  const sanitized = period.trim().toLowerCase();

  if (!validPeriods.includes(sanitized)) {
    return { valid: true, sanitized: '7d' }; // Default to 7 days
  }

  return { valid: true, sanitized };
}

/**
 * Validates URL
 * @param {string} url - URL to validate
 * @returns {Object} - {valid: boolean, error?: string, sanitized?: string}
 */
export function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }

    // Prevent localhost and internal IPs
    const hostname = parsed.hostname.toLowerCase();
    const invalidHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (invalidHosts.includes(hostname)) {
      return { valid: false, error: 'Invalid URL' };
    }

    // Prevent private IP ranges
    if (/^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname)) {
      return { valid: false, error: 'Invalid URL' };
    }

    return { valid: true, sanitized: parsed.toString() };
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates boolean value
 * @param {*} value - Value to validate as boolean
 * @returns {Object} - {valid: boolean, value: boolean}
 */
export function validateBoolean(value) {
  if (typeof value === 'boolean') {
    return { valid: true, value };
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return { valid: true, value: true };
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return { valid: true, value: false };
    }
  }

  if (typeof value === 'number') {
    return { valid: true, value: value !== 0 };
  }

  return { valid: false, value: false };
}

/**
 * Validates object has only allowed keys
 * @param {Object} obj - Object to validate
 * @param {string[]} allowedKeys - Array of allowed keys
 * @returns {Object} - {valid: boolean, error?: string, extraKeys?: string[]}
 */
export function validateObjectKeys(obj, allowedKeys) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'Invalid object' };
  }

  const objKeys = Object.keys(obj);
  const extraKeys = objKeys.filter(key => !allowedKeys.includes(key));

  if (extraKeys.length > 0) {
    return {
      valid: false,
      error: `Unexpected fields: ${extraKeys.join(', ')}`,
      extraKeys
    };
  }

  return { valid: true };
}
