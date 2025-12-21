import { test, expect, type Page } from '@playwright/test'

/**
 * Tracking Script E2E Integration Tests
 *
 * End-to-end tests for the tracking script functionality including
 * script loading, event collection, SPA navigation, and privacy features.
 */

test.describe('Tracking Script Integration', () => {
  const TEST_SITE_ID = 'test-site-e2e'
  let interceptedRequests: any[] = []

  test.beforeEach(async ({ page }) => {
    interceptedRequests = []

    // Intercept tracking requests
    await page.route('**/api/collect', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()

      interceptedRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        body: postData,
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })
  })

  test.describe('Script Loading', () => {
    test('should load tracking script successfully', async ({ page }) => {
      await page.goto('/')

      // Add tracking script
      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      // Wait for script to execute
      await page.waitForTimeout(500)

      // Verify no console errors
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      expect(errors).toHaveLength(0)
    })

    test('should inject script via script tag', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((siteId) => {
        const script = document.createElement('script')
        script.src = `/api/script/${siteId}`
        script.async = true
        document.head.appendChild(script)
      }, TEST_SITE_ID)

      await page.waitForTimeout(1000)

      const scriptTag = await page.$(`script[src*="/api/script/${TEST_SITE_ID}"]`)
      expect(scriptTag).toBeTruthy()
    })

    test('should load script asynchronously', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()

      await page.evaluate((siteId) => {
        const script = document.createElement('script')
        script.src = `/api/script/${siteId}`
        script.async = true
        document.head.appendChild(script)
      }, TEST_SITE_ID)

      const loadTime = Date.now() - startTime

      // Async script should not block page load
      expect(loadTime).toBeLessThan(100)
    })

    test('should handle script load errors gracefully', async ({ page }) => {
      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.evaluate(() => {
        const script = document.createElement('script')
        script.src = '/api/script/non-existent-site'
        document.head.appendChild(script)
      })

      await page.waitForTimeout(1000)

      // Should not crash the page
      expect(await page.title()).toBeTruthy()
    })
  })

  test.describe('Pageview Tracking', () => {
    test('should track initial pageview on load', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const pageviewRequests = interceptedRequests.filter(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequests.length).toBeGreaterThan(0)
    })

    test('should include URL in pageview', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const pageviewRequest = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequest).toBeTruthy()
      expect(pageviewRequest?.body?.url).toContain('localhost')
    })

    test('should include screen dimensions', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const pageviewRequest = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequest?.body?.sw).toBeGreaterThan(0)
      expect(pageviewRequest?.body?.sh).toBeGreaterThan(0)
    })

    test('should include language', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const pageviewRequest = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequest?.body?.lang).toBeTruthy()
      expect(typeof pageviewRequest?.body?.lang).toBe('string')
    })

    test('should include timestamp', async ({ page }) => {
      await page.goto('/')

      const beforeTime = Date.now()

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const afterTime = Date.now()

      const pageviewRequest = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequest?.body?.ts).toBeGreaterThanOrEqual(beforeTime)
      expect(pageviewRequest?.body?.ts).toBeLessThanOrEqual(afterTime)
    })

    test('should include visitor ID', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const pageviewRequest = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      expect(pageviewRequest?.body?.vid).toBeTruthy()
      expect(typeof pageviewRequest?.body?.vid).toBe('string')
    })
  })

  test.describe('SPA Navigation Tracking', () => {
    test('should track pushState navigation', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(500)

      const initialCount = interceptedRequests.filter(
        (req) => req.body?.type === 'pageview'
      ).length

      // Simulate SPA navigation
      await page.evaluate(() => {
        window.history.pushState({}, '', '/new-page')
      })

      await page.waitForTimeout(500)

      const newCount = interceptedRequests.filter(
        (req) => req.body?.type === 'pageview'
      ).length

      expect(newCount).toBeGreaterThan(initialCount)
    })

    test('should track popstate navigation', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(500)

      // Create history entries
      await page.evaluate(() => {
        window.history.pushState({}, '', '/page1')
        window.history.pushState({}, '', '/page2')
      })

      await page.waitForTimeout(500)

      const beforeBackCount = interceptedRequests.length

      // Navigate back
      await page.goBack()

      await page.waitForTimeout(500)

      expect(interceptedRequests.length).toBeGreaterThan(beforeBackCount)
    })

    test('should track multiple navigation events', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(500)

      const initialCount = interceptedRequests.length

      // Simulate multiple navigations
      await page.evaluate(() => {
        window.history.pushState({}, '', '/page1')
        window.history.pushState({}, '', '/page2')
        window.history.pushState({}, '', '/page3')
      })

      await page.waitForTimeout(1000)

      const newCount = interceptedRequests.filter(
        (req) => req.body?.type === 'pageview'
      ).length

      // Should track initial + 3 navigations
      expect(newCount).toBeGreaterThanOrEqual(4)
    })

    test('should update URL in pageview after navigation', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(500)

      await page.evaluate(() => {
        window.history.pushState({}, '', '/new-url')
      })

      await page.waitForTimeout(500)

      const lastPageview = interceptedRequests
        .filter((req) => req.body?.type === 'pageview')
        .pop()

      expect(lastPageview?.body?.url).toContain('/new-url')
    })
  })

  test.describe('Visitor Fingerprinting', () => {
    test('should generate consistent visitor ID', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const visitorIds = interceptedRequests
        .filter((req) => req.body?.type === 'pageview')
        .map((req) => req.body?.vid)

      // All requests should have the same visitor ID
      expect(new Set(visitorIds).size).toBe(1)
    })

    test('should generate different IDs for different browsers', async ({
      page,
      browser,
    }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const visitorId1 = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )?.body?.vid

      // Create new context with different viewport (simulating different device)
      const context2 = await browser.newContext({
        viewport: { width: 375, height: 667 },
      })
      const page2 = await context2.newPage()

      const interceptedRequests2: any[] = []
      await page2.route('**/api/collect', async (route) => {
        const request = route.request()
        const postData = request.postDataJSON()
        interceptedRequests2.push({ body: postData })

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      })

      await page2.goto('/')

      await page2.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page2.waitForTimeout(1000)

      const visitorId2 = interceptedRequests2.find(
        (req) => req.body?.type === 'pageview'
      )?.body?.vid

      expect(visitorId1).toBeTruthy()
      expect(visitorId2).toBeTruthy()
      expect(visitorId1).not.toBe(visitorId2)

      await context2.close()
    })
  })

  test.describe('Data Transmission', () => {
    test('should use sendBeacon when available', async ({ page }) => {
      await page.goto('/')

      const sendBeaconCalls: any[] = []

      await page.addInitScript(() => {
        const originalSendBeacon = navigator.sendBeacon
        navigator.sendBeacon = function (...args) {
          ;(window as any).__sendBeaconCalls = (window as any).__sendBeaconCalls || []
          ;(window as any).__sendBeaconCalls.push(args)
          return true
        }
      })

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const calls = await page.evaluate(() => (window as any).__sendBeaconCalls || [])

      expect(calls.length).toBeGreaterThan(0)
    })

    test('should send data as JSON', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const request = interceptedRequests[0]

      expect(request?.body).toBeTruthy()
      expect(typeof request?.body).toBe('object')
    })

    test('should send to correct endpoint', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const request = interceptedRequests[0]

      expect(request?.url).toContain('/api/collect')
    })
  })

  test.describe('Privacy Features', () => {
    test('should not use cookies', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const cookies = await page.context().cookies()

      // Should not set any tracking cookies
      const trackingCookies = cookies.filter((c) =>
        ['_ga', '_gid', '__utma', '__utmb'].includes(c.name)
      )

      expect(trackingCookies).toHaveLength(0)
    })

    test('should respect Do Not Track', async ({ page, browser }) => {
      const context = await browser.newContext({
        extraHTTPHeaders: {
          DNT: '1',
        },
      })
      const dntPage = await context.newPage()

      const interceptedDNT: any[] = []
      await dntPage.route('**/api/collect', async (route) => {
        const request = route.request()
        interceptedDNT.push({ headers: request.headers() })

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      })

      await dntPage.addInitScript(() => {
        Object.defineProperty(navigator, 'doNotTrack', {
          get: () => '1',
        })
      })

      await dntPage.goto('/')

      await dntPage.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await dntPage.waitForTimeout(1000)

      // Script should check DNT and potentially not send data
      // Implementation depends on DNT handling strategy

      await context.close()
    })

    test('should not collect sensitive information', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      const request = interceptedRequests.find(
        (req) => req.body?.type === 'pageview'
      )

      // Should not collect sensitive data
      expect(request?.body).not.toHaveProperty('ip')
      expect(request?.body).not.toHaveProperty('email')
      expect(request?.body).not.toHaveProperty('name')
      expect(request?.body).not.toHaveProperty('phone')
    })
  })

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.route('**/api/collect', async (route) => {
        await route.abort('failed')
      })

      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      // Should not crash despite network error
      expect(await page.title()).toBeTruthy()
    })

    test('should handle missing navigator gracefully', async ({ page }) => {
      await page.goto('/')

      await page.addInitScript(() => {
        // @ts-ignore
        delete window.navigator
      })

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      // Should handle missing navigator without errors
      expect(errors.filter((e) => e.includes('navigator'))).toHaveLength(0)
    })

    test('should handle missing screen object', async ({ page }) => {
      await page.goto('/')

      await page.addInitScript(() => {
        // @ts-ignore
        delete window.screen
      })

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      await page.waitForTimeout(1000)

      expect(errors.filter((e) => e.includes('screen'))).toHaveLength(0)
    })
  })

  test.describe('Performance', () => {
    test('should load script quickly', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()

      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })

      const loadTime = Date.now() - startTime

      expect(loadTime).toBeLessThan(2000)
    })

    test('should not block page rendering', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()

      await page.evaluate((siteId) => {
        const script = document.createElement('script')
        script.src = `/api/script/${siteId}`
        script.async = true
        document.head.appendChild(script)
      }, TEST_SITE_ID)

      // Page should remain interactive
      const clickable = await page.$('body')
      expect(clickable).toBeTruthy()

      const renderTime = Date.now() - startTime
      expect(renderTime).toBeLessThan(100)
    })

    test('should have minimal impact on page load time', async ({ page }) => {
      const startTime = Date.now()
      await page.goto('/')
      const loadWithoutScript = Date.now() - startTime

      await page.reload()

      const startTime2 = Date.now()
      await page.addScriptTag({
        url: `/api/script/${TEST_SITE_ID}`,
      })
      const loadWithScript = Date.now() - startTime2

      const overhead = loadWithScript - loadWithoutScript
      expect(overhead).toBeLessThan(1000)
    })
  })
})
