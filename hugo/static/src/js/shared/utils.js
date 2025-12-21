// Zero Trust Analytics - Shared Utilities

/**
 * Format number with commas (e.g., 1234567 -> "1,234,567")
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format duration in seconds to human readable (e.g., 125 -> "2m 5s")
 */
function formatDuration(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, len = 30) {
  if (!str) return '-';
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

/**
 * Format percentage (e.g., 0.1234 -> "12.3%")
 */
function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Sort object entries by value descending and return top N
 */
function sortedEntries(obj, limit = 10) {
  if (!obj) return [];
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Show/hide element using Bootstrap's d-none class
 */
function showElement(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.classList.remove('d-none');
}

function hideElement(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.classList.add('d-none');
}

function toggleElement(el, show) {
  show ? showElement(el) : hideElement(el);
}

/**
 * Set button to loading state
 */
function setButtonLoading(btn, loading, loadingText = 'Loading...', originalText = null) {
  if (typeof btn === 'string') btn = document.querySelector(btn);
  if (!btn) return;

  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn.dataset.originalText || 'Submit';
  }
}

/**
 * Show error message in element
 */
function showError(el, message) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

function hideError(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.style.display = 'none';
}

/**
 * Debounce function
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.utils = {
    formatNumber,
    formatDuration,
    truncate,
    formatPercent,
    sortedEntries,
    capitalize,
    showElement,
    hideElement,
    toggleElement,
    setButtonLoading,
    showError,
    hideError,
    debounce
  };

  // Expose commonly used formatters globally
  window.formatNumber = formatNumber;
  window.formatDuration = formatDuration;
  window.truncate = truncate;
  window.sortedEntries = sortedEntries;
}
