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
