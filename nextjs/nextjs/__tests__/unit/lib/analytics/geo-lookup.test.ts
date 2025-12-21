import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Geographic Data Lookup Tests
 * Tests for looking up geographic information from IP addresses
 * Includes country, region, city, timezone, and coordinates
 */

interface GeoLocation {
  ip: string
  country?: string
  countryCode?: string
  region?: string
  regionCode?: string
  city?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  timezone?: string
  continent?: string
  continentCode?: string
}

interface GeoDatabase {
  version: string
  lastUpdated: Date
  totalRecords: number
}

interface IPRange {
  start: string
  end: string
  location: GeoLocation
}

interface GeoLookupOptions {
  cache?: boolean
  fallbackToDefault?: boolean
  includeCoordinates?: boolean
  includeTimezone?: boolean
}

// Mock geo database
const mockGeoData: Map<string, GeoLocation> = new Map([
  ['8.8.8.8', {
    ip: '8.8.8.8',
    country: 'United States',
    countryCode: 'US',
    region: 'California',
    regionCode: 'CA',
    city: 'Mountain View',
    postalCode: '94035',
    latitude: 37.386,
    longitude: -122.0838,
    timezone: 'America/Los_Angeles',
    continent: 'North America',
    continentCode: 'NA'
  }],
  ['1.1.1.1', {
    ip: '1.1.1.1',
    country: 'Australia',
    countryCode: 'AU',
    region: 'Queensland',
    regionCode: 'QLD',
    city: 'Brisbane',
    latitude: -27.4698,
    longitude: 153.0251,
    timezone: 'Australia/Brisbane',
    continent: 'Oceania',
    continentCode: 'OC'
  }],
  ['151.101.1.140', {
    ip: '151.101.1.140',
    country: 'United Kingdom',
    countryCode: 'GB',
    region: 'England',
    regionCode: 'ENG',
    city: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
    continent: 'Europe',
    continentCode: 'EU'
  }]
])

// TDD: Implementation will follow these tests
class GeoLookup {
  private cache: Map<string, GeoLocation>
  private database: Map<string, GeoLocation>
  private defaultLocation: GeoLocation
  private cacheEnabled: boolean

  constructor() {
    this.cache = new Map()
    this.database = mockGeoData
    this.cacheEnabled = true
    this.defaultLocation = {
      ip: '0.0.0.0',
      country: 'Unknown',
      countryCode: 'XX',
      continent: 'Unknown',
      continentCode: 'XX'
    }
  }

  /**
   * Lookup geographic information for an IP address
   */
  async lookup(ip: string, options: GeoLookupOptions = {}): Promise<GeoLocation> {
    // Check cache first
    if (options.cache !== false && this.cacheEnabled && this.cache.has(ip)) {
      return this.cache.get(ip)!
    }

    // Validate IP
    if (!this.isValidIP(ip)) {
      throw new Error('Invalid IP address format')
    }

    // Handle special IPs
    if (this.isPrivateIP(ip) || this.isLoopbackIP(ip)) {
      return {
        ip,
        country: 'Private',
        countryCode: 'XX',
        continent: 'Unknown',
        continentCode: 'XX'
      }
    }

    // Lookup in database
    let location = this.database.get(ip)

    if (!location && options.fallbackToDefault !== false) {
      location = { ...this.defaultLocation, ip }
    }

    if (!location) {
      throw new Error('IP address not found in database')
    }

    // Filter response based on options
    const result = this.filterLocationData(location, options)

    // Cache result
    if (this.cacheEnabled) {
      this.cache.set(ip, result)
    }

    return result
  }

  /**
   * Batch lookup multiple IP addresses
   */
  async batchLookup(ips: string[], options: GeoLookupOptions = {}): Promise<GeoLocation[]> {
    const results = await Promise.all(
      ips.map(ip => this.lookup(ip, options).catch(() => ({ ...this.defaultLocation, ip })))
    )
    return results
  }

  /**
   * Lookup by coordinates (reverse geocoding)
   */
  async lookupByCoordinates(lat: number, lon: number): Promise<GeoLocation | null> {
    const threshold = 0.1 // Degrees of latitude/longitude

    for (const [, location] of this.database) {
      if (location.latitude !== undefined && location.longitude !== undefined) {
        const latDiff = Math.abs(location.latitude - lat)
        const lonDiff = Math.abs(location.longitude - lon)

        if (latDiff < threshold && lonDiff < threshold) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Get all locations for a country
   */
  async getLocationsByCountry(countryCode: string): Promise<GeoLocation[]> {
    const locations: GeoLocation[] = []

    for (const [, location] of this.database) {
      if (location.countryCode === countryCode) {
        locations.push(location)
      }
    }

    return locations
  }

  /**
   * Get all locations for a region
   */
  async getLocationsByRegion(countryCode: string, regionCode: string): Promise<GeoLocation[]> {
    const locations: GeoLocation[] = []

    for (const [, location] of this.database) {
      if (location.countryCode === countryCode && location.regionCode === regionCode) {
        locations.push(location)
      }
    }

    return locations
  }

  /**
   * Calculate distance between two locations (in kilometers)
   */
  calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
    if (!loc1.latitude || !loc1.longitude || !loc2.latitude || !loc2.longitude) {
      throw new Error('Both locations must have coordinates')
    }

    const R = 6371 // Earth's radius in km
    const dLat = this.toRadians(loc2.latitude - loc1.latitude)
    const dLon = this.toRadians(loc2.longitude - loc1.longitude)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(loc1.latitude)) *
        Math.cos(this.toRadians(loc2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 100) / 100
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  /**
   * Check if IP is valid
   */
  isValidIP(ip: string): boolean {
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.').map(Number)
      return parts.every(part => part >= 0 && part <= 255)
    }

    // IPv6 (simplified check)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/
    return ipv6Regex.test(ip)
  }

  /**
   * Check if IP is private
   */
  isPrivateIP(ip: string): boolean {
    if (!ip.includes('.')) return false

    const parts = ip.split('.').map(Number)
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    )
  }

  /**
   * Check if IP is loopback
   */
  isLoopbackIP(ip: string): boolean {
    return ip.startsWith('127.') || ip === '::1'
  }

  /**
   * Filter location data based on options
   */
  private filterLocationData(location: GeoLocation, options: GeoLookupOptions): GeoLocation {
    const result: GeoLocation = {
      ip: location.ip,
      country: location.country,
      countryCode: location.countryCode,
      region: location.region,
      regionCode: location.regionCode,
      city: location.city,
      continent: location.continent,
      continentCode: location.continentCode
    }

    if (options.includeCoordinates !== false) {
      result.latitude = location.latitude
      result.longitude = location.longitude
    }

    if (options.includeTimezone !== false) {
      result.timezone = location.timezone
    }

    if (location.postalCode) {
      result.postalCode = location.postalCode
    }

    return result
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: 0,
      misses: 0
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get database info
   */
  getDatabaseInfo(): GeoDatabase {
    return {
      version: '1.0.0',
      lastUpdated: new Date(),
      totalRecords: this.database.size
    }
  }

  /**
   * Get supported countries
   */
  getSupportedCountries(): Array<{ code: string; name: string }> {
    const countries = new Map<string, string>()

    for (const [, location] of this.database) {
      if (location.countryCode && location.country) {
        countries.set(location.countryCode, location.country)
      }
    }

    return Array.from(countries.entries()).map(([code, name]) => ({ code, name }))
  }

  /**
   * Get timezone for IP
   */
  async getTimezone(ip: string): Promise<string | null> {
    try {
      const location = await this.lookup(ip, { includeTimezone: true })
      return location.timezone || null
    } catch {
      return null
    }
  }

  /**
   * Get country name from country code
   */
  getCountryName(countryCode: string): string | null {
    for (const [, location] of this.database) {
      if (location.countryCode === countryCode) {
        return location.country || null
      }
    }
    return null
  }

  /**
   * Check if IP is in country
   */
  async isIPInCountry(ip: string, countryCode: string): Promise<boolean> {
    try {
      const location = await this.lookup(ip)
      return location.countryCode === countryCode
    } catch {
      return false
    }
  }

  /**
   * Get continent for IP
   */
  async getContinent(ip: string): Promise<string | null> {
    try {
      const location = await this.lookup(ip)
      return location.continent || null
    } catch {
      return null
    }
  }

  /**
   * Normalize IP (remove port if present)
   */
  normalizeIP(ipWithPort: string): string {
    return ipWithPort.split(':')[0]
  }

  /**
   * Add location to database
   */
  addLocation(location: GeoLocation): void {
    this.database.set(location.ip, location)
  }

  /**
   * Remove location from database
   */
  removeLocation(ip: string): boolean {
    return this.database.delete(ip)
  }

  /**
   * Update location in database
   */
  updateLocation(ip: string, updates: Partial<GeoLocation>): boolean {
    const existing = this.database.get(ip)
    if (!existing) return false

    this.database.set(ip, { ...existing, ...updates })
    return true
  }
}

describe('GeoLookup', () => {
  let geoLookup: GeoLookup

  beforeEach(() => {
    geoLookup = new GeoLookup()
  })

  describe('Basic Lookup', () => {
    it('should lookup geographic data for valid IP', async () => {
      const result = await geoLookup.lookup('8.8.8.8')

      expect(result).toBeDefined()
      expect(result.country).toBe('United States')
      expect(result.countryCode).toBe('US')
      expect(result.city).toBe('Mountain View')
    })

    it('should return location with all fields', async () => {
      const result = await geoLookup.lookup('8.8.8.8')

      expect(result.ip).toBeDefined()
      expect(result.country).toBeDefined()
      expect(result.countryCode).toBeDefined()
      expect(result.region).toBeDefined()
      expect(result.city).toBeDefined()
      expect(result.latitude).toBeDefined()
      expect(result.longitude).toBeDefined()
      expect(result.timezone).toBeDefined()
    })

    it('should lookup Australian IP', async () => {
      const result = await geoLookup.lookup('1.1.1.1')

      expect(result.country).toBe('Australia')
      expect(result.countryCode).toBe('AU')
      expect(result.city).toBe('Brisbane')
    })

    it('should lookup UK IP', async () => {
      const result = await geoLookup.lookup('151.101.1.140')

      expect(result.country).toBe('United Kingdom')
      expect(result.countryCode).toBe('GB')
      expect(result.city).toBe('London')
    })

    it('should throw error for invalid IP format', async () => {
      await expect(geoLookup.lookup('invalid-ip')).rejects.toThrow('Invalid IP address format')
    })

    it('should throw error for out of range IP', async () => {
      await expect(geoLookup.lookup('999.999.999.999')).rejects.toThrow()
    })

    it('should handle IP not in database with fallback', async () => {
      const result = await geoLookup.lookup('200.200.200.200', { fallbackToDefault: true })

      expect(result.country).toBe('Unknown')
      expect(result.countryCode).toBe('XX')
    })

    it('should throw error for IP not in database without fallback', async () => {
      await expect(geoLookup.lookup('200.200.200.200', { fallbackToDefault: false }))
        .rejects.toThrow('IP address not found in database')
    })
  })

  describe('IP Validation', () => {
    it('should validate correct IPv4 address', () => {
      expect(geoLookup.isValidIP('192.168.1.1')).toBe(true)
    })

    it('should validate Google DNS', () => {
      expect(geoLookup.isValidIP('8.8.8.8')).toBe(true)
    })

    it('should reject invalid format', () => {
      expect(geoLookup.isValidIP('256.1.1.1')).toBe(false)
    })

    it('should reject malformed IP', () => {
      expect(geoLookup.isValidIP('1.2.3')).toBe(false)
    })

    it('should reject empty string', () => {
      expect(geoLookup.isValidIP('')).toBe(false)
    })

    it('should validate IPv6 address', () => {
      expect(geoLookup.isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
    })
  })

  describe('Private and Loopback IPs', () => {
    it('should detect private IP (10.x.x.x)', () => {
      expect(geoLookup.isPrivateIP('10.0.0.1')).toBe(true)
    })

    it('should detect private IP (192.168.x.x)', () => {
      expect(geoLookup.isPrivateIP('192.168.1.1')).toBe(true)
    })

    it('should detect private IP (172.16-31.x.x)', () => {
      expect(geoLookup.isPrivateIP('172.16.0.1')).toBe(true)
    })

    it('should not flag public IP as private', () => {
      expect(geoLookup.isPrivateIP('8.8.8.8')).toBe(false)
    })

    it('should detect loopback IP', () => {
      expect(geoLookup.isLoopbackIP('127.0.0.1')).toBe(true)
    })

    it('should detect IPv6 loopback', () => {
      expect(geoLookup.isLoopbackIP('::1')).toBe(true)
    })

    it('should handle private IP lookup', async () => {
      const result = await geoLookup.lookup('192.168.1.1')

      expect(result.country).toBe('Private')
      expect(result.countryCode).toBe('XX')
    })

    it('should handle loopback IP lookup', async () => {
      const result = await geoLookup.lookup('127.0.0.1')

      expect(result.country).toBe('Private')
    })
  })

  describe('Caching', () => {
    it('should cache lookup results', async () => {
      await geoLookup.lookup('8.8.8.8')
      const stats = geoLookup.getCacheStats()

      expect(stats.size).toBeGreaterThan(0)
    })

    it('should return cached result on second lookup', async () => {
      const result1 = await geoLookup.lookup('8.8.8.8')
      const result2 = await geoLookup.lookup('8.8.8.8')

      expect(result1).toEqual(result2)
    })

    it('should skip cache when option is set', async () => {
      await geoLookup.lookup('8.8.8.8')
      const result = await geoLookup.lookup('8.8.8.8', { cache: false })

      expect(result).toBeDefined()
    })

    it('should clear cache', async () => {
      await geoLookup.lookup('8.8.8.8')
      geoLookup.clearCache()
      const stats = geoLookup.getCacheStats()

      expect(stats.size).toBe(0)
    })
  })

  describe('Batch Lookup', () => {
    it('should batch lookup multiple IPs', async () => {
      const ips = ['8.8.8.8', '1.1.1.1', '151.101.1.140']
      const results = await geoLookup.batchLookup(ips)

      expect(results).toHaveLength(3)
      expect(results[0].country).toBe('United States')
      expect(results[1].country).toBe('Australia')
      expect(results[2].country).toBe('United Kingdom')
    })

    it('should handle empty batch', async () => {
      const results = await geoLookup.batchLookup([])

      expect(results).toHaveLength(0)
    })

    it('should handle batch with invalid IPs gracefully', async () => {
      const ips = ['8.8.8.8', 'invalid', '1.1.1.1']
      const results = await geoLookup.batchLookup(ips)

      expect(results).toHaveLength(3)
      expect(results[1].country).toBe('Unknown')
    })

    it('should handle batch with unknown IPs', async () => {
      const ips = ['8.8.8.8', '200.200.200.200']
      const results = await geoLookup.batchLookup(ips)

      expect(results).toHaveLength(2)
      expect(results[1].country).toBe('Unknown')
    })
  })

  describe('Coordinate Lookup', () => {
    it('should find location by coordinates', async () => {
      const result = await geoLookup.lookupByCoordinates(37.386, -122.0838)

      expect(result).not.toBeNull()
      expect(result?.city).toBe('Mountain View')
    })

    it('should return null for unknown coordinates', async () => {
      const result = await geoLookup.lookupByCoordinates(0, 0)

      expect(result).toBeNull()
    })

    it('should find nearby location with threshold', async () => {
      const result = await geoLookup.lookupByCoordinates(37.39, -122.08)

      expect(result).not.toBeNull()
    })
  })

  describe('Country Filtering', () => {
    it('should get all locations for a country', async () => {
      const locations = await geoLookup.getLocationsByCountry('US')

      expect(locations.length).toBeGreaterThan(0)
      expect(locations[0].countryCode).toBe('US')
    })

    it('should return empty array for unknown country', async () => {
      const locations = await geoLookup.getLocationsByCountry('ZZ')

      expect(locations).toHaveLength(0)
    })

    it('should get locations by region', async () => {
      const locations = await geoLookup.getLocationsByRegion('US', 'CA')

      expect(locations.length).toBeGreaterThan(0)
      expect(locations[0].regionCode).toBe('CA')
    })
  })

  describe('Distance Calculation', () => {
    it('should calculate distance between two locations', async () => {
      const loc1 = await geoLookup.lookup('8.8.8.8')
      const loc2 = await geoLookup.lookup('1.1.1.1')

      const distance = geoLookup.calculateDistance(loc1, loc2)

      expect(distance).toBeGreaterThan(0)
      expect(typeof distance).toBe('number')
    })

    it('should throw error if coordinates are missing', async () => {
      const loc1: GeoLocation = { ip: '1.1.1.1', country: 'Test' }
      const loc2: GeoLocation = { ip: '2.2.2.2', country: 'Test' }

      expect(() => geoLookup.calculateDistance(loc1, loc2))
        .toThrow('Both locations must have coordinates')
    })

    it('should calculate zero distance for same location', async () => {
      const loc = await geoLookup.lookup('8.8.8.8')
      const distance = geoLookup.calculateDistance(loc, loc)

      expect(distance).toBe(0)
    })
  })

  describe('Lookup Options', () => {
    it('should exclude coordinates when option is set', async () => {
      const result = await geoLookup.lookup('8.8.8.8', { includeCoordinates: false })

      expect(result.latitude).toBeUndefined()
      expect(result.longitude).toBeUndefined()
    })

    it('should exclude timezone when option is set', async () => {
      const result = await geoLookup.lookup('8.8.8.8', { includeTimezone: false })

      expect(result.timezone).toBeUndefined()
    })

    it('should include all data by default', async () => {
      const result = await geoLookup.lookup('8.8.8.8')

      expect(result.latitude).toBeDefined()
      expect(result.longitude).toBeDefined()
      expect(result.timezone).toBeDefined()
    })
  })

  describe('Database Management', () => {
    it('should get database info', () => {
      const info = geoLookup.getDatabaseInfo()

      expect(info.version).toBeDefined()
      expect(info.lastUpdated).toBeInstanceOf(Date)
      expect(info.totalRecords).toBeGreaterThan(0)
    })

    it('should get supported countries', () => {
      const countries = geoLookup.getSupportedCountries()

      expect(countries.length).toBeGreaterThan(0)
      expect(countries[0]).toHaveProperty('code')
      expect(countries[0]).toHaveProperty('name')
    })

    it('should add new location to database', async () => {
      const newLocation: GeoLocation = {
        ip: '100.100.100.100',
        country: 'Test Country',
        countryCode: 'TC'
      }

      geoLookup.addLocation(newLocation)
      const result = await geoLookup.lookup('100.100.100.100')

      expect(result.country).toBe('Test Country')
    })

    it('should remove location from database', () => {
      const removed = geoLookup.removeLocation('8.8.8.8')

      expect(removed).toBe(true)
    })

    it('should update existing location', () => {
      const updated = geoLookup.updateLocation('8.8.8.8', { city: 'Updated City' })

      expect(updated).toBe(true)
    })

    it('should return false when updating non-existent location', () => {
      const updated = geoLookup.updateLocation('999.999.999.999', { city: 'Test' })

      expect(updated).toBe(false)
    })
  })

  describe('Utility Functions', () => {
    it('should get timezone for IP', async () => {
      const timezone = await geoLookup.getTimezone('8.8.8.8')

      expect(timezone).toBe('America/Los_Angeles')
    })

    it('should return null for IP without timezone', async () => {
      const timezone = await geoLookup.getTimezone('invalid-ip')

      expect(timezone).toBeNull()
    })

    it('should get country name from code', () => {
      const country = geoLookup.getCountryName('US')

      expect(country).toBe('United States')
    })

    it('should return null for unknown country code', () => {
      const country = geoLookup.getCountryName('ZZ')

      expect(country).toBeNull()
    })

    it('should check if IP is in country', async () => {
      const isInUS = await geoLookup.isIPInCountry('8.8.8.8', 'US')

      expect(isInUS).toBe(true)
    })

    it('should return false if IP is not in country', async () => {
      const isInUK = await geoLookup.isIPInCountry('8.8.8.8', 'GB')

      expect(isInUK).toBe(false)
    })

    it('should get continent for IP', async () => {
      const continent = await geoLookup.getContinent('8.8.8.8')

      expect(continent).toBe('North America')
    })

    it('should normalize IP with port', () => {
      const normalized = geoLookup.normalizeIP('192.168.1.1:8080')

      expect(normalized).toBe('192.168.1.1')
    })

    it('should normalize IP without port', () => {
      const normalized = geoLookup.normalizeIP('192.168.1.1')

      expect(normalized).toBe('192.168.1.1')
    })
  })

  describe('Edge Cases', () => {
    it('should handle leading/trailing whitespace in IP', async () => {
      await expect(geoLookup.lookup(' 8.8.8.8 ')).rejects.toThrow()
    })

    it('should handle minimum valid IPv4', () => {
      expect(geoLookup.isValidIP('0.0.0.0')).toBe(true)
    })

    it('should handle maximum valid IPv4', () => {
      expect(geoLookup.isValidIP('255.255.255.255')).toBe(true)
    })

    it('should reject IPv4 with negative numbers', () => {
      expect(geoLookup.isValidIP('-1.0.0.0')).toBe(false)
    })

    it('should handle batch lookup with duplicates', async () => {
      const ips = ['8.8.8.8', '8.8.8.8', '1.1.1.1']
      const results = await geoLookup.batchLookup(ips)

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual(results[1])
    })
  })

  describe('Performance', () => {
    it('should handle large batch lookups', async () => {
      const ips = Array(100).fill('8.8.8.8')
      const startTime = Date.now()
      const results = await geoLookup.batchLookup(ips)
      const endTime = Date.now()

      expect(results).toHaveLength(100)
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })

  describe('Continent Information', () => {
    it('should include continent code', async () => {
      const result = await geoLookup.lookup('8.8.8.8')

      expect(result.continent).toBe('North America')
      expect(result.continentCode).toBe('NA')
    })

    it('should return correct continent for Australia', async () => {
      const result = await geoLookup.lookup('1.1.1.1')

      expect(result.continent).toBe('Oceania')
      expect(result.continentCode).toBe('OC')
    })

    it('should return correct continent for UK', async () => {
      const result = await geoLookup.lookup('151.101.1.140')

      expect(result.continent).toBe('Europe')
      expect(result.continentCode).toBe('EU')
    })
  })
})
