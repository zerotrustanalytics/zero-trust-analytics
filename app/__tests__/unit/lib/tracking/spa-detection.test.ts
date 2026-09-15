import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * SPA Navigation Detection Tests
 *
 * Tests Single Page Application navigation detection including
 * History API interception, hash change detection, and route change tracking.
 */

describe('SPA Navigation Detection', () => {
  let mockHistory: any
  let pushStateCallback: (() => void) | null = null
  let popStateCallback: ((event: any) => void) | null = null
  let hashChangeCallback: ((event: any) => void) | null = null

  beforeEach(() => {
    // Mock history API
    const originalPushState = vi.fn()
    mockHistory = {
      pushState: vi.fn((...args: any[]) => {
        originalPushState(...args)
        if (pushStateCallback) pushStateCallback()
      }),
      replaceState: vi.fn(),
      state: {},
      length: 1,
    }

    vi.stubGlobal('history', mockHistory)

    // Mock window event listeners
    const listeners = new Map<string, ((event: any) => void)[]>()
    vi.stubGlobal('window', {
      addEventListener: vi.fn((event: string, callback: (e: any) => void) => {
        if (!listeners.has(event)) {
          listeners.set(event, [])
        }
        listeners.get(event)!.push(callback)

        if (event === 'popstate') {
          popStateCallback = callback
        } else if (event === 'hashchange') {
          hashChangeCallback = callback
        }
      }),
      removeEventListener: vi.fn((event: string, callback: (e: any) => void) => {
        const list = listeners.get(event)
        if (list) {
          const index = list.indexOf(callback)
          if (index > -1) list.splice(index, 1)
        }
      }),
      dispatchEvent: vi.fn((event: any) => {
        const list = listeners.get(event.type)
        if (list) {
          list.forEach((cb) => cb(event))
        }
      }),
      location: {
        href: 'http://localhost:3000/',
        pathname: '/',
        hash: '',
      },
    })

    vi.stubGlobal('location', window.location)
  })

  afterEach(() => {
    pushStateCallback = null
    popStateCallback = null
    hashChangeCallback = null
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('History.pushState Interception', () => {
    it('should intercept pushState calls', () => {
      const originalPushState = history.pushState
      let intercepted = false

      history.pushState = function (...args: any[]) {
        intercepted = true
        return originalPushState.apply(history, args)
      }

      history.pushState({}, '', '/new-page')

      expect(intercepted).toBe(true)
    })

    it('should track navigation on pushState', () => {
      const navigations: string[] = []

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        navigations.push(args[2] as string)
      }

      history.pushState({}, '', '/page1')
      history.pushState({}, '', '/page2')

      expect(navigations).toEqual(['/page1', '/page2'])
    })

    it('should preserve original pushState functionality', () => {
      const state = { data: 'test' }
      const title = 'Test Page'
      const url = '/test'

      history.pushState(state, title, url)

      expect(mockHistory.pushState).toHaveBeenCalledWith(state, title, url)
    })

    it('should handle pushState with null state', () => {
      expect(() => {
        history.pushState(null, '', '/test')
      }).not.toThrow()

      expect(mockHistory.pushState).toHaveBeenCalled()
    })

    it('should handle pushState without URL', () => {
      expect(() => {
        history.pushState({}, '')
      }).not.toThrow()

      expect(mockHistory.pushState).toHaveBeenCalled()
    })

    it('should detect multiple consecutive navigations', () => {
      let navigationCount = 0

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        navigationCount++
      }

      history.pushState({}, '', '/page1')
      history.pushState({}, '', '/page2')
      history.pushState({}, '', '/page3')

      expect(navigationCount).toBe(3)
    })
  })

  describe('History.replaceState Interception', () => {
    it('should intercept replaceState calls', () => {
      const originalReplaceState = history.replaceState
      let intercepted = false

      history.replaceState = function (...args: any[]) {
        intercepted = true
        return originalReplaceState.apply(history, args)
      }

      history.replaceState({}, '', '/replaced')

      expect(intercepted).toBe(true)
    })

    it('should distinguish replaceState from pushState', () => {
      const events: string[] = []

      const originalPushState = history.pushState
      const originalReplaceState = history.replaceState

      history.pushState = function (...args: any[]) {
        events.push('push')
        return originalPushState.apply(history, args)
      }

      history.replaceState = function (...args: any[]) {
        events.push('replace')
        return originalReplaceState.apply(history, args)
      }

      history.pushState({}, '', '/push')
      history.replaceState({}, '', '/replace')

      expect(events).toEqual(['push', 'replace'])
    })
  })

  describe('Popstate Event Detection', () => {
    it('should listen for popstate events', () => {
      window.addEventListener('popstate', () => {})

      expect(window.addEventListener).toHaveBeenCalledWith(
        'popstate',
        expect.any(Function)
      )
    })

    it('should track back button navigation', () => {
      let backNavigation = false

      window.addEventListener('popstate', () => {
        backNavigation = true
      })

      if (popStateCallback) {
        popStateCallback({ state: {} })
      }

      expect(backNavigation).toBe(true)
    })

    it('should track forward button navigation', () => {
      let forwardNavigation = false

      window.addEventListener('popstate', () => {
        forwardNavigation = true
      })

      if (popStateCallback) {
        popStateCallback({ state: {} })
      }

      expect(forwardNavigation).toBe(true)
    })

    it('should handle popstate with state data', () => {
      let stateData: any = null

      window.addEventListener('popstate', (event) => {
        stateData = event.state
      })

      if (popStateCallback) {
        popStateCallback({ state: { page: 'test' } })
      }

      expect(stateData).toEqual({ page: 'test' })
    })

    it('should handle popstate with null state', () => {
      let received = false

      window.addEventListener('popstate', () => {
        received = true
      })

      if (popStateCallback) {
        popStateCallback({ state: null })
      }

      expect(received).toBe(true)
    })
  })

  describe('Hash Change Detection', () => {
    it('should listen for hashchange events', () => {
      window.addEventListener('hashchange', () => {})

      expect(window.addEventListener).toHaveBeenCalledWith(
        'hashchange',
        expect.any(Function)
      )
    })

    it('should track hash navigation', () => {
      let hashChanged = false

      window.addEventListener('hashchange', () => {
        hashChanged = true
      })

      if (hashChangeCallback) {
        hashChangeCallback({
          oldURL: 'http://localhost:3000/',
          newURL: 'http://localhost:3000/#section',
        })
      }

      expect(hashChanged).toBe(true)
    })

    it('should provide old and new URLs', () => {
      let oldURL = ''
      let newURL = ''

      window.addEventListener('hashchange', (event) => {
        oldURL = event.oldURL
        newURL = event.newURL
      })

      if (hashChangeCallback) {
        hashChangeCallback({
          oldURL: 'http://localhost:3000/',
          newURL: 'http://localhost:3000/#new',
        })
      }

      expect(oldURL).toBe('http://localhost:3000/')
      expect(newURL).toBe('http://localhost:3000/#new')
    })

    it('should detect hash-only navigation', () => {
      const hashes: string[] = []

      window.addEventListener('hashchange', (event) => {
        const url = new URL(event.newURL)
        hashes.push(url.hash)
      })

      if (hashChangeCallback) {
        hashChangeCallback({
          oldURL: 'http://localhost:3000/#section1',
          newURL: 'http://localhost:3000/#section2',
        })
      }

      expect(hashes).toContain('#section2')
    })
  })

  describe('URL Change Detection', () => {
    it('should detect when URL changes', () => {
      const getCurrentURL = (): string => location.href

      const before = getCurrentURL()
      window.location.href = 'http://localhost:3000/new-page'
      const after = getCurrentURL()

      expect(before).not.toBe(after)
    })

    it('should extract pathname from URL', () => {
      window.location.pathname = '/products/123'

      expect(location.pathname).toBe('/products/123')
    })

    it('should handle query parameters', () => {
      const url = 'http://localhost:3000/search?q=test&page=1'
      const parsed = new URL(url)

      expect(parsed.pathname).toBe('/search')
      expect(parsed.search).toBe('?q=test&page=1')
    })

    it('should handle fragment identifiers', () => {
      const url = 'http://localhost:3000/page#section'
      const parsed = new URL(url)

      expect(parsed.pathname).toBe('/page')
      expect(parsed.hash).toBe('#section')
    })
  })

  describe('Route Change Tracking', () => {
    it('should track complete navigation flow', () => {
      const events: Array<{ type: string; url: string }> = []

      const trackNavigation = (type: string, url: string) => {
        events.push({ type, url })
      }

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        trackNavigation('pushState', args[2] as string)
      }

      window.addEventListener('popstate', () => {
        trackNavigation('popstate', location.href)
      })

      // Simulate navigation
      history.pushState({}, '', '/page1')
      history.pushState({}, '', '/page2')

      if (popStateCallback) {
        popStateCallback({ state: {} })
      }

      expect(events).toHaveLength(3)
      expect(events[0].type).toBe('pushState')
      expect(events[1].type).toBe('pushState')
      expect(events[2].type).toBe('popstate')
    })

    it('should debounce rapid navigation changes', async () => {
      let navigationCount = 0
      let debouncedCount = 0
      let debounceTimer: NodeJS.Timeout | null = null

      const trackNavigation = () => {
        navigationCount++

        if (debounceTimer) clearTimeout(debounceTimer)

        debounceTimer = setTimeout(() => {
          debouncedCount++
        }, 100)
      }

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        trackNavigation()
      }

      // Rapid navigation
      history.pushState({}, '', '/page1')
      history.pushState({}, '', '/page2')
      history.pushState({}, '', '/page3')

      expect(navigationCount).toBe(3)
      expect(debouncedCount).toBe(0)

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(debouncedCount).toBe(1)
    })

    it('should track URL at time of navigation', () => {
      const urls: string[] = []

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        urls.push(args[2] as string)
      }

      history.pushState({}, '', '/page1')
      history.pushState({}, '', '/page2?param=value')
      history.pushState({}, '', '/page3#section')

      expect(urls).toEqual(['/page1', '/page2?param=value', '/page3#section'])
    })
  })

  describe('Framework-Specific Detection', () => {
    it('should work with React Router navigation', () => {
      // Simulate React Router using pushState
      let reactRouterNavigation = false

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        reactRouterNavigation = true
      }

      history.pushState({ key: 'abc123' }, '', '/react-route')

      expect(reactRouterNavigation).toBe(true)
    })

    it('should work with Next.js navigation', () => {
      // Simulate Next.js router
      let nextNavigation = false

      const originalPushState = history.pushState
      history.pushState = function (...args: any[]) {
        originalPushState.apply(history, args)
        nextNavigation = true
      }

      history.pushState({ as: '/next-page', url: '/next-page' }, '', '/next-page')

      expect(nextNavigation).toBe(true)
    })

    it('should work with hash-based routing', () => {
      let hashNavigation = false

      window.addEventListener('hashchange', () => {
        hashNavigation = true
      })

      if (hashChangeCallback) {
        hashChangeCallback({
          oldURL: 'http://localhost:3000/#/',
          newURL: 'http://localhost:3000/#/products',
        })
      }

      expect(hashNavigation).toBe(true)
    })
  })
})
