// Zero Trust Analytics - Shared Auth Service

const TOKEN_KEY = 'zta_token';
const USER_KEY = 'zta_user';

/**
 * Store authentication credentials
 */
function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear authentication credentials
 */
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Get stored token
 */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get stored user
 */
function getUser() {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
  return !!getToken();
}

/**
 * Get authorization headers for API requests
 */
function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Require authentication - redirects if not logged in
 */
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login/';
    return false;
  }
  return true;
}

/**
 * Logout and redirect
 */
function logout() {
  clearAuth();
  window.location.href = '/';
}

/**
 * Update UI elements based on auth state
 */
function updateAuthUI() {
  const token = getToken();
  const loggedIn = document.querySelectorAll('.auth-logged-in');
  const loggedOut = document.querySelectorAll('.auth-logged-out');

  if (token) {
    loggedIn.forEach(el => el.classList.remove('d-none'));
    loggedOut.forEach(el => el.classList.add('d-none'));
  } else {
    loggedIn.forEach(el => el.classList.add('d-none'));
    loggedOut.forEach(el => el.classList.remove('d-none'));
  }
}

// === THEME MANAGEMENT ===

const THEME_KEY = 'zta_theme';

/**
 * Get current theme (light or dark)
 */
function getTheme() {
  // Check localStorage first
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;

  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

/**
 * Set theme and update UI
 */
function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Update toggle button icons
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');

  if (darkIcon && lightIcon) {
    if (theme === 'dark') {
      darkIcon.classList.add('d-none');
      lightIcon.classList.remove('d-none');
    } else {
      darkIcon.classList.remove('d-none');
      lightIcon.classList.add('d-none');
    }
  }
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

/**
 * Initialize theme on page load
 */
function initTheme() {
  const theme = getTheme();
  applyTheme(theme);

  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.auth = {
    setAuth,
    clearAuth,
    getToken,
    getUser,
    isLoggedIn,
    getAuthHeaders,
    requireAuth,
    logout,
    updateAuthUI
  };

  window.ZTA.theme = {
    getTheme,
    setTheme,
    toggleTheme,
    initTheme
  };

  // Also expose commonly used functions globally for backward compatibility
  window.getAuthHeaders = getAuthHeaders;
  window.isLoggedIn = isLoggedIn;
  window.logout = logout;
  window.requireAuth = requireAuth;
  window.updateAuthUI = updateAuthUI;
  window.clearAuth = clearAuth;
  window.toggleTheme = toggleTheme;

  // Initialize theme immediately (before DOMContentLoaded to prevent flash)
  initTheme();

  // Initialize offline detection
  initOfflineDetection();
}

// === OFFLINE DETECTION ===

let isOnline = navigator.onLine;
let offlineBanner = null;

/**
 * Initialize offline detection
 */
function initOfflineDetection() {
  // Create offline banner element
  createOfflineBanner();

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Check initial state
  if (!navigator.onLine) {
    handleOffline();
  }
}

/**
 * Create the offline banner element
 */
function createOfflineBanner() {
  offlineBanner = document.createElement('div');
  offlineBanner.id = 'offline-banner';
  offlineBanner.className = 'offline-banner';
  offlineBanner.innerHTML = `
    <i class="bi bi-wifi-off me-2"></i>
    <span>You're offline. Some features may be unavailable.</span>
  `;
  offlineBanner.style.cssText = `
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #dc3545;
    color: white;
    padding: 0.75rem 1rem;
    text-align: center;
    z-index: 9999;
    font-size: 0.9rem;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(offlineBanner);
}

/**
 * Handle going offline
 */
function handleOffline() {
  isOnline = false;
  if (offlineBanner) {
    offlineBanner.style.display = 'block';
  }
}

/**
 * Handle coming back online
 */
function handleOnline() {
  isOnline = true;
  if (offlineBanner) {
    // Show "back online" message briefly
    offlineBanner.innerHTML = `
      <i class="bi bi-wifi me-2"></i>
      <span>You're back online!</span>
    `;
    offlineBanner.style.background = '#198754';

    // Hide after 3 seconds
    setTimeout(() => {
      offlineBanner.style.display = 'none';
      // Reset for next offline event
      offlineBanner.innerHTML = `
        <i class="bi bi-wifi-off me-2"></i>
        <span>You're offline. Some features may be unavailable.</span>
      `;
      offlineBanner.style.background = '#dc3545';
    }, 3000);
  }
}

/**
 * Check if currently online
 */
function checkOnline() {
  return isOnline;
}
