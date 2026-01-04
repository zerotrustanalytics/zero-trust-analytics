/**
 * Consent Management Utility
 * GDPR Article 7 - Conditions for consent
 * SOC2 P1-P8 - Privacy criteria
 */

export enum ConsentCategory {
  /** Required for basic functionality */
  NECESSARY = 'necessary',
  /** Analytics and usage tracking */
  ANALYTICS = 'analytics',
  /** Personalization and preferences */
  PREFERENCES = 'preferences',
  /** Marketing and advertising */
  MARKETING = 'marketing',
}

export interface ConsentRecord {
  /** User or session identifier */
  userId?: string
  sessionId: string
  /** IP address (anonymized) */
  ipAddress?: string
  /** Consent preferences by category */
  consents: Record<ConsentCategory, boolean>
  /** Timestamp of consent */
  timestamp: Date
  /** Consent method (banner, settings, API) */
  method: 'banner' | 'settings' | 'api'
  /** User agent at time of consent */
  userAgent?: string
  /** Version of privacy policy */
  policyVersion: string
  /** Proof of consent for audit trail */
  proof?: string
}

export interface ConsentPreferences {
  consents: Record<ConsentCategory, boolean>
  lastUpdated: Date
  policyVersion: string
}

const CONSENT_COOKIE_NAME = 'consent-preferences'
const CURRENT_POLICY_VERSION = '1.0.0'

/**
 * Generate proof hash for consent audit trail
 */
async function generateConsentProof(record: Omit<ConsentRecord, 'proof'>): Promise<string> {
  const data = JSON.stringify({
    userId: record.userId,
    sessionId: record.sessionId,
    consents: record.consents,
    timestamp: record.timestamp.toISOString(),
    policyVersion: record.policyVersion,
  })

  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Get default consent preferences (only necessary = true)
 */
export function getDefaultConsents(): Record<ConsentCategory, boolean> {
  return {
    [ConsentCategory.NECESSARY]: true, // Always required
    [ConsentCategory.ANALYTICS]: false,
    [ConsentCategory.PREFERENCES]: false,
    [ConsentCategory.MARKETING]: false,
  }
}

/**
 * Parse consent from cookie value
 */
export function parseConsentCookie(cookieValue: string | undefined): ConsentPreferences | null {
  if (!cookieValue) return null

  try {
    const parsed = JSON.parse(cookieValue)
    return {
      consents: {
        [ConsentCategory.NECESSARY]: true, // Always true
        [ConsentCategory.ANALYTICS]: Boolean(parsed.consents?.analytics),
        [ConsentCategory.PREFERENCES]: Boolean(parsed.consents?.preferences),
        [ConsentCategory.MARKETING]: Boolean(parsed.consents?.marketing),
      },
      lastUpdated: new Date(parsed.lastUpdated),
      policyVersion: parsed.policyVersion || CURRENT_POLICY_VERSION,
    }
  } catch {
    return null
  }
}

/**
 * Serialize consent preferences for cookie
 */
export function serializeConsentCookie(preferences: ConsentPreferences): string {
  return JSON.stringify({
    consents: preferences.consents,
    lastUpdated: preferences.lastUpdated.toISOString(),
    policyVersion: preferences.policyVersion,
  })
}

/**
 * Check if specific consent is granted
 */
export function hasConsent(
  preferences: ConsentPreferences | null,
  category: ConsentCategory
): boolean {
  if (category === ConsentCategory.NECESSARY) return true
  if (!preferences) return false
  return preferences.consents[category] === true
}

/**
 * Record consent for audit trail
 */
export async function recordConsent(
  record: Omit<ConsentRecord, 'proof' | 'timestamp' | 'policyVersion'>
): Promise<ConsentRecord> {
  const fullRecord: Omit<ConsentRecord, 'proof'> = {
    ...record,
    timestamp: new Date(),
    policyVersion: CURRENT_POLICY_VERSION,
  }

  const proof = await generateConsentProof(fullRecord)

  const finalRecord: ConsentRecord = {
    ...fullRecord,
    proof,
  }

  // Log consent record for audit
  console.log('[CONSENT] Recorded consent:', {
    sessionId: finalRecord.sessionId,
    consents: finalRecord.consents,
    timestamp: finalRecord.timestamp.toISOString(),
    proof: finalRecord.proof,
  })

  return finalRecord
}

/**
 * Check if consent needs to be refreshed (policy version changed)
 */
export function needsConsentRefresh(preferences: ConsentPreferences | null): boolean {
  if (!preferences) return true
  return preferences.policyVersion !== CURRENT_POLICY_VERSION
}

/**
 * Get human-readable descriptions for consent categories
 */
export const consentDescriptions: Record<ConsentCategory, { title: string; description: string }> = {
  [ConsentCategory.NECESSARY]: {
    title: 'Necessary',
    description: 'Required for the website to function. These cannot be disabled.',
  },
  [ConsentCategory.ANALYTICS]: {
    title: 'Analytics',
    description: 'Help us understand how you use our service to improve it.',
  },
  [ConsentCategory.PREFERENCES]: {
    title: 'Preferences',
    description: 'Remember your settings and preferences for a better experience.',
  },
  [ConsentCategory.MARKETING]: {
    title: 'Marketing',
    description: 'Show you relevant content and offers based on your interests.',
  },
}

export { CONSENT_COOKIE_NAME, CURRENT_POLICY_VERSION }
