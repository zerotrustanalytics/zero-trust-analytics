/**
 * Form validation utilities
 */

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

export interface ValidationRule {
  required?: boolean | string
  minLength?: number | { value: number; message: string }
  maxLength?: number | { value: number; message: string }
  pattern?: RegExp | { value: RegExp; message: string }
  custom?: (value: string) => string | null
}

export type ValidationSchema = Record<string, ValidationRule>

/**
 * Validates a single field value against a validation rule
 */
export function validateField(
  value: string | undefined | null,
  rule: ValidationRule,
  fieldName: string
): string | null {
  const val = value?.trim() || ''

  // Required check
  if (rule.required) {
    if (!val) {
      return typeof rule.required === 'string'
        ? rule.required
        : `${fieldName} is required`
    }
  }

  // Skip other validations if empty and not required
  if (!val) return null

  // Min length check
  if (rule.minLength) {
    const min = typeof rule.minLength === 'number' ? rule.minLength : rule.minLength.value
    const message =
      typeof rule.minLength === 'object'
        ? rule.minLength.message
        : `${fieldName} must be at least ${min} characters`
    if (val.length < min) return message
  }

  // Max length check
  if (rule.maxLength) {
    const max = typeof rule.maxLength === 'number' ? rule.maxLength : rule.maxLength.value
    const message =
      typeof rule.maxLength === 'object'
        ? rule.maxLength.message
        : `${fieldName} must be at most ${max} characters`
    if (val.length > max) return message
  }

  // Pattern check
  if (rule.pattern) {
    const pattern = rule.pattern instanceof RegExp ? rule.pattern : rule.pattern.value
    const message =
      rule.pattern instanceof RegExp
        ? `${fieldName} format is invalid`
        : rule.pattern.message
    if (!pattern.test(val)) return message
  }

  // Custom validation
  if (rule.custom) {
    const error = rule.custom(val)
    if (error) return error
  }

  return null
}

/**
 * Validates all fields in a form data object against a schema
 */
export function validate(
  data: Record<string, string | undefined | null>,
  schema: ValidationSchema
): ValidationResult {
  const errors: Record<string, string> = {}

  for (const [field, rule] of Object.entries(schema)) {
    const error = validateField(data[field], rule, formatFieldName(field))
    if (error) {
      errors[field] = error
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Formats a camelCase field name to a human-readable format
 */
function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

// Common validation patterns
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  domain: /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
  url: /^https?:\/\/.+/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
}

// Common validation schemas
export const schemas = {
  login: {
    email: {
      required: true,
      pattern: { value: patterns.email, message: 'Invalid email address' },
    },
    password: {
      required: true,
    },
  } as ValidationSchema,

  register: {
    email: {
      required: true,
      pattern: { value: patterns.email, message: 'Invalid email address' },
    },
    password: {
      required: true,
      minLength: { value: 8, message: 'Password must be at least 8 characters' },
      pattern: {
        value: patterns.password,
        message: 'Password must contain uppercase, lowercase, and number',
      },
    },
    confirmPassword: {
      required: true,
    },
  } as ValidationSchema,

  forgotPassword: {
    email: {
      required: true,
      pattern: { value: patterns.email, message: 'Invalid email address' },
    },
  } as ValidationSchema,

  addSite: {
    domain: {
      required: true,
      pattern: { value: patterns.domain, message: 'Invalid domain format' },
    },
    name: {
      maxLength: { value: 100, message: 'Name must be at most 100 characters' },
    },
  } as ValidationSchema,
}

/**
 * Validates password confirmation matches
 */
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): string | null {
  if (password !== confirmPassword) {
    return 'Passwords do not match'
  }
  return null
}

/**
 * Validates password strength and returns specific issues
 */
export function validatePasswordStrength(password: string): string[] {
  const issues: string[] = []

  if (password.length < 8) {
    issues.push('At least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    issues.push('One uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    issues.push('One lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    issues.push('One number')
  }

  return issues
}

/**
 * Cleans a domain input by removing protocol and path
 */
export function cleanDomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .trim()
}
