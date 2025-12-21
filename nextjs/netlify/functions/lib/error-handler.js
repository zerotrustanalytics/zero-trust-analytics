/**
 * Centralized Error Handler for Zero Trust Analytics
 *
 * Provides:
 * - Custom error classes with proper types and status codes
 * - Consistent error response formatting
 * - Error logging integration
 * - Sanitized error messages for clients (no internal details leaked)
 * - Error recovery and retry logic where appropriate
 */

import { logger } from './logger.js';

/**
 * Base Error class for all application errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Operational errors vs programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Validation Error - 400 Bad Request
 * Used when user input is invalid
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error - 401 Unauthorized
 * Used when authentication fails or is missing
 */
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * Authorization Error - 403 Forbidden
 * Used when user is authenticated but lacks permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Not Found Error - 404 Not Found
 * Used when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict Error - 409 Conflict
 * Used when operation conflicts with current state (e.g., duplicate email)
 */
export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 * Used when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * External Service Error - 502 Bad Gateway
 * Used when external service (Stripe, database, etc.) fails
 */
export class ExternalServiceError extends AppError {
  constructor(service, originalError = null) {
    const message = `External service error: ${service}`;
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', { service });
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Database Error - 500 Internal Server Error
 * Used for database operation failures
 */
export class DatabaseError extends AppError {
  constructor(operation, originalError = null) {
    super('Database operation failed', 500, 'DATABASE_ERROR', { operation });
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Handle errors in Netlify function handlers
 *
 * @param {Error} error - The error to handle
 * @param {Object} logger - Logger instance for this request
 * @param {string} origin - CORS origin header
 * @returns {Response} Formatted error response
 */
export function handleError(error, requestLogger = logger, origin = null) {
  // Log the error with appropriate level
  if (error instanceof AppError && error.isOperational) {
    // Operational errors (expected errors) - log as warning
    requestLogger.warn(error.message, {
      errorCode: error.code,
      statusCode: error.statusCode,
      details: error.details,
    });
  } else {
    // Programming errors or unexpected errors - log as error with full stack
    requestLogger.error('Unhandled error in function handler', error, {
      errorType: error.constructor.name,
    });
  }

  // Determine response details
  let statusCode = 500;
  let responseBody = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  };

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    responseBody = error.toJSON();
  } else {
    // Unknown error - don't leak internal details
    responseBody = {
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
  }

  // Build response headers
  const headers = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  // Add CORS headers if origin provided
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  // Add retry-after header for rate limit errors
  if (error instanceof RateLimitError) {
    headers['Retry-After'] = error.retryAfter.toString();
  }

  return new Response(JSON.stringify(responseBody), {
    status: statusCode,
    headers,
  });
}

/**
 * Async error handler wrapper for Netlify functions
 *
 * Wraps a handler function to automatically catch and handle errors
 *
 * @param {Function} handler - The async handler function
 * @param {string} functionName - Name of the function for logging
 * @returns {Function} Wrapped handler with error handling
 */
export function withErrorHandler(handler, functionName) {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Create function-specific logger
      const { createFunctionLogger } = await import('./logger.js');
      const requestLogger = createFunctionLogger(functionName, req, context);

      // Extract origin for CORS
      const origin = req.headers.get('origin');

      // Handle the error
      return handleError(error, requestLogger, origin);
    }
  };
}

/**
 * Assert a condition, throw ValidationError if false
 *
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @param {*} details - Additional error details
 */
export function assert(condition, message, details = null) {
  if (!condition) {
    throw new ValidationError(message, details);
  }
}

/**
 * Validate required fields in an object
 *
 * @param {Object} data - Data object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @throws {ValidationError} If any required field is missing
 */
export function validateRequired(data, requiredFields) {
  const missing = requiredFields.filter(field => !data[field]);

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      { missing }
    );
  }
}

/**
 * Wrap external service calls with error handling
 *
 * @param {Function} serviceCall - Async function that calls external service
 * @param {string} serviceName - Name of the service for error reporting
 * @returns {Promise<*>} Result of the service call
 * @throws {ExternalServiceError} If service call fails
 */
export async function withExternalService(serviceCall, serviceName) {
  try {
    return await serviceCall();
  } catch (error) {
    throw new ExternalServiceError(serviceName, error);
  }
}

/**
 * Wrap database calls with error handling
 *
 * @param {Function} dbCall - Async function that performs database operation
 * @param {string} operation - Description of the operation
 * @returns {Promise<*>} Result of the database call
 * @throws {DatabaseError} If database operation fails
 */
export async function withDatabase(dbCall, operation) {
  try {
    return await dbCall();
  } catch (error) {
    throw new DatabaseError(operation, error);
  }
}

// Export all error classes for easy importing
export const Errors = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
};
