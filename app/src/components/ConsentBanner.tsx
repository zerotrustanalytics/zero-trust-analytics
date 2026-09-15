'use client'

import { useState, useEffect } from 'react'
import { Button, Card } from '@/components/ui'
import {
  ConsentCategory,
  consentDescriptions,
  getDefaultConsents,
  parseConsentCookie,
  serializeConsentCookie,
  needsConsentRefresh,
  recordConsent,
  CONSENT_COOKIE_NAME,
  CURRENT_POLICY_VERSION,
  type ConsentPreferences,
} from '@/lib/consent'

interface ConsentBannerProps {
  onConsentChange?: (consents: Record<ConsentCategory, boolean>) => void
}

export function ConsentBanner({ onConsentChange }: ConsentBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [consents, setConsents] = useState<Record<ConsentCategory, boolean>>(getDefaultConsents())

  useEffect(() => {
    // Check if consent has been given
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`))
      ?.split('=')[1]

    const preferences = parseConsentCookie(cookieValue ? decodeURIComponent(cookieValue) : undefined)

    if (!preferences || needsConsentRefresh(preferences)) {
      setIsVisible(true)
    } else {
      setConsents(preferences.consents)
      onConsentChange?.(preferences.consents)
    }
  }, [onConsentChange])

  const saveConsent = async (selectedConsents: Record<ConsentCategory, boolean>) => {
    const preferences: ConsentPreferences = {
      consents: selectedConsents,
      lastUpdated: new Date(),
      policyVersion: CURRENT_POLICY_VERSION,
    }

    // Set cookie
    const cookieValue = serializeConsentCookie(preferences)
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict`

    // Record for audit trail
    await recordConsent({
      sessionId: crypto.randomUUID(),
      consents: selectedConsents,
      method: 'banner',
      userAgent: navigator.userAgent,
    })

    setConsents(selectedConsents)
    setIsVisible(false)
    onConsentChange?.(selectedConsents)
  }

  const handleAcceptAll = () => {
    const allConsents: Record<ConsentCategory, boolean> = {
      [ConsentCategory.NECESSARY]: true,
      [ConsentCategory.ANALYTICS]: true,
      [ConsentCategory.PREFERENCES]: true,
      [ConsentCategory.MARKETING]: true,
    }
    saveConsent(allConsents)
  }

  const handleAcceptNecessary = () => {
    saveConsent(getDefaultConsents())
  }

  const handleSavePreferences = () => {
    saveConsent(consents)
  }

  const toggleConsent = (category: ConsentCategory) => {
    if (category === ConsentCategory.NECESSARY) return // Can't toggle necessary
    setConsents((prev) => ({
      ...prev,
      [category]: !prev[category],
    }))
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t border-border shadow-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-description"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4">
          <div>
            <h2 id="consent-banner-title" className="text-lg font-semibold text-foreground">
              We value your privacy
            </h2>
            <p id="consent-banner-description" className="text-sm text-muted-foreground mt-1">
              We use cookies to enhance your experience. By clicking "Accept All", you consent to our use of cookies.
              You can customize your preferences or only accept necessary cookies.
            </p>
          </div>

          {showDetails && (
            <Card variant="bordered" padding="sm" className="mt-2">
              <div className="space-y-3">
                {Object.values(ConsentCategory).map((category) => {
                  const description = consentDescriptions[category]
                  const isNecessary = category === ConsentCategory.NECESSARY

                  return (
                    <div key={category} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id={`consent-${category}`}
                        checked={consents[category]}
                        onChange={() => toggleConsent(category)}
                        disabled={isNecessary}
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary disabled:opacity-50"
                        aria-describedby={`consent-${category}-desc`}
                      />
                      <div className="flex-1">
                        <label
                          htmlFor={`consent-${category}`}
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {description.title}
                          {isNecessary && (
                            <span className="ml-2 text-xs text-muted-foreground">(Required)</span>
                          )}
                        </label>
                        <p id={`consent-${category}-desc`} className="text-xs text-muted-foreground">
                          {description.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                aria-expanded={showDetails}
              >
                {showDetails ? 'Hide Details' : 'Customize'}
              </Button>
              <a
                href="/privacy"
                className="text-sm text-primary hover:underline inline-flex items-center"
              >
                Privacy Policy
              </a>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleAcceptNecessary}>
                Necessary Only
              </Button>
              {showDetails ? (
                <Button size="sm" onClick={handleSavePreferences}>
                  Save Preferences
                </Button>
              ) : (
                <Button size="sm" onClick={handleAcceptAll}>
                  Accept All
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
