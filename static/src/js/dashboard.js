// Zero Trust Analytics - Dashboard JavaScript
// Requires: shared/auth-service.js, shared/utils.js, shared/api.js, shared/modal.js
// Note: Uses shared utilities from ZTA namespace

let currentSiteId = null;
let currentPeriod = '7d';
let realtimeInterval = null;
let visitorsChart = null;
let sourcesChart = null;
let devicesChart = null;
let browsersChart = null;
let compareEnabled = false;
let previousPeriodData = null;

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
        option.textContent = site.nickname || site.domain;
        option.dataset.domain = site.domain;
        option.dataset.nickname = site.nickname || '';
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

  const settingsBtn = document.getElementById('site-settings-btn');

  if (!currentSiteId) {
    document.getElementById('stats-content').style.display = 'none';
    if (settingsBtn) settingsBtn.style.display = 'none';
    stopRealtimeUpdates();
    return;
  }

  document.getElementById('stats-content').style.display = 'block';
  if (settingsBtn) settingsBtn.style.display = 'inline-block';
  document.getElementById('current-site-domain').textContent = selector.options[selector.selectedIndex].text;

  // Update embed code
  const embedCode = `<script src="https://ztas.io/js/analytics.js" data-site-id="${currentSiteId}"></script>`;
  document.getElementById('embed-code').textContent = embedCode;

  try {
    const res = await fetch(`${API_BASE}/stats?siteId=${currentSiteId}&period=${currentPeriod}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load stats');
    }

    // Fetch comparison data if enabled
    if (compareEnabled) {
      await loadComparisonData();
    } else {
      previousPeriodData = null;
      clearComparisonDisplay();
    }

    updateDashboard(data);
    startRealtimeUpdates();

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Toggle comparison mode
function toggleComparison() {
  compareEnabled = document.getElementById('compare-toggle').checked;
  if (currentSiteId) {
    loadStats();
  }
}

// Load comparison data for previous period
async function loadComparisonData() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (!startDate || !endDate) return;

  // Calculate previous period dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays);

  try {
    const res = await fetch(`${API_BASE}/stats?siteId=${currentSiteId}&startDate=${prevStart.toISOString().split('T')[0]}&endDate=${prevEnd.toISOString().split('T')[0]}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (res.ok) {
      previousPeriodData = data;
    }
  } catch (err) {
    console.error('Failed to load comparison data:', err);
    previousPeriodData = null;
  }
}

// Clear comparison display
function clearComparisonDisplay() {
  const compareEls = document.querySelectorAll('.stat-comparison');
  compareEls.forEach(el => el.innerHTML = '');
}

// Format comparison change
function formatChange(current, previous, isPercentage = false, invertColors = false) {
  if (previous === 0 || previous === undefined || previous === null) {
    return '<span class="neutral">-</span>';
  }

  const change = ((current - previous) / previous) * 100;
  const absChange = Math.abs(change).toFixed(1);

  let colorClass;
  if (change > 0) {
    colorClass = invertColors ? 'down' : 'up';
  } else if (change < 0) {
    colorClass = invertColors ? 'up' : 'down';
  } else {
    colorClass = 'neutral';
  }

  const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  return `<span class="${colorClass}">${arrow} ${absChange}%</span>`;
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

  // Show comparison if enabled
  if (compareEnabled && previousPeriodData) {
    document.getElementById('unique-visitors-compare').innerHTML =
      formatChange(data.uniqueVisitors || 0, previousPeriodData.uniqueVisitors || 0);
    document.getElementById('page-views-compare').innerHTML =
      formatChange(data.pageviews || 0, previousPeriodData.pageviews || 0);
    document.getElementById('sessions-compare').innerHTML =
      formatChange(data.uniqueSessions || 0, previousPeriodData.uniqueSessions || 0);
    // For bounce rate, lower is better (invert colors)
    document.getElementById('bounce-rate-compare').innerHTML =
      formatChange(data.bounceRate || 0, previousPeriodData.bounceRate || 0, true, true);
  } else {
    clearComparisonDisplay();
  }

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

  // Events with enhanced display
  document.getElementById('total-events').textContent = formatNumber(data.totalEvents || 0);
  populateEventsTable('events-table', data.events || {});

  // Update charts
  updateCharts(data);
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

      // Update real-time traffic sources
      const sourcesEl = document.getElementById('realtime-sources');
      if (sourcesEl && data.trafficSources && data.trafficSources.length > 0) {
        const sourceColors = {
          'direct': 'bg-primary',
          'organic': 'bg-success',
          'referral': 'bg-info',
          'social': 'bg-warning',
          'default': 'bg-secondary'
        };

        sourcesEl.innerHTML = data.trafficSources.slice(0, 4).map(s => {
          const colorClass = sourceColors[s.source] || sourceColors['default'];
          return `<span class="badge ${colorClass}">${s.source}: ${s.count}</span>`;
        }).join('');
        sourcesEl.style.display = 'flex';
      } else if (sourcesEl) {
        sourcesEl.style.display = 'none';
      }
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

  ZTA.utils.hideElement('add-site-error');

  try {
    const data = await ZTA.api.apiPost('/sites/create', { domain });

    // Show embed code immediately
    alert('Site created! Embed code:\n\n' + data.embedCode);

    // Close modal and reload sites
    hideModal('addSiteModal');
    form.reset();

    // Reload and select new site
    await loadSites();
    document.getElementById('site-selector').value = data.site.id;
    loadStats();

  } catch (err) {
    console.error('Add site error:', err);
    const errorEl = document.getElementById('add-site-error');
    errorEl.textContent = err.message;
    ZTA.utils.showElement(errorEl);
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

// Helper functions are now in shared/utils.js
// Using ZTA.utils.formatNumber, ZTA.utils.formatDuration, ZTA.utils.truncate
// Aliased globally for backward compatibility

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

// === CHARTS ===

function updateCharts(data) {
  if (typeof Chart === 'undefined') return;

  updateVisitorsChart(data.daily || []);
  updateSourcesChart(data.trafficSources || {});
  updateDevicesChart(data.devices || {});
  updateBrowsersChart(data.browsers || {});
}

function updateVisitorsChart(dailyData) {
  const ctx = document.getElementById('visitors-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (visitorsChart) {
    visitorsChart.destroy();
  }

  // Prepare data - last N days
  const labels = dailyData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const visitors = dailyData.map(d => d.uniqueVisitors || 0);
  const pageviews = dailyData.map(d => d.pageviews || 0);

  visitorsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Visitors',
          data: visitors,
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13, 110, 253, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Pageviews',
          data: pageviews,
          borderColor: '#6c757d',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function updateSourcesChart(sources) {
  const ctx = document.getElementById('sources-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (sourcesChart) {
    sourcesChart.destroy();
  }

  const sortedSources = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const labels = sortedSources.map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
  const values = sortedSources.map(([, count]) => count);

  const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6c757d'];

  sourcesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 10
          }
        }
      }
    }
  });
}

function updateDevicesChart(devices) {
  const ctx = document.getElementById('devices-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (devicesChart) {
    devicesChart.destroy();
  }

  const sortedDevices = Object.entries(devices).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const labels = sortedDevices.map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
  const values = sortedDevices.map(([, count]) => count);

  const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6c757d'];

  devicesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Visits',
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function updateBrowsersChart(browsers) {
  const ctx = document.getElementById('browsers-chart');
  if (!ctx) return;

  // Destroy existing chart
  if (browsersChart) {
    browsersChart.destroy();
  }

  const sortedBrowsers = Object.entries(browsers).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = sortedBrowsers.map(([name]) => name);
  const values = sortedBrowsers.map(([, count]) => count);

  const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6c757d', '#0dcaf0'];

  browsersChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 8,
            font: {
              size: 11
            }
          }
        }
      }
    }
  });
}

// Helper: Populate events table with details
function populateEventsTable(tableId, events) {
  const tbody = document.getElementById(tableId);
  const valueTotalEl = document.getElementById('events-value-total');

  if (!events || Object.keys(events).length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No data yet</td></tr>`;
    if (valueTotalEl) valueTotalEl.style.display = 'none';
    return;
  }

  // Sort by count
  const sortedEvents = Object.entries(events).sort((a, b) => b[1].count - a[1].count);
  let totalValue = 0;

  tbody.innerHTML = sortedEvents.slice(0, 15).map(([key, data]) => {
    // Parse event key (category:action)
    const [category, action] = key.split(':');
    const eventName = action || category;

    // Get top labels as details
    const labels = Object.entries(data.labels || {}).sort((a, b) => b[1] - a[1]);
    const topLabels = labels.slice(0, 3).map(([label]) => label).join(', ');

    // Format value
    const value = data.totalValue || 0;
    totalValue += value;
    const valueStr = value > 0 ? `$${formatNumber(value.toFixed(2))}` : '-';

    return `
      <tr>
        <td>
          <span class="badge bg-secondary me-1">${truncate(category, 10)}</span>
          <strong>${truncate(eventName, 15)}</strong>
        </td>
        <td class="text-muted small">${topLabels || '-'}</td>
        <td class="text-end">${formatNumber(data.count)}</td>
        <td class="text-end">${valueStr}</td>
      </tr>
    `;
  }).join('');

  // Show total value if any
  if (valueTotalEl) {
    if (totalValue > 0) {
      valueTotalEl.textContent = `$${formatNumber(totalValue.toFixed(2))}`;
      valueTotalEl.style.display = 'inline';
    } else {
      valueTotalEl.style.display = 'none';
    }
  }
}

// === SITE MANAGEMENT ===

let currentSiteData = null;

// Open site settings modal
function openSiteSettings() {
  if (!currentSiteId) return;

  const selector = document.getElementById('site-selector');
  const selectedOption = selector.options[selector.selectedIndex];

  document.getElementById('settings-site-id').value = currentSiteId;
  document.getElementById('settings-domain').value = selectedOption.dataset.domain || selectedOption.textContent;
  document.getElementById('settings-nickname').value = selectedOption.dataset.nickname || '';
  ZTA.utils.hideElement('site-settings-error');

  showModal('siteSettingsModal');
}

// Handle site update
async function handleUpdateSite(event) {
  event.preventDefault();

  const siteId = document.getElementById('settings-site-id').value;
  const domain = document.getElementById('settings-domain').value.trim();
  const nickname = document.getElementById('settings-nickname').value.trim();

  ZTA.utils.hideElement('site-settings-error');

  try {
    const data = await ZTA.api.apiPost('/sites/update', { siteId, domain, nickname });

    // Close modal and reload
    hideModal('siteSettingsModal');
    await loadSites();

    // Re-select the site
    document.getElementById('site-selector').value = siteId;
    loadStats();

  } catch (err) {
    console.error('Update site error:', err);
    const errorEl = document.getElementById('site-settings-error');
    errorEl.textContent = err.message;
    ZTA.utils.showElement(errorEl);
  }
}

// Confirm and delete site
function confirmDeleteSite() {
  const siteId = document.getElementById('settings-site-id').value;
  const domain = document.getElementById('settings-domain').value;

  if (confirm(`Are you sure you want to delete "${domain}"?\n\nThis will permanently remove all analytics data for this site. This action cannot be undone.`)) {
    deleteSite(siteId);
  }
}

// Delete site
async function deleteSite(siteId) {
  try {
    await ZTA.api.apiPost('/sites/delete', { siteId });

    // Close modal and reload
    hideModal('siteSettingsModal');

    alert('Site deleted successfully');
    await loadSites();

  } catch (err) {
    console.error('Delete site error:', err);
    alert('Failed to delete site: ' + err.message);
  }
}

// === STRIPE BILLING ===

// Start checkout for subscription
async function startCheckout() {
  try {
    const data = await ZTA.api.apiPost('/stripe/checkout');
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
    const data = await ZTA.api.apiPost('/stripe/portal');
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
