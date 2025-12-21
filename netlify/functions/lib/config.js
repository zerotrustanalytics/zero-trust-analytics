/**
 * Environment Configuration and Validation
 *
 * This module validates all required environment variables on startup
 * and provides a centralized configuration object for the application.
 */

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Required environment variables that must be present
 */
const REQUIRED_VARS = {
  JWT_SECRET: {
    description: 'Secret key for JWT token signing',
    validator: (value) => value && value.length >= 32,
    errorMessage: 'JWT_SECRET must be at least 32 characters long'
  },
  TURSO_DATABASE_URL: {
    description: 'Turso database connection URL',
    validator: (value) => value && (value.startsWith('libsql://') || value.startsWith('file:') || value.startsWith('http')),
    errorMessage: 'TURSO_DATABASE_URL must be a valid libsql://, file:, or http(s):// URL'
  },
  TURSO_AUTH_TOKEN: {
    description: 'Turso database authentication token',
    validator: (value) => value !== undefined && value !== null,
    errorMessage: 'TURSO_AUTH_TOKEN must be provided (can be empty string for local file databases)'
  }
};

/**
 * Optional environment variables with default values
 */
const OPTIONAL_VARS = {
  JWT_EXPIRY: {
    description: 'JWT token expiry time',
    default: '7d',
    validator: (value) => /^\d+[hdwmy]$/.test(value),
    errorMessage: 'JWT_EXPIRY must be in format like "7d", "24h", "30m"'
  },
  ALLOWED_ORIGINS: {
    description: 'Comma-separated list of allowed CORS origins',
    default: 'http://localhost:3000,http://localhost:8888',
    validator: (value) => typeof value === 'string',
    errorMessage: 'ALLOWED_ORIGINS must be a comma-separated string'
  },
  NODE_ENV: {
    description: 'Node environment',
    default: 'development',
    validator: (value) => ['development', 'production', 'test'].includes(value),
    errorMessage: 'NODE_ENV must be one of: development, production, test'
  },
  RATE_LIMIT_MAX: {
    description: 'Maximum number of requests per window (default)',
    default: '100',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_MAX must be a positive integer'
  },
  RATE_LIMIT_WINDOW: {
    description: 'Rate limit window in milliseconds (default)',
    default: '900000', // 15 minutes
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_WINDOW must be a positive integer'
  },
  RATE_LIMIT_LOGIN_MAX: {
    description: 'Maximum login attempts per window',
    default: '10',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_LOGIN_MAX must be a positive integer'
  },
  RATE_LIMIT_LOGIN_WINDOW: {
    description: 'Login rate limit window in milliseconds',
    default: '60000', // 1 minute
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_LOGIN_WINDOW must be a positive integer'
  },
  RATE_LIMIT_REGISTER_MAX: {
    description: 'Maximum registration attempts per window',
    default: '5',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_REGISTER_MAX must be a positive integer'
  },
  RATE_LIMIT_REGISTER_WINDOW: {
    description: 'Registration rate limit window in milliseconds',
    default: '60000', // 1 minute
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_REGISTER_WINDOW must be a positive integer'
  },
  RATE_LIMIT_TRACK_MAX: {
    description: 'Maximum tracking requests per window',
    default: '1000',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_TRACK_MAX must be a positive integer'
  },
  RATE_LIMIT_TRACK_WINDOW: {
    description: 'Tracking rate limit window in milliseconds',
    default: '60000', // 1 minute
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_TRACK_WINDOW must be a positive integer'
  },
  RATE_LIMIT_API_MAX: {
    description: 'Maximum API requests per window',
    default: '100',
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_API_MAX must be a positive integer'
  },
  RATE_LIMIT_API_WINDOW: {
    description: 'API rate limit window in milliseconds',
    default: '60000', // 1 minute
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'RATE_LIMIT_API_WINDOW must be a positive integer'
  },
  SESSION_MAX_AGE: {
    description: 'Maximum session age in seconds',
    default: '604800', // 7 days
    validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    errorMessage: 'SESSION_MAX_AGE must be a positive integer'
  },
  MFA_ISSUER: {
    description: 'MFA/2FA issuer name',
    default: 'Zero Trust Analytics',
    validator: (value) => typeof value === 'string' && value.length > 0,
    errorMessage: 'MFA_ISSUER must be a non-empty string'
  }
};

/**
 * Validates a single environment variable
 * @param {string} name - Variable name
 * @param {object} config - Variable configuration
 * @param {boolean} isRequired - Whether the variable is required
 * @returns {string} The validated value
 * @throws {ConfigError} If validation fails
 */
function validateVar(name, config, isRequired = true) {
  const value = process.env[name];

  // Check if required variable is missing
  if (isRequired && (value === undefined || value === null)) {
    throw new ConfigError(
      `Missing required environment variable: ${name}\n` +
      `Description: ${config.description}\n` +
      `Please set this variable in your .env file or environment.`
    );
  }

  // Use default if optional variable is missing
  const finalValue = value !== undefined ? value : config.default;

  // Validate the value
  if (config.validator && !config.validator(finalValue)) {
    throw new ConfigError(
      `Invalid value for environment variable: ${name}\n` +
      `${config.errorMessage}\n` +
      `Current value: ${finalValue}`
    );
  }

  return finalValue;
}

/**
 * Validates all environment variables
 * @returns {object} Configuration object with all validated values
 * @throws {ConfigError} If any validation fails
 */
function validateConfig() {
  const errors = [];
  const config = {};

  // Validate required variables
  for (const [name, varConfig] of Object.entries(REQUIRED_VARS)) {
    try {
      config[name] = validateVar(name, varConfig, true);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Validate optional variables
  for (const [name, varConfig] of Object.entries(OPTIONAL_VARS)) {
    try {
      config[name] = validateVar(name, varConfig, false);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // If there are errors, throw a combined error
  if (errors.length > 0) {
    throw new ConfigError(
      'Environment configuration validation failed:\n\n' +
      errors.join('\n\n') +
      '\n\nPlease fix these issues before starting the application.'
    );
  }

  return config;
}

/**
 * Gets the parsed ALLOWED_ORIGINS as an array
 * @param {string} originsString - Comma-separated origins
 * @returns {string[]} Array of allowed origins
 */
function getAllowedOrigins(originsString) {
  return originsString
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

// Validate configuration on module load
let config;
try {
  config = validateConfig();
} catch (error) {
  // In development, log the error but don't crash
  if (process.env.NODE_ENV === 'test') {
    // In test mode, use mock values
    config = {
      JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
      TURSO_DATABASE_URL: 'file:test.db',
      TURSO_AUTH_TOKEN: 'test-token',
      JWT_EXPIRY: '7d',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      NODE_ENV: 'test',
      RATE_LIMIT_MAX: '100',
      RATE_LIMIT_WINDOW: '900000',
      RATE_LIMIT_LOGIN_MAX: '10',
      RATE_LIMIT_LOGIN_WINDOW: '60000',
      RATE_LIMIT_REGISTER_MAX: '5',
      RATE_LIMIT_REGISTER_WINDOW: '60000',
      RATE_LIMIT_TRACK_MAX: '1000',
      RATE_LIMIT_TRACK_WINDOW: '60000',
      RATE_LIMIT_API_MAX: '100',
      RATE_LIMIT_API_WINDOW: '60000',
      SESSION_MAX_AGE: '604800',
      MFA_ISSUER: 'Zero Trust Analytics'
    };
  } else {
    console.error('\n' + '='.repeat(80));
    console.error('CONFIGURATION ERROR');
    console.error('='.repeat(80));
    console.error(error.message);
    console.error('='.repeat(80) + '\n');
    throw error;
  }
}

/**
 * Centralized configuration object
 * All environment variables are validated and accessible here
 */
export const Config = {
  // Authentication
  jwt: {
    secret: config.JWT_SECRET,
    expiry: config.JWT_EXPIRY
  },

  // Database
  database: {
    url: config.TURSO_DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN
  },

  // CORS
  cors: {
    allowedOrigins: getAllowedOrigins(config.ALLOWED_ORIGINS),
    allowedOriginsString: config.ALLOWED_ORIGINS
  },

  // Environment
  env: config.NODE_ENV,
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',

  // Rate Limiting
  rateLimit: {
    max: parseInt(config.RATE_LIMIT_MAX),
    window: parseInt(config.RATE_LIMIT_WINDOW),
    endpoints: {
      login: {
        max: parseInt(config.RATE_LIMIT_LOGIN_MAX),
        window: parseInt(config.RATE_LIMIT_LOGIN_WINDOW)
      },
      register: {
        max: parseInt(config.RATE_LIMIT_REGISTER_MAX),
        window: parseInt(config.RATE_LIMIT_REGISTER_WINDOW)
      },
      track: {
        max: parseInt(config.RATE_LIMIT_TRACK_MAX),
        window: parseInt(config.RATE_LIMIT_TRACK_WINDOW)
      },
      api: {
        max: parseInt(config.RATE_LIMIT_API_MAX),
        window: parseInt(config.RATE_LIMIT_API_WINDOW)
      }
    }
  },

  // Session
  session: {
    maxAge: parseInt(config.SESSION_MAX_AGE)
  },

  // MFA
  mfa: {
    issuer: config.MFA_ISSUER
  }
};

/**
 * Utility function to check if all required environment variables are set
 * Useful for health checks
 * @returns {object} Status object with isValid flag and any missing variables
 */
export function checkConfig() {
  const missing = [];

  for (const name of Object.keys(REQUIRED_VARS)) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get configuration summary for debugging (with sensitive values redacted)
 * @returns {object} Redacted configuration object
 */
export function getConfigSummary() {
  return {
    jwt: {
      expiry: Config.jwt.expiry,
      secretConfigured: !!Config.jwt.secret
    },
    database: {
      url: Config.database.url.substring(0, 20) + '...',
      authTokenConfigured: !!Config.database.authToken
    },
    cors: {
      allowedOrigins: Config.cors.allowedOrigins
    },
    env: Config.env,
    rateLimit: Config.rateLimit,
    session: Config.session,
    mfa: Config.mfa
  };
}

export default Config;
