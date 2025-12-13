// Test that the minified script exposes the correct API
const fs = require('fs');

// Mock browser globals
global.window = global;
global.document = {
  currentScript: null,
  referrer: '',
  title: 'Test Page',
  visibilityState: 'visible',
  readyState: 'complete',
  addEventListener: () => {},
  getElementsByTagName: () => []
};
global.navigator = {
  userAgent: 'Mozilla/5.0 (test)',
  language: 'en'
};
global.screen = {
  width: 1920,
  height: 1080,
  colorDepth: 24
};
global.innerWidth = 1920;
global.innerHeight = 1080;
global.location = {
  href: 'https://example.com/test',
  pathname: '/test',
  hostname: 'example.com',
  search: ''
};
global.fetch = () => Promise.resolve();
global.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.URL = require('url').URL;
global.URLSearchParams = URLSearchParams;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// Load the minified script
const code = fs.readFileSync('./static/js/analytics.min.js', 'utf8');
eval(code);

// Test API
console.log('Testing ZTA Analytics API...\n');

const tests = [
  { name: 'ZTA object exists', check: () => typeof ZTA !== 'undefined' },
  { name: 'ZTA.init is a function', check: () => typeof ZTA.init === 'function' },
  { name: 'ZTA.track is a function', check: () => typeof ZTA.track === 'function' },
  { name: 'ZTA.trackPageView is a function', check: () => typeof ZTA.trackPageView === 'function' },
  { name: 'ZTA.trackEvent is a function', check: () => typeof ZTA.trackEvent === 'function' }
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  try {
    if (test.check()) {
      console.log('✓', test.name);
      passed++;
    } else {
      console.log('✗', test.name);
      failed++;
    }
  } catch (err) {
    console.log('✗', test.name, '-', err.message);
    failed++;
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
