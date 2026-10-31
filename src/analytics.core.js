(function() {
  'use strict';

  // Zero Trust Analytics (core). Stores nothing on the visitor's device;
  // visitors, sessions and sampling are derived server-side.
  var ZTA = window.ZTA || {};
  var DEFAULT_API = 'https://app.ztas.io';
  var cfg = {
    endpoint: null,
    siteId: null,
    debug: false,
    sampleRate: 1.0
  };

  var queue = {
    events: [],
    timer: null
  };

  // Referrer origin only; same-site referrers omitted.
  function getReferrer() {
    if (!document.referrer) return null;
    try {
      var ref = new URL(document.referrer);
      return ref.hostname === window.location.hostname ? null : ref.origin;
    } catch (e) {
      return null;
    }
  }

  function send(data) {
    if (!cfg.siteId) return;

    queue.events.push(data);

    if (queue.events.length >= 25) {
      flush();
    } else {
      if (queue.timer) clearTimeout(queue.timer);
      queue.timer = setTimeout(flush, 15000);
    }
  }

  function flush() {
    if (queue.events.length === 0) return;

    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }

    var events = queue.events;
    queue.events = [];

    var body = {
      batch: true,
      siteId: cfg.siteId,
      events: events
    };
    if (cfg.sampleRate < 1) body.sampleRate = cfg.sampleRate;

    fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit'
    }).catch(function(err) {
      if (cfg.debug) console.log('[ZTA] Error:', err);
    });
  }

  ZTA.init = function(siteId, options) {
    options = options || {};
    cfg.siteId = siteId;
    cfg.endpoint = options.endpoint || DEFAULT_API + '/api/track';
    cfg.debug = options.debug || false;
    cfg.sampleRate = options.sampleRate !== undefined ? options.sampleRate : 1.0;

    if (options.autoTrack !== false) {
      ZTA.trackPageView();
    }

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') flush();
    });

    if (options.auto404 !== false) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', detect404OnLoad);
      } else {
        detect404OnLoad();
      }
    }

    if (cfg.debug) console.log('[ZTA] Initialized:', siteId);
  };

  ZTA.trackPageView = function() {
    var params = new URLSearchParams(window.location.search);
    send({
      type: 'pageview',
      path: window.location.pathname,
      referrer: getReferrer(),
      utm: {
        source: params.get('utm_source'),
        medium: params.get('utm_medium'),
        campaign: params.get('utm_campaign'),
        term: params.get('utm_term'),
        content: params.get('utm_content')
      }
    });
  };

  // Only `label` and `value` (or `amount`) are recorded.
  ZTA.track = function(eventName, properties) {
    properties = properties || {};
    send({
      type: 'event',
      category: properties.category || 'custom',
      action: eventName,
      label: properties.label || null,
      value: properties.value || properties.amount || null,
      path: window.location.pathname
    });
  };

  ZTA.trackEvent = function(category, action, label, value) {
    send({
      type: 'event',
      category: category,
      action: action,
      label: label || null,
      value: value || null,
      path: window.location.pathname
    });
  };

  ZTA.track404 = function(options) {
    options = options || {};
    var errorUrl = options.url || window.location.pathname;
    var referrer = options.referrer || document.referrer || null;

    var errorEndpoint = cfg.endpoint.replace('/track', '/errors');

    fetch(errorEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: cfg.siteId,
        type: '404',
        url: errorUrl,
        referrer: referrer,
        user_agent: navigator.userAgent
      }),
      keepalive: true
    }).catch(function(err) {
      if (cfg.debug) console.log('[ZTA] 404 tracking error:', err);
    });
  };

  ZTA.trackError = function(type, options) {
    options = options || {};
    var errorUrl = options.url || window.location.pathname;

    var errorEndpoint = cfg.endpoint.replace('/track', '/errors');

    fetch(errorEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: cfg.siteId,
        type: type,
        url: errorUrl,
        referrer: options.referrer || document.referrer || null,
        user_agent: navigator.userAgent,
        message: options.message || null,
        stack: options.stack || null,
        metadata: options.metadata || null
      }),
      keepalive: true
    }).catch(function(err) {
      if (cfg.debug) console.log('[ZTA] Error tracking error:', err);
    });
  };

  function auto404Detection() {
    var indicators = [
      function() {
        var title = document.title.toLowerCase();
        return title.includes('404') || title.includes('not found') || title.includes('page not found');
      },
      function() {
        var h1 = document.querySelector('h1');
        if (h1) {
          var text = h1.textContent.toLowerCase();
          return text.includes('404') || text.includes('not found');
        }
        return false;
      },
      function() {
        var body = document.body;
        if (body) {
          var classes = body.className.toLowerCase();
          return classes.includes('error-404') || classes.includes('not-found') || classes.includes('page-not-found');
        }
        return false;
      },
      function() {
        var meta = document.querySelector('meta[name="prerender-status-code"]');
        if (meta) {
          return meta.getAttribute('content') === '404';
        }
        return false;
      }
    ];

    for (var i = 0; i < indicators.length; i++) {
      if (indicators[i]()) {
        return true;
      }
    }

    return false;
  }

  function detect404OnLoad() {
    if (auto404Detection()) {
      ZTA.track404();
      if (cfg.debug) console.log('[ZTA] Auto-detected 404 page');
    }
  }

  // Auto-track elements with data-zta-track attribute
  function setupAutoTrack() {
    var elements = document.querySelectorAll('[data-zta-track]');

    elements.forEach(function(el) {
      if (el._ztaTracked) return; // Already tracked
      el._ztaTracked = true;

      el.addEventListener('click', function() {
        var eventName = el.getAttribute('data-zta-track');
        var label = el.getAttribute('data-zta-label') || null;
        var category = el.getAttribute('data-zta-category') || 'click';
        var value = el.getAttribute('data-zta-value') || null;

        if (cfg.debug) {
          console.log('[ZTA] Auto-track click:', eventName, { label: label, category: category, value: value });
        }

        ZTA.trackEvent(category, eventName, label, value ? parseFloat(value) : null);
      });
    });
  }

  // Expose for manual re-scanning (useful for SPAs)
  ZTA.scanTrackElements = setupAutoTrack;

  window.ZTA = ZTA;

  // Auto-init
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
      ZTA.init(siteId, {
        endpoint: api + '/api/track',
        autoTrack: script.getAttribute('data-auto-track') !== 'false',
        debug: script.getAttribute('data-debug') === 'true',
        sampleRate: sampleRate !== null ? parseFloat(sampleRate) : 1.0
      });

      // Setup auto-tracking for data-zta-track elements
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAutoTrack);
      } else {
        setupAutoTrack();
      }
    }
  }
})();
