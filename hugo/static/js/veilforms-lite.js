/**
 * VeilForms Lite - Browser Bundle
 * Client-side encryption for privacy-first forms
 * Encrypts form data BEFORE it leaves the browser
 */

(function(window) {
  'use strict';

  const VeilForms = {
    config: {
      publicKey: null,
      debug: false,
      piiWarning: true,
    },

    // PII detection patterns
    PII_PATTERNS: {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
      ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
      creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
      ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    },

    /**
     * Initialize VeilForms
     */
    init(options = {}) {
      this.config.publicKey = options.publicKey || null;
      this.config.debug = options.debug || false;
      this.config.piiWarning = options.piiWarning !== false;

      if (options.autoBind !== false) {
        this.bindForms();
      }

      this.log('VeilForms initialized');
    },

    /**
     * Bind all forms with data-veilform attribute
     */
    bindForms() {
      document.querySelectorAll('form[data-veilform]').forEach(form => {
        form.addEventListener('submit', this.handleSubmit.bind(this));
        this.log('Bound form:', form.name || form.id || 'unnamed');
      });
    },

    /**
     * Handle form submission
     */
    async handleSubmit(e) {
      e.preventDefault();
      const form = e.target;

      try {
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn?.textContent;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Encrypting & Sending...';
        }

        // Collect form data
        const formData = this.collectFormData(form);
        this.log('Collected form data:', Object.keys(formData));

        // Detect PII (warning only)
        if (this.config.piiWarning) {
          const piiDetected = this.detectPII(formData);
          if (piiDetected.length > 0) {
            this.log('PII detected in fields:', piiDetected);
          }
        }

        // Encrypt the data
        let payload;
        if (this.config.publicKey) {
          payload = await this.encryptData(formData);
          this.log('Data encrypted client-side');
        } else {
          // No public key - send as-is (for testing)
          payload = { encrypted: false, data: formData };
          this.log('No public key - sending unencrypted');
        }

        // Create submission
        const submission = {
          submissionId: this.generateId(),
          timestamp: new Date().toISOString(),
          payload: JSON.stringify(payload),
          formName: form.getAttribute('name') || 'contact',
        };

        // For demo/testing: Show the encrypted payload instead of submitting
        this.log('Submission ID:', submission.submissionId);
        this.log('Encrypted payload:', submission.payload);

        // Show the encrypted data to the user
        this.showEncryptedPayload(form, {
          'form-name': submission.formName,
          'submission-id': submission.submissionId,
          'timestamp': submission.timestamp,
          'encrypted-payload': submission.payload,
        });

        form.dispatchEvent(new CustomEvent('veilforms:success', {
          detail: { submissionId: submission.submissionId }
        }));

        // Restore button
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }

      } catch (error) {
        this.log('Error:', error.message);
        form.dispatchEvent(new CustomEvent('veilforms:error', {
          detail: { error: error.message }
        }));
        this.showMessage(form, 'error', 'Something went wrong. Please try again.');

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Message';
        }
      }
    },

    /**
     * Collect data from form
     */
    collectFormData(form) {
      const data = {};
      const formData = new FormData(form);

      for (const [key, value] of formData.entries()) {
        if (key !== 'form-name') { // Skip Netlify's hidden field
          data[key] = value;
        }
      }

      return data;
    },

    /**
     * Detect PII in data
     */
    detectPII(data) {
      const detected = [];

      for (const [field, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          for (const [type, pattern] of Object.entries(this.PII_PATTERNS)) {
            pattern.lastIndex = 0;
            if (pattern.test(value)) {
              detected.push({ field, type });
            }
          }
        }
      }

      return detected;
    },

    /**
     * Encrypt data using hybrid RSA+AES encryption
     */
    async encryptData(data) {
      // Import public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        this.config.publicKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );

      // Generate one-time AES key
      const aesKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt']
      );

      // Encrypt data with AES
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(JSON.stringify(data));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        dataBytes
      );

      // Encrypt AES key with RSA public key
      const aesKeyBytes = await crypto.subtle.exportKey('raw', aesKey);
      const encryptedKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        aesKeyBytes
      );

      return {
        encrypted: true,
        version: 'vf-e1',
        data: this.arrayBufferToBase64(encryptedData),
        key: this.arrayBufferToBase64(encryptedKey),
        iv: this.arrayBufferToBase64(iv),
      };
    },

    /**
     * Generate anonymous submission ID
     */
    generateId() {
      return 'vf-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },

    /**
     * Show encrypted payload (for demo/testing)
     */
    showEncryptedPayload(form, data) {
      // Remove existing output
      const existing = form.parentNode.querySelector('.veilforms-output');
      if (existing) existing.remove();

      const div = document.createElement('div');
      div.className = 'veilforms-output';
      div.style.cssText = 'margin-top: 2rem; padding: 1.5rem; background: #1a1a2e; color: #0f0; border-radius: 8px; font-family: monospace; font-size: 12px;';

      div.innerHTML = `
        <h4 style="color: #fff; margin-top: 0;">What Netlify Would Receive:</h4>
        <p style="color: #aaa;">This is the encrypted data that would be sent. Notice: no readable name, email, or message!</p>
        <pre style="white-space: pre-wrap; word-break: break-all; background: #0d0d1a; padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(data, null, 2)}</pre>
        <p style="color: #ff6b6b; margin-bottom: 0;">Without your private key, this data is unreadable.</p>
      `;

      form.parentNode.insertBefore(div, form.nextSibling);
    },

    /**
     * Show success/error message
     */
    showMessage(form, type, message) {
      // Remove existing message
      const existing = form.parentNode.querySelector('.veilforms-message');
      if (existing) existing.remove();

      const div = document.createElement('div');
      div.className = `veilforms-message veilforms-${type}`;
      div.textContent = message;
      div.style.cssText = type === 'success'
        ? 'padding: 1rem; margin-top: 1rem; background: #d4edda; color: #155724; border-radius: 4px;'
        : 'padding: 1rem; margin-top: 1rem; background: #f8d7da; color: #721c24; border-radius: 4px;';

      form.parentNode.insertBefore(div, form.nextSibling);
    },

    /**
     * Utility: ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    },

    /**
     * Debug logging
     */
    log(...args) {
      if (this.config.debug && console) {
        console.log('[VeilForms]', ...args);
      }
    }
  };

  // Expose globally
  window.VeilForms = VeilForms;

})(window);
