___TERMS_OF_SERVICE___

By creating or modifying this file you agree to Google Tag Manager's Community
Template Gallery Developer Terms of Service available at
https://developers.google.com/tag-manager/gallery-tos (or such other URL as
Google may provide), as modified from time to time.


___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "displayName": "Zero Trust Analytics",
  "brand": {
    "id": "brand_dummy",
    "displayName": "Zero Trust Analytics",
    "thumbnail": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  },
  "description": "Privacy-first analytics without cookies. GDPR \u0026 CCPA compliant by design.",
  "containerContexts": [
    "WEB"
  ]
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "TEXT",
    "name": "siteId",
    "displayName": "Site ID",
    "simpleValueType": true,
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ],
    "help": "Your Zero Trust Analytics Site ID. Find this in your ZTA dashboard under Site Settings."
  },
  {
    "type": "TEXT",
    "name": "scriptUrl",
    "displayName": "Script URL (Advanced)",
    "simpleValueType": true,
    "defaultValue": "https://ztas.io/js/analytics.min.js",
    "help": "Custom script URL. Only change if self-hosting."
  },
  {
    "type": "CHECKBOX",
    "name": "trackPageviews",
    "checkboxText": "Automatically track pageviews",
    "simpleValueType": true,
    "defaultValue": true
  },
  {
    "type": "CHECKBOX",
    "name": "trackOutbound",
    "checkboxText": "Track outbound link clicks",
    "simpleValueType": true,
    "defaultValue": true
  },
  {
    "type": "CHECKBOX",
    "name": "trackDownloads",
    "checkboxText": "Track file downloads",
    "simpleValueType": true,
    "defaultValue": true
  },
  {
    "type": "CHECKBOX",
    "name": "trackForms",
    "checkboxText": "Track form submissions",
    "simpleValueType": true,
    "defaultValue": true
  },
  {
    "type": "CHECKBOX",
    "name": "trackScroll",
    "checkboxText": "Track scroll depth",
    "simpleValueType": true,
    "defaultValue": false
  },
  {
    "type": "CHECKBOX",
    "name": "track404",
    "checkboxText": "Track 404 errors",
    "simpleValueType": true,
    "defaultValue": true
  },
  {
    "type": "CHECKBOX",
    "name": "respectDNT",
    "checkboxText": "Respect Do Not Track",
    "simpleValueType": true,
    "defaultValue": false
  },
  {
    "type": "CHECKBOX",
    "name": "debug",
    "checkboxText": "Enable debug mode",
    "simpleValueType": true,
    "defaultValue": false
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const injectScript = require('injectScript');
const setInWindow = require('setInWindow');
const copyFromWindow = require('copyFromWindow');
const createQueue = require('createQueue');
const makeTableMap = require('makeTableMap');
const log = require('logToConsole');

const siteId = data.siteId;
const scriptUrl = data.scriptUrl || 'https://ztas.io/js/analytics.min.js';

// Configuration options
const config = {
  siteId: siteId,
  autoPageview: data.trackPageviews !== false,
  autoOutbound: data.trackOutbound !== false,
  autoDownloads: data.trackDownloads !== false,
  autoForms: data.trackForms !== false,
  autoScroll: data.trackScroll === true,
  auto404: data.track404 !== false,
  respectDNT: data.respectDNT === true,
  debug: data.debug === true
};

// Set configuration before script loads
setInWindow('ZTA_CONFIG', config, true);

// Inject the ZTA script
injectScript(scriptUrl, function() {
  if (data.debug) {
    log('Zero Trust Analytics loaded successfully');
  }
  data.gtmOnSuccess();
}, function() {
  log('Zero Trust Analytics failed to load');
  data.gtmOnFailure();
}, 'zta-analytics');


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://ztas.io/*"
              },
              {
                "type": 1,
                "string": "https://*.ztas.io/*"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "ZTA_CONFIG"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "zta"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "logging",
        "versionId": "1"
      },
      "param": [
        {
          "key": "environments",
          "value": {
            "type": 1,
            "string": "debug"
          }
        }
      ]
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
- name: Basic pageview tracking
  code: |
    const mockData = {
      siteId: 'test_site_123',
      trackPageviews: true,
      trackOutbound: true,
      trackDownloads: true,
      trackForms: true,
      trackScroll: false,
      track404: true,
      respectDNT: false,
      debug: false
    };

    runCode(mockData);
    assertApi('injectScript').wasCalled();
    assertApi('setInWindow').wasCalledWith('ZTA_CONFIG', {
      siteId: 'test_site_123',
      autoPageview: true,
      autoOutbound: true,
      autoDownloads: true,
      autoForms: true,
      autoScroll: false,
      auto404: true,
      respectDNT: false,
      debug: false
    }, true);

- name: Custom script URL
  code: |
    const mockData = {
      siteId: 'test_site_123',
      scriptUrl: 'https://custom.domain.com/analytics.js',
      trackPageviews: true
    };

    runCode(mockData);
    assertApi('injectScript').wasCalledWith('https://custom.domain.com/analytics.js');


___NOTES___

Zero Trust Analytics - Google Tag Manager Template

Features:
- Privacy-first analytics (no cookies, no PII)
- GDPR & CCPA compliant
- Automatic pageview tracking
- Outbound link tracking
- File download tracking
- Form submission tracking
- Scroll depth tracking
- 404 error tracking
- Do Not Track support
- Debug mode

For documentation, visit: https://ztas.io/docs
For support, contact: support@ztas.io
