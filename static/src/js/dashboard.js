// Zero Trust Analytics - Dashboard JavaScript

const API_BASE = '/api';
let currentSiteId = null;
let currentPeriod = '7d';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  if (!requireAuth()) return;
  checkCheckoutStatus();
  loadSites();
});

// Load user's sites
async function loadSites() {
  try {
    const res = await fetch(`${API_BASE}/sites/list`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        logout();
        return;
      }
      throw new Error(data.error);
    }

    const selector = document.getElementById('site-selector');
    const emptyState = document.getElementById('empty-state');
    const statsContent = document.getElementById('stats-content');

    if (data.sites && data.sites.length > 0) {
      emptyState.style.display = 'none';

      // Populate site selector
      selector.innerHTML = '<option value="">Select a site...</option>';
      data.sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.id;
        option.textContent = site.domain;
        selector.appendChild(option);
      });

      // Auto-select first site
      if (data.sites.length === 1) {
        selector.value = data.sites[0].id;
        loadStats();
      }
    } else {
      emptyState.style.display = 'block';
      statsContent.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load sites:', err);
  }
}

// Load stats for selected site
async function loadStats() {
  const selector = document.getElementById('site-selector');
  currentSiteId = selector.value;

  if (!currentSiteId) {
    document.getElementById('stats-content').style.display = 'none';
    return;
  }

  document.getElementById('stats-content').style.display = 'block';
  document.getElementById('current-site-domain').textContent = selector.options[selector.selectedIndex].text;

  // Update embed code
  const embedCode = `<script src="https://zero-trust-analytics.netlify.app/js/analytics.js" data-site-id="${currentSiteId}"></script>`;
  document.getElementById('embed-code').textContent = embedCode;

  try {
    const res = await fetch(`${API_BASE}/stats?siteId=${currentSiteId}&period=${currentPeriod}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    // Update stats
    document.getElementById('unique-visitors').textContent = formatNumber(data.uniqueVisitors || 0);
    document.getElementById('page-views').textContent = formatNumber(data.pageviews || 0);

    // Top page
    const pages = Object.entries(data.pages || {}).sort((a, b) => b[1] - a[1]);
    document.getElementById('top-page').textContent = pages.length > 0 ? truncate(pages[0][0], 15) : '-';

    // Top referrer
    const referrers = Object.entries(data.referrers || {}).sort((a, b) => b[1] - a[1]);
    document.getElementById('top-referrer').textContent = referrers.length > 0 ? truncate(referrers[0][0], 15) : 'Direct';

    // Populate tables
    populateTable('top-pages-table', pages);
    populateTable('top-referrers-table', referrers, 'Direct');

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Set period and reload
function setPeriod(period) {
  currentPeriod = period;

  // Update button states
  document.querySelectorAll('.period-selector .btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase().includes(period.replace('d', ' day').replace('h', 'h'))) {
      btn.classList.add('active');
    }
  });

  if (currentSiteId) {
    loadStats();
  }
}

// Handle add site form
async function handleAddSite(event) {
  event.preventDefault();
  const form = event.target;
  const domain = document.getElementById('site-domain').value.trim();
  const errorEl = document.getElementById('add-site-error');

  errorEl.classList.add('d-none');

  try {
    const res = await fetch(`${API_BASE}/sites/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ domain })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    // Close modal and reload sites
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSiteModal'));
    modal.hide();
    form.reset();

    // Reload and select new site
    await loadSites();
    document.getElementById('site-selector').value = data.site.id;
    loadStats();

  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('d-none');
  }
}

// Copy embed code to clipboard
function copyEmbedCode() {
  const code = document.getElementById('embed-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert('Embed code copied to clipboard!');
  });
}

// Helper: Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Helper: Truncate string
function truncate(str, len) {
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

// Helper: Populate table
function populateTable(tableId, data, emptyLabel = '-') {
  const tbody = document.getElementById(tableId);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No data yet</td></tr>`;
    return;
  }

  tbody.innerHTML = data.slice(0, 10).map(([name, count]) => `
    <tr>
      <td>${name || emptyLabel}</td>
      <td class="text-end">${formatNumber(count)}</td>
    </tr>
  `).join('');
}

// === STRIPE BILLING ===

// Start checkout for subscription
async function startCheckout() {
  try {
    const res = await fetch(`${API_BASE}/stripe/checkout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    // Redirect to Stripe checkout
    window.location.href = data.url;
  } catch (err) {
    console.error('Checkout error:', err);
    alert('Failed to start checkout: ' + err.message);
  }
}

// Open billing portal
async function openBillingPortal() {
  try {
    const res = await fetch(`${API_BASE}/stripe/portal`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    // Redirect to Stripe portal
    window.location.href = data.url;
  } catch (err) {
    console.error('Portal error:', err);
    alert('Failed to open billing portal: ' + err.message);
  }
}

// Check URL params for checkout status
function checkCheckoutStatus() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('success') === 'true') {
    alert('Payment successful! Your subscription is now active.');
    // Clean URL
    window.history.replaceState({}, document.title, '/dashboard/');
  }

  if (params.get('canceled') === 'true') {
    alert('Checkout was canceled. You can try again when ready.');
    window.history.replaceState({}, document.title, '/dashboard/');
  }
}
