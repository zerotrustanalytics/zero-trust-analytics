(function() {
  'use strict';

  // Zero Trust Analytics - Privacy-focused tracking with Google Analytics parity
  var ZTA = window.ZTA || {};

  // Configuration
  ZTA.config = {
    endpoint: null,
    siteId: null,
    debug: false,
    trackScrollDepth: true,
    trackOutboundLinks: true,
    trackFileDownloads: true,
    trackFormSubmissions: true,
    heartbeatInterval: 60000 // 60 seconds for real-time (reduced to avoid rate limits)
  };

  // Session state
  ZTA.session = {
    id: null,
    startTime: null,
    pageCount: 0,
    isNew: true,
    landingPage: null
  };

  // Page state
  ZTA.page = {
    startTime: null,
    maxScrollDepth: 0,
    scrollMilestones: { 25: false, 50: false, 75: false, 100: false }
  };

  // Initialize with site ID
  ZTA.init = function(siteId, options) {
    options = options || {};
    ZTA.config.siteId = siteId;
    ZTA.config.endpoint = options.endpoint || 'https://ztas.io/api/track';
    ZTA.config.debug = options.debug || false;
    ZTA.config.trackScrollDepth = options.trackScrollDepth !== false;
    ZTA.config.trackOutboundLinks = options.trackOutboundLinks !== false;
    ZTA.config.trackFileDownloads = options.trackFileDownloads !== false;
    ZTA.config.trackFormSubmissions = options.trackFormSubmissions !== false;

    // Initialize session
    ZTA.initSession();

    // Record page start time
    ZTA.page.startTime = Date.now();

    // Auto-track page view on init
    if (options.autoTrack !== false) {
      ZTA.trackPageView();
    }

    // Track on navigation (SPA support)
    if (options.spa) {
      ZTA.setupSPATracking();
    }

    // Setup engagement tracking
    ZTA.setupEngagementTracking();

    // Setup scroll depth tracking
    if (ZTA.config.trackScrollDepth) {
      ZTA.setupScrollTracking();
    }

    // Setup outbound link tracking
    if (ZTA.config.trackOutboundLinks) {
      ZTA.setupOutboundLinkTracking();
    }

    // Setup file download tracking
    if (ZTA.config.trackFileDownloads) {
      ZTA.setupFileDownloadTracking();
    }

    // Setup form submission tracking
    if (ZTA.config.trackFormSubmissions) {
      ZTA.setupFormTracking();
    }

    // Setup declarative tracking (data-zta-track attributes)
    ZTA.setupDeclarativeTracking();

    // Setup heartbeat for real-time
    ZTA.setupHeartbeat();

    ZTA.log('Initialized with site ID:', siteId);
  };

  // Initialize or restore session
  ZTA.initSession = function() {
    var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    var stored = null;

    try {
      stored = JSON.parse(sessionStorage.getItem('zta_session'));
    } catch (e) {}

    var now = Date.now();

    if (stored && (now - stored.lastActivity) < SESSION_TIMEOUT) {
      // Restore existing session
      ZTA.session.id = stored.id;
      ZTA.session.startTime = stored.startTime;
      ZTA.session.pageCount = stored.pageCount;
      ZTA.session.landingPage = stored.landingPage;
      ZTA.session.isNew = false;
    } else {
      // Create new session
      ZTA.session.id = ZTA.generateId();
      ZTA.session.startTime = now;
      ZTA.session.pageCount = 0;
      ZTA.session.landingPage = window.location.pathname;
      ZTA.session.isNew = true;
    }

    // Check if returning visitor
    var visitorId = localStorage.getItem('zta_visitor');
    if (!visitorId) {
      visitorId = ZTA.generateId();
      localStorage.setItem('zta_visitor', visitorId);
      ZTA.session.isNewVisitor = true;
    } else {
      ZTA.session.isNewVisitor = false;
    }
    ZTA.session.visitorId = visitorId;

    // Increment page count
    ZTA.session.pageCount++;

    // Save session
    ZTA.saveSession();
  };

  // Save session to sessionStorage
  ZTA.saveSession = function() {
    try {
      sessionStorage.setItem('zta_session', JSON.stringify({
        id: ZTA.session.id,
        startTime: ZTA.session.startTime,
        pageCount: ZTA.session.pageCount,
        landingPage: ZTA.session.landingPage,
        lastActivity: Date.now()
      }));
    } catch (e) {}
  };

  // Generate unique ID
  ZTA.generateId = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Get page load performance metrics (anonymized)
  ZTA.getPerformanceMetrics = function() {
    if (!window.performance || !window.performance.timing) {
      return null;
    }

    var timing = window.performance.timing;
    var navigationStart = timing.navigationStart;

    // Only collect timing metrics, no fingerprinting data
    return {
      // Page load time (total time from navigation start to load complete)
      pageLoadTime: timing.loadEventEnd > 0 ? timing.loadEventEnd - navigationStart : null,
      // DOM content loaded time
      domContentLoaded: timing.domContentLoadedEventEnd > 0 ? timing.domContentLoadedEventEnd - navigationStart : null,
      // DNS lookup time
      dnsTime: timing.domainLookupEnd - timing.domainLookupStart,
      // TCP connection time
      connectTime: timing.connectEnd - timing.connectStart,
      // Time to first byte (server response time)
      ttfb: timing.responseStart - timing.requestStart,
      // DOM processing time
      domProcessing: timing.domComplete - timing.domLoading
    };
  };

  // Get device info
  ZTA.getDeviceInfo = function() {
    var ua = navigator.userAgent;

    // Device type
    var deviceType = 'desktop';
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      deviceType = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
      deviceType = 'mobile';
    }

    // Browser detection
    var browser = 'Unknown';
    var browserVersion = '';
    if (/firefox/i.test(ua)) {
      browser = 'Firefox';
      browserVersion = (ua.match(/firefox\/(\d+)/i) || [])[1] || '';
    } else if (/edg/i.test(ua)) {
      browser = 'Edge';
      browserVersion = (ua.match(/edg\/(\d+)/i) || [])[1] || '';
    } else if (/chrome/i.test(ua)) {
      browser = 'Chrome';
      browserVersion = (ua.match(/chrome\/(\d+)/i) || [])[1] || '';
    } else if (/safari/i.test(ua)) {
      browser = 'Safari';
      browserVersion = (ua.match(/version\/(\d+)/i) || [])[1] || '';
    } else if (/msie|trident/i.test(ua)) {
      browser = 'IE';
      browserVersion = (ua.match(/(?:msie |rv:)(\d+)/i) || [])[1] || '';
    }

    // OS detection
    var os = 'Unknown';
    if (/windows/i.test(ua)) {
      os = 'Windows';
    } else if (/macintosh|mac os x/i.test(ua)) {
      os = 'macOS';
    } else if (/linux/i.test(ua)) {
      os = 'Linux';
    } else if (/android/i.test(ua)) {
      os = 'Android';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = 'iOS';
    }

    return {
      type: deviceType,
      browser: browser,
      browserVersion: browserVersion,
      os: os,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: navigator.language || navigator.userLanguage || 'en',
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1
    };
  };

  // Get UTM parameters
  ZTA.getUTMParams = function() {
    var params = new URLSearchParams(window.location.search);
    return {
      source: params.get('utm_source') || null,
      medium: params.get('utm_medium') || null,
      campaign: params.get('utm_campaign') || null,
      term: params.get('utm_term') || null,
      content: params.get('utm_content') || null
    };
  };

  // Categorize traffic source
  ZTA.getTrafficSource = function() {
    var referrer = document.referrer;
    if (!referrer) {
      return { type: 'direct', source: null };
    }

    try {
      var refUrl = new URL(referrer);
      var refHost = refUrl.hostname.toLowerCase();

      // Search engines
      var searchEngines = {
        'google': /google\./i,
        'bing': /bing\./i,
        'yahoo': /yahoo\./i,
        'duckduckgo': /duckduckgo\./i,
        'baidu': /baidu\./i,
        'yandex': /yandex\./i
      };

      for (var engine in searchEngines) {
        if (searchEngines[engine].test(refHost)) {
          return { type: 'organic', source: engine };
        }
      }

      // Social networks
      var socialNetworks = {
        'facebook': /facebook\.|fb\./i,
        'twitter': /twitter\.|t\.co/i,
        'x': /x\.com/i,
        'linkedin': /linkedin\./i,
        'instagram': /instagram\./i,
        'pinterest': /pinterest\./i,
        'reddit': /reddit\./i,
        'youtube': /youtube\./i,
        'tiktok': /tiktok\./i
      };

      for (var network in socialNetworks) {
        if (socialNetworks[network].test(refHost)) {
          return { type: 'social', source: network };
        }
      }

      // Check if same domain (internal)
      if (refHost === window.location.hostname) {
        return { type: 'internal', source: refHost };
      }

      // Default to referral
      return { type: 'referral', source: refHost };
    } catch (e) {
      return { type: 'referral', source: referrer };
    }
  };

  // Track a page view
  ZTA.trackPageView = function(customData) {
    var device = ZTA.getDeviceInfo();
    var utm = ZTA.getUTMParams();
    var traffic = ZTA.getTrafficSource();

    var data = {
      type: 'pageview',
      siteId: ZTA.config.siteId,

      // Page info
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer || null,

      // Session info
      sessionId: ZTA.session.id,
      pageCount: ZTA.session.pageCount,
      landingPage: ZTA.session.landingPage,
      isNewVisitor: ZTA.session.isNewVisitor,
      isNewSession: ZTA.session.isNew && ZTA.session.pageCount === 1,

      // Device info
      device: device,

      // Traffic source
      trafficSource: traffic,

      // UTM parameters
      utm: utm,

      // Timestamp
      timestamp: new Date().toISOString()
    };

    // Merge custom data
    if (customData) {
      for (var key in customData) {
        data[key] = customData[key];
      }
    }

    ZTA.send(data);
    ZTA.saveSession();

    // Send performance metrics after page fully loads (delayed to ensure accurate timing)
    if (document.readyState === 'complete') {
      ZTA.sendPerformanceMetrics();
    } else {
      window.addEventListener('load', function() {
        // Delay slightly to ensure loadEventEnd is populated
        setTimeout(function() {
          ZTA.sendPerformanceMetrics();
        }, 100);
      });
    }
  };

  // Send performance metrics as a separate event
  ZTA.sendPerformanceMetrics = function() {
    var metrics = ZTA.getPerformanceMetrics();
    if (!metrics || metrics.pageLoadTime === null) return;

    var data = {
      type: 'event',
      siteId: ZTA.config.siteId,
      sessionId: ZTA.session.id,
      category: 'performance',
      action: 'page_load',
      label: window.location.pathname,
      value: metrics.pageLoadTime,
      properties: metrics,
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    };

    ZTA.send(data);
    ZTA.log('Performance metrics sent:', metrics);
  };

  // Track custom events (detailed)
  ZTA.trackEvent = function(category, action, label, value) {
    var data = {
      type: 'event',
      siteId: ZTA.config.siteId,
      sessionId: ZTA.session.id,
      category: category,
      action: action,
      label: label || null,
      value: value || null,
      url: window.location.href,
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    };

    ZTA.send(data);
  };

  // Simple event tracking API
  // Usage: ZTA.track('signup')
  //        ZTA.track('button_click')
  //        ZTA.track('purchase', { amount: 99, product: 'Pro Plan' })
  ZTA.track = function(eventName, properties) {
    properties = properties || {};

    var data = {
      type: 'event',
      siteId: ZTA.config.siteId,
      sessionId: ZTA.session.id,
      category: 'custom',
      action: eventName,
      label: properties.label || null,
      value: properties.value || properties.amount || null,
      properties: properties,
      url: window.location.href,
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    };

    ZTA.send(data);
    ZTA.log('Tracked event:', eventName, properties);
  };

  // Track time on page (called on page unload)
  ZTA.trackEngagement = function() {
    var timeOnPage = Math.round((Date.now() - ZTA.page.startTime) / 1000);
    var sessionDuration = Math.round((Date.now() - ZTA.session.startTime) / 1000);

    var data = {
      type: 'engagement',
      siteId: ZTA.config.siteId,
      sessionId: ZTA.session.id,
      path: window.location.pathname,
      timeOnPage: timeOnPage,
      sessionDuration: sessionDuration,
      maxScrollDepth: ZTA.page.maxScrollDepth,
      pageCount: ZTA.session.pageCount,
      isExitPage: true,
      isBounce: ZTA.session.pageCount === 1,
      timestamp: new Date().toISOString()
    };

    ZTA.send(data);
  };

  // Setup engagement tracking on page unload
  ZTA.setupEngagementTracking = function() {
    // Use both pagehide and visibilitychange for best coverage
    window.addEventListener('pagehide', function() {
      ZTA.trackEngagement();
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        ZTA.trackEngagement();
      }
    });
  };

  // Setup scroll depth tracking
  ZTA.setupScrollTracking = function() {
    var ticking = false;

    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(function() {
          var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          var docHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight;

          var scrollPercent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 100;

          if (scrollPercent > ZTA.page.maxScrollDepth) {
            ZTA.page.maxScrollDepth = scrollPercent;
          }

          // Track milestones
          var milestones = [25, 50, 75, 100];
          milestones.forEach(function(milestone) {
            if (scrollPercent >= milestone && !ZTA.page.scrollMilestones[milestone]) {
              ZTA.page.scrollMilestones[milestone] = true;
              ZTA.trackEvent('scroll', 'depth', milestone + '%', milestone);
            }
          });

          ticking = false;
        });
        ticking = true;
      }
    });
  };

  // Setup outbound link tracking
  ZTA.setupOutboundLinkTracking = function() {
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      try {
        var url = new URL(href, window.location.origin);

        // Check if external
        if (url.hostname !== window.location.hostname) {
          ZTA.trackEvent('outbound', 'click', url.hostname);
        }
      } catch (err) {
        // Invalid URL, ignore
      }
    });
  };

  // Setup file download tracking
  ZTA.setupFileDownloadTracking = function() {
    var downloadExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|exe|dmg|mp3|mp4|avi|mov|csv)$/i;

    document.addEventListener('click', function(e) {
      var link = e.target.closest('a');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      if (downloadExtensions.test(href)) {
        var filename = href.split('/').pop().split('?')[0];
        ZTA.trackEvent('download', 'file', filename);
      }
    });
  };

  // Setup form submission tracking
  ZTA.setupFormTracking = function() {
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;

      // Get form identifier (id, name, or action)
      var formId = form.id || form.name || '';
      var formAction = form.action || '';

      // Try to get a meaningful label for the form
      var formLabel = formId;
      if (!formLabel) {
        // Use action URL path
        try {
          var actionUrl = new URL(formAction, window.location.origin);
          formLabel = actionUrl.pathname;
        } catch (err) {
          formLabel = 'unknown';
        }
      }

      // Get form type based on common patterns
      var formType = 'form';
      var formClasses = (form.className || '').toLowerCase();
      var formIdLower = formId.toLowerCase();

      if (/login|signin|sign-in/i.test(formIdLower + formClasses)) {
        formType = 'login';
      } else if (/register|signup|sign-up/i.test(formIdLower + formClasses)) {
        formType = 'signup';
      } else if (/contact|message/i.test(formIdLower + formClasses)) {
        formType = 'contact';
      } else if (/subscribe|newsletter|email/i.test(formIdLower + formClasses)) {
        formType = 'subscribe';
      } else if (/search/i.test(formIdLower + formClasses)) {
        formType = 'search';
      } else if (/checkout|payment|order/i.test(formIdLower + formClasses)) {
        formType = 'checkout';
      }

      ZTA.trackEvent('form', formType, formLabel);
      ZTA.log('Form submitted:', formType, formLabel);
    });
  };

  // Setup declarative tracking via data attributes
  // Usage: <button data-zta-track="event_name" data-zta-category="campaign" data-zta-label="summer_sale">
  ZTA.setupDeclarativeTracking = function() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-zta-track]');
      if (!el) return;

      var eventName = el.getAttribute('data-zta-track');
      if (!eventName) return;

      var properties = {};
      var category = el.getAttribute('data-zta-category');
      var label = el.getAttribute('data-zta-label');
      var value = el.getAttribute('data-zta-value');

      if (category) properties.category = category;
      if (label) properties.label = label;
      if (value) properties.value = parseFloat(value) || 0;

      ZTA.track(eventName, properties);
      ZTA.log('Declarative track:', eventName, properties);
    });
  };

  // Setup heartbeat for real-time tracking
  ZTA.setupHeartbeat = function() {
    setInterval(function() {
      if (document.visibilityState === 'visible') {
        var data = {
          type: 'heartbeat',
          siteId: ZTA.config.siteId,
          sessionId: ZTA.session.id,
          path: window.location.pathname,
          timestamp: new Date().toISOString()
        };
        ZTA.send(data);
      }
    }, ZTA.config.heartbeatInterval);
  };

  // Send data to server
  ZTA.send = function(data) {
    if (!ZTA.config.siteId) {
      ZTA.log('Error: Site ID not set');
      return;
    }

    // Use fetch with keepalive for cross-origin compatibility
    // (sendBeacon has CORS issues with some browsers)
    fetch(ZTA.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      keepalive: true
    }).then(function() {
      ZTA.log('Sent:', data.type);
    }).catch(function(err) {
      ZTA.log('Send error:', err);
    });
  };

  // SPA tracking setup
  ZTA.setupSPATracking = function() {
    // Track pushState
    var originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      ZTA.onRouteChange();
    };

    // Track replaceState
    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      ZTA.onRouteChange();
    };

    // Track popstate (back/forward)
    window.addEventListener('popstate', function() {
      ZTA.onRouteChange();
    });

    ZTA.log('SPA tracking enabled');
  };

  // Handle route change in SPA
  ZTA.onRouteChange = function() {
    // Track engagement for previous page
    ZTA.trackEngagement();

    // Reset page state
    ZTA.page.startTime = Date.now();
    ZTA.page.maxScrollDepth = 0;
    ZTA.page.scrollMilestones = { 25: false, 50: false, 75: false, 100: false };

    // Increment page count
    ZTA.session.pageCount++;
    ZTA.saveSession();

    // Track new page view
    ZTA.trackPageView();
  };

  // Debug logging
  ZTA.log = function() {
    if (ZTA.config.debug && console && console.log) {
      console.log.apply(console, ['[ZTA]'].concat(Array.prototype.slice.call(arguments)));
    }
  };

  // Expose globally
  window.ZTA = ZTA;

  // Auto-init if data attributes present
  var script = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  if (script) {
    var siteId = script.getAttribute('data-site-id');
    var autoTrack = script.getAttribute('data-auto-track') !== 'false';
    var spa = script.getAttribute('data-spa') === 'true';
    var debug = script.getAttribute('data-debug') === 'true';
    var trackScroll = script.getAttribute('data-track-scroll') !== 'false';
    var trackOutbound = script.getAttribute('data-track-outbound') !== 'false';
    var trackDownloads = script.getAttribute('data-track-downloads') !== 'false';
    var trackForms = script.getAttribute('data-track-forms') !== 'false';

    if (siteId) {
      ZTA.init(siteId, {
        autoTrack: autoTrack,
        spa: spa,
        debug: debug,
        trackScrollDepth: trackScroll,
        trackOutboundLinks: trackOutbound,
        trackFileDownloads: trackDownloads,
        trackFormSubmissions: trackForms
      });
    }
  }
})();
