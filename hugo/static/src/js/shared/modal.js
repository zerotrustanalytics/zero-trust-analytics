// Zero Trust Analytics - Modal Manager
// Standardized modal handling with dynamic creation and confirmation dialogs

const ZTAModal = (function() {
  const instances = new Map();
  let dynamicModalId = 0;

  /**
   * Show a Bootstrap modal by ID
   * @param {string} modalId - Modal element ID
   * @returns {bootstrap.Modal|null}
   */
  function show(modalId) {
    const el = document.getElementById(modalId);
    if (!el) {
      console.warn(`Modal #${modalId} not found`);
      return null;
    }

    let modal = instances.get(modalId);
    if (!modal) {
      modal = new bootstrap.Modal(el);
      instances.set(modalId, modal);
    }

    modal.show();
    return modal;
  }

  /**
   * Hide a Bootstrap modal by ID
   * @param {string} modalId - Modal element ID
   */
  function hide(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;

    const modal = instances.get(modalId) || bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }

  /**
   * Get or create a modal instance
   * @param {string} modalId - Modal element ID
   * @returns {bootstrap.Modal|null}
   */
  function get(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return null;

    let modal = instances.get(modalId);
    if (!modal) {
      modal = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
      instances.set(modalId, modal);
    }

    return modal;
  }

  /**
   * Set modal loading state
   * @param {string} modalId - Modal element ID
   * @param {boolean} loading - Loading state
   */
  function setLoading(modalId, loading) {
    const el = document.getElementById(modalId);
    if (!el) return;

    const submitBtn = el.querySelector('[type="submit"], .btn-primary');
    const inputs = el.querySelectorAll('input, select, textarea, button');

    if (loading) {
      el.classList.add('modal-loading');
      if (submitBtn) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        submitBtn.disabled = true;
      }
      inputs.forEach(input => {
        if (input !== submitBtn) input.disabled = true;
      });
    } else {
      el.classList.remove('modal-loading');
      if (submitBtn && submitBtn.dataset.originalText) {
        submitBtn.innerHTML = submitBtn.dataset.originalText;
        submitBtn.disabled = false;
      }
      inputs.forEach(input => input.disabled = false);
    }
  }

  /**
   * Reset modal form
   * @param {string} modalId - Modal element ID
   */
  function reset(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;

    const form = el.querySelector('form');
    if (form) {
      form.reset();
      // Clear validation states
      form.querySelectorAll('.is-invalid, .is-valid').forEach(input => {
        input.classList.remove('is-invalid', 'is-valid');
      });
      form.querySelectorAll('.invalid-feedback').forEach(feedback => {
        feedback.textContent = '';
      });
    }
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
   * Create a dynamic modal
   * @param {object} options - Modal configuration
   * @returns {string} - Modal ID
   */
  function create(options = {}) {
    const id = `zta-modal-${++dynamicModalId}`;
    const {
      title = '',
      body = '',
      size = '', // 'sm', 'lg', 'xl', or ''
      centered = true,
      backdrop = true,
      keyboard = true,
      footer = null,
      onShow = null,
      onHide = null,
      onHidden = null
    } = options;

    const sizeClass = size ? `modal-${size}` : '';
    const centeredClass = centered ? 'modal-dialog-centered' : '';

    const modalHtml = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}-label" aria-hidden="true"
           data-bs-backdrop="${backdrop}" data-bs-keyboard="${keyboard}">
        <div class="modal-dialog ${sizeClass} ${centeredClass}">
          <div class="modal-content">
            ${title ? `
            <div class="modal-header">
              <h5 class="modal-title" id="${id}-label">${escapeHtml(title)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            ` : ''}
            <div class="modal-body">
              ${body}
            </div>
            ${footer !== null ? `
            <div class="modal-footer">
              ${footer}
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const el = document.getElementById(id);

    // Event listeners
    if (onShow) el.addEventListener('show.bs.modal', onShow);
    if (onHide) el.addEventListener('hide.bs.modal', onHide);
    if (onHidden) el.addEventListener('hidden.bs.modal', onHidden);

    // Cleanup on hidden
    el.addEventListener('hidden.bs.modal', () => {
      instances.delete(id);
      el.remove();
    });

    return id;
  }

  /**
   * Show a confirmation dialog
   * @param {string} message - Confirmation message
   * @param {object} options - Dialog options
   * @returns {Promise<boolean>}
   */
  function confirm(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Confirm',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        confirmClass = 'btn-primary',
        danger = false
      } = options;

      const btnClass = danger ? 'btn-danger' : confirmClass;

      const id = create({
        title,
        body: `<p class="mb-0">${escapeHtml(message)}</p>`,
        footer: `
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${btnClass}" id="${id}-confirm">${escapeHtml(confirmText)}</button>
        `,
        onHidden: () => resolve(false)
      });

      const el = document.getElementById(id);
      const confirmBtn = el.querySelector(`[id$="-confirm"]`);

      confirmBtn.addEventListener('click', () => {
        resolve(true);
        hide(id);
      });

      show(id);
    });
  }

  /**
   * Show a delete confirmation dialog
   * @param {string} itemName - Name of item to delete
   * @param {object} options - Dialog options
   * @returns {Promise<boolean>}
   */
  function confirmDelete(itemName, options = {}) {
    return confirm(
      options.message || `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      {
        title: options.title || 'Delete Confirmation',
        confirmText: options.confirmText || 'Delete',
        cancelText: options.cancelText || 'Cancel',
        danger: true,
        ...options
      }
    );
  }

  /**
   * Show an alert dialog (replaces window.alert)
   * @param {string} message - Alert message
   * @param {object} options - Dialog options
   * @returns {Promise<void>}
   */
  function alert(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Alert',
        buttonText = 'OK',
        type = 'info' // info, success, warning, error
      } = options;

      const icons = {
        info: 'fa-info-circle text-primary',
        success: 'fa-check-circle text-success',
        warning: 'fa-exclamation-triangle text-warning',
        error: 'fa-exclamation-circle text-danger'
      };

      const icon = icons[type] || icons.info;

      const id = create({
        title,
        body: `
          <div class="text-center">
            <i class="fas ${icon} fa-3x mb-3"></i>
            <p class="mb-0">${escapeHtml(message)}</p>
          </div>
        `,
        footer: `
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">${escapeHtml(buttonText)}</button>
        `,
        centered: true,
        size: 'sm',
        onHidden: () => resolve()
      });

      show(id);
    });
  }

  /**
   * Show a prompt dialog (replaces window.prompt)
   * @param {string} message - Prompt message
   * @param {object} options - Dialog options
   * @returns {Promise<string|null>}
   */
  function prompt(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Input Required',
        defaultValue = '',
        placeholder = '',
        inputType = 'text',
        confirmText = 'OK',
        cancelText = 'Cancel',
        required = false
      } = options;

      const inputId = `zta-prompt-input-${Date.now()}`;

      const id = create({
        title,
        body: `
          <p>${escapeHtml(message)}</p>
          <input type="${inputType}" id="${inputId}" class="form-control"
                 value="${escapeHtml(defaultValue)}"
                 placeholder="${escapeHtml(placeholder)}"
                 ${required ? 'required' : ''}>
        `,
        footer: `
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-primary" id="${id}-submit">${escapeHtml(confirmText)}</button>
        `,
        onHidden: () => resolve(null)
      });

      const el = document.getElementById(id);
      const input = document.getElementById(inputId);
      const submitBtn = el.querySelector(`[id$="-submit"]`);

      // Focus input when modal is shown
      el.addEventListener('shown.bs.modal', () => input.focus());

      // Submit on Enter
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitBtn.click();
        }
      });

      submitBtn.addEventListener('click', () => {
        const value = input.value;
        if (required && !value.trim()) {
          input.classList.add('is-invalid');
          return;
        }
        resolve(value);
        hide(id);
      });

      show(id);
    });
  }

  // Public API
  return {
    show,
    hide,
    get,
    setLoading,
    reset,
    create,
    confirm,
    confirmDelete,
    alert,
    prompt,
    // Legacy aliases
    showModal: show,
    hideModal: hide,
    getModal: get
  };
})();

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.modal = ZTAModal;

  // Global shortcuts for backward compatibility
  window.showModal = ZTAModal.show;
  window.hideModal = ZTAModal.hide;
  window.getModal = ZTAModal.get;
}
