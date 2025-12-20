import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Event Collector Tests
 *
 * Comprehensive TDD tests for event collection and batching functionality.
 * Tests event queuing, batching, retry logic, offline support, and data persistence.
 */

describe('Event Collector', () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>
  let xhrMock: any

  interface Event {
    type: string
    url?: string
    [key: string]: any
  }

  interface CollectorOptions {
    endpoint?: string
    batchSize?: number
    flushInterval?: number
    maxQueueSize?: number
    maxRetries?: number
    retryDelay?: number
    enableOfflineQueue?: boolean
  }

  /**
   * Event Collector Implementation
   */
  class EventCollector {
    private queue: Event[] = []
    private endpoint: string
    private batchSize: number
    private flushInterval: number
    private maxQueueSize: number
    private maxRetries: number
    private retryDelay: number
    private enableOfflineQueue: boolean
    private flushTimer: NodeJS.Timeout | null = null
    private failedBatches: Array<{ batch: Event[]; retryCount: number }> = []
    private isOnline: boolean = true

    constructor(options: CollectorOptions = {}) {
      this.endpoint = options.endpoint || '/api/collect'
      this.batchSize = options.batchSize || 10
      this.flushInterval = options.flushInterval || 5000
      this.maxQueueSize = options.maxQueueSize || 100
      this.maxRetries = options.maxRetries || 3
      this.retryDelay = options.retryDelay || 1000
      this.enableOfflineQueue = options.enableOfflineQueue !== false

      this.setupOnlineListener()
    }

    private setupOnlineListener(): void {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          this.isOnline = true
          this.retryFailedBatches()
        })

        window.addEventListener('offline', () => {
          this.isOnline = false
        })
      }
    }

    add(event: Event): boolean {
      if (this.queue.length >= this.maxQueueSize) {
        return false
      }

      this.queue.push({
        ...event,
        _queued: Date.now(),
      })

      if (this.queue.length >= this.batchSize) {
        this.flush()
      } else if (!this.flushTimer) {
        this.startFlushTimer()
      }

      return true
    }

    flush(): void {
      if (this.queue.length === 0) return

      const batch = this.queue.splice(0, this.batchSize)

      if (this.isOnline || !this.enableOfflineQueue) {
        this.send(batch)
      } else {
        this.failedBatches.push({ batch, retryCount: 0 })
      }

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

    private send(batch: Event[], isRetry: boolean = false): void {
      const payload = JSON.stringify(batch)

      try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const success = navigator.sendBeacon(this.endpoint, payload)
          if (!success && !isRetry) {
            this.failedBatches.push({ batch, retryCount: 0 })
          }
        } else {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', this.endpoint, true)
          xhr.setRequestHeader('Content-Type', 'application/json')

          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              if (!isRetry) {
                this.failedBatches.push({ batch, retryCount: 0 })
              }
            }
          }

          xhr.onerror = () => {
            if (!isRetry) {
              this.failedBatches.push({ batch, retryCount: 0 })
            }
          }

          xhr.send(payload)
        }
      } catch (error) {
        if (!isRetry) {
          this.failedBatches.push({ batch, retryCount: 0 })
        }
      }
    }

    private retryFailedBatches(): void {
      const batches = [...this.failedBatches]
      this.failedBatches = []

      batches.forEach(({ batch, retryCount }) => {
        if (retryCount < this.maxRetries) {
          setTimeout(() => {
            this.send(batch, true)
          }, this.retryDelay * (retryCount + 1))

          this.failedBatches.push({ batch, retryCount: retryCount + 1 })
        }
      })
    }

    getQueueLength(): number {
      return this.queue.length
    }

    getFailedBatchesCount(): number {
      return this.failedBatches.length
    }

    clear(): void {
      this.queue = []
      this.failedBatches = []
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
    }

    setOnlineStatus(online: boolean): void {
      this.isOnline = online
      if (online) {
        this.retryFailedBatches()
      }
    }
  }

  beforeEach(() => {
    sendBeaconMock = vi.fn(() => true)
    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      onload: null,
      onerror: null,
      status: 200,
    }

    vi.stubGlobal('navigator', {
      sendBeacon: sendBeaconMock,
    })

    vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      const collector = new EventCollector()

      expect(collector.getQueueLength()).toBe(0)
    })

    it('should accept custom endpoint', () => {
      const collector = new EventCollector({ endpoint: '/custom/endpoint' })

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalledWith(
        '/custom/endpoint',
        expect.any(String)
      )
    })

    it('should accept custom batch size', () => {
      const collector = new EventCollector({ batchSize: 5 })

      for (let i = 0; i < 4; i++) {
        collector.add({ type: 'pageview' })
      }
      expect(sendBeaconMock).not.toHaveBeenCalled()

      collector.add({ type: 'pageview' })
      expect(sendBeaconMock).toHaveBeenCalled()
    })

    it('should accept custom flush interval', async () => {
      const collector = new EventCollector({ flushInterval: 100 })

      collector.add({ type: 'pageview' })
      expect(sendBeaconMock).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(sendBeaconMock).toHaveBeenCalled()

      collector.clear()
    })

    it('should accept custom max queue size', () => {
      const collector = new EventCollector({ maxQueueSize: 5 })

      for (let i = 0; i < 5; i++) {
        expect(collector.add({ type: 'pageview' })).toBe(true)
      }

      expect(collector.add({ type: 'pageview' })).toBe(false)
    })

    it('should initialize with online status', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
    })
  })

  describe('Event Queuing', () => {
    it('should add event to queue', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview', url: '/test' })

      expect(collector.getQueueLength()).toBe(1)
    })

    it('should add multiple events', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview', url: '/1' })
      collector.add({ type: 'pageview', url: '/2' })
      collector.add({ type: 'pageview', url: '/3' })

      expect(collector.getQueueLength()).toBe(3)
    })

    it('should add timestamp to events', () => {
      const collector = new EventCollector()
      const beforeTime = Date.now()

      collector.add({ type: 'pageview' })
      collector.flush()

      const afterTime = Date.now()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0]._queued).toBeGreaterThanOrEqual(beforeTime)
      expect(payload[0]._queued).toBeLessThanOrEqual(afterTime)
    })

    it('should preserve event data', () => {
      const collector = new EventCollector()
      const event = {
        type: 'click',
        target: 'button',
        text: 'Click Me',
        value: 42,
      }

      collector.add(event)
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload[0].type).toBe('click')
      expect(payload[0].target).toBe('button')
      expect(payload[0].text).toBe('Click Me')
      expect(payload[0].value).toBe(42)
    })

    it('should reject events when queue is full', () => {
      const collector = new EventCollector({ maxQueueSize: 3 })

      expect(collector.add({ type: 'pageview' })).toBe(true)
      expect(collector.add({ type: 'pageview' })).toBe(true)
      expect(collector.add({ type: 'pageview' })).toBe(true)
      expect(collector.add({ type: 'pageview' })).toBe(false)
    })

    it('should return true for successful add', () => {
      const collector = new EventCollector()

      const result = collector.add({ type: 'pageview' })

      expect(result).toBe(true)
    })
  })

  describe('Batching', () => {
    it('should auto-flush when batch size reached', () => {
      const collector = new EventCollector({ batchSize: 3 })

      collector.add({ type: 'pageview', url: '/1' })
      collector.add({ type: 'pageview', url: '/2' })
      expect(sendBeaconMock).not.toHaveBeenCalled()

      collector.add({ type: 'pageview', url: '/3' })
      expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    })

    it('should send correct batch size', () => {
      const collector = new EventCollector({ batchSize: 5 })

      for (let i = 0; i < 7; i++) {
        collector.add({ type: 'pageview', url: `/${i}` })
      }

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(payload).toHaveLength(5)
    })

    it('should keep remaining events in queue', () => {
      const collector = new EventCollector({ batchSize: 3 })

      for (let i = 0; i < 5; i++) {
        collector.add({ type: 'pageview' })
      }

      expect(collector.getQueueLength()).toBe(2)
    })

    it('should send events as JSON array', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview', url: '/1' })
      collector.add({ type: 'pageview', url: '/2' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = JSON.parse(sendBeaconMock.mock.calls[0][1])
      expect(Array.isArray(payload)).toBe(true)
    })

    it('should send to configured endpoint', () => {
      const collector = new EventCollector({ endpoint: '/api/events' })

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalledWith(
        '/api/events',
        expect.any(String)
      )
    })
  })

  describe('Flush Timer', () => {
    it('should flush after interval', async () => {
      const collector = new EventCollector({
        batchSize: 10,
        flushInterval: 100,
      })

      collector.add({ type: 'pageview' })
      expect(sendBeaconMock).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(sendBeaconMock).toHaveBeenCalled()
      collector.clear()
    })

    it('should respect custom interval', async () => {
      const collector = new EventCollector({
        batchSize: 10,
        flushInterval: 50,
      })

      collector.add({ type: 'pageview' })

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(sendBeaconMock).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(sendBeaconMock).toHaveBeenCalled()

      collector.clear()
    })

    it('should clear timer on manual flush', async () => {
      const collector = new EventCollector({ flushInterval: 100 })

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      collector.clear()
    })

    it('should restart timer if events remain', async () => {
      const collector = new EventCollector({
        batchSize: 2,
        flushInterval: 100,
      })

      collector.add({ type: 'pageview' })
      collector.add({ type: 'pageview' })
      collector.add({ type: 'pageview' })

      expect(sendBeaconMock).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(sendBeaconMock).toHaveBeenCalledTimes(2)
      collector.clear()
    })
  })

  describe('Send Beacon', () => {
    it('should use sendBeacon when available', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      expect(xhrMock.open).not.toHaveBeenCalled()
    })

    it('should send JSON payload', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview', url: '/test' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
      const payload = sendBeaconMock.mock.calls[0][1]
      expect(() => JSON.parse(payload)).not.toThrow()
    })

    it('should handle sendBeacon failure', () => {
      sendBeaconMock.mockReturnValueOnce(false)

      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(collector.getFailedBatchesCount()).toBe(1)
    })
  })

  describe('XMLHttpRequest Fallback', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        sendBeacon: undefined,
      })
    })

    it('should use XHR when sendBeacon unavailable', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.open).toHaveBeenCalled()
      expect(xhrMock.send).toHaveBeenCalled()
    })

    it('should use POST method', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.open).toHaveBeenCalledWith(
        'POST',
        '/api/collect',
        true
      )
    })

    it('should set Content-Type header', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.setRequestHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json'
      )
    })

    it('should send JSON payload', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.flush()

      expect(xhrMock.send).toHaveBeenCalled()
      const payload = xhrMock.send.mock.calls[0][0]
      expect(() => JSON.parse(payload)).not.toThrow()
    })
  })

  describe('Offline Support', () => {
    it('should queue events when offline', () => {
      const collector = new EventCollector({ enableOfflineQueue: true })

      collector.setOnlineStatus(false)
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).not.toHaveBeenCalled()
      expect(collector.getFailedBatchesCount()).toBe(1)
    })

    it('should retry when back online', () => {
      const collector = new EventCollector({ enableOfflineQueue: true })

      collector.setOnlineStatus(false)
      collector.add({ type: 'pageview' })
      collector.flush()

      collector.setOnlineStatus(true)

      expect(collector.getFailedBatchesCount()).toBeGreaterThan(0)
    })

    it('should disable offline queue when configured', () => {
      const collector = new EventCollector({ enableOfflineQueue: false })

      collector.setOnlineStatus(false)
      collector.add({ type: 'pageview' })
      collector.flush()

      expect(sendBeaconMock).toHaveBeenCalled()
    })
  })

  describe('Queue Management', () => {
    it('should clear queue', () => {
      const collector = new EventCollector()

      collector.add({ type: 'pageview' })
      collector.add({ type: 'pageview' })
      collector.clear()

      expect(collector.getQueueLength()).toBe(0)
    })

    it('should clear failed batches', () => {
      const collector = new EventCollector()

      collector.setOnlineStatus(false)
      collector.add({ type: 'pageview' })
      collector.flush()

      collector.clear()

      expect(collector.getFailedBatchesCount()).toBe(0)
    })

    it('should handle empty queue flush', () => {
      const collector = new EventCollector()

      expect(() => collector.flush()).not.toThrow()
      expect(sendBeaconMock).not.toHaveBeenCalled()
    })

    it('should return correct queue length', () => {
      const collector = new EventCollector()

      expect(collector.getQueueLength()).toBe(0)

      collector.add({ type: 'pageview' })
      expect(collector.getQueueLength()).toBe(1)

      collector.add({ type: 'pageview' })
      expect(collector.getQueueLength()).toBe(2)

      collector.flush()
      expect(collector.getQueueLength()).toBe(0)
    })
  })
})
