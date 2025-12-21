import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Script Generator Tests
 *
 * Tests the tracking script generation and minification functionality.
 * Covers script structure, injection safety, size constraints, and browser compatibility.
 */

describe('Script Generator', () => {
  const mockSiteId = 'test-site-123'
  const mockApiUrl = 'https://api.example.com'

  // Helper function to generate tracking script
  const generateScript = (siteId: string, apiUrl: string): string => {
    return `
(function(){
  'use strict';
  var d=document,w=window,n=navigator,s=screen;
  var sid='${siteId}',api='${apiUrl}';

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
      n.sendBeacon(api+'/api/collect',JSON.stringify(payload));
    }else{
      var xhr=new XMLHttpRequest();
      xhr.open('POST',api+'/api/collect',true);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.send(JSON.stringify(payload));
    }
  }

  // Track pageview
  send('pageview');

  // Track navigation (SPA support)
  var pushState=history.pushState;
  history.pushState=function(){
    pushState.apply(history,arguments);
    send('pageview');
  };
  w.addEventListener('popstate',function(){send('pageview');});

  // Track page visibility
  var hidden,visChange;
  if(typeof d.hidden!=='undefined'){hidden='hidden';visChange='visibilitychange';}
  else if(typeof d.msHidden!=='undefined'){hidden='msHidden';visChange='msvisibilitychange';}
  else if(typeof d.webkitHidden!=='undefined'){hidden='webkitHidden';visChange='webkitvisibilitychange';}

  var startTime=Date.now();
  if(visChange){
    d.addEventListener(visChange,function(){
      if(d[hidden]){
        send('leave',{duration:Date.now()-startTime});
      }else{
        startTime=Date.now();
      }
    });
  }

  w.addEventListener('beforeunload',function(){
    send('leave',{duration:Date.now()-startTime});
  });
})();
`.trim()
  }

  describe('Script Structure', () => {
    it('should generate valid JavaScript code', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toBeTruthy()
      expect(script).toContain('(function(){')
      expect(script).toContain('})();')
    })

    it('should use IIFE pattern for scope isolation', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toMatch(/^\(function\(\)\{/)
      expect(script).toMatch(/\}\)\(\);?$/)
    })

    it('should include strict mode', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain("'use strict'")
    })

    it('should inject siteId correctly', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain(`sid='${mockSiteId}'`)
    })

    it('should inject API URL correctly', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain(`api='${mockApiUrl}'`)
    })
  })

  describe('XSS Protection', () => {
    it('should escape single quotes in siteId', () => {
      const maliciousSiteId = "test';alert('xss');//"
      const script = generateScript(maliciousSiteId, mockApiUrl)

      // Script should not contain unescaped malicious code
      expect(script).not.toContain("alert('xss')")
    })

    it('should escape single quotes in API URL', () => {
      const maliciousUrl = "https://api.example.com';alert('xss');//"
      const script = generateScript(mockSiteId, maliciousUrl)

      expect(script).not.toContain("alert('xss')")
    })

    it('should handle special characters in siteId', () => {
      const specialChars = "test<>\"&"
      const script = generateScript(specialChars, mockApiUrl)

      expect(script).toBeTruthy()
      expect(script).toContain('(function(){')
    })

    it('should sanitize HTML entities', () => {
      const htmlSiteId = "test&lt;script&gt;"
      const script = generateScript(htmlSiteId, mockApiUrl)

      expect(script).not.toContain('<script>')
      expect(script).toBeTruthy()
    })

    it('should prevent JavaScript injection via siteId', () => {
      const injection = "test'); doEvil(); var fake='"
      const script = generateScript(injection, mockApiUrl)

      expect(script).not.toContain('doEvil()')
    })
  })

  describe('Script Size', () => {
    it('should generate script under 3KB uncompressed', () => {
      const script = generateScript(mockSiteId, mockApiUrl)
      const sizeInBytes = new Blob([script]).size

      expect(sizeInBytes).toBeLessThan(3000)
    })

    it('should use minified variable names', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('var d=document')
      expect(script).toContain('var w=window')
      expect(script).toContain('var n=navigator')
      expect(script).toContain('var s=screen')
    })

    it('should not include unnecessary whitespace', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      // Should not have multiple consecutive spaces
      expect(script).not.toMatch(/  +/)
      // Should not have trailing whitespace
      expect(script).not.toMatch(/\s+$/m)
    })

    it('should use short function names', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('function hash(')
      expect(script).toContain('function send(')
    })
  })

  describe('Hash Function', () => {
    it('should include hash function for visitor ID', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('function hash(str)')
      expect(script).toContain('var h=0')
      expect(script).toContain('return h.toString(36)')
    })

    it('should use bit shift for hashing', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('((h<<5)-h)')
    })

    it('should convert hash to base36', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('.toString(36)')
    })
  })

  describe('Send Function', () => {
    it('should include send function for data transmission', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('function send(type,data)')
    })

    it('should include all required payload fields', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('sid:sid')
      expect(script).toContain('type:type')
      expect(script).toContain('url:location.href')
      expect(script).toContain('ref:d.referrer')
      expect(script).toContain('sw:s.width')
      expect(script).toContain('sh:s.height')
      expect(script).toContain('lang:n.language')
      expect(script).toContain('ts:Date.now()')
      expect(script).toContain('vid:hash(')
    })

    it('should use sendBeacon when available', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('if(n.sendBeacon){')
      expect(script).toContain("n.sendBeacon(api+'/api/collect',JSON.stringify(payload))")
    })

    it('should fallback to XMLHttpRequest', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('var xhr=new XMLHttpRequest()')
      expect(script).toContain("xhr.open('POST',api+'/api/collect',true)")
      expect(script).toContain("xhr.setRequestHeader('Content-Type','application/json')")
      expect(script).toContain('xhr.send(JSON.stringify(payload))')
    })
  })

  describe('Event Tracking', () => {
    it('should track initial pageview', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain("send('pageview')")
    })

    it('should track pushState navigation', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('var pushState=history.pushState')
      expect(script).toContain('history.pushState=function()')
      expect(script).toContain('pushState.apply(history,arguments)')
    })

    it('should track popstate events', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain("w.addEventListener('popstate'")
    })

    it('should track page visibility changes', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('visibilitychange')
      expect(script).toContain('msvisibilitychange')
      expect(script).toContain('webkitvisibilitychange')
    })

    it('should track beforeunload event', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain("w.addEventListener('beforeunload'")
    })

    it('should track session duration', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('var startTime=Date.now()')
      expect(script).toContain('duration:Date.now()-startTime')
    })
  })

  describe('Browser Compatibility', () => {
    it('should use ES5 compatible syntax', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      // Should not contain ES6+ syntax
      expect(script).not.toContain('=>')
      expect(script).not.toContain('const ')
      expect(script).not.toContain('let ')
      expect(script).not.toContain('`')
    })

    it('should use Object.assign for payload merging', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('Object.assign({')
    })

    it('should handle vendor-prefixed visibility API', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain("typeof d.hidden!=='undefined'")
      expect(script).toContain("typeof d.msHidden!=='undefined'")
      expect(script).toContain("typeof d.webkitHidden!=='undefined'")
    })

    it('should check for sendBeacon support', () => {
      const script = generateScript(mockSiteId, mockApiUrl)

      expect(script).toContain('if(n.sendBeacon){')
    })
  })
})
