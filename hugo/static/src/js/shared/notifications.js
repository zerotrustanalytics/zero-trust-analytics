// Zero Trust Analytics - Toast Notification System
// Replaces alert() calls with elegant, accessible toast notifications

/**
 * Notification Manager - Singleton toast notification system
 */
const ZTANotify = (function() {
  let container = null;
  let toastId = 0;

  const DEFAULTS = {
    duration: 5000,
    position: 'top-right',
    dismissible: true,
    pauseOnHover: true
  };

  const ICONS = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  const COLORS = {
    success: { bg: '#198754', border: '#157347', icon: '#fff' },
    error: { bg: '#dc3545', border: '#b02a37', icon: '#fff' },
    warning: { bg: '#ffc107', border: '#e0a800', icon: '#000' },
    info: { bg: '#0d6efd', border: '#0b5ed7', icon: '#fff' }
  };

  /**
   * Initialize the toast container
   */
  function init() {
    if (container) return;

    container = document.createElement('div');
    container.id = 'zta-toast-container';
    container.className = 'zta-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);

    // Inject styles if not already present
    if (!document.getElementById('zta-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'zta-toast-styles';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  /**
   * Get CSS styles for toasts
   */
  function getStyles() {
    return `
      .zta-toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
        pointer-events: none;
      }

      .zta-toast-container.bottom-right {
        top: auto;
        bottom: 20px;
      }

      .zta-toast-container.top-left {
        right: auto;
        left: 20px;
      }

      .zta-toast-container.bottom-left {
        top: auto;
        bottom: 20px;
        right: auto;
        left: 20px;
      }

      .zta-toast {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: auto;
        animation: zta-toast-in 0.3s ease-out;
        max-width: 100%;
        word-wrap: break-word;
      }

      .zta-toast.removing {
        animation: zta-toast-out 0.2s ease-in forwards;
      }

      @keyframes zta-toast-in {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes zta-toast-out {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100%);
        }
      }

      .zta-toast-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .zta-toast-content {
        flex: 1;
        min-width: 0;
      }

      .zta-toast-title {
        font-weight: 600;
        font-size: 0.95rem;
        margin-bottom: 4px;
        color: inherit;
      }

      .zta-toast-message {
        font-size: 0.875rem;
        opacity: 0.9;
        line-height: 1.4;
        color: inherit;
      }

      .zta-toast-close {
        background: none;
        border: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        padding: 0;
        font-size: 1rem;
        line-height: 1;
        flex-shrink: 0;
        margin-left: 8px;
      }

      .zta-toast-close:hover {
        opacity: 1;
      }

      .zta-toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 0 0 8px 8px;
        transition: width linear;
      }

      /* Dark mode adjustments */
      [data-theme="dark"] .zta-toast {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }

      /* Mobile responsiveness */
      @media (max-width: 480px) {
        .zta-toast-container {
          left: 10px;
          right: 10px;
          max-width: none;
        }

        .zta-toast {
          padding: 12px;
        }
      }
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show a toast notification
   * @param {string} type - success, error, warning, info
   * @param {string} message - Main message
   * @param {object} options - Optional settings
   */
  function show(type, message, options = {}) {
    init();

    const id = ++toastId;
    const config = { ...DEFAULTS, ...options };
    const colors = COLORS[type] || COLORS.info;
    const icon = ICONS[type] || ICONS.info;

    const toast = document.createElement('div');
    toast.className = 'zta-toast';
    toast.id = `zta-toast-${id}`;
    toast.setAttribute('role', 'alert');
    toast.style.backgroundColor = colors.bg;
    toast.style.borderLeft = `4px solid ${colors.border}`;
    toast.style.color = colors.icon;
    toast.style.position = 'relative';
    toast.style.overflow = 'hidden';

    // Build toast HTML
    let html = `
      <i class="fas ${icon} zta-toast-icon"></i>
      <div class="zta-toast-content">
    `;

    if (config.title) {
      html += `<div class="zta-toast-title">${escapeHtml(config.title)}</div>`;
    }

    html += `<div class="zta-toast-message">${escapeHtml(message)}</div>`;
    html += '</div>';

    if (config.dismissible) {
      html += `<button class="zta-toast-close" aria-label="Dismiss notification">&times;</button>`;
    }

    // Add progress bar if duration > 0
    if (config.duration > 0) {
      html += `<div class="zta-toast-progress" style="width: 100%;"></div>`;
    }

    toast.innerHTML = html;
    container.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('.zta-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => dismiss(id));
    }

    // Progress bar animation
    const progressBar = toast.querySelector('.zta-toast-progress');
    let remainingTime = config.duration;
    let startTime = Date.now();
    let timeoutId = null;
    let isPaused = false;

    function startTimer() {
      if (config.duration <= 0) return;

      startTime = Date.now();
      timeoutId = setTimeout(() => dismiss(id), remainingTime);

      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.style.transitionDuration = `${remainingTime}ms`;
        // Force reflow
        progressBar.offsetHeight;
        progressBar.style.width = '0%';
      }
    }

    function pauseTimer() {
      if (isPaused || config.duration <= 0) return;
      isPaused = true;

      clearTimeout(timeoutId);
      remainingTime -= (Date.now() - startTime);

      if (progressBar) {
        const currentWidth = progressBar.getBoundingClientRect().width;
        const containerWidth = toast.getBoundingClientRect().width;
        progressBar.style.transitionDuration = '0ms';
        progressBar.style.width = `${(currentWidth / containerWidth) * 100}%`;
      }
    }

    function resumeTimer() {
      if (!isPaused || config.duration <= 0) return;
      isPaused = false;
      startTimer();
    }

    // Pause on hover
    if (config.pauseOnHover && config.duration > 0) {
      toast.addEventListener('mouseenter', pauseTimer);
      toast.addEventListener('mouseleave', resumeTimer);
    }

    // Start auto-dismiss timer
    startTimer();

    return id;
  }

  /**
   * Dismiss a toast by ID
   */
  function dismiss(id) {
    const toast = document.getElementById(`zta-toast-${id}`);
    if (!toast) return;

    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 200);
  }

  /**
   * Dismiss all toasts
   */
  function dismissAll() {
    if (!container) return;
    const toasts = container.querySelectorAll('.zta-toast');
    toasts.forEach(toast => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 200);
    });
  }

  /**
   * Set default position
   */
  function setPosition(position) {
    init();
    container.className = 'zta-toast-container';
    if (position !== 'top-right') {
      container.classList.add(position);
    }
  }

  // Public API
  return {
    success: (message, options) => show('success', message, options),
    error: (message, options) => show('error', message, options),
    warning: (message, options) => show('warning', message, options),
    info: (message, options) => show('info', message, options),
    show,
    dismiss,
    dismissAll,
    setPosition,
    init
  };
})();

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.notify = ZTANotify;

  // Convenient global shortcuts
  window.notify = ZTANotify;
}
