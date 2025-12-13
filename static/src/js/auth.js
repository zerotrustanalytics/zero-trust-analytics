// Zero Trust Analytics - Auth JavaScript
// Requires: shared/auth-service.js, shared/utils.js, shared/api.js

const API_BASE = '/api';

// Check auth state on page load
document.addEventListener('DOMContentLoaded', function() {
  updateAuthUI();
});

// Handle login form
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('login-error');

  const email = form.email.value;
  const password = form.password.value;
  const twofaCode = form['twofa-code']?.value;

  // Use shared utilities
  ZTA.utils.setButtonLoading(btn, true, 'Signing in...');
  ZTA.utils.hideError(errorEl);

  try {
    // Check if we're in 2FA validation mode
    const tempToken = sessionStorage.getItem('temp_token');

    if (tempToken && twofaCode) {
      // Validate 2FA code
      const res = await fetch(`${API_BASE}/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          tempToken,
          code: twofaCode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '2FA validation failed');
      }

      // Clear temp token
      sessionStorage.removeItem('temp_token');

      // Use shared auth service
      ZTA.auth.setAuth(data.token, data.user);

      // Redirect to dashboard
      window.location.href = '/dashboard/';
      return;
    }

    // Initial login request
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Check if 2FA is required
    if (data.requires_2fa) {
      // Store temp token
      sessionStorage.setItem('temp_token', data.tempToken);

      // Hide email/password fields, show 2FA field
      document.getElementById('email-field').classList.add('d-none');
      document.getElementById('password-field').classList.add('d-none');
      document.getElementById('forgot-password-link').classList.add('d-none');
      document.getElementById('twofa-field').classList.remove('d-none');

      // Focus on 2FA input
      document.getElementById('twofa-code').focus();

      // Update button text
      btn.textContent = 'Verify Code';
      ZTA.utils.setButtonLoading(btn, false);

      return;
    }

    // No 2FA required - normal login
    ZTA.auth.setAuth(data.token, data.user);

    // Redirect to dashboard
    window.location.href = '/dashboard/';
  } catch (err) {
    ZTA.utils.showError(errorEl, err.message);
    ZTA.utils.setButtonLoading(btn, false, null, 'Sign In');
  }
}

// Handle register form
async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('register-error');

  const email = form.email.value;
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const plan = form.plan?.value || 'pro'; // Get selected plan from hidden field

  // Validate passwords match
  if (password !== confirmPassword) {
    ZTA.utils.showError(errorEl, 'Passwords do not match');
    return;
  }

  ZTA.utils.setButtonLoading(btn, true, 'Creating account...');
  ZTA.utils.hideError(errorEl);

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, plan })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // Use shared auth service
    ZTA.auth.setAuth(data.token, data.user);

    // Redirect to dashboard
    window.location.href = '/dashboard/';
  } catch (err) {
    ZTA.utils.showError(errorEl, err.message);
    ZTA.utils.setButtonLoading(btn, false, null, 'Create Account');
  }
}

// Handle forgot password form
async function handleForgotPassword(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');

  const email = form.email.value;

  ZTA.utils.setButtonLoading(btn, true, 'Sending...');
  ZTA.utils.hideError(errorEl);
  if (successEl) successEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    // Show success message
    if (successEl) {
      successEl.textContent = 'If an account exists with that email, you will receive a password reset link.';
      successEl.style.display = 'block';
    }
    ZTA.utils.setButtonLoading(btn, false, null, 'Send Reset Link');
  } catch (err) {
    ZTA.utils.showError(errorEl, err.message);
    ZTA.utils.setButtonLoading(btn, false, null, 'Send Reset Link');
  }
}

// Handle reset password form
async function handleResetPassword(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('reset-error');

  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const token = new URLSearchParams(window.location.search).get('token');

  if (password !== confirmPassword) {
    ZTA.utils.showError(errorEl, 'Passwords do not match');
    return;
  }

  if (!token) {
    ZTA.utils.showError(errorEl, 'Invalid reset link');
    return;
  }

  ZTA.utils.setButtonLoading(btn, true, 'Resetting...');
  ZTA.utils.hideError(errorEl);

  try {
    const res = await fetch(`${API_BASE}/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Reset failed');
    }

    // Redirect to login with success message
    window.location.href = '/login/?reset=success';
  } catch (err) {
    ZTA.utils.showError(errorEl, err.message);
    ZTA.utils.setButtonLoading(btn, false, null, 'Reset Password');
  }
}
