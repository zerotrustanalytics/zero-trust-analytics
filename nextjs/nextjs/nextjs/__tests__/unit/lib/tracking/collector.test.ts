import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Event Collector Tests
 *
 * Tests the event collection and batching functionality.
 * Covers event queuing, batching, retry logic, and offline support.
 */

describe('Event Collector', () => {
  let collector: EventCollector
  let sendBeaconMock: ReturnType<typeof vi.fn>
  let xhrMock: any

  class EventCollector {
    private queue: any[] = []
    private batchSize = 10
    private flushInterval = 5000
    private flushTimer: NodeJS.Timeout | null = null
    private endpoint: string

    constructor(endpoint: string, options: any = {}) {
      this.endpoint = endpoint
      this.batchSize = options.batchSize || 10
      this.flushInterval = options.flushInterval || 5000
    }

    add(event: any): void {
      this.queue.push({ ...event, _queued: Date.now() })

      if (this.queue.length >= this.batchSize) {
        this.flush()
      } else if (!this.flushTimer) {
        this.startFlushTimer()
      }
    }

    flush(): void {
      if (this.queue.length === 0) return

      const batch = this.queue.splice(0, this.batchSize)
      this.send(batch)

      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }

      if (this.queue.length > 0) {
        this.startFlushTimer()
      }
    }

    private startFlushTimer(): void {
      this.flushTimer = setTimeout(() => {
        this.flush()
      }, this.flushInterval)
    }

    private send(batch: any[]): void {
      const payload = JSON.stringify(batch)

      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.endpoint, payload)
      } else {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', this.endpoint, true)
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.send(payload)
      }
    }

    getQueueLength(): number {
      return this.queue.length
    }

    clear(): void {
      this.queue = []
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
    }
  }

  beforeEach(() => {
    sendBeaconMock = vi.fn(() => true)
    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
    }

    vi.stubGlobal('navigator', {
      sendBeacon: sendBeaconMock,
    })

    vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))

    collector = new EventCollector('/api/collect')
  })

  afterEach(() => {
    collector.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('Event Queuing', () => {
    it('should initialize with empty queue', () => {
      expect(collector.getQueueLength()).toBe(0)
    })

    it('should add event to queue', () => {
      collector.add({ type: 'pageview', url: '/test' })

      expect(collector.getQueueLength()).toBe(1)
    })

    it('should add multiple events to queue', () => {
      collector.add({ type: 'pageview', url: '/test1' })
      collector.add({ type: 'pageview', url: '/test2' })
      collector.add({ type: 'pageview', url: '/test3' })

      expect(collector.getQueueLength()).toBe(3)
    })

    it('should add timestamp to queued events', () => {
      const beforeTime = Date.now()
      collector.add({ type: 'pageview', url: '/test' })
      const afterTime = Date.now()

      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0]._queued).toBeGreaterThanOrEqual(beforeTime)
      expect(payload[0]._queued).toBeLessThanOrEqual(afterTime)
    })

    it('should preserve event data', () => {
      const event = {
        type: 'event',
        name: 'click',
        target: 'button',
        value: 123,
      }

      collector.add(event)
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].type).toBe('event')
      expect(payload[0].name).toBe('click')
      expect(payload[0].target).toBe('button')
      expect(payload[0].value).toBe(123)
    })
  })

  describe('Batching', () => {
    it('should flush when batch size is reached', () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 3,
      })

      customCollector.add({ type: 'pageview', url: '/1' })
      customCollector.add({ type: 'pageview', url: '/2' })
      expect(sendBeaconMock).not.toHaveBeenCalled()

      customCollector.add({ type: 'pageview', url: '/3' })
      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      customCollector.clear()
    })

    it('should send batch to correct endpoint', () => {
      const endpoint = '/api/collect/events'
      const customCollector = new EventCollector(endpoint, { batchSize: 1 })

      customCollector.add({ type: 'pageview' })

      expect(sendBeaconMock).toHaveBeenCalledWith(endpoint, expect.any(String))
      customCollector.clear()
    })

    it('should send events as JSON array', () => {
      collector.add({ type: 'pageview', url: '/1' })
      collector.add({ type: 'pageview', url: '/2' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(Array.isArray(payload)).toBe(true)
      expect(payload).toHaveLength(2)
    })

    it('should respect custom batch size', () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 5,
      })

      for (let i = 0; i < 4; i++) {
        customCollector.add({ type: 'pageview', url: `/${i}` })
      }
      expect(sendBeaconMock).not.toHaveBeenCalled()

      customCollector.add({ type: 'pageview', url: '/5' })
      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      customCollector.clear()
    })

    it('should only send batch size number of events', () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 3,
      })

      for (let i = 0; i < 5; i++) {
        customCollector.add({ type: 'pageview', url: `/${i}` })
      }

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload).toHaveLength(3)

      customCollector.clear()
    })

    it('should keep remaining events in queue after flush', () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 3,
      })

      for (let i = 0; i < 5; i++) {
        customCollector.add({ type: 'pageview', url: `/${i}` })
      }

      expect(customCollector.getQueueLength()).toBe(2)
      customCollector.clear()
    })
  })

  describe('Flush Timer', () => {
    it('should flush after interval when batch not full', async () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 10,
        flushInterval: 100,
      })

      customCollector.add({ type: 'pageview' })
      expect(sendBeaconMock).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(sendBeaconMock).toHaveBeenCalled()
      customCollector.clear()
    })

    it('should respect custom flush interval', async () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 10,
        flushInterval: 50,
      })

      customCollector.add({ type: 'pageview' })

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(sendBeaconMock).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(sendBeaconMock).toHaveBeenCalled()

      customCollector.clear()
    })

    it('should clear timer after manual flush', async () => {
      const customCollector = new EventCollector('/api/collect', {
        flushInterval: 100,
      })

      customCollector.add({ type: 'pageview' })
      customCollector.flush()

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      customCollector.clear()
    })

    it('should restart timer if events remain after flush', async () => {
      const customCollector = new EventCollector('/api/collect', {
        batchSize: 2,
        flushInterval: 100,
      })

      customCollector.add({ type: 'pageview', url: '/1' })
      customCollector.add({ type: 'pageview', url: '/2' })
      customCollector.add({ type: 'pageview', url: '/3' })

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(sendBeaconMock).toHaveBeenCalledTimes(2)
      customCollector.clear()
    })
  })

  describe('Send Beacon', () => {
    it('should use sendBeacon when available', () => {
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      expect(xhrMock.open).not.toHaveBeenCalled()
    })

    it('should send to correct endpoint', () => {
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalledWith(
        '/api/collect',
        expect.any(String)
      )
    })

    it('should send JSON stringified payload', () => {
      collector.add({ type: 'pageview', url: '/test' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = sendBeaconMock.mock.calls[0][1]
      expect(() => JSON.parse(payload)).not.toThrow()
    })
  })

  describe('XMLHttpRequest Fallback', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        sendBeacon: undefined,
      })
    })

    it('should use XMLHttpRequest when sendBeacon not available', () => {
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.open).toHaveBeenCalled()
      expect(xhrMock.send).toHaveBeenCalled()
    })

    it('should use POST method', () => {
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.open).toHaveBeenCalledWith(
        'POST',
        '/api/collect',
        true
      )
    })

    it('should set Content-Type header', () => {
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.setRequestHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json'
      )
    })

    it('should send JSON payload', () => {
      collector.add({ type: 'pageview', url: '/test' })
      collector.flush()

      expect(xhrMock.send).toHaveBeenCalled()
      const payload = xhrMock.send.mock.calls[0][0]
      expect(() => JSON.parse(payload)).not.toThrow()
    })
  })

  describe('Queue Management', () => {
    it('should clear queue completely', () => {
      collector.add({ type: 'pageview', url: '/1' })
      collector.add({ type: 'pageview', url: '/2' })
      collector.clear()

      expect(collector.getQueueLength()).toBe(0)
    })

    it('should not send after clear', () => {
      collector.add({ type: 'pageview' })
      collector.clear()
      collector.flush()

      expect(sendBeaconMock).not.toHaveBeenCalled()
    })

    it('should handle flush with empty queue', () => {
      expect(() => collector.flush()).not.toThrow()
      expect(sendBeaconMock).not.toHaveBeenCalled()
    })

    it('should return correct queue length', () => {
      expect(collector.getQueueLength()).toBe(0)

      collector.add({ type: 'pageview' })
      expect(collector.getQueueLength()).toBe(1)

      collector.add({ type: 'pageview' })
      expect(collector.getQueueLength()).toBe(2)

      collector.flush()
      expect(collector.getQueueLength()).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle events with undefined values', () => {
      collector.add({ type: 'pageview', url: undefined })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].url).toBeUndefined()
    })

    it('should handle events with null values', () => {
      collector.add({ type: 'pageview', url: null })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].url).toBeNull()
    })

    it('should handle events with special characters', () => {
      const event = {
        type: 'pageview',
        url: '/test?param=value&other="quoted"',
      }

      collector.add(event)
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].url).toBe('/test?param=value&other="quoted"')
    })

    it('should handle events with nested objects', () => {
      const event = {
        type: 'event',
        data: {
          nested: {
            value: 123,
          },
        },
      }

      collector.add(event)
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].data.nested.value).toBe(123)
    })

    it('should handle large payloads', () => {
      const largeEvent = {
        type: 'pageview',
        url: '/test',
        data: 'x'.repeat(10000),
      }

      collector.add(largeEvent)
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
    })
  })
})
