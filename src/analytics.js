(function() {
  'use strict';

  // Zero Trust Analytics - privacy-focused tracking.
  //
  // Stores NOTHING on the visitor's device (no cookies, localStorage or
  // sessionStorage) and sends only what the dashboard uses. Visitors, sessions
  // and sampling are all derived server-side from a daily-rotating hash.
  var ZTA = window.ZTA || {};

  var DEFAULT_API = 'https://app.ztas.io';

  // Configuration
  ZTA.config = {
    endpoint: null,
    siteId: null,
    debug: false,
    sampleRate: 1.0,              // 1.0 = 100%; applied server-side per visitor
    trackScrollMilestones: false, // Send events at 25/50/75/100% scroll depth
    trackOutboundLinks: true,
    trackFileDownloads: true,
    trackFormSubmissions: true
  };

  // Event queue for batching - reduces HTTP requests
  ZTA.queue = {
    events: [],
    timer: null,
    maxSize: 25,       // Send when queue reaches this size
    maxWait: 15000     // Or after 15 seconds
  };

  // Page state (in memory only; reset on each page / SPA route)
  ZTA.page = {
    path: null,
    startTime: null,
    viewsThisLoad: 0,
    engagementSent: false,
    scrollMilestones: { 25: false, 50: false, 75: false, 100: false }
  };

  // Initialize with site ID
  ZTA.init = function(siteId, options) {
    options = options || {};
    ZTA.config.siteId = siteId;
    ZTA.config.endpoint = options.endpoint || DEFAULT_API + '/api/track';
    ZTA.config.debug = options.debug || false;
    ZTA.config.sampleRate = options.sampleRate !== undefined ? options.sampleRate : 1.0;
    ZTA.config.trackScrollMilestones = options.trackScrollMilestones === true;
    ZTA.config.trackOutboundLinks = options.trackOutboundLinks !== false;
    ZTA.config.trackFileDownloads = options.trackFileDownloads !== false;
    ZTA.config.trackFormSubmissions = options.trackFormSubmissions !== false;

    ZTA.page.path = window.location.pathname;
    ZTA.page.startTime = Date.now();

    if (options.autoTrack !== false) {
      ZTA.trackPageView();
    }

    if (options.spa) {
      ZTA.setupSPATracking();
    }

    ZTA.setupEngagementTracking();

    if (ZTA.config.trackScrollMilestones) {
      ZTA.setupScrollTracking();
    }

    if (ZTA.config.trackOutboundLinks) {
      ZTA.setupOutboundLinkTracking();
    }

    if (ZTA.config.trackFileDownloads) {
      ZTA.setupFileDownloadTracking();
    }

    if (ZTA.config.trackFormSubmissions) {
      ZTA.setupFormTracking();
    }

    // Declarative tracking (data-zta-track attributes)
    ZTA.setupDeclarativeTracking();

    // Flush queue on page unload to ensure no events are lost
    ZTA.setupUnloadFlush();

    ZTA.log('Initialized with site ID:', siteId);
  };

  // Setup flush on page unload
  ZTA.setupUnloadFlush = function() {
    window.addEventListener('pagehide', function() {
      ZTA.flushQueue();
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        ZTA.flushQueue();
      }
    });
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

  // Referrer origin only (scheme + host) — never the path or query, which can
  // carry search terms or tokens. Same-site referrers are omitted.
  ZTA.getReferrer = function() {
    if (!document.referrer) return null;
    try {
      var ref = new URL(document.referrer);
      if (ref.hostname === window.location.hostname) return null;
      return ref.origin;
    } catch (e) {
      return null;
    }
  };

  // Track a page view
  ZTA.trackPageView = function() {
    ZTA.page.viewsThisLoad++;
    ZTA.send({
      type: 'pageview',
      path: window.location.pathname,
      referrer: ZTA.getReferrer(),
      utm: ZTA.getUTMParams()
    });
  };

  // Track custom events (detailed)
  ZTA.trackEvent = function(category, action, label, value) {
    ZTA.send({
      type: 'event',
      category: category,
      action: action,
      label: label || null,
      value: value || null,
      path: window.location.pathname
    });
  };

  // Simple event tracking API
  // Usage: ZTA.track('signup')
  //        ZTA.track('purchase', { label: 'Pro Plan', value: 99 })
  // Only `label` and `value` (or `amount`) are recorded.
  ZTA.track = function(eventName, properties) {
    properties = properties || {};
    ZTA.send({
      type: 'event',
      category: properties.category || 'custom',
      action: eventName,
      label: properties.label || null,
      value: properties.value || properties.amount || null,
      path: window.location.pathname
    });
    ZTA.log('Tracked event:', eventName, properties);
  };

  // Track time on page (called when the page is left or hidden)
  ZTA.trackEngagement = function() {
    // Prevent double-sending (pagehide + visibilitychange can both fire)
    if (ZTA.page.engagementSent) return;
    ZTA.page.engagementSent = true;

    ZTA.send({
      type: 'engagement',
      path: ZTA.page.path,
      timeOnPage: Math.round((Date.now() - ZTA.page.startTime) / 1000),
      isBounce: ZTA.page.viewsThisLoad <= 1
    });
  };

  // Setup engagement tracking on page unload
  ZTA.setupEngagementTracking = function() {
    window.addEventListener('pagehide', function() {
      ZTA.trackEngagement();
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        ZTA.trackEngagement();
      }
    });
  };

  // Scroll milestone events (opt-in: data-track-scroll="true")
  ZTA.setupScrollTracking = function() {
    var ticking = false;

    window.addEventListener('scroll', function() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function() {
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        var docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ) - window.innerHeight;
        var scrollPercent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 100;

        [25, 50, 75, 100].forEach(function(milestone) {
          if (scrollPercent >= milestone && !ZTA.page.scrollMilestones[milestone]) {
            ZTA.page.scrollMilestones[milestone] = true;
            ZTA.trackEvent('scroll', 'depth', milestone + '%', milestone);
          }
        });

        ticking = false;
      });
    });
  };

  // Setup outbound link tracking
  ZTA.setupOutboundLinkTracking = function() {
    document.addEventListener('click', function(e) {
      var link = e.target.closest && e.target.closest('a');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      try {
        var url = new URL(href, window.location.origin);
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== window.location.hostname) {
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
      var link = e.target.closest && e.target.closest('a');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      var path = href.split(/[?#]/)[0];
      if (downloadExtensions.test(path)) {
        ZTA.trackEvent('download', 'file', path.split('/').pop());
      }
    });
  };

  // Setup form submission tracking
  ZTA.setupFormTracking = function() {
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;

      // Form identifier: id, name, or the action path (never field values)
      var formId = form.id || form.getAttribute('name') || '';
      var formLabel = formId;
      if (!formLabel) {
        try {
          formLabel = new URL(form.getAttribute('action') || '', window.location.href).pathname;
        } catch (err) {
          formLabel = 'unknown';
        }
      }

      // Classify by common id/class patterns
      var hint = (formId + ' ' + (form.className || '')).toLowerCase();
      var formType = 'form';
      if (/login|signin|sign-in/.test(hint)) formType = 'login';
      else if (/register|signup|sign-up/.test(hint)) formType = 'signup';
      else if (/contact|message/.test(hint)) formType = 'contact';
      else if (/subscribe|newsletter|email/.test(hint)) formType = 'subscribe';
      else if (/search/.test(hint)) formType = 'search';
      else if (/checkout|payment|order/.test(hint)) formType = 'checkout';

      ZTA.trackEvent('form', formType, formLabel);
      ZTA.log('Form submitted:', formType, formLabel);
    });
  };

  // Declarative tracking via data attributes (one delegated listener, so
  // elements added later are covered and each click is counted once).
  // Usage: <button data-zta-track="signup" data-zta-category="cta" data-zta-label="hero" data-zta-value="1">
  ZTA.setupDeclarativeTracking = function() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest && e.target.closest('[data-zta-track]');
      if (!el) return;

      var eventName = el.getAttribute('data-zta-track');
      if (!eventName) return;

      var value = el.getAttribute('data-zta-value');
      ZTA.track(eventName, {
        category: el.getAttribute('data-zta-category') || 'click',
        label: el.getAttribute('data-zta-label') || null,
        value: value ? parseFloat(value) || 0 : null
      });
    });
  };

  // Kept for API compatibility: declarative tracking is delegated, so newly
  // added [data-zta-track] elements need no re-scan.
  ZTA.scanTrackElements = function() {};

  // Queue event for batching
  ZTA.send = function(data) {
    if (!ZTA.config.siteId) {
      ZTA.log('Error: Site ID not set');
      return;
    }

    ZTA.queue.events.push(data);
    ZTA.log('Queued:', data.type, '(queue size:', ZTA.queue.events.length + ')');

    if (ZTA.queue.events.length >= ZTA.queue.maxSize) {
      ZTA.flushQueue();
      return;
    }

    if (ZTA.queue.timer) {
      clearTimeout(ZTA.queue.timer);
    }
    ZTA.queue.timer = setTimeout(function() {
      ZTA.flushQueue();
    }, ZTA.queue.maxWait);
  };

  // Flush the event queue - send all queued events in one request
  ZTA.flushQueue = function() {
    if (ZTA.queue.events.length === 0) return;

    if (ZTA.queue.timer) {
      clearTimeout(ZTA.queue.timer);
      ZTA.queue.timer = null;
    }

    var events = ZTA.queue.events;
    ZTA.queue.events = [];

    ZTA.log('Flushing', events.length, 'events');
    ZTA.sendBatch(events);
  };

  // Send a batch of events to the server
  ZTA.sendBatch = function(events) {
    var body = {
      batch: true,
      siteId: ZTA.config.siteId,
      events: events
    };
    if (ZTA.config.sampleRate < 1) {
      body.sampleRate = ZTA.config.sampleRate;
    }

    fetch(ZTA.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit'
    }).then(function() {
      ZTA.log('Batch sent:', events.length, 'events');
    }).catch(function(err) {
      ZTA.log('Batch send error:', err);
    });
  };

  // SPA tracking: a pageview per real route change. Routers also call
  // replaceState for scroll restoration and query/hash updates; those keep the
  // same pathname and must not count as pageviews.
  ZTA.setupSPATracking = function() {
    var originalPushState = history.pushState;
    history.pushState = function() {
      var result = originalPushState.apply(history, arguments);
      ZTA.onRouteChange();
      return result;
    };

    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      var result = originalReplaceState.apply(history, arguments);
      ZTA.onRouteChange();
      return result;
    };

    window.addEventListener('popstate', function() {
      ZTA.onRouteChange();
    });

    ZTA.log('SPA tracking enabled');
  };

  // Handle route change in SPA
  ZTA.onRouteChange = function() {
    var path = window.location.pathname;
    if (path === ZTA.page.path) return;

    // Engagement for the page being left
    ZTA.trackEngagement();

    ZTA.page.path = path;
    ZTA.page.startTime = Date.now();
    ZTA.page.engagementSent = false;
    ZTA.page.scrollMilestones = { 25: false, 50: false, 75: false, 100: false };

    ZTA.trackPageView();
  };

  // Debug logging
  ZTA.log = function() {
    if (ZTA.config.debug && window.console && console.log) {
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
    var sampleRate = script.getAttribute('data-sample-rate');
    // data-api lets self-hosters point the script at their own server.
    var api = (script.getAttribute('data-api') || DEFAULT_API).replace(/\/+$/, '');

    if (siteId) {
      try {
        ZTA.init(siteId, {
          endpoint: api + '/api/track',
          autoTrack: script.getAttribute('data-auto-track') !== 'false',
          spa: script.getAttribute('data-spa') === 'true',
          debug: script.getAttribute('data-debug') === 'true',
          sampleRate: sampleRate !== null ? parseFloat(sampleRate) : 1.0,
          trackScrollMilestones: script.getAttribute('data-track-scroll') === 'true',
          trackOutboundLinks: script.getAttribute('data-track-outbound') !== 'false',
          trackFileDownloads: script.getAttribute('data-track-downloads') !== 'false',
          trackFormSubmissions: script.getAttribute('data-track-forms') !== 'false'
        });
      } catch (e) {
        // Analytics must never break the host page.
      }
    }
  }
})();
