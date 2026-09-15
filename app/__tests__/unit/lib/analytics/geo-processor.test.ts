import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Geographic Data Processor Module - Processes geographic analytics data
 * Including country, region, city detection and aggregation
 */

interface GeoData {
  country?: string
  countryCode?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
  timezone?: string
}

interface GeoAnalytics {
  location: string
  visitors: number
  pageViews: number
  sessions: number
}

interface GeoDistribution {
  [key: string]: number
}

interface Coordinates {
  latitude: number
  longitude: number
}

// TDD: Implementation will follow these tests
class GeoProcessor {
  /**
   * Parse IP address to geographic data (mock implementation)
   */
  parseIPToGeo(ip: string): GeoData | null {
    // Mock implementation for testing
    if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip === 'localhost') {
      return null
    }

    // Mock data based on IP patterns
    if (ip.startsWith('192.168.')) {
      return {
        country: 'United States',
        countryCode: 'US',
        region: 'California',
        city: 'San Francisco',
        latitude: 37.7749,
        longitude: -122.4194,
        timezone: 'America/Los_Angeles',
      }
    }

    return {
      country: 'Unknown',
      countryCode: 'XX',
    }
  }

  /**
   * Aggregate pageviews by country
   */
  aggregateByCountry(geoData: GeoData[]): GeoAnalytics[] {
    const countryMap = new Map<string, { visitors: Set<string>; pageViews: number; sessions: Set<string> }>()

    geoData.forEach((data, index) => {
      const country = data.country || 'Unknown'

      if (!countryMap.has(country)) {
        countryMap.set(country, {
          visitors: new Set(),
          pageViews: 0,
          sessions: new Set(),
        })
      }

      const stats = countryMap.get(country)!
      stats.visitors.add(`visitor-${index}`)
      stats.pageViews += 1
      stats.sessions.add(`session-${index}`)
    })

    return Array.from(countryMap.entries())
      .map(([location, stats]) => ({
        location,
        visitors: stats.visitors.size,
        pageViews: stats.pageViews,
        sessions: stats.sessions.size,
      }))
      .sort((a, b) => b.pageViews - a.pageViews)
  }

  /**
   * Aggregate pageviews by region
   */
  aggregateByRegion(geoData: GeoData[]): GeoAnalytics[] {
    const regionMap = new Map<string, { visitors: Set<string>; pageViews: number; sessions: Set<string> }>()

    geoData.forEach((data, index) => {
      if (!data.region) return

      const key = `${data.country} - ${data.region}`

      if (!regionMap.has(key)) {
        regionMap.set(key, {
          visitors: new Set(),
          pageViews: 0,
          sessions: new Set(),
        })
      }

      const stats = regionMap.get(key)!
      stats.visitors.add(`visitor-${index}`)
      stats.pageViews += 1
      stats.sessions.add(`session-${index}`)
    })

    return Array.from(regionMap.entries())
      .map(([location, stats]) => ({
        location,
        visitors: stats.visitors.size,
        pageViews: stats.pageViews,
        sessions: stats.sessions.size,
      }))
      .sort((a, b) => b.pageViews - a.pageViews)
  }

  /**
   * Aggregate pageviews by city
   */
  aggregateByCity(geoData: GeoData[]): GeoAnalytics[] {
    const cityMap = new Map<string, { visitors: Set<string>; pageViews: number; sessions: Set<string> }>()

    geoData.forEach((data, index) => {
      if (!data.city) return

      const key = `${data.city}, ${data.country}`

      if (!cityMap.has(key)) {
        cityMap.set(key, {
          visitors: new Set(),
          pageViews: 0,
          sessions: new Set(),
        })
      }

      const stats = cityMap.get(key)!
      stats.visitors.add(`visitor-${index}`)
      stats.pageViews += 1
      stats.sessions.add(`session-${index}`)
    })

    return Array.from(cityMap.entries())
      .map(([location, stats]) => ({
        location,
        visitors: stats.visitors.size,
        pageViews: stats.pageViews,
        sessions: stats.sessions.size,
      }))
      .sort((a, b) => b.pageViews - a.pageViews)
  }

  /**
   * Get country distribution as percentage
   */
  getCountryDistribution(geoData: GeoData[]): GeoDistribution {
    if (geoData.length === 0) return {}

    const countryCount = new Map<string, number>()

    geoData.forEach(data => {
      const country = data.country || 'Unknown'
      countryCount.set(country, (countryCount.get(country) || 0) + 1)
    })

    const distribution: GeoDistribution = {}

    countryCount.forEach((count, country) => {
      distribution[country] = Math.round((count / geoData.length) * 100 * 10) / 10
    })

    return distribution
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371 // Earth's radius in kilometers

    const lat1 = this.toRadians(coord1.latitude)
    const lat2 = this.toRadians(coord2.latitude)
    const deltaLat = this.toRadians(coord2.latitude - coord1.latitude)
    const deltaLon = this.toRadians(coord2.longitude - coord1.longitude)

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return Math.round(R * c * 10) / 10
  }

  /**
   * Get top N countries by pageviews
   */
  getTopCountries(geoData: GeoData[], limit: number): GeoAnalytics[] {
    const aggregated = this.aggregateByCountry(geoData)
    return aggregated.slice(0, limit)
  }

  /**
   * Filter data by country code
   */
  filterByCountryCode(geoData: GeoData[], countryCode: string): GeoData[] {
    return geoData.filter(data => data.countryCode === countryCode)
  }

  /**
   * Check if location is within bounding box
   */
  isWithinBounds(
    location: Coordinates,
    bounds: { north: number; south: number; east: number; west: number }
  ): boolean {
    return (
      location.latitude <= bounds.north &&
      location.latitude >= bounds.south &&
      location.longitude <= bounds.east &&
      location.longitude >= bounds.west
    )
  }

  /**
   * Get timezone from geo data
   */
  getTimezone(geoData: GeoData): string {
    return geoData.timezone || 'UTC'
  }

  /**
   * Validate coordinates
   */
  isValidCoordinates(latitude: number, longitude: number): boolean {
    return (
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    )
  }

  /**
   * Helper: Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }

  /**
   * Group nearby locations (simple clustering)
   */
  groupNearbyLocations(
    locations: (GeoData & { id: string })[],
    maxDistanceKm: number
  ): Map<string, (GeoData & { id: string })[]> {
    const clusters = new Map<string, (GeoData & { id: string })[]>()
    const processed = new Set<string>()

    locations.forEach(loc1 => {
      if (processed.has(loc1.id)) return
      if (!loc1.latitude || !loc1.longitude) return

      const cluster: (GeoData & { id: string })[] = [loc1]
      processed.add(loc1.id)

      locations.forEach(loc2 => {
        if (processed.has(loc2.id)) return
        if (!loc2.latitude || !loc2.longitude) return

        const distance = this.calculateDistance(
          { latitude: loc1.latitude!, longitude: loc1.longitude! },
          { latitude: loc2.latitude, longitude: loc2.longitude }
        )

        if (distance <= maxDistanceKm) {
          cluster.push(loc2)
          processed.add(loc2.id)
        }
      })

      clusters.set(loc1.id, cluster)
    })

    return clusters
  }
}

describe('GeoProcessor - Geographic Data Processing', () => {
  let processor: GeoProcessor

  beforeEach(() => {
    processor = new GeoProcessor()
  })

  describe('parseIPToGeo', () => {
    it('should parse valid IP to geo data', () => {
      const result = processor.parseIPToGeo('192.168.1.1')

      expect(result).toBeDefined()
      expect(result?.country).toBe('United States')
      expect(result?.countryCode).toBe('US')
    })

    it('should return null for localhost', () => {
      const result = processor.parseIPToGeo('127.0.0.1')
      expect(result).toBeNull()
    })

    it('should return null for invalid IP', () => {
      const result = processor.parseIPToGeo('0.0.0.0')
      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = processor.parseIPToGeo('')
      expect(result).toBeNull()
    })

    it('should include timezone data', () => {
      const result = processor.parseIPToGeo('192.168.1.1')
      expect(result?.timezone).toBeDefined()
    })
  })

  describe('aggregateByCountry', () => {
    it('should aggregate pageviews by country', () => {
      const geoData: GeoData[] = [
        { country: 'United States', countryCode: 'US' },
        { country: 'United States', countryCode: 'US' },
        { country: 'Canada', countryCode: 'CA' },
      ]

      const result = processor.aggregateByCountry(geoData)

      expect(result).toHaveLength(2)
      expect(result[0].location).toBe('United States')
      expect(result[0].pageViews).toBe(2)
      expect(result[1].location).toBe('Canada')
      expect(result[1].pageViews).toBe(1)
    })

    it('should handle empty array', () => {
      const result = processor.aggregateByCountry([])
      expect(result).toHaveLength(0)
    })

    it('should sort by pageviews descending', () => {
      const geoData: GeoData[] = [
        { country: 'Canada', countryCode: 'CA' },
        { country: 'United States', countryCode: 'US' },
        { country: 'United States', countryCode: 'US' },
        { country: 'United States', countryCode: 'US' },
      ]

      const result = processor.aggregateByCountry(geoData)

      expect(result[0].location).toBe('United States')
      expect(result[0].pageViews).toBe(3)
    })

    it('should handle unknown countries', () => {
      const geoData: GeoData[] = [
        { countryCode: 'XX' },
        { country: 'United States', countryCode: 'US' },
      ]

      const result = processor.aggregateByCountry(geoData)

      expect(result.some(r => r.location === 'Unknown')).toBe(true)
    })
  })

  describe('aggregateByRegion', () => {
    it('should aggregate pageviews by region', () => {
      const geoData: GeoData[] = [
        { country: 'United States', region: 'California' },
        { country: 'United States', region: 'California' },
        { country: 'United States', region: 'New York' },
      ]

      const result = processor.aggregateByRegion(geoData)

      expect(result).toHaveLength(2)
      expect(result[0].location).toContain('California')
      expect(result[0].pageViews).toBe(2)
    })

    it('should skip entries without region', () => {
      const geoData: GeoData[] = [
        { country: 'United States', region: 'California' },
        { country: 'Canada' },
      ]

      const result = processor.aggregateByRegion(geoData)

      expect(result).toHaveLength(1)
    })

    it('should include country in location key', () => {
      const geoData: GeoData[] = [
        { country: 'United States', region: 'Georgia' },
        { country: 'Georgia', region: 'Tbilisi' },
      ]

      const result = processor.aggregateByRegion(geoData)

      expect(result).toHaveLength(2)
      expect(result.every(r => r.location.includes(' - '))).toBe(true)
    })
  })

  describe('aggregateByCity', () => {
    it('should aggregate pageviews by city', () => {
      const geoData: GeoData[] = [
        { country: 'United States', city: 'San Francisco' },
        { country: 'United States', city: 'San Francisco' },
        { country: 'United States', city: 'New York' },
      ]

      const result = processor.aggregateByCity(geoData)

      expect(result).toHaveLength(2)
      expect(result[0].location).toContain('San Francisco')
      expect(result[0].pageViews).toBe(2)
    })

    it('should skip entries without city', () => {
      const geoData: GeoData[] = [
        { country: 'United States', city: 'Boston' },
        { country: 'United States' },
      ]

      const result = processor.aggregateByCity(geoData)

      expect(result).toHaveLength(1)
    })

    it('should include country in city location', () => {
      const geoData: GeoData[] = [
        { country: 'United States', city: 'Portland' },
        { country: 'United Kingdom', city: 'Portland' },
      ]

      const result = processor.aggregateByCity(geoData)

      expect(result).toHaveLength(2)
    })
  })

  describe('getCountryDistribution', () => {
    it('should calculate country distribution percentages', () => {
      const geoData: GeoData[] = [
        { country: 'United States' },
        { country: 'United States' },
        { country: 'United States' },
        { country: 'Canada' },
      ]

      const result = processor.getCountryDistribution(geoData)

      expect(result['United States']).toBe(75)
      expect(result['Canada']).toBe(25)
    })

    it('should return empty object for empty array', () => {
      const result = processor.getCountryDistribution([])
      expect(result).toEqual({})
    })

    it('should round to one decimal place', () => {
      const geoData: GeoData[] = [
        { country: 'A' },
        { country: 'B' },
        { country: 'B' },
      ]

      const result = processor.getCountryDistribution(geoData)

      expect(result['A']).toBe(33.3)
      expect(result['B']).toBe(66.7)
    })
  })

  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates', () => {
      const coord1: Coordinates = { latitude: 40.7128, longitude: -74.0060 } // New York
      const coord2: Coordinates = { latitude: 34.0522, longitude: -118.2437 } // Los Angeles

      const distance = processor.calculateDistance(coord1, coord2)

      expect(distance).toBeGreaterThan(3900) // Approximately 3944 km
      expect(distance).toBeLessThan(4000)
    })

    it('should return 0 for same coordinates', () => {
      const coord: Coordinates = { latitude: 40.7128, longitude: -74.0060 }

      const distance = processor.calculateDistance(coord, coord)

      expect(distance).toBe(0)
    })

    it('should handle coordinates across meridian', () => {
      const coord1: Coordinates = { latitude: 0, longitude: -179 }
      const coord2: Coordinates = { latitude: 0, longitude: 179 }

      const distance = processor.calculateDistance(coord1, coord2)

      expect(distance).toBeGreaterThan(0)
    })
  })

  describe('getTopCountries', () => {
    it('should return top N countries', () => {
      const geoData: GeoData[] = [
        { country: 'United States' },
        { country: 'United States' },
        { country: 'United States' },
        { country: 'Canada' },
        { country: 'Canada' },
        { country: 'Mexico' },
      ]

      const result = processor.getTopCountries(geoData, 2)

      expect(result).toHaveLength(2)
      expect(result[0].location).toBe('United States')
      expect(result[1].location).toBe('Canada')
    })

    it('should handle limit greater than available countries', () => {
      const geoData: GeoData[] = [
        { country: 'United States' },
      ]

      const result = processor.getTopCountries(geoData, 10)

      expect(result).toHaveLength(1)
    })
  })

  describe('filterByCountryCode', () => {
    it('should filter data by country code', () => {
      const geoData: GeoData[] = [
        { country: 'United States', countryCode: 'US' },
        { country: 'Canada', countryCode: 'CA' },
        { country: 'United States', countryCode: 'US' },
      ]

      const result = processor.filterByCountryCode(geoData, 'US')

      expect(result).toHaveLength(2)
      expect(result.every(d => d.countryCode === 'US')).toBe(true)
    })

    it('should return empty array when no matches', () => {
      const geoData: GeoData[] = [
        { country: 'United States', countryCode: 'US' },
      ]

      const result = processor.filterByCountryCode(geoData, 'CA')

      expect(result).toHaveLength(0)
    })
  })

  describe('isWithinBounds', () => {
    it('should check if location is within bounding box', () => {
      const location: Coordinates = { latitude: 40.7128, longitude: -74.0060 }
      const bounds = { north: 45, south: 35, east: -70, west: -80 }

      const result = processor.isWithinBounds(location, bounds)

      expect(result).toBe(true)
    })

    it('should return false if outside bounds', () => {
      const location: Coordinates = { latitude: 50, longitude: -74.0060 }
      const bounds = { north: 45, south: 35, east: -70, west: -80 }

      const result = processor.isWithinBounds(location, bounds)

      expect(result).toBe(false)
    })
  })

  describe('isValidCoordinates', () => {
    it('should validate correct coordinates', () => {
      expect(processor.isValidCoordinates(40.7128, -74.0060)).toBe(true)
    })

    it('should reject invalid latitude', () => {
      expect(processor.isValidCoordinates(91, -74.0060)).toBe(false)
      expect(processor.isValidCoordinates(-91, -74.0060)).toBe(false)
    })

    it('should reject invalid longitude', () => {
      expect(processor.isValidCoordinates(40.7128, 181)).toBe(false)
      expect(processor.isValidCoordinates(40.7128, -181)).toBe(false)
    })

    it('should validate edge cases', () => {
      expect(processor.isValidCoordinates(90, 180)).toBe(true)
      expect(processor.isValidCoordinates(-90, -180)).toBe(true)
      expect(processor.isValidCoordinates(0, 0)).toBe(true)
    })
  })

  describe('groupNearbyLocations', () => {
    it('should group nearby locations', () => {
      const locations = [
        { id: '1', latitude: 40.7128, longitude: -74.0060, country: 'US' },
        { id: '2', latitude: 40.7580, longitude: -73.9855, country: 'US' }, // ~5km away
        { id: '3', latitude: 34.0522, longitude: -118.2437, country: 'US' }, // Far away
      ]

      const result = processor.groupNearbyLocations(locations, 10)

      expect(result.size).toBeGreaterThan(0)
    })

    it('should handle empty locations', () => {
      const result = processor.groupNearbyLocations([], 10)

      expect(result.size).toBe(0)
    })

    it('should skip locations without coordinates', () => {
      const locations = [
        { id: '1', country: 'US' },
        { id: '2', latitude: 40.7128, longitude: -74.0060, country: 'US' },
      ]

      const result = processor.groupNearbyLocations(locations, 10)

      expect(result.size).toBeLessThanOrEqual(1)
    })
  })
})
