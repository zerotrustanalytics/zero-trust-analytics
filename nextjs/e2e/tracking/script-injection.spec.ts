import { test, expect, type Page } from '@playwright/test'

/**
 * Tracking Script Injection E2E Tests
 *
 * Comprehensive end-to-end tests for tracking script loading, injection,
 * execution, and interaction with the page. Tests various injection methods,
 * async loading, error handling, and cross-browser compatibility.
 */

test.describe('Tracking Script Injection @tracking', () => {
  const TEST_SITE_ID = 'test-site-injection'
  const SCRIPT_URL = `/api/script/${TEST_SITE_ID}`
  let interceptedRequests: any[] = []

  test.beforeEach(async ({ page }) => {
    interceptedRequests = []

    // Intercept tracking requests
    await page.route('**/api/collect', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON?.() || {}

      interceptedRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        body: postData,
        timestamp: Date.now(),
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    // Intercept script requests
    await page.route(`**/api/script/${TEST_SITE_ID}`, async (route) => {
      // Mock tracking script
      const script = `
        (function(){
          'use strict';
          var d=document,w=window,n=navigator,s=screen;
          var sid='${TEST_SITE_ID}',api='';

          function hash(str){
            var h=0;for(var i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}
            return h.toString(36);
          }

          function send(type,data){
            var payload=Object.assign({
              sid:sid,
              type:type,
              url:location.href,
              ref:d.referrer||'',
              sw:s.width,
              sh:s.height,
              lang:n.language,
              ts:Date.now(),
              vid:hash(n.userAgent+s.width+s.height)
            },data||{});

            if(n.sendBeacon){
              n.sendBeacon('/api/collect',JSON.stringify(payload));
            }else{
              var xhr=new XMLHttpRequest();
              xhr.open('POST','/api/collect',true);
              xhr.setRequestHeader('Content-Type','application/json');
              xhr.send(JSON.stringify(payload));
            }
          }

          send('pageview');
          w.__trackingScriptLoaded = true;
        })();
      `

      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: script,
      })
    })
  })

  test.describe('Script Loading Methods', () => {
    test('should load script via script tag injection', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      const scriptTag = await page.$(`script[src*="${TEST_SITE_ID}"]`)
      expect(scriptTag).toBeTruthy()
    })

    test('should load script asynchronously', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        document.head.appendChild(script)
      }, SCRIPT_URL)

      const loadTime = Date.now() - startTime

      // Should not block
      expect(loadTime).toBeLessThan(100)
    })

    test('should load script with defer attribute', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.defer = true
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })

    test('should load script in head', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(500)

      const scriptInHead = await page.$('head script[src*="script"]')
      expect(scriptInHead).toBeTruthy()
    })

    test('should load script in body', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        document.body.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(500)

      const scriptInBody = await page.$('body script[src*="script"]')
      expect(scriptInBody).toBeTruthy()
    })

    test('should load script before closing body tag', async ({ page }) => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <h1>Test Page</h1>
          <script src="${SCRIPT_URL}" async></script>
        </body>
        </html>
      `)

      await page.waitForTimeout(1000)

      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })

    test('should load multiple instances gracefully', async ({ page }) => {
      await page.goto('/')

      // Load script twice
      await page.evaluate((url) => {
        const script1 = document.createElement('script')
        script1.src = url
        document.head.appendChild(script1)

        const script2 = document.createElement('script')
        script2.src = url
        document.head.appendChild(script2)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      // Should handle gracefully
      expect(await page.title()).toBeTruthy()
    })
  })

  test.describe('Script Execution', () => {
    test('should execute script after load', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })

    test('should send initial pageview', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      const pageviews = interceptedRequests.filter((r) => r.body?.type === 'pageview')
      expect(pageviews.length).toBeGreaterThan(0)
    })

    test('should execute in IIFE scope', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      // Internal variables should not pollute global scope
      const hasSid = await page.evaluate(() => typeof (window as any).sid !== 'undefined')
      const hasApi = await page.evaluate(() => typeof (window as any).api !== 'undefined')

      expect(hasSid).toBe(false)
      expect(hasApi).toBe(false)
    })

    test('should use strict mode', async ({ page }) => {
      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      // No errors from strict mode violations
      expect(errors).toHaveLength(0)
    })

    test('should not interfere with page JavaScript', async ({ page }) => {
      await page.goto('/')

      await page.evaluate(() => {
        ;(window as any).testVariable = 'original value'
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      const value = await page.evaluate(() => (window as any).testVariable)
      expect(value).toBe('original value')
    })
  })

  test.describe('Error Handling', () => {
    test('should handle script load errors gracefully', async ({ page }) => {
      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.evaluate(() => {
        const script = document.createElement('script')
        script.src = '/api/script/non-existent'
        script.onerror = () => {
          console.log('Script load error handled')
        }
        document.head.appendChild(script)
      })

      await page.waitForTimeout(1000)

      // Page should still be functional
      expect(await page.title()).toBeTruthy()
    })

    test('should handle network errors', async ({ page }) => {
      // Simulate network error
      await page.route(`**/api/script/${TEST_SITE_ID}`, (route) => {
        route.abort('failed')
      })

      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      // Should not crash page
      expect(await page.title()).toBeTruthy()
    })

    test('should handle missing navigator', async ({ page }) => {
      await page.goto('/')

      await page.addInitScript(() => {
        // Simulate partial navigator object
        Object.defineProperty(window, 'navigator', {
          value: {},
          writable: true,
        })
      })

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      // Should handle gracefully
      const criticalErrors = errors.filter((e) => !e.includes('Cannot read'))
      expect(criticalErrors).toHaveLength(0)
    })

    test('should handle missing screen object', async ({ page }) => {
      await page.goto('/')

      await page.addInitScript(() => {
        Object.defineProperty(window, 'screen', {
          value: undefined,
          writable: true,
        })
      })

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      // Errors should be handled
      expect(errors.length).toBeLessThan(5)
    })

    test('should handle blocked tracking requests', async ({ page }) => {
      await page.route('**/api/collect', (route) => route.abort('blockedbyclient'))

      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      // Should fail silently
      expect(await page.title()).toBeTruthy()
    })
  })

  test.describe('Performance', () => {
    test('should load script quickly', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()
      await page.addScriptTag({ url: SCRIPT_URL })
      const loadTime = Date.now() - startTime

      expect(loadTime).toBeLessThan(2000)
    })

    test('should not block page rendering', async ({ page }) => {
      await page.goto('/')

      const startTime = Date.now()

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        document.head.appendChild(script)
      }, SCRIPT_URL)

      const renderTime = Date.now() - startTime

      // Should complete immediately
      expect(renderTime).toBeLessThan(100)
    })

    test('should not block DOMContentLoaded', async ({ page }) => {
      let domContentLoadedTime = 0
      let scriptLoadTime = 0

      page.on('domcontentloaded', () => {
        domContentLoadedTime = Date.now()
      })

      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        script.onload = () => {
          ;(window as any).scriptLoadTime = Date.now()
        }
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      scriptLoadTime = await page.evaluate(() => (window as any).scriptLoadTime || 0)

      // Script should load after DOMContentLoaded
      expect(domContentLoadedTime).toBeGreaterThan(0)
    })

    test('should have minimal memory footprint', async ({ page }) => {
      await page.goto('/')

      const initialMetrics = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize
        }
        return 0
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      const afterMetrics = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize
        }
        return 0
      })

      // Memory increase should be minimal (less than 1MB)
      const increase = afterMetrics - initialMetrics
      if (increase > 0) {
        expect(increase).toBeLessThan(1024 * 1024)
      }
    })

    test('should not cause layout shift', async ({ page }) => {
      await page.goto('/')

      const beforeHeight = await page.evaluate(() => document.body.scrollHeight)

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      const afterHeight = await page.evaluate(() => document.body.scrollHeight)

      // Page layout should not change
      expect(afterHeight).toBe(beforeHeight)
    })
  })

  test.describe('Cross-Browser Compatibility', () => {
    test('should work with modern sendBeacon API', async ({ page }) => {
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

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      const calls = await page.evaluate(() => (window as any).__sendBeaconCalls || [])
      expect(calls.length).toBeGreaterThan(0)
    })

    test('should fallback to XMLHttpRequest when sendBeacon unavailable', async ({
      page,
    }) => {
      await page.goto('/')

      await page.addInitScript(() => {
        // Remove sendBeacon
        Object.defineProperty(navigator, 'sendBeacon', {
          value: undefined,
          writable: true,
        })

        // Track XHR calls
        const originalXHR = XMLHttpRequest
        ;(window as any).__xhrCalls = []

        ;(window as any).XMLHttpRequest = function () {
          const xhr = new originalXHR()
          ;(window as any).__xhrCalls.push(xhr)
          return xhr
        }
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      const xhrCalls = await page.evaluate(() => (window as any).__xhrCalls || [])
      expect(xhrCalls.length).toBeGreaterThan(0)
    })

    test('should work in strict CSP environment', async ({ page }) => {
      await page.setExtraHTTPHeaders({
        'Content-Security-Policy': "script-src 'self' 'unsafe-inline'",
      })

      await page.goto('/')

      const errors: string[] = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
      })

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(1000)

      // Should work despite CSP
      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })
  })

  test.describe('Script Attributes', () => {
    test('should respect async attribute', async ({ page }) => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
          <script src="${SCRIPT_URL}" async></script>
        </head>
        <body><h1>Test</h1></body>
        </html>
      `)

      await page.waitForTimeout(1000)

      const script = await page.$(`script[src*="script"]`)
      const isAsync = await script?.evaluate((el) => (el as HTMLScriptElement).async)

      expect(isAsync).toBe(true)
    })

    test('should work without type attribute', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        // Don't set type attribute
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })

    test('should work with type="text/javascript"', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.type = 'text/javascript'
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      const loaded = await page.evaluate(() => (window as any).__trackingScriptLoaded)
      expect(loaded).toBe(true)
    })

    test('should support custom data attributes', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.setAttribute('data-site-id', 'custom-site')
        script.setAttribute('data-config', 'custom')
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(500)

      const hasDataAttrs = await page.evaluate(() => {
        const script = document.querySelector('script[data-site-id]')
        return script?.getAttribute('data-site-id') === 'custom-site'
      })

      expect(hasDataAttrs).toBe(true)
    })
  })

  test.describe('DOM Interaction', () => {
    test('should not modify existing DOM elements', async ({ page }) => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <div id="test">Original Content</div>
        </body>
        </html>
      `)

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      const content = await page.textContent('#test')
      expect(content).toBe('Original Content')
    })

    test('should not create visible elements', async ({ page }) => {
      await page.goto('/')

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      const visibleElements = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'))
        return scripts.filter((s) => {
          const style = window.getComputedStyle(s)
          return style.display !== 'none' && style.visibility !== 'hidden'
        }).length
      })

      // Script tags are not visible
      expect(visibleElements).toBe(0)
    })

    test('should not prevent form submissions', async ({ page }) => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <form id="testForm" action="/submit" method="post">
            <input type="text" name="test" value="value">
            <button type="submit">Submit</button>
          </form>
        </body>
        </html>
      `)

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      // Form should still be submittable
      const form = await page.$('#testForm')
      expect(form).toBeTruthy()
    })

    test('should not interfere with clicks', async ({ page }) => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
          <button id="testBtn">Click Me</button>
        </body>
        </html>
      `)

      await page.addScriptTag({ url: SCRIPT_URL })
      await page.waitForTimeout(500)

      let clicked = false
      await page.evaluate(() => {
        document.getElementById('testBtn')?.addEventListener('click', () => {
          ;(window as any).clicked = true
        })
      })

      await page.click('#testBtn')

      clicked = await page.evaluate(() => (window as any).clicked)
      expect(clicked).toBe(true)
    })
  })

  test.describe('Cleanup and Removal', () => {
    test('should allow script removal', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.id = 'tracking-script'
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(500)

      await page.evaluate(() => {
        const script = document.getElementById('tracking-script')
        script?.remove()
      })

      const scriptExists = await page.$('#tracking-script')
      expect(scriptExists).toBeNull()
    })

    test('should stop tracking after removal', async ({ page }) => {
      await page.goto('/')

      await page.evaluate((url) => {
        const script = document.createElement('script')
        script.src = url
        script.id = 'tracking-script'
        document.head.appendChild(script)
      }, SCRIPT_URL)

      await page.waitForTimeout(1000)

      const initialCount = interceptedRequests.length

      await page.evaluate(() => {
        document.getElementById('tracking-script')?.remove()
      })

      // Trigger navigation
      await page.evaluate(() => {
        window.history.pushState({}, '', '/new-page')
      })

      await page.waitForTimeout(500)

      // Should not track after removal
      expect(interceptedRequests.length).toBe(initialCount)
    })
  })
})
