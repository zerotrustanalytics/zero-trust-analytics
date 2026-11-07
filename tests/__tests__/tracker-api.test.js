import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

/** Runs a tracker source file against a minimal fake browser and returns its global. */
function load(file) {
  const listeners = () => {};
  const window = {
    addEventListener: listeners,
    location: { pathname: '/category/private', search: '', hostname: 'example.org' },
    navigator: {},
  };
  const document = {
    addEventListener: listeners,
    getElementsByTagName: () => [],
    querySelectorAll: () => [],
    referrer: '',
    currentScript: null,
  };
  const sent = [];
  const fetch = (_url, options) => {
    sent.push(...JSON.parse(options.body).events);
    return Promise.resolve({ ok: true });
  };
  vm.runInNewContext(readFileSync(file, 'utf8'), {
    window, document, fetch, URLSearchParams, URL, setTimeout: () => 0, clearTimeout: () => {}, console, history: {},
    navigator: window.navigator, location: window.location,
  });
  return { window, sent };
}

describe.each(['src/analytics.js', 'src/analytics.core.js'])('%s', (file) => {
  it('exposes the documented zta global and trackPageview alias', () => {
    const { window } = load(file);
    expect(window.zta).toBe(window.ZTA);
    expect(typeof window.zta.track).toBe('function');
    expect(window.zta.trackPageview).toBe(window.zta.trackPageView);
  });
});

describe('src/analytics.js', () => {
  const init = (options = {}) => {
    const loaded = load('src/analytics.js');
    loaded.window.ZTA.init('site', { autoTrack: false, trackOutboundLinks: false, trackFileDownloads: false, trackFormSubmissions: false, ...options });
    return loaded;
  };
  const queued = (loaded) => loaded.window.ZTA.queue.events;

  it('uses the page path by default and lets callers replace it', () => {
    const loaded = init();
    loaded.window.zta.track('a');
    loaded.window.zta.track('b', { path: '/chat' });
    loaded.window.zta.trackPageview('/custom/path');
    expect(queued(loaded).map((e) => e.path)).toEqual(['/category/private', '/chat', '/custom/path']);
  });

  it('keeps a value of zero', () => {
    const loaded = init();
    loaded.window.zta.track('results', { value: 0 });
    expect(queued(loaded)[0].value).toBe(0);
  });

  it('reports engagement unless it is turned off', () => {
    const on = init();
    on.window.ZTA.trackEngagement();
    expect(queued(on).map((e) => e.type)).toEqual(['engagement']);

    const off = init({ trackEngagement: false });
    off.window.ZTA.trackEngagement();
    expect(queued(off)).toEqual([]);
  });
});
