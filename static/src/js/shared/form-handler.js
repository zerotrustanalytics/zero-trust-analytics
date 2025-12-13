// Zero Trust Analytics - Form Handler
// Generic form submission with validation, loading states, and error handling

const ZTAForm = (function() {

  /**
   * Initialize a form with standard handling
   * @param {string|HTMLFormElement} form - Form element or selector
   * @param {object} options - Configuration options
   */
  function init(form, options = {}) {
    const el = typeof form === 'string' ? document.querySelector(form) : form;
    if (!el) {
      console.warn('Form not found:', form);
      return null;
    }

    const config = {
      endpoint: options.endpoint || el.action || '',
      method: options.method || el.method || 'POST',
      validate: options.validate || null,
      beforeSubmit: options.beforeSubmit || null,
      onSuccess: options.onSuccess || null,
      onError: options.onError || null,
      onComplete: options.onComplete || null,
      resetOnSuccess: options.resetOnSuccess !== false,
      showNotifications: options.showNotifications !== false,
      submitButton: options.submitButton || el.querySelector('[type="submit"]'),
      loadingText: options.loadingText || 'Submitting...',
      successMessage: options.successMessage || 'Saved successfully',
      errorMessage: options.errorMessage || 'An error occurred',
      transform: options.transform || null
    };

    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSubmit(el, config);
    });

    // Return controller for programmatic access
    return {
      submit: () => handleSubmit(el, config),
      reset: () => resetForm(el),
      setLoading: (loading) => setFormLoading(el, config.submitButton, loading, config.loadingText),
      getData: () => getFormData(el),
      setData: (data) => setFormData(el, data),
      validate: () => validateForm(el, config.validate),
      element: el
    };
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(form, config) {
    // Clear previous errors
    clearErrors(form);

    // Custom validation
    if (config.validate) {
      const errors = config.validate(getFormData(form));
      if (errors && Object.keys(errors).length > 0) {
        showErrors(form, errors);
        return { success: false, errors };
      }
    }

    // HTML5 validation
    if (!form.checkValidity()) {
      form.reportValidity();
      return { success: false, errors: { form: 'Please fill in all required fields' } };
    }

    // Before submit hook
    if (config.beforeSubmit) {
      const proceed = await config.beforeSubmit(getFormData(form));
      if (proceed === false) return { success: false, cancelled: true };
    }

    // Set loading state
    setFormLoading(form, config.submitButton, true, config.loadingText);

    try {
      let data = getFormData(form);

      // Transform data if needed
      if (config.transform) {
        data = config.transform(data);
      }

      // Make API request
      const response = await (window.ZTA?.api?.request || apiRequest)(config.endpoint, {
        method: config.method.toUpperCase(),
        body: data
      });

      // Success handling
      if (config.showNotifications && window.ZTA?.notify) {
        window.ZTA.notify.success(config.successMessage);
      }

      if (config.resetOnSuccess) {
        resetForm(form);
      }

      if (config.onSuccess) {
        await config.onSuccess(response, form);
      }

      return { success: true, data: response };

    } catch (err) {
      // Error handling
      const errorMsg = err.data?.error || err.message || config.errorMessage;

      if (config.showNotifications && window.ZTA?.notify) {
        window.ZTA.notify.error(errorMsg);
      }

      // Show field-specific errors if provided
      if (err.data?.errors) {
        showErrors(form, err.data.errors);
      }

      if (config.onError) {
        await config.onError(err, form);
      }

      return { success: false, error: err };

    } finally {
      setFormLoading(form, config.submitButton, false, config.loadingText);

      if (config.onComplete) {
        config.onComplete(form);
      }
    }
  }

  /**
   * Get form data as object
   */
  function getFormData(form) {
    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
      // Handle array fields (e.g., checkboxes with same name)
      if (key.endsWith('[]')) {
        const cleanKey = key.slice(0, -2);
        if (!data[cleanKey]) data[cleanKey] = [];
        data[cleanKey].push(value);
      } else if (data[key] !== undefined) {
        // Convert to array if duplicate keys
        if (!Array.isArray(data[key])) {
          data[key] = [data[key]];
        }
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    // Handle checkboxes that are unchecked (not in FormData)
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      if (!checkbox.name.endsWith('[]') && !formData.has(checkbox.name)) {
        data[checkbox.name] = false;
      } else if (formData.has(checkbox.name)) {
        // Convert checkbox value to boolean if it's "on"
        if (data[checkbox.name] === 'on') {
          data[checkbox.name] = true;
        }
      }
    });

    return data;
  }

  /**
   * Set form data from object
   */
  function setFormData(form, data) {
    Object.entries(data).forEach(([key, value]) => {
      const field = form.elements[key];
      if (!field) return;

      if (field.type === 'checkbox') {
        field.checked = Boolean(value);
      } else if (field.type === 'radio') {
        const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else if (field.tagName === 'SELECT' && field.multiple && Array.isArray(value)) {
        Array.from(field.options).forEach(opt => {
          opt.selected = value.includes(opt.value);
        });
      } else {
        field.value = value;
      }
    });
  }

  /**
   * Reset form to initial state
   */
  function resetForm(form) {
    form.reset();
    clearErrors(form);
  }

  /**
   * Set form loading state
   */
  function setFormLoading(form, submitBtn, loading, loadingText) {
    const inputs = form.querySelectorAll('input, select, textarea, button');

    if (loading) {
      form.classList.add('form-loading');
      inputs.forEach(input => input.disabled = true);

      if (submitBtn) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
      }
    } else {
      form.classList.remove('form-loading');
      inputs.forEach(input => input.disabled = false);

      if (submitBtn && submitBtn.dataset.originalText) {
        submitBtn.innerHTML = submitBtn.dataset.originalText;
        delete submitBtn.dataset.originalText;
      }
    }
  }

  /**
   * Validate form with custom rules
   */
  function validateForm(form, validateFn) {
    if (!validateFn) return {};
    return validateFn(getFormData(form));
  }

  /**
   * Show validation errors
   */
  function showErrors(form, errors) {
    Object.entries(errors).forEach(([field, message]) => {
      const input = form.elements[field] || form.querySelector(`[name="${field}"]`);
      if (input) {
        input.classList.add('is-invalid');

        // Find or create feedback element
        let feedback = input.parentElement.querySelector('.invalid-feedback');
        if (!feedback) {
          feedback = document.createElement('div');
          feedback.className = 'invalid-feedback';
          input.parentElement.appendChild(feedback);
        }
        feedback.textContent = message;
      }
    });
  }

  /**
   * Clear all validation errors
   */
  function clearErrors(form) {
    form.querySelectorAll('.is-invalid').forEach(el => {
      el.classList.remove('is-invalid');
    });
    form.querySelectorAll('.invalid-feedback').forEach(el => {
      el.textContent = '';
    });
  }

  /**
   * Simple API request fallback if ZTA.api not available
   */
  async function apiRequest(endpoint, options) {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();

    if (!res.ok) {
      const error = new Error(data.error || 'Request failed');
      error.data = data;
      error.status = res.status;
      throw error;
    }

    return data;
  }

  /**
   * Quick form setup for common patterns
   */
  function quick(selector, endpoint, options = {}) {
    const forms = document.querySelectorAll(selector);
    const controllers = [];

    forms.forEach(form => {
      controllers.push(init(form, { endpoint, ...options }));
    });

    return controllers.length === 1 ? controllers[0] : controllers;
  }

  // Public API
  return {
    init,
    quick,
    getFormData,
    setFormData,
    resetForm,
    showErrors,
    clearErrors,
    setFormLoading
  };
})();

// Export for module usage or attach to window
if (typeof window !== 'undefined') {
  window.ZTA = window.ZTA || {};
  window.ZTA.form = ZTAForm;
}
