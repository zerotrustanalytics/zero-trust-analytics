/**
 * Structured Logger for Zero Trust Analytics
 *
 * Provides consistent, structured logging across all Netlify functions with:
 * - Multiple log levels (debug, info, warn, error)
 * - Timestamps and request IDs for tracing
 * - Context-aware logging
 * - JSON format for production, pretty format for development
 * - PII-safe logging (never logs sensitive data)
 */

import { randomUUID } from 'crypto';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',
};

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NETLIFY_DEV === 'true';
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? (isDevelopment ? LOG_LEVELS.debug : LOG_LEVELS.info);

/**
 * Create a logger instance with optional context
 *
 * @param {Object} defaultContext - Default context to include in all logs
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
export function createLogger(defaultContext = {}) {
  const requestId = defaultContext.requestId || generateRequestId();

  const logger = {
    /**
     * Log debug information (development only)
     */
    debug: (message, context = {}) => {
      log('debug', message, { ...defaultContext, ...context, requestId });
    },

    /**
     * Log informational messages
     */
    info: (message, context = {}) => {
      log('info', message, { ...defaultContext, ...context, requestId });
    },

    /**
     * Log warnings
     */
    warn: (message, context = {}) => {
      log('warn', message, { ...defaultContext, ...context, requestId });
    },

    /**
     * Log errors with stack traces
     */
    error: (message, error = null, context = {}) => {
      const errorContext = {
        ...defaultContext,
        ...context,
        requestId,
      };

      if (error instanceof Error) {
        errorContext.error = {
          message: error.message,
          name: error.name,
          stack: error.stack,
          ...(error.code && { code: error.code }),
          ...(error.statusCode && { statusCode: error.statusCode }),
        };
      } else if (error) {
        errorContext.errorDetails = error;
      }

      log('error', message, errorContext);
    },

    /**
     * Create a child logger with additional context
     */
    child: (additionalContext = {}) => {
      return createLogger({ ...defaultContext, ...additionalContext, requestId });
    },

    /**
     * Get the current request ID
     */
    getRequestId: () => requestId,
  };

  return logger;
}

/**
 * Core logging function
 */
function log(level, message, context = {}) {
  // Check if this log level should be output
  if (LOG_LEVELS[level] < currentLogLevel) {
    return;
  }

  const timestamp = new Date().toISOString();

  // Sanitize context to prevent PII leaks
  const sanitizedContext = sanitizeContext(context);

  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...sanitizedContext,
  };

  if (isDevelopment) {
    // Pretty format for development
    const color = LOG_COLORS[level];
    const reset = LOG_COLORS.reset;
    const contextStr = Object.keys(sanitizedContext).length > 0
      ? '\n' + JSON.stringify(sanitizedContext, null, 2)
      : '';

    console.log(`${color}[${timestamp}] ${level.toUpperCase()}${reset}: ${message}${contextStr}`);
  } else {
    // JSON format for production (CloudWatch, Datadog, etc.)
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Sanitize context to remove PII and sensitive data
 */
function sanitizeContext(context) {
  const sanitized = { ...context };

  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'creditCard',
    'ssn',
    'email', // Keep email out of logs for privacy
    'ip', // Already hashed in our system
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeContext(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId() {
  // Use shorter IDs in development for readability
  if (isDevelopment) {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
  }
  return randomUUID();
}

/**
 * Extract request context from Netlify function event
 */
export function extractRequestContext(req, context) {
  const url = new URL(req.url);

  return {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    userAgent: req.headers.get('user-agent')?.substring(0, 100), // Truncate to avoid huge logs
    ip: context.ip || req.headers.get('x-forwarded-for') || 'unknown',
    geo: {
      country: context.geo?.country?.code,
      region: context.geo?.subdivision?.code,
    },
  };
}

/**
 * Create a logger for a specific function handler
 *
 * @param {string} functionName - Name of the Netlify function
 * @param {Request} req - Netlify function request object
 * @param {Object} context - Netlify function context object
 * @returns {Object} Logger instance
 */
export function createFunctionLogger(functionName, req, context) {
  const requestContext = extractRequestContext(req, context);

  return createLogger({
    function: functionName,
    ...requestContext,
  });
}

// Export a default logger for simple use cases
export const logger = createLogger();

// Export log level constants for external use
export { LOG_LEVELS };
