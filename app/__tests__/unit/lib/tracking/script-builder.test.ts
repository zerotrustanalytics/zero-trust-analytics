import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Script Builder Tests
 *
 * Comprehensive TDD tests for tracking script generation, optimization,
 * and customization. Tests script structure, minification, security,
 * and configuration options.
 */

describe('Script Builder', () => {
  interface ScriptOptions {
    siteId: string
    apiUrl: string
    enableSPA?: boolean
    enablePageLeave?: boolean
    enableClickTracking?: boolean
    cookieless?: boolean
    respectDNT?: boolean
    customFields?: Record<string, any>
    debug?: boolean
  }

  /**
   * Generates a tracking script with the given options
   */
  const buildScript = (options: ScriptOptions): string => {
    const {
      siteId,
      apiUrl,
      enableSPA = true,
      enablePageLeave = true,
      enableClickTracking = false,
      cookieless = true,
      respectDNT = true,
      customFields = {},
      debug = false,
    } = options

    // Escape single quotes to prevent XSS
    const escapeSingleQuote = (str: string): string => {
      return str.replace(/'/g, "\\'")
    }

    const escapedSiteId = escapeSingleQuote(siteId)
    const escapedApiUrl = escapeSingleQuote(apiUrl)

    let script = `(function(){
  'use strict';
  var d=document,w=window,n=navigator,s=screen;
  var sid='${escapedSiteId}',api='${escapedApiUrl}';
  ${debug ? "var dbg=true;" : ""}

  function hash(str){
    var h=0;for(var i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}
    return h.toString(36);
  }

  ${respectDNT ? `
  function checkDNT(){
    return n.doNotTrack==='1'||w.doNotTrack==='1';
  }` : ''}

  function send(type,data){
    ${respectDNT ? `if(checkDNT())return;` : ''}
    ${debug ? "if(dbg)console.log('ZTA:',type,data);" : ""}
    var payload=Object.assign({
      sid:sid,
      type:type,
      url:location.href,
      ref:d.referrer||'',
      sw:s.width,
      sh:s.height,
      lang:n.language,
      ts:Date.now(),
      ${cookieless ? "vid:hash(n.userAgent+s.width+s.height+n.language)" : "vid:getCookie('vid')"}
    },${JSON.stringify(customFields)},data||{});

    if(n.sendBeacon){
      n.sendBeacon(api+'/api/collect',JSON.stringify(payload));
    }else{
      var xhr=new XMLHttpRequest();
      xhr.open('POST',api+'/api/collect',true);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.send(JSON.stringify(payload));
    }
  }

  send('pageview');

  ${enableSPA ? `
  var pushState=history.pushState;
  history.pushState=function(){
    pushState.apply(history,arguments);
    send('pageview');
  };
  w.addEventListener('popstate',function(){send('pageview');});` : ''}

  ${enablePageLeave ? `
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
  });` : ''}

  ${enableClickTracking ? `
  d.addEventListener('click',function(e){
    var el=e.target;
    if(el.tagName==='A'||el.tagName==='BUTTON'){
      send('click',{
        tag:el.tagName,
        text:(el.textContent||'').substring(0,100),
        href:el.href||''
      });
    }
  });` : ''}
})();`

    return script.trim()
  }

  /**
   * Minifies the script by removing unnecessary whitespace
   */
  const minifyScript = (script: string): string => {
    return script
      .replace(/\n\s+/g, '')
      .replace(/;\s+/g, ';')
      .replace(/\{\s+/g, '{')
      .replace(/\s+\}/g, '}')
      .replace(/,\s+/g, ',')
  }

  /**
   * Calculates the size of the script in bytes
   */
  const getScriptSize = (script: string): number => {
    return new Blob([script]).size
  }

  describe('Basic Script Generation', () => {
    it('should generate a valid JavaScript script', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toBeTruthy()
      expect(script).toContain('(function(){')
      expect(script).toContain('})();')
    })

    it('should include strict mode', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain("'use strict'")
    })

    it('should inject siteId correctly', () => {
      const siteId = 'my-test-site-123'
      const script = buildScript({
        siteId,
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain(`sid='${siteId}'`)
    })

    it('should inject apiUrl correctly', () => {
      const apiUrl = 'https://api.mysite.com'
      const script = buildScript({
        siteId: 'test-site',
        apiUrl,
      })

      expect(script).toContain(`api='${apiUrl}'`)
    })

    it('should use IIFE for scope isolation', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toMatch(/^\(function\(\)\{/)
      expect(script).toMatch(/\}\)\(\);?$/)
    })

    it('should include core functions', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain('function hash(')
      expect(script).toContain('function send(')
    })

    it('should send initial pageview', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain("send('pageview')")
    })
  })

  describe('XSS Protection and Security', () => {
    it('should escape single quotes in siteId', () => {
      const script = buildScript({
        siteId: "test';alert('xss');//",
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain("\\'")
      expect(script).not.toContain("';alert('xss')")
    })

    it('should escape single quotes in apiUrl', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: "https://api.example.com';alert('xss');//",
      })

      expect(script).toContain("\\'")
      expect(script).not.toContain("';alert('xss')")
    })

    it('should handle special characters safely', () => {
      const script = buildScript({
        siteId: 'test<>"\'"&',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toBeTruthy()
      expect(script).toContain('(function(){')
    })

    it('should prevent script injection via siteId', () => {
      const script = buildScript({
        siteId: "test'); maliciousCode(); var fake=('",
        apiUrl: 'https://api.example.com',
      })

      expect(script).not.toContain('maliciousCode()')
    })

    it('should prevent script injection via apiUrl', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: "https://api.example.com'); doEvil(); var x=('",
      })

      expect(script).not.toContain('doEvil()')
    })

    it('should handle empty siteId safely', () => {
      const script = buildScript({
        siteId: '',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain("sid=''")
    })

    it('should handle empty apiUrl safely', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: '',
      })

      expect(script).toContain("api=''")
    })
  })

  describe('Feature Configuration', () => {
    it('should include SPA tracking when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableSPA: true,
      })

      expect(script).toContain('history.pushState')
      expect(script).toContain("addEventListener('popstate'")
    })

    it('should exclude SPA tracking when disabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableSPA: false,
      })

      expect(script).not.toContain('history.pushState')
      expect(script).not.toContain("addEventListener('popstate'")
    })

    it('should include page leave tracking when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enablePageLeave: true,
      })

      expect(script).toContain('visibilitychange')
      expect(script).toContain("addEventListener('beforeunload'")
    })

    it('should exclude page leave tracking when disabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enablePageLeave: false,
      })

      expect(script).not.toContain('visibilitychange')
      expect(script).not.toContain("addEventListener('beforeunload'")
    })

    it('should include click tracking when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableClickTracking: true,
      })

      expect(script).toContain("d.addEventListener('click'")
      expect(script).toContain("send('click'")
    })

    it('should exclude click tracking when disabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableClickTracking: false,
      })

      expect(script).not.toContain("d.addEventListener('click'")
    })

    it('should use cookieless tracking when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        cookieless: true,
      })

      expect(script).toContain('vid:hash(')
      expect(script).not.toContain('getCookie')
    })

    it('should include DNT check when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        respectDNT: true,
      })

      expect(script).toContain('function checkDNT()')
      expect(script).toContain('if(checkDNT())return')
    })

    it('should exclude DNT check when disabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        respectDNT: false,
      })

      expect(script).not.toContain('checkDNT')
    })
  })

  describe('Custom Fields', () => {
    it('should include custom fields in payload', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        customFields: { environment: 'production', version: '1.0.0' },
      })

      expect(script).toContain('"environment":"production"')
      expect(script).toContain('"version":"1.0.0"')
    })

    it('should handle empty custom fields', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        customFields: {},
      })

      expect(script).toContain('{}')
    })

    it('should handle multiple custom fields', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        customFields: {
          app: 'myapp',
          env: 'dev',
          region: 'us-east-1',
        },
      })

      expect(script).toContain('"app":"myapp"')
      expect(script).toContain('"env":"dev"')
      expect(script).toContain('"region":"us-east-1"')
    })

    it('should handle custom fields with special characters', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        customFields: { message: 'Hello "World"' },
      })

      expect(script).toBeTruthy()
    })
  })

  describe('Debug Mode', () => {
    it('should include debug logging when enabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        debug: true,
      })

      expect(script).toContain('var dbg=true')
      expect(script).toContain("console.log('ZTA:'")
    })

    it('should exclude debug logging when disabled', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        debug: false,
      })

      expect(script).not.toContain('dbg')
      expect(script).not.toContain('console.log')
    })
  })

  describe('Script Minification', () => {
    it('should minify script successfully', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      const minified = minifyScript(script)

      expect(minified.length).toBeLessThan(script.length)
    })

    it('should remove unnecessary whitespace', () => {
      const script = `var x = 1;
      var y = 2;
      function test() {
        return x + y;
      }`

      const minified = minifyScript(script)

      expect(minified).not.toContain('\n')
      expect(minified).not.toMatch(/  +/)
    })

    it('should maintain script functionality after minification', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      const minified = minifyScript(script)

      expect(minified).toContain('(function(){')
      expect(minified).toContain('})();')
      expect(minified).toContain("send('pageview')")
    })
  })

  describe('Script Size Optimization', () => {
    it('should generate script under 5KB', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      const size = getScriptSize(script)
      expect(size).toBeLessThan(5000)
    })

    it('should be smaller with minification', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      const minified = minifyScript(script)

      const originalSize = getScriptSize(script)
      const minifiedSize = getScriptSize(minified)

      expect(minifiedSize).toBeLessThan(originalSize)
    })

    it('should be compact with minimal features', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableSPA: false,
        enablePageLeave: false,
        enableClickTracking: false,
      })

      const size = getScriptSize(script)
      expect(size).toBeLessThan(2000)
    })

    it('should increase size with more features', () => {
      const minimal = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableSPA: false,
        enablePageLeave: false,
        enableClickTracking: false,
      })

      const full = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
        enableSPA: true,
        enablePageLeave: true,
        enableClickTracking: true,
        debug: true,
      })

      const minimalSize = getScriptSize(minimal)
      const fullSize = getScriptSize(full)

      expect(fullSize).toBeGreaterThan(minimalSize)
    })
  })

  describe('Browser Compatibility', () => {
    it('should use ES5 compatible syntax', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).not.toContain('=>')
      expect(script).not.toContain('const ')
      expect(script).not.toContain('let ')
      expect(script).not.toContain('`')
    })

    it('should use var declarations', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain('var d=')
      expect(script).toContain('var w=')
      expect(script).toContain('var n=')
      expect(script).toContain('var s=')
    })

    it('should use Object.assign for merging', () => {
      const script = buildScript({
        siteId: 'test-site',
        apiUrl: 'https://api.example.com',
      })

      expect(script).toContain('Object.assign(')
    })
  })
})
