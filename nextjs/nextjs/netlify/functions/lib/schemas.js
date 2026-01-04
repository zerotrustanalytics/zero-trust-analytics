/**
 * Request Schemas
 * Defines validation schemas for all API endpoints
 */

import {
  validateEmail,
  validatePassword,
  validateDomain,
  validateSiteId,
  validateUUID,
  validateDateRange,
  validatePlan,
  validatePagination,
  validatePeriod,
  validateURL,
  validateBoolean,
  sanitizeString
} from './validators.js';
import { ValidationError } from './error-handler.js';
import { createFunctionLogger } from './logger.js';

/**
 * Schema validation helper
 * @param {Object} schema - Validation schema
 * @param {Object} data - Data to validate
 * @param {Object} logger - Logger instance
 * @returns {Object} - Validated and sanitized data
 * @throws {ValidationError} - If validation fails
 */
export function validateRequest(schema, data, logger = null) {
  const errors = [];
  const sanitized = {};

  // Create a default logger if none provided
  const log = logger || {
    debug: () => {},
    warn: (msg, ctx) => console.warn(msg, ctx),
    error: (msg, ctx) => console.error(msg, ctx)
  };

  log.debug('Validating request data', {
    schemaFields: Object.keys(schema),
    dataFields: Object.keys(data || {})
  });

  // Check for required fields
  for (const [field, rules] of Object.entries(schema)) {
    const value = data?.[field];

    // Check if field is required
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip validation if field is optional and not provided
    if (!rules.required && (value === undefined || value === null || value === '')) {
      if (rules.default !== undefined) {
        sanitized[field] = rules.default;
      }
      continue;
    }

    // Run validator function
    if (rules.validator) {
      const result = rules.validator(value, rules.options);

      if (!result.valid) {
        if (result.errors && Array.isArray(result.errors)) {
          errors.push(...result.errors);
        } else if (result.error) {
          errors.push(result.error);
        } else {
          errors.push(`${field} is invalid`);
        }
      } else {
        // Use sanitized value if provided, otherwise use original
        sanitized[field] = result.sanitized !== undefined ? result.sanitized : value;
      }
    } else {
      // No validator, just copy the value
      sanitized[field] = value;
    }
  }

  // Check for unexpected fields
  const allowedFields = Object.keys(schema);
  const providedFields = Object.keys(data || {});
  const unexpectedFields = providedFields.filter(field => !allowedFields.includes(field));

  if (unexpectedFields.length > 0) {
    log.warn('Unexpected fields in request', { unexpectedFields });
    // Don't add to errors, just log for now
    // errors.push(`Unexpected fields: ${unexpectedFields.join(', ')}`);
  }

  if (errors.length > 0) {
    log.warn('Validation failed', {
      errorCount: errors.length,
      errors
    });
    throw new ValidationError(errors.length === 1 ? errors[0] : 'Validation failed', errors);
  }

  log.debug('Validation successful', {
    sanitizedFields: Object.keys(sanitized)
  });

  return sanitized;
}

/**
 * Auth Register Schema
 */
export const authRegisterSchema = {
  email: {
    required: true,
    validator: validateEmail
  },
  password: {
    required: true,
    validator: validatePassword
  },
  plan: {
    required: false,
    validator: validatePlan,
    default: 'pro'
  }
};

/**
 * Auth Login Schema
 */
export const authLoginSchema = {
  email: {
    required: true,
    validator: validateEmail
  },
  password: {
    required: true,
    validator: (password) => {
      // For login, we just need to check if password is provided
      // Not enforcing complexity rules on login
      if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
      }
      if (password.length < 1 || password.length > 128) {
        return { valid: false, error: 'Invalid password length' };
      }
      return { valid: true };
    }
  }
};

/**
 * Site Create Schema
 */
export const siteCreateSchema = {
  domain: {
    required: true,
    validator: validateDomain
  }
};

/**
 * Stats Query Schema
 */
export const statsQuerySchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  period: {
    required: false,
    validator: validatePeriod,
    default: '7d'
  },
  startDate: {
    required: false,
    validator: (date) => {
      if (!date) return { valid: true };
      try {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return { valid: false, error: 'Invalid start date' };
        }
        return { valid: true, sanitized: parsed.toISOString() };
      } catch (err) {
        return { valid: false, error: 'Invalid start date format' };
      }
    }
  },
  endDate: {
    required: false,
    validator: (date) => {
      if (!date) return { valid: true };
      try {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return { valid: false, error: 'Invalid end date' };
        }
        return { valid: true, sanitized: parsed.toISOString() };
      } catch (err) {
        return { valid: false, error: 'Invalid end date format' };
      }
    }
  }
};

/**
 * Site Update Schema
 */
export const siteUpdateSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  domain: {
    required: false,
    validator: validateDomain
  },
  name: {
    required: false,
    validator: (name) => {
      if (!name) return { valid: true };
      const sanitized = sanitizeString(name, { maxLength: 100 });
      if (sanitized.length < 1) {
        return { valid: false, error: 'Name is too short' };
      }
      return { valid: true, sanitized };
    }
  }
};

/**
 * Site Delete Schema
 */
export const siteDeleteSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  }
};

/**
 * User Update Schema
 */
export const userUpdateSchema = {
  email: {
    required: false,
    validator: validateEmail
  },
  name: {
    required: false,
    validator: (name) => {
      if (!name) return { valid: true };
      const sanitized = sanitizeString(name, { maxLength: 100 });
      if (sanitized.length < 1) {
        return { valid: false, error: 'Name is too short' };
      }
      return { valid: true, sanitized };
    }
  }
};

/**
 * Password Change Schema
 */
export const passwordChangeSchema = {
  currentPassword: {
    required: true,
    validator: (password) => {
      if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Current password is required' };
      }
      return { valid: true };
    }
  },
  newPassword: {
    required: true,
    validator: validatePassword
  }
};

/**
 * Team Invite Schema
 */
export const teamInviteSchema = {
  email: {
    required: true,
    validator: validateEmail
  },
  role: {
    required: false,
    validator: (role) => {
      const validRoles = ['admin', 'member', 'viewer'];
      if (!role) return { valid: true, sanitized: 'member' };
      const sanitized = role.trim().toLowerCase();
      if (!validRoles.includes(sanitized)) {
        return { valid: false, error: 'Invalid role' };
      }
      return { valid: true, sanitized };
    },
    default: 'member'
  }
};

/**
 * Pagination Schema
 */
export const paginationSchema = {
  page: {
    required: false,
    validator: (page) => validatePagination(page, 20),
    default: 1
  },
  limit: {
    required: false,
    validator: (limit) => {
      const result = validatePagination(1, limit);
      if (!result.valid) return result;
      return { valid: true, sanitized: result.limit };
    },
    default: 20
  }
};

/**
 * Goal Create Schema
 */
export const goalCreateSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  name: {
    required: true,
    validator: (name) => {
      if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Goal name is required' };
      }
      const sanitized = sanitizeString(name, { maxLength: 100 });
      if (sanitized.length < 1) {
        return { valid: false, error: 'Goal name is too short' };
      }
      return { valid: true, sanitized };
    }
  },
  type: {
    required: true,
    validator: (type) => {
      const validTypes = ['pageview', 'event', 'custom'];
      if (!type) return { valid: false, error: 'Goal type is required' };
      const sanitized = type.trim().toLowerCase();
      if (!validTypes.includes(sanitized)) {
        return { valid: false, error: 'Invalid goal type' };
      }
      return { valid: true, sanitized };
    }
  },
  value: {
    required: false,
    validator: (value) => {
      if (!value) return { valid: true };
      const sanitized = sanitizeString(value, { maxLength: 500 });
      return { valid: true, sanitized };
    }
  }
};

/**
 * Funnel Create Schema
 */
export const funnelCreateSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  name: {
    required: true,
    validator: (name) => {
      if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Funnel name is required' };
      }
      const sanitized = sanitizeString(name, { maxLength: 100 });
      if (sanitized.length < 1) {
        return { valid: false, error: 'Funnel name is too short' };
      }
      return { valid: true, sanitized };
    }
  },
  steps: {
    required: true,
    validator: (steps) => {
      if (!Array.isArray(steps)) {
        return { valid: false, error: 'Steps must be an array' };
      }
      if (steps.length < 2) {
        return { valid: false, error: 'Funnel must have at least 2 steps' };
      }
      if (steps.length > 10) {
        return { valid: false, error: 'Funnel cannot have more than 10 steps' };
      }
      // Sanitize each step
      const sanitized = steps.map(step => sanitizeString(step, { maxLength: 200 }));
      return { valid: true, sanitized };
    }
  }
};

/**
 * Export Data Schema
 */
export const exportDataSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  format: {
    required: false,
    validator: (format) => {
      const validFormats = ['csv', 'json'];
      if (!format) return { valid: true, sanitized: 'csv' };
      const sanitized = format.trim().toLowerCase();
      if (!validFormats.includes(sanitized)) {
        return { valid: false, error: 'Invalid export format' };
      }
      return { valid: true, sanitized };
    },
    default: 'csv'
  },
  startDate: {
    required: false,
    validator: (date) => {
      if (!date) return { valid: true };
      try {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return { valid: false, error: 'Invalid start date' };
        }
        return { valid: true, sanitized: parsed.toISOString() };
      } catch (err) {
        return { valid: false, error: 'Invalid start date format' };
      }
    }
  },
  endDate: {
    required: false,
    validator: (date) => {
      if (!date) return { valid: true };
      try {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return { valid: false, error: 'Invalid end date' };
        }
        return { valid: true, sanitized: parsed.toISOString() };
      } catch (err) {
        return { valid: false, error: 'Invalid end date format' };
      }
    }
  }
};

/**
 * Track Event Schema (for analytics tracking)
 */
export const trackEventSchema = {
  siteId: {
    required: true,
    validator: validateSiteId
  },
  event: {
    required: false,
    validator: (event) => {
      if (!event) return { valid: true, sanitized: 'pageview' };
      const sanitized = sanitizeString(event, { maxLength: 100 });
      if (sanitized.length < 1) {
        return { valid: false, error: 'Event name is too short' };
      }
      return { valid: true, sanitized };
    },
    default: 'pageview'
  },
  url: {
    required: false,
    validator: (url) => {
      if (!url) return { valid: true };
      // For tracking, we accept relative URLs too
      const sanitized = sanitizeString(url, { maxLength: 2000 });
      return { valid: true, sanitized };
    }
  },
  referrer: {
    required: false,
    validator: (referrer) => {
      if (!referrer) return { valid: true };
      const sanitized = sanitizeString(referrer, { maxLength: 2000 });
      return { valid: true, sanitized };
    }
  }
};

/**
 * Helper to validate date range (used in post-validation checks)
 */
export function validateDateRangeInData(data) {
  if (data.startDate && data.endDate) {
    const result = validateDateRange(data.startDate, data.endDate);
    if (!result.valid) {
      throw new ValidationError(result.error);
    }
    return {
      startDate: result.startDate,
      endDate: result.endDate
    };
  }
  return {};
}
