// Test helper to create Headers-like objects that work with Object.fromEntries()
export function createHeaders(headersObj) {
  const entries = Object.entries(headersObj);
  const map = new Map(entries.map(([k, v]) => [k.toLowerCase(), v]));

  return {
    // Support both direct property access (headers.authorization) and .get() method
    ...headersObj,
    get(key) {
      return map.get(key.toLowerCase()) || null;
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    },
    entries() {
      return entries[Symbol.iterator]();
    }
  };
}

// Header names the functions read; used to resolve tests' `{ get: (name) => ... }`
// header stubs, which can't be enumerated.
const KNOWN_HEADERS = [
  'authorization', 'origin', 'referer', 'content-type', 'cookie', 'user-agent',
  'x-forwarded-for', 'x-real-ip', 'x-nf-client-connection-ip', 'x-nf-client-connection-region',
  'x-csrf-token', 'x-admin-key', 'x-auth-password', 'x-cleanup-key', 'x-init-secret', 'x-migration-key',
  'stripe-signature', 'cf-ipcountry', 'cf-region', 'cf-ipcity', 'x-country', 'x-city',
];

/**
 * Turn a test's request literal ({ method, url, headers, json, ... }) into a real
 * Fetch API Request, which is what the functions receive in production: absolute
 * URL, real Headers (so Object.fromEntries(req.headers) and headers.get both work).
 * Body readers the test stubs (json, text, formData) and any extra fields are kept.
 */
export function toRequest(init = {}) {
  const { method = 'GET', url = '/', headers = {}, body, ...rest } = init;
  const h = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((v, k) => h.set(k, v));
  } else if (headers && typeof headers[Symbol.iterator] === 'function') {
    for (const [k, v] of headers) if (v != null) h.set(k, String(v));
  } else if (headers && typeof headers.get === 'function') {
    for (const name of KNOWN_HEADERS) {
      const v = headers.get(name);
      if (v != null) h.set(name, String(v));
    }
  } else if (headers) {
    for (const [k, v] of Object.entries(headers)) if (v != null && typeof v !== 'function') h.set(k, String(v));
  }
  const canHaveBody = !['GET', 'HEAD'].includes(String(method).toUpperCase());
  const req = new Request(new URL(url, 'http://localhost').toString(), {
    method,
    headers: h,
    body: canHaveBody && body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  for (const [k, v] of Object.entries(rest)) {
    Object.defineProperty(req, k, { value: v, configurable: true, writable: true });
  }
  return req;
}

/**
 * Stand-in for authenticateRequest in suites that identify users by Bearer
 * token through their own `verify(token) -> user` stub (most mock jsonwebtoken's
 * verify for this). Same outcomes the endpoints see in production: no token or a
 * rejected token is a 401; otherwise the decoded user.
 */
export async function bearerAuth(headers, verify) {
  const raw = typeof headers?.get === 'function'
    ? headers.get('authorization')
    : headers?.authorization ?? headers?.Authorization;
  const token = /^Bearer (.+)$/.exec(raw || '')?.[1];
  if (!token) return { error: 'No token provided', status: 401 };
  try {
    return { user: verify(token) };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}
