// Zero Trust Analytics - Validation Utilities
// Common validation functions for forms and data

const ZTAValidate = (function() {

  /**
   * Email validation
   * @param {string} email
   * @returns {boolean}
   */
  function email(email) {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  /**
   * URL validation
   * @param {string} url
   * @returns {boolean}
   */
  function url(url) {
    if (!url) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Domain validation (without protocol)
   * @param {string} domain
   * @returns {boolean}
   */
  function domain(domain) {
    if (!domain) return false;
    const re = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return re.test(domain);
  }

  /**
   * Password strength validation
   * @param {string} password
   * @param {object} options
   * @returns {object} { valid: boolean, errors: string[], strength: 'weak'|'medium'|'strong' }
   */
  function password(password, options = {}) {
    const {
      minLength = 8,
      requireUppercase = true,
      requireLowercase = true,
      requireNumber = true,
      requireSpecial = false
    } = options;

    const errors = [];
    let score = 0;

    if (!password) {
      return { valid: false, errors: ['Password is required'], strength: 'weak' };
    }

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters`);
    } else {
      score++;
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else if (/[A-Z]/.test(password)) {
      score++;
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else if (/[a-z]/.test(password)) {
      score++;
    }

    if (requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    } else if (/[0-9]/.test(password)) {
      score++;
    }

    if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score++;
    }

    // Bonus for length
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    let strength = 'weak';
    if (score >= 4) strength = 'medium';
    if (score >= 6) strength = 'strong';

    return {
      valid: errors.length === 0,
      errors,
      strength,
      score
    };
  }

  /**
   * Required field validation
   * @param {*} value
   * @returns {boolean}
   */
  function required(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  /**
   * Minimum length validation
   * @param {string} value
   * @param {number} min
   * @returns {boolean}
   */
  function minLength(value, min) {
    if (!value) return false;
    return String(value).length >= min;
  }

  /**
   * Maximum length validation
   * @param {string} value
   * @param {number} max
   * @returns {boolean}
   */
  function maxLength(value, max) {
    if (!value) return true;
    return String(value).length <= max;
  }

  /**
   * Numeric validation
   * @param {*} value
   * @returns {boolean}
   */
  function numeric(value) {
    if (value === '' || value === null || value === undefined) return false;
    return !isNaN(parseFloat(value)) && isFinite(value);
  }

  /**
   * Integer validation
   * @param {*} value
   * @returns {boolean}
   */
  function integer(value) {
    return numeric(value) && Number.isInteger(Number(value));
  }

  /**
   * Range validation
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {boolean}
   */
  function range(value, min, max) {
    const num = Number(value);
    return numeric(value) && num >= min && num <= max;
  }

  /**
   * Pattern (regex) validation
   * @param {string} value
   * @param {RegExp|string} pattern
   * @returns {boolean}
   */
  function pattern(value, pattern) {
    if (!value) return false;
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return re.test(value);
  }

  /**
   * Match validation (confirm fields)
   * @param {*} value1
   * @param {*} value2
   * @returns {boolean}
   */
  function matches(value1, value2) {
    return value1 === value2;
  }

  /**
   * Date validation
   * @param {string} value
   * @returns {boolean}
   */
  function date(value) {
    if (!value) return false;
    const d = new Date(value);
    return d instanceof Date && !isNaN(d);
  }

  /**
   * Future date validation
   * @param {string} value
   * @returns {boolean}
   */
  function futureDate(value) {
    if (!date(value)) return false;
    return new Date(value) > new Date();
  }

  /**
   * Past date validation
   * @param {string} value
   * @returns {boolean}
   */
  function pastDate(value) {
    if (!date(value)) return false;
    return new Date(value) < new Date();
  }

  /**
   * Alphanumeric validation
   * @param {string} value
   * @returns {boolean}
   */
  function alphanumeric(value) {
    if (!value) return false;
    return /^[a-zA-Z0-9]+$/.test(value);
  }

  /**
   * Slug validation (lowercase, hyphens, numbers)
   * @param {string} value
   * @returns {boolean}
   */
  function slug(value) {
    if (!value) return false;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  /**
   * Hex color validation
   * @param {string} value
   * @returns {boolean}
   */
  function hexColor(value) {
    if (!value) return false;
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
  }

  /**
   * Phone number validation (basic)
   * @param {string} value
   * @returns {boolean}
   */
  function phone(value) {
    if (!value) return false;
    // Remove common formatting characters
    const cleaned = value.replace(/[\s\-\(\)\.]/g, '');
    // Check for valid phone number pattern
    return /^(\+?1)?[2-9]\d{9}$/.test(cleaned) || /^\+?[1-9]\d{6,14}$/.test(cleaned);
  }

  /**
   * Credit card validation (Luhn algorithm)
   * @param {string} value
   * @returns {boolean}
   */
  function creditCard(value) {
    if (!value) return false;
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Create a validator chain
   * @param {string} fieldName - Display name for error messages
   * @returns {object} - Chainable validator
   */
  function field(fieldName) {
    const rules = [];
    const chain = {
      required: (msg) => {
        rules.push({ fn: required, msg: msg || `${fieldName} is required` });
        return chain;
      },
      email: (msg) => {
        rules.push({ fn: email, msg: msg || `${fieldName} must be a valid email` });
        return chain;
      },
      url: (msg) => {
        rules.push({ fn: url, msg: msg || `${fieldName} must be a valid URL` });
        return chain;
      },
      minLength: (min, msg) => {
        rules.push({ fn: (v) => minLength(v, min), msg: msg || `${fieldName} must be at least ${min} characters` });
        return chain;
      },
      maxLength: (max, msg) => {
        rules.push({ fn: (v) => maxLength(v, max), msg: msg || `${fieldName} cannot exceed ${max} characters` });
        return chain;
      },
      numeric: (msg) => {
        rules.push({ fn: numeric, msg: msg || `${fieldName} must be a number` });
        return chain;
      },
      pattern: (re, msg) => {
        rules.push({ fn: (v) => pattern(v, re), msg: msg || `${fieldName} format is invalid` });
        return chain;
      },
      custom: (fn, msg) => {
        rules.push({ fn, msg: msg || `${fieldName} is invalid` });
        return chain;
      },
      validate: (value) => {
        for (const rule of rules) {
          if (!rule.fn(value)) {
            return rule.msg;
          }
        }
        return null;
      }
    };
    return chain;
  }

  /**
   * Validate an object against a schema
   * @param {object} data - Data to validate
   * @param {object} schema - Validation schema { fieldName: validatorChain }
   * @returns {object} - { valid: boolean, errors: { field: message } }
   */
  function schema(data, validationSchema) {
    const errors = {};

    Object.entries(validationSchema).forEach(([fieldKey, validator]) => {
      const error = validator.validate(data[fieldKey]);
      if (error) {
        errors[fieldKey] = error;
      }
    });

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  // Public API
  return {
    // Individual validators
    email,
    url,
    domain,
    password,
    required,
    minLength,
    maxLength,
    numeric,
    integer,
    range,
    pattern,
    matches,
    date,
    futureDate,
    pastDate,
    alphanumeric,
    slug,
    hexColor,
    phone,
    creditCard,
    // Builder methods
    field,
    schema
  };
})();

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.validate = ZTAValidate;
}
