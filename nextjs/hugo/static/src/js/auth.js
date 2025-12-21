// Zero Trust Analytics - Auth JavaScript
// Requires: shared/auth-service.js, shared/utils.js, shared/api.js, shared/notifications.js

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
      // Validate 2FA code using shared API client
      const data = await ZTA.api.post('/auth/2fa', {
        action: 'validate',
        tempToken,
        code: twofaCode
      });

      // Clear temp token
      sessionStorage.removeItem('temp_token');

      // Use shared auth service
      ZTA.auth.setAuth(data.token, data.user);

      // Redirect to dashboard
      window.location.href = '/dashboard/';
      return;
    }

    // Initial login request using shared API client
    const data = await ZTA.api.post('/auth/login', { email, password });

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
    const errorMsg = err.data?.error || err.message || 'Login failed';
    ZTA.utils.showError(errorEl, errorMsg);
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

  // Validate passwords match using shared validator
  if (!ZTA.validate.matches(password, confirmPassword)) {
    ZTA.utils.showError(errorEl, 'Passwords do not match');
    return;
  }

  // Validate password strength
  const pwResult = ZTA.validate.password(password);
  if (!pwResult.valid) {
    ZTA.utils.showError(errorEl, pwResult.errors[0]);
    return;
  }

  ZTA.utils.setButtonLoading(btn, true, 'Creating account...');
  ZTA.utils.hideError(errorEl);

  try {
    // Use shared API client
    const data = await ZTA.api.post('/auth/register', { email, password, plan });

    // Use shared auth service
    ZTA.auth.setAuth(data.token, data.user);

    // Redirect to dashboard
    window.location.href = '/dashboard/';
  } catch (err) {
    const errorMsg = err.data?.error || err.message || 'Registration failed';
    ZTA.utils.showError(errorEl, errorMsg);
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

  // Validate email using shared validator
  if (!ZTA.validate.email(email)) {
    ZTA.utils.showError(errorEl, 'Please enter a valid email address');
    return;
  }

  ZTA.utils.setButtonLoading(btn, true, 'Sending...');
  ZTA.utils.hideError(errorEl);
  if (successEl) successEl.style.display = 'none';

  try {
    // Use shared API client
    await ZTA.api.post('/auth/forgot', { email });

    // Show success message
    if (successEl) {
      successEl.textContent = 'If an account exists with that email, you will receive a password reset link.';
      successEl.style.display = 'block';
    }
    ZTA.utils.setButtonLoading(btn, false, null, 'Send Reset Link');
  } catch (err) {
    const errorMsg = err.data?.error || err.message || 'Request failed';
    ZTA.utils.showError(errorEl, errorMsg);
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

  // Validate passwords match
  if (!ZTA.validate.matches(password, confirmPassword)) {
    ZTA.utils.showError(errorEl, 'Passwords do not match');
    return;
  }

  // Validate password strength
  const pwResult = ZTA.validate.password(password);
  if (!pwResult.valid) {
    ZTA.utils.showError(errorEl, pwResult.errors[0]);
    return;
  }

  if (!token) {
    ZTA.utils.showError(errorEl, 'Invalid reset link');
    return;
  }

  ZTA.utils.setButtonLoading(btn, true, 'Resetting...');
  ZTA.utils.hideError(errorEl);

  try {
    // Use shared API client
    await ZTA.api.post('/auth/reset', { token, password });

    // Redirect to login with success message
    window.location.href = '/login/?reset=success';
  } catch (err) {
    const errorMsg = err.data?.error || err.message || 'Reset failed';
    ZTA.utils.showError(errorEl, errorMsg);
    ZTA.utils.setButtonLoading(btn, false, null, 'Reset Password');
  }
}
