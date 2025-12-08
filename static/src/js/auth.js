// Zero Trust Analytics - Auth JavaScript

const API_BASE = '/api';

// Check auth state on page load
document.addEventListener('DOMContentLoaded', function() {
  updateAuthUI();
});

// Update UI based on auth state
function updateAuthUI() {
  const token = localStorage.getItem('zta_token');
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

// Handle login form
async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('login-error');

  const email = form.email.value;
  const password = form.password.value;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Store token and user info
    localStorage.setItem('zta_token', data.token);
    localStorage.setItem('zta_user', JSON.stringify(data.user));

    // Redirect to dashboard
    window.location.href = '/dashboard/';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In';
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

  // Validate passwords match
  if (password !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account...';
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // Store token and user info
    localStorage.setItem('zta_token', data.token);
    localStorage.setItem('zta_user', JSON.stringify(data.user));

    // Redirect to dashboard (will prompt for payment)
    window.location.href = '/dashboard/';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

// Logout
function logout() {
  localStorage.removeItem('zta_token');
  localStorage.removeItem('zta_user');
  window.location.href = '/';
}

// Get auth headers
function getAuthHeaders() {
  const token = localStorage.getItem('zta_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Check if logged in
function isLoggedIn() {
  return !!localStorage.getItem('zta_token');
}

// Require auth (redirect if not logged in)
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login/';
    return false;
  }
  return true;
}
