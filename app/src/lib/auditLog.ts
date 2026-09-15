/**
 * Audit Logging Utility
 * SOC2 CC4.1 - Monitoring activities
 * SOC2 CC7.2 - System monitoring
 * GDPR Article 30 - Records of processing activities
 */

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  PASSWORD_CHANGE = 'auth.password.change',
  PASSWORD_RESET_REQUEST = 'auth.password.reset.request',
  PASSWORD_RESET_COMPLETE = 'auth.password.reset.complete',
  MFA_ENABLED = 'auth.mfa.enabled',
  MFA_DISABLED = 'auth.mfa.disabled',

  // Authorization events
  ACCESS_DENIED = 'authz.access.denied',
  PERMISSION_GRANTED = 'authz.permission.granted',
  PERMISSION_REVOKED = 'authz.permission.revoked',

  // Data events
  DATA_CREATED = 'data.create',
  DATA_READ = 'data.read',
  DATA_UPDATED = 'data.update',
  DATA_DELETED = 'data.delete',
  DATA_EXPORTED = 'data.export',

  // Privacy events (GDPR)
  CONSENT_GRANTED = 'privacy.consent.granted',
  CONSENT_REVOKED = 'privacy.consent.revoked',
  DATA_SUBJECT_REQUEST = 'privacy.dsr.request',
  DATA_SUBJECT_FULFILLED = 'privacy.dsr.fulfilled',
  DATA_ANONYMIZED = 'privacy.data.anonymized',

  // Security events
  RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  CSRF_VIOLATION = 'security.csrf.violation',
  SUSPICIOUS_ACTIVITY = 'security.suspicious.activity',
  API_KEY_CREATED = 'security.api_key.created',
  API_KEY_REVOKED = 'security.api_key.revoked',

  // System events
  CONFIGURATION_CHANGE = 'system.config.change',
  ERROR_OCCURRED = 'system.error',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface AuditLogEntry {
  /** Unique identifier for this log entry */
  id?: string
  /** Timestamp of the event */
  timestamp: Date
  /** Type of action performed */
  action: AuditAction
  /** Severity level */
  severity: AuditSeverity
  /** User who performed the action (if applicable) */
  userId?: string
  /** User's email (for display) */
  userEmail?: string
  /** IP address of the request */
  ipAddress?: string
  /** User agent string */
  userAgent?: string
  /** Resource that was affected */
  resource?: string
  /** Resource identifier */
  resourceId?: string
  /** Additional context/details */
  details?: Record<string, unknown>
  /** Request ID for correlation */
  requestId?: string
  /** Session ID */
  sessionId?: string
  /** Outcome of the action */
  outcome: 'success' | 'failure'
  /** Error message if failed */
  errorMessage?: string
}

interface AuditLoggerConfig {
  /** Console logging enabled */
  consoleEnabled: boolean
  /** External service URL for log forwarding */
  externalServiceUrl?: string
  /** API key for external service */
  externalApiKey?: string
  /** Minimum severity to log */
  minSeverity: AuditSeverity
}

const severityOrder: Record<AuditSeverity, number> = {
  [AuditSeverity.INFO]: 0,
  [AuditSeverity.WARNING]: 1,
  [AuditSeverity.ERROR]: 2,
  [AuditSeverity.CRITICAL]: 3,
}

class AuditLogger {
  private config: AuditLoggerConfig
  private buffer: AuditLogEntry[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = {
      consoleEnabled: process.env.NODE_ENV !== 'production',
      minSeverity: AuditSeverity.INFO,
      ...config,
    }

    // Flush buffer every 5 seconds in production
    if (typeof setInterval !== 'undefined' && this.config.externalServiceUrl) {
      this.flushInterval = setInterval(() => this.flush(), 5000)
    }
  }

  /**
   * Log an audit event
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }

    // Check minimum severity
    if (severityOrder[entry.severity] < severityOrder[this.config.minSeverity]) {
      return
    }

    // Console logging
    if (this.config.consoleEnabled) {
      this.logToConsole(fullEntry)
    }

    // Buffer for external service
    if (this.config.externalServiceUrl) {
      this.buffer.push(fullEntry)
    }

    // Immediately flush critical events
    if (entry.severity === AuditSeverity.CRITICAL) {
      await this.flush()
    }
  }

  /**
   * Helper for successful actions
   */
  async success(
    action: AuditAction,
    details?: Record<string, unknown>,
    context?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: AuditSeverity.INFO,
      outcome: 'success',
      details,
      ...context,
    })
  }

  /**
   * Helper for failed actions
   */
  async failure(
    action: AuditAction,
    errorMessage: string,
    details?: Record<string, unknown>,
    context?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: AuditSeverity.WARNING,
      outcome: 'failure',
      errorMessage,
      details,
      ...context,
    })
  }

  /**
   * Helper for security events
   */
  async security(
    action: AuditAction,
    details?: Record<string, unknown>,
    context?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: AuditSeverity.ERROR,
      outcome: 'failure',
      details,
      ...context,
    })
  }

  private logToConsole(entry: AuditLogEntry): void {
    const prefix = `[AUDIT][${entry.severity.toUpperCase()}]`
    const message = `${prefix} ${entry.action} - ${entry.outcome}`

    switch (entry.severity) {
      case AuditSeverity.CRITICAL:
      case AuditSeverity.ERROR:
        console.error(message, entry)
        break
      case AuditSeverity.WARNING:
        console.warn(message, entry)
        break
      default:
        console.log(message, entry)
    }
  }

  /**
   * Flush buffered logs to external service
   */
  async flush(): Promise<void> {
    if (!this.config.externalServiceUrl || this.buffer.length === 0) {
      return
    }

    const entries = [...this.buffer]
    this.buffer = []

    try {
      await fetch(this.config.externalServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.externalApiKey && {
            Authorization: `Bearer ${this.config.externalApiKey}`,
          }),
        },
        body: JSON.stringify({ entries }),
      })
    } catch (error) {
      // Re-add entries to buffer on failure
      this.buffer.unshift(...entries)
      console.error('[AUDIT] Failed to flush logs to external service:', error)
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }
}

// Singleton instance
export const auditLogger = new AuditLogger({
  consoleEnabled: true,
  externalServiceUrl: process.env.AUDIT_LOG_SERVICE_URL,
  externalApiKey: process.env.AUDIT_LOG_API_KEY,
})

export { AuditLogger }
