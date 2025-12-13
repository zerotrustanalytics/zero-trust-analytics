(function() {
  'use strict';

  var ZTA = window.ZTA || {};
  var cfg = {
    endpoint: null,
    siteId: null,
    debug: false
  };

  var session = {
    id: null,
    startTime: null,
    pageCount: 0,
    visitorId: null
  };

  var queue = {
    events: [],
    timer: null
  };

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function initSession() {
    var TIMEOUT = 1800000; // 30 min
    var stored = null;
    var now = Date.now();

    try {
      stored = JSON.parse(sessionStorage.getItem('zta_session'));
    } catch (e) {}

    if (stored && (now - stored.lastActivity) < TIMEOUT) {
      session.id = stored.id;
      session.startTime = stored.startTime;
      session.pageCount = stored.pageCount;
    } else {
      session.id = generateId();
      session.startTime = now;
      session.pageCount = 0;
    }

    var visitorId = localStorage.getItem('zta_visitor');
    if (!visitorId) {
      visitorId = generateId();
      localStorage.setItem('zta_visitor', visitorId);
    }
    session.visitorId = visitorId;
    session.pageCount++;

    try {
      sessionStorage.setItem('zta_session', JSON.stringify({
        id: session.id,
        startTime: session.startTime,
        pageCount: session.pageCount,
        lastActivity: now
      }));
    } catch (e) {}
  }

  function getDevice() {
    var ua = navigator.userAgent;
    var type = 'desktop';
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      type = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
      type = 'mobile';
    }

    var browser = 'Unknown';
    if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua)) browser = 'Safari';

    var os = 'Unknown';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/mac/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad/i.test(ua)) os = 'iOS';

    return {
      type: type,
      browser: browser,
      os: os,
      width: window.innerWidth,
      height: window.innerHeight,
      lang: navigator.language || 'en'
    };
  }

  function getSource() {
    var ref = document.referrer;
    if (!ref) return { type: 'direct', source: null };

    try {
      var refHost = new URL(ref).hostname.toLowerCase();

      if (/google\./i.test(refHost)) return { type: 'organic', source: 'google' };
      if (/bing\./i.test(refHost)) return { type: 'organic', source: 'bing' };
      if (/facebook\.|fb\./i.test(refHost)) return { type: 'social', source: 'facebook' };
      if (/twitter\.|t\.co|x\.com/i.test(refHost)) return { type: 'social', source: 'twitter' };
      if (/linkedin\./i.test(refHost)) return { type: 'social', source: 'linkedin' };

      if (refHost === window.location.hostname) return { type: 'internal', source: refHost };

      return { type: 'referral', source: refHost };
    } catch (e) {
      return { type: 'referral', source: ref };
    }
  }

  function send(data) {
    if (!cfg.siteId) return;

    queue.events.push(data);

    if (queue.events.length >= 10) {
      flush();
    } else {
      if (queue.timer) clearTimeout(queue.timer);
      queue.timer = setTimeout(flush, 5000);
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

    fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch: true,
        siteId: cfg.siteId,
        events: events
      }),
      keepalive: true
    }).catch(function(err) {
      if (cfg.debug) console.log('[ZTA] Error:', err);
    });
  }

  ZTA.init = function(siteId, options) {
    options = options || {};
    cfg.siteId = siteId;
    cfg.endpoint = options.endpoint || 'https://ztas.io/api/track';
    cfg.debug = options.debug || false;

    initSession();

    if (options.autoTrack !== false) {
      ZTA.trackPageView();
    }

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') flush();
    });

    if (cfg.debug) console.log('[ZTA] Initialized:', siteId);
  };

  ZTA.trackPageView = function(customData) {
    var params = new URLSearchParams(window.location.search);
    var data = {
      type: 'pageview',
      siteId: cfg.siteId,
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer || null,
      sessionId: session.id,
      visitorId: session.visitorId,
      pageCount: session.pageCount,
      device: getDevice(),
      source: getSource(),
      utm: {
        source: params.get('utm_source'),
        medium: params.get('utm_medium'),
        campaign: params.get('utm_campaign')
      },
      timestamp: new Date().toISOString()
    };

    if (customData) {
      for (var key in customData) {
        data[key] = customData[key];
      }
    }

    send(data);
  };

  ZTA.track = function(eventName, properties) {
    properties = properties || {};
    send({
      type: 'event',
      siteId: cfg.siteId,
      sessionId: session.id,
      visitorId: session.visitorId,
      category: 'custom',
      action: eventName,
      label: properties.label || null,
      value: properties.value || properties.amount || null,
      properties: properties,
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    });
  };

  ZTA.trackEvent = function(category, action, label, value) {
    send({
      type: 'event',
      siteId: cfg.siteId,
      sessionId: session.id,
      visitorId: session.visitorId,
      category: category,
      action: action,
      label: label || null,
      value: value || null,
      path: window.location.pathname,
      timestamp: new Date().toISOString()
    });
  };

  window.ZTA = ZTA;

  // Auto-init
  var script = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  if (script) {
    var siteId = script.getAttribute('data-site-id');
    if (siteId) {
      ZTA.init(siteId, {
        autoTrack: script.getAttribute('data-auto-track') !== 'false',
        debug: script.getAttribute('data-debug') === 'true'
      });
    }
  }
})();
