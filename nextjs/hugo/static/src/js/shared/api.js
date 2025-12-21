// Zero Trust Analytics - Shared API Client
// Unified fetch with consistent error handling, auth, and methods

const API_BASE = '/api';

/**
 * Custom API Error class with status and data
 */
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make an authenticated API request with standard error handling
 * @param {string} endpoint - API endpoint (e.g., '/sites/list')
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - Response data
 */
async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers
    },
    ...options
  };

  // Stringify body if object
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, config);

    // Handle empty responses
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    if (!res.ok) {
      if (res.status === 401) {
        // Token expired or invalid - clear auth and redirect
        if (typeof clearAuth === 'function') clearAuth();
        window.location.href = '/login/';
        throw new ApiError('Session expired', res.status);
      }
      throw new ApiError(data.error || `Request failed with status ${res.status}`, res.status, data);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'Network error', 0);
  }
}

/**
 * GET request helper
 * @param {string} endpoint - API endpoint
 * @param {object} params - Query parameters
 */
async function apiGet(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  return apiRequest(url, { method: 'GET' });
}

/**
 * POST request helper
 * @param {string} endpoint - API endpoint
 * @param {object} body - Request body
 */
async function apiPost(endpoint, body = {}) {
  return apiRequest(endpoint, {
    method: 'POST',
    body
  });
}

/**
 * PATCH request helper
 * @param {string} endpoint - API endpoint
 * @param {object} body - Request body
 */
async function apiPatch(endpoint, body = {}) {
  return apiRequest(endpoint, {
    method: 'PATCH',
    body
  });
}

/**
 * PUT request helper
 * @param {string} endpoint - API endpoint
 * @param {object} body - Request body
 */
async function apiPut(endpoint, body = {}) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body
  });
}

/**
 * DELETE request helper
 * @param {string} endpoint - API endpoint
 * @param {object} params - Query parameters (optional)
 */
async function apiDelete(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  return apiRequest(url, { method: 'DELETE' });
}

/**
 * Upload file(s) via multipart form data
 * @param {string} endpoint - API endpoint
 * @param {FormData} formData - Form data with files
 */
async function apiUpload(endpoint, formData) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(), // Don't set Content-Type for FormData
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || 'Upload failed', res.status, data);
  }

  return data;
}

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.api = {
    request: apiRequest,
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    put: apiPut,
    delete: apiDelete,
    upload: apiUpload,
    ApiError,
    API_BASE
  };

  // Legacy exports for backward compatibility
  window.apiRequest = apiRequest;
  window.apiGet = apiGet;
  window.apiPost = apiPost;
}
