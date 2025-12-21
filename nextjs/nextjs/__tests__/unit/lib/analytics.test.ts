import { describe, it, expect, vi, beforeEach } from 'vitest'

// Analytics utility functions to be tested
const calculateBounceRate = (bounces: number, sessions: number): number => {
  if (sessions === 0) return 0
  return Math.round((bounces / sessions) * 100 * 10) / 10
}

const calculateAvgSessionDuration = (totalDuration: number, sessions: number): number => {
  if (sessions === 0) return 0
  return Math.round(totalDuration / sessions)
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

const parseUserAgent = (ua: string): { browser: string; os: string; device: string } => {
  const result = { browser: 'Unknown', os: 'Unknown', device: 'Desktop' }

  // Browser detection
  if (ua.includes('Chrome')) result.browser = 'Chrome'
  else if (ua.includes('Firefox')) result.browser = 'Firefox'
  else if (ua.includes('Safari')) result.browser = 'Safari'
  else if (ua.includes('Edge')) result.browser = 'Edge'

  // OS detection
  if (ua.includes('Windows')) result.os = 'Windows'
  else if (ua.includes('Mac')) result.os = 'macOS'
  else if (ua.includes('Linux')) result.os = 'Linux'
  else if (ua.includes('Android')) result.os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) result.os = 'iOS'

  // Device detection
  if (ua.includes('Mobile') || ua.includes('Android')) result.device = 'Mobile'
  else if (ua.includes('Tablet') || ua.includes('iPad')) result.device = 'Tablet'

  return result
}

describe('Analytics Utilities', () => {
  describe('calculateBounceRate', () => {
    it('calculates correct bounce rate', () => {
      expect(calculateBounceRate(45, 100)).toBe(45)
      expect(calculateBounceRate(33, 100)).toBe(33)
    })

    it('handles decimal results', () => {
      expect(calculateBounceRate(1, 3)).toBe(33.3)
    })

    it('returns 0 for 0 sessions', () => {
      expect(calculateBounceRate(10, 0)).toBe(0)
    })

    it('handles 100% bounce rate', () => {
      expect(calculateBounceRate(100, 100)).toBe(100)
    })

    it('handles 0% bounce rate', () => {
      expect(calculateBounceRate(0, 100)).toBe(0)
    })
  })

  describe('calculateAvgSessionDuration', () => {
    it('calculates average correctly', () => {
      expect(calculateAvgSessionDuration(1000, 10)).toBe(100)
    })

    it('returns 0 for 0 sessions', () => {
      expect(calculateAvgSessionDuration(1000, 0)).toBe(0)
    })

    it('rounds to nearest integer', () => {
      expect(calculateAvgSessionDuration(100, 3)).toBe(33)
    })
  })

  describe('formatNumber', () => {
    it('formats millions', () => {
      expect(formatNumber(1500000)).toBe('1.5M')
      expect(formatNumber(1000000)).toBe('1.0M')
    })

    it('formats thousands', () => {
      expect(formatNumber(1500)).toBe('1.5K')
      expect(formatNumber(1000)).toBe('1.0K')
    })

    it('returns small numbers as-is', () => {
      expect(formatNumber(999)).toBe('999')
      expect(formatNumber(0)).toBe('0')
    })
  })

  describe('formatDuration', () => {
    it('formats seconds only', () => {
      expect(formatDuration(45)).toBe('45s')
    })

    it('formats minutes and seconds', () => {
      expect(formatDuration(125)).toBe('2m 5s')
    })

    it('formats hours, minutes', () => {
      expect(formatDuration(3725)).toBe('1h 2m')
    })
  })

  describe('parseUserAgent', () => {
    it('detects Chrome on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
      const result = parseUserAgent(ua)
      expect(result.browser).toBe('Chrome')
      expect(result.os).toBe('Windows')
      expect(result.device).toBe('Desktop')
    })

    it('detects Safari on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
      const result = parseUserAgent(ua)
      expect(result.browser).toBe('Safari')
      expect(result.os).toBe('macOS')
      expect(result.device).toBe('Desktop')
    })

    it('detects mobile devices', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0'
      const result = parseUserAgent(ua)
      expect(result.device).toBe('Mobile')
      expect(result.os).toBe('Android')
    })

    it('detects iOS devices', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      const result = parseUserAgent(ua)
      expect(result.os).toBe('iOS')
    })
  })
})
