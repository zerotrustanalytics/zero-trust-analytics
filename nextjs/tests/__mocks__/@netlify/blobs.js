// Mock implementation of @netlify/blobs for testing
const stores = new Map();

function createMockStore(name) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const data = stores.get(name);

  return {
    async get(key, options = {}) {
      const value = data.get(key);
      if (value === undefined) return null;
      if (options.type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async setJSON(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list() {
      return { blobs: Array.from(data.keys()).map(key => ({ key })) };
    }
  };
}

export function getStore({ name, consistency }) {
  return createMockStore(name);
}

// Helper to clear all stores between tests
export function __clearAllStores() {
  stores.clear();
}

// Helper to get store data for assertions
export function __getStoreData(name) {
  return stores.get(name);
}
