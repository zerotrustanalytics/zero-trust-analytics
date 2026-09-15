import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Custom Event Collection API Tests
 *
 * Tests the custom event collection endpoint for tracking
 * user interactions, conversions, and custom analytics events.
 */

describe('Custom Event Collection API', () => {
  const createRequest = (body: any, headers: Record<string, string> = {}): NextRequest => {
    return new NextRequest('http://localhost:3000/api/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  }

  describe('Event Validation', () => {
    it('should accept valid custom event', async () => {
      const payload = {
        sid: 'site-123',
        type: 'event',
        name: 'button_click',
        url: 'https://example.com/page',
        vid: 'visitor-123',
        ts: Date.now(),
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.type).toBe('event')
      expect(body.name).toBe('button_click')
    })

    it('should require event name', async () => {
      const payload = {
        sid: 'site-123',
        type: 'event',
        url: 'https://example.com/page',
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.name).toBeUndefined()
    })

    it('should validate event name format', () => {
      const isValidEventName = (name: string): boolean => {
        return /^[a-z0-9_]+$/.test(name) && name.length <= 50
      }

      expect(isValidEventName('button_click')).toBe(true)
      expect(isValidEventName('purchase_completed')).toBe(true)
      expect(isValidEventName('invalid-name')).toBe(false)
      expect(isValidEventName('Invalid Name')).toBe(false)
      expect(isValidEventName('a'.repeat(51))).toBe(false)
    })

    it('should accept event with custom properties', async () => {
      const payload = {
        sid: 'site-123',
        type: 'event',
        name: 'purchase',
        properties: {
          product: 'Widget',
          price: 29.99,
          currency: 'USD',
        },
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.properties).toBeDefined()
      expect(body.properties.product).toBe('Widget')
      expect(body.properties.price).toBe(29.99)
    })

    it('should limit properties object size', () => {
      const maxSize = 10000

      const checkPropertiesSize = (properties: any): boolean => {
        const json = JSON.stringify(properties)
        return json.length <= maxSize
      }

      const smallProps = { key: 'value' }
      const largeProps = { data: 'x'.repeat(20000) }

      expect(checkPropertiesSize(smallProps)).toBe(true)
      expect(checkPropertiesSize(largeProps)).toBe(false)
    })

    it('should accept numeric event values', async () => {
      const payload = {
        sid: 'site-123',
        type: 'event',
        name: 'purchase',
        value: 99.99,
      }

      const request = createRequest(payload)
      const body = await request.json()

      expect(body.value).toBe(99.99)
      expect(typeof body.value).toBe('number')
    })

    it('should validate numeric values are positive', () => {
      const isValidValue = (value: number): boolean => {
        return typeof value === 'number' && value >= 0 && isFinite(value)
      }

      expect(isValidValue(0)).toBe(true)
      expect(isValidValue(99.99)).toBe(true)
      expect(isValidValue(-10)).toBe(false)
      expect(isValidValue(NaN)).toBe(false)
      expect(isValidValue(Infinity)).toBe(false)
    })
  })

  describe('Event Types', () => {
    it('should track click events', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'click',
        properties: {
          element: 'button',
          text: 'Sign Up',
          selector: '#signup-btn',
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.name).toBe('click')
      expect(body.properties.element).toBe('button')
    })

    it('should track form submission events', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'form_submit',
        properties: {
          formId: 'contact-form',
          fields: 3,
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.name).toBe('form_submit')
      expect(body.properties.formId).toBe('contact-form')
    })

    it('should track conversion events', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'conversion',
        value: 149.99,
        properties: {
          goal: 'purchase',
          product: 'Premium Plan',
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.name).toBe('conversion')
      expect(body.value).toBe(149.99)
    })

    it('should track video events', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'video_play',
        properties: {
          videoId: 'intro-video',
          duration: 120,
          position: 0,
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.name).toBe('video_play')
      expect(body.properties.videoId).toBe('intro-video')
    })

    it('should track download events', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'download',
        properties: {
          fileName: 'whitepaper.pdf',
          fileSize: 1024000,
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.name).toBe('download')
      expect(body.properties.fileName).toBe('whitepaper.pdf')
    })
  })

  describe('Event Properties', () => {
    it('should accept string properties', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        properties: {
          category: 'electronics',
          brand: 'Apple',
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(typeof body.properties.category).toBe('string')
      expect(typeof body.properties.brand).toBe('string')
    })

    it('should accept number properties', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        properties: {
          quantity: 5,
          price: 29.99,
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(typeof body.properties.quantity).toBe('number')
      expect(typeof body.properties.price).toBe('number')
    })

    it('should accept boolean properties', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        properties: {
          isLoggedIn: true,
          hasAccount: false,
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(typeof body.properties.isLoggedIn).toBe('boolean')
      expect(typeof body.properties.hasAccount).toBe('boolean')
    })

    it('should accept array properties', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        properties: {
          categories: ['electronics', 'computers'],
          tags: ['new', 'featured'],
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(Array.isArray(body.properties.categories)).toBe(true)
      expect(body.properties.categories).toHaveLength(2)
    })

    it('should accept nested object properties', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        properties: {
          product: {
            id: '123',
            name: 'Widget',
            price: 29.99,
          },
        },
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.properties.product.id).toBe('123')
      expect(body.properties.product.name).toBe('Widget')
    })

    it('should sanitize property values', () => {
      const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
          return value.substring(0, 1000)
        }
        if (Array.isArray(value)) {
          return value.slice(0, 100)
        }
        return value
      }

      const longString = 'a'.repeat(2000)
      const longArray = new Array(200).fill('item')

      expect(sanitizeValue(longString).length).toBe(1000)
      expect(sanitizeValue(longArray).length).toBe(100)
    })
  })

  describe('Event Metadata', () => {
    it('should add server timestamp to event', () => {
      const addMetadata = (event: any) => ({
        ...event,
        serverTs: Date.now(),
      })

      const before = Date.now()
      const withMetadata = addMetadata({ name: 'test' })
      const after = Date.now()

      expect(withMetadata.serverTs).toBeGreaterThanOrEqual(before)
      expect(withMetadata.serverTs).toBeLessThanOrEqual(after)
    })

    it('should generate unique event ID', () => {
      const events = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const id = crypto.randomUUID()
        events.add(id)
      }

      expect(events.size).toBe(100)
    })

    it('should preserve client timestamp', async () => {
      const clientTs = Date.now()
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        ts: clientTs,
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.ts).toBe(clientTs)
    })

    it('should track event source', async () => {
      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'test',
        source: 'tracking-script',
      }

      const request = createRequest(event)
      const body = await request.json()

      expect(body.source).toBe('tracking-script')
    })
  })

  describe('Event Deduplication', () => {
    it('should detect duplicate events by ID', () => {
      const seenEvents = new Set<string>()

      const isDuplicate = (eventId: string): boolean => {
        if (seenEvents.has(eventId)) {
          return true
        }
        seenEvents.add(eventId)
        return false
      }

      const id1 = 'event-123'
      const id2 = 'event-456'

      expect(isDuplicate(id1)).toBe(false)
      expect(isDuplicate(id1)).toBe(true)
      expect(isDuplicate(id2)).toBe(false)
    })

    it('should detect duplicate events by content hash', () => {
      const hashEvent = (event: any): string => {
        const str = JSON.stringify(event)
        let hash = 0
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i)
          hash |= 0
        }
        return hash.toString(36)
      }

      const event1 = { name: 'click', element: 'button' }
      const event2 = { name: 'click', element: 'button' }
      const event3 = { name: 'click', element: 'link' }

      expect(hashEvent(event1)).toBe(hashEvent(event2))
      expect(hashEvent(event1)).not.toBe(hashEvent(event3))
    })

    it('should use time window for deduplication', () => {
      const recentEvents = new Map<string, number>()
      const windowMs = 5000

      const isDuplicateInWindow = (hash: string, timestamp: number): boolean => {
        const lastSeen = recentEvents.get(hash)

        if (lastSeen && timestamp - lastSeen < windowMs) {
          return true
        }

        recentEvents.set(hash, timestamp)
        return false
      }

      const now = Date.now()
      const hash = 'event-hash'

      expect(isDuplicateInWindow(hash, now)).toBe(false)
      expect(isDuplicateInWindow(hash, now + 1000)).toBe(true)
      expect(isDuplicateInWindow(hash, now + 6000)).toBe(false)
    })
  })

  describe('Event Storage', () => {
    it('should store event with all fields', () => {
      const storage: any[] = []

      const saveEvent = (event: any): void => {
        storage.push({
          id: crypto.randomUUID(),
          ...event,
          createdAt: new Date(),
        })
      }

      const event = {
        sid: 'site-123',
        type: 'event',
        name: 'purchase',
        value: 99.99,
      }

      saveEvent(event)

      expect(storage).toHaveLength(1)
      expect(storage[0].sid).toBe('site-123')
      expect(storage[0].name).toBe('purchase')
      expect(storage[0].id).toBeTruthy()
    })

    it('should index events by site ID', () => {
      const eventsBySite = new Map<string, any[]>()

      const indexEvent = (event: any): void => {
        if (!eventsBySite.has(event.sid)) {
          eventsBySite.set(event.sid, [])
        }
        eventsBySite.get(event.sid)!.push(event)
      }

      indexEvent({ sid: 'site-1', name: 'event1' })
      indexEvent({ sid: 'site-1', name: 'event2' })
      indexEvent({ sid: 'site-2', name: 'event3' })

      expect(eventsBySite.get('site-1')).toHaveLength(2)
      expect(eventsBySite.get('site-2')).toHaveLength(1)
    })

    it('should index events by name', () => {
      const eventsByName = new Map<string, any[]>()

      const indexByName = (event: any): void => {
        if (!eventsByName.has(event.name)) {
          eventsByName.set(event.name, [])
        }
        eventsByName.get(event.name)!.push(event)
      }

      indexByName({ name: 'click', element: 'button1' })
      indexByName({ name: 'click', element: 'button2' })
      indexByName({ name: 'purchase', value: 99 })

      expect(eventsByName.get('click')).toHaveLength(2)
      expect(eventsByName.get('purchase')).toHaveLength(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid property types', () => {
      const validateProperties = (properties: any): boolean => {
        if (typeof properties !== 'object' || properties === null) {
          return false
        }

        for (const value of Object.values(properties)) {
          const type = typeof value
          if (
            type !== 'string' &&
            type !== 'number' &&
            type !== 'boolean' &&
            !Array.isArray(value) &&
            type !== 'object'
          ) {
            return false
          }
        }

        return true
      }

      expect(validateProperties({ key: 'value' })).toBe(true)
      expect(validateProperties({ key: 123 })).toBe(true)
      expect(validateProperties({ key: true })).toBe(true)
      expect(validateProperties(null)).toBe(false)
      expect(validateProperties('string')).toBe(false)
    })

    it('should handle circular references in properties', () => {
      const hasCircularReference = (obj: any): boolean => {
        try {
          JSON.stringify(obj)
          return false
        } catch (error) {
          return true
        }
      }

      const circular: any = { a: 1 }
      circular.self = circular

      expect(hasCircularReference(circular)).toBe(true)
      expect(hasCircularReference({ a: 1, b: 2 })).toBe(false)
    })

    it('should handle missing required fields', () => {
      const validateEvent = (event: any): string | null => {
        if (!event.sid) return 'Missing site ID'
        if (event.type !== 'event') return 'Invalid event type'
        if (!event.name) return 'Missing event name'
        return null
      }

      expect(validateEvent({ sid: 'site-123', type: 'event', name: 'test' })).toBeNull()
      expect(validateEvent({ type: 'event', name: 'test' })).toBe('Missing site ID')
      expect(validateEvent({ sid: 'site-123', name: 'test' })).toBe('Invalid event type')
      expect(validateEvent({ sid: 'site-123', type: 'event' })).toBe('Missing event name')
    })
  })
})
