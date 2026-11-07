import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from '@jest/globals';

// CI runs Jest from netlify/functions, so paths can't be relative to the working directory.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  vm.runInNewContext(readFileSync(path.join(repoRoot, file), 'utf8'), {
    window, document, fetch, URLSearchParams, URL, setTimeout: () => 0, clearTimeout: () => {}, console, history: {},
    navigator: window.navigator, location: window.location,
  });
  return { window, sent };
}

describe.each(['src/analytics.js', 'src/analytics.core.js'])('%s', (file) => {
  it('does not define window.zta, which would wake up guarded snippets on existing sites', () => {
    const { window } = load(file);
    expect(window.zta).toBeUndefined();
    expect(typeof window.ZTA.track).toBe('function');
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
    loaded.window.ZTA.track('a');
    loaded.window.ZTA.track('b', { path: '/chat' });
    loaded.window.ZTA.trackPageView('/custom/path');
    expect(queued(loaded).map((e) => e.path)).toEqual(['/category/private', '/chat', '/custom/path']);
  });

  it('ignores a page view argument that is not a path', () => {
    const loaded = init();
    loaded.window.ZTA.trackPageView({ section: 'blog' });
    loaded.window.ZTA.trackPageView({ type: 'popstate' });
    expect(queued(loaded).map((e) => e.path)).toEqual(['/category/private', '/category/private']);
  });

  it('reports engagement against the page view path it was given', () => {
    const loaded = init();
    loaded.window.ZTA.trackPageView('/chat');
    loaded.window.ZTA.trackEngagement();
    expect(queued(loaded).at(-1)).toMatchObject({ type: 'engagement', path: '/chat' });
  });

  it('keeps a value of zero', () => {
    const loaded = init();
    loaded.window.ZTA.track('results', { value: 0 });
    expect(queued(loaded)[0].value).toBe(0);
  });

  it('falls back to amount when value is empty, and otherwise keeps value', () => {
    const loaded = init();
    for (const value of [null, '', undefined]) loaded.window.ZTA.track('buy', { value, amount: 9 });
    loaded.window.ZTA.track('buy', { value: 5, amount: 9 });
    expect(queued(loaded).map((e) => e.value)).toEqual([9, 9, 9, 5]);
  });

  it('does not report the real path when history updates on a page with a custom path', () => {
    const loaded = init();
    loaded.window.ZTA.trackPageView('/chat');
    const before = queued(loaded).length;
    loaded.window.ZTA.onRouteChange();
    expect(queued(loaded).length).toBe(before);
    expect(queued(loaded).map((e) => e.path)).not.toContain('/category/private');
  });

  it('reports a real navigation after a custom path', () => {
    const loaded = init();
    loaded.window.ZTA.trackPageView('/chat');
    loaded.window.location.pathname = '/next';
    loaded.window.ZTA.onRouteChange();
    expect(queued(loaded).at(-1)).toMatchObject({ type: 'pageview', path: '/next' });
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
