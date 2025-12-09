// Zero Trust Analytics - Dashboard JavaScript
// Note: API_BASE is defined in auth.js which loads first

let currentSiteId = null;
let currentPeriod = '7d';
let realtimeInterval = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  if (!requireAuth()) return;
  checkCheckoutStatus();
  loadSites();
  initDatePickers();
});

// Initialize date pickers with default values
function initDatePickers() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
  document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
}

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
    stopRealtimeUpdates();
    return;
  }

  document.getElementById('stats-content').style.display = 'block';
  document.getElementById('current-site-domain').textContent = selector.options[selector.selectedIndex].text;

  // Update embed code
  const embedCode = `<script src="https://zerotrustanalytics.netlify.app/js/analytics.js" data-site-id="${currentSiteId}"></script>`;
  document.getElementById('embed-code').textContent = embedCode;

  try {
    const res = await fetch(`${API_BASE}/stats?siteId=${currentSiteId}&period=${currentPeriod}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load stats');
    }

    updateDashboard(data);
    startRealtimeUpdates();

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Load stats with custom date range
async function loadStatsCustomRange() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (!startDate || !endDate || !currentSiteId) return;

  // Clear period selector active state
  document.querySelectorAll('.period-selector .btn').forEach(btn => btn.classList.remove('active'));

  try {
    const res = await fetch(`${API_BASE}/stats?siteId=${currentSiteId}&startDate=${startDate}&endDate=${endDate}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    updateDashboard(data);

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Update all dashboard elements
function updateDashboard(data) {
  // Primary stats
  document.getElementById('unique-visitors').textContent = formatNumber(data.uniqueVisitors || 0);
  document.getElementById('page-views').textContent = formatNumber(data.pageviews || 0);
  document.getElementById('sessions').textContent = formatNumber(data.uniqueSessions || 0);
  document.getElementById('bounce-rate').textContent = (data.bounceRate || 0) + '%';

  // Secondary stats
  document.getElementById('avg-session-duration').textContent = formatDuration(data.avgSessionDuration || 0);
  document.getElementById('pages-per-session').textContent = (data.avgPagesPerSession || 0).toFixed(1);
  document.getElementById('avg-scroll-depth').textContent = (data.avgScrollDepth || 0) + '%';
  document.getElementById('new-vs-returning').textContent =
    `${formatNumber(data.newVisitors || 0)} / ${formatNumber(data.returningVisitors || 0)}`;

  // Pages table
  const pages = Object.entries(data.pages || {}).sort((a, b) => b[1] - a[1]);
  document.getElementById('pages-count').textContent = pages.length;
  populatePagesTable('top-pages-table', pages, data.avgTimeOnPage || {});

  // Referrers table
  const referrers = Object.entries(data.referrers || {}).sort((a, b) => b[1] - a[1]);
  document.getElementById('referrers-count').textContent = referrers.length;
  populateTable('top-referrers-table', referrers, 'Direct');

  // Landing pages
  const landingPages = Object.entries(data.landingPages || {}).sort((a, b) => b[1] - a[1]);
  populateTable('landing-pages-table', landingPages);

  // Exit pages
  const exitPages = Object.entries(data.exitPages || {}).sort((a, b) => b[1] - a[1]);
  populateTable('exit-pages-table', exitPages);

  // Traffic sources
  const trafficSources = Object.entries(data.trafficSources || {}).sort((a, b) => b[1] - a[1]);
  populateTable('traffic-sources-table', trafficSources);

  // Devices
  const devices = Object.entries(data.devices || {}).sort((a, b) => b[1] - a[1]);
  populateTable('devices-table', devices);

  // Browsers
  const browsers = Object.entries(data.browsers || {}).sort((a, b) => b[1] - a[1]);
  populateTable('browsers-table', browsers);

  // Operating Systems
  const os = Object.entries(data.operatingSystems || {}).sort((a, b) => b[1] - a[1]);
  populateTable('os-table', os);

  // Countries
  const countries = Object.entries(data.countries || {}).sort((a, b) => b[1] - a[1]);
  populateTable('countries-table', countries);

  // Languages
  const languages = Object.entries(data.languages || {}).sort((a, b) => b[1] - a[1]);
  populateTable('languages-table', languages);

  // Campaigns
  const campaigns = Object.entries(data.campaigns || {}).sort((a, b) => b[1] - a[1]);
  populateTable('campaigns-table', campaigns);

  // Events
  document.getElementById('total-events').textContent = formatNumber(data.totalEvents || 0);
  const events = Object.entries(data.events || {}).map(([key, val]) => [key, val.count]).sort((a, b) => b[1] - a[1]);
  populateTable('events-table', events);
}

// Set period and reload
function setPeriod(period) {
  currentPeriod = period;

  // Update button states
  document.querySelectorAll('.period-selector .btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Update date pickers to match period
  const endDate = new Date();
  const startDate = new Date();
  switch (period) {
    case '24h': startDate.setDate(startDate.getDate() - 1); break;
    case '7d': startDate.setDate(startDate.getDate() - 7); break;
    case '30d': startDate.setDate(startDate.getDate() - 30); break;
    case '90d': startDate.setDate(startDate.getDate() - 90); break;
    case '365d': startDate.setDate(startDate.getDate() - 365); break;
  }
  document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
  document.getElementById('end-date').value = endDate.toISOString().split('T')[0];

  if (currentSiteId) {
    loadStats();
  }
}

// Real-time updates
function startRealtimeUpdates() {
  stopRealtimeUpdates();
  updateRealtime();
  realtimeInterval = setInterval(updateRealtime, 15000); // Every 15 seconds
}

function stopRealtimeUpdates() {
  if (realtimeInterval) {
    clearInterval(realtimeInterval);
    realtimeInterval = null;
  }
}

async function updateRealtime() {
  if (!currentSiteId) return;

  try {
    const res = await fetch(`${API_BASE}/realtime?siteId=${currentSiteId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (res.ok) {
      document.getElementById('active-visitors').textContent = data.activeVisitors || 0;
    }
  } catch (err) {
    console.error('Realtime update failed:', err);
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
      throw new Error(data.error || 'Failed to create site');
    }

    // Show embed code immediately
    alert('Site created! Embed code:\n\n' + data.embedCode);

    // Close modal and reload sites
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSiteModal'));
    modal.hide();
    form.reset();

    // Reload and select new site
    await loadSites();
    document.getElementById('site-selector').value = data.site.id;
    loadStats();

  } catch (err) {
    console.error('Add site error:', err);
    errorEl.textContent = err.message;
    errorEl.classList.remove('d-none');
  }
}

// Export data
async function exportData(format) {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const url = `${API_BASE}/export?siteId=${currentSiteId}&format=${format}&period=${currentPeriod}`;

  try {
    const res = await fetch(url, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      throw new Error('Export failed');
    }

    const blob = await res.blob();
    const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `analytics.${format}`;

    // Download file
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to export data');
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

// Helper: Format duration
function formatDuration(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Helper: Truncate string
function truncate(str, len) {
  if (!str) return '-';
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
      <td title="${name || emptyLabel}">${truncate(name || emptyLabel, 30)}</td>
      <td class="text-end">${formatNumber(count)}</td>
    </tr>
  `).join('');
}

// Helper: Populate pages table with time on page
function populatePagesTable(tableId, data, timeOnPage) {
  const tbody = document.getElementById(tableId);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No data yet</td></tr>`;
    return;
  }

  tbody.innerHTML = data.slice(0, 10).map(([path, count]) => {
    const avgTime = timeOnPage[path] || 0;
    return `
      <tr>
        <td title="${path}">${truncate(path, 25)}</td>
        <td class="text-end">${formatNumber(count)}</td>
        <td class="text-end">${formatDuration(avgTime)}</td>
      </tr>
    `;
  }).join('');
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
