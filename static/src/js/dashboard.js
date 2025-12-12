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
  checkUserStatus();
  loadSites();
  initDatePickers();
  initTooltips();
  initKeyboardShortcuts();
});

// Initialize Bootstrap tooltips
function initTooltips() {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => {
    new bootstrap.Tooltip(el, {
      trigger: 'hover focus',
      delay: { show: 300, hide: 100 }
    });
  });
}

// Check user's subscription/trial status
async function checkUserStatus() {
  try {
    const res = await fetch(`${API_BASE}/user/status`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) return;

    const data = await res.json();
    const trialBanner = document.getElementById('trial-banner');
    const expiredBanner = document.getElementById('expired-banner');
    const trialText = document.getElementById('trial-status-text');

    if (data.status === 'trial') {
      // Show trial banner with days remaining
      if (trialBanner && trialText) {
        trialText.textContent = data.daysLeft === 1
          ? '1 day left in your free trial'
          : `${data.daysLeft} days left in your free trial`;
        trialBanner.classList.remove('d-none');
      }
    } else if (data.status === 'expired') {
      // Show expired banner
      if (expiredBanner) {
        expiredBanner.classList.remove('d-none');
      }
    }
    // If status is 'active', don't show any banner

  } catch (err) {
    console.error('Failed to check user status:', err);
  }
}

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

      // Show onboarding wizard for new users
      const hasSeenOnboarding = localStorage.getItem('zta_onboarding_seen');
      if (!hasSeenOnboarding) {
        setTimeout(() => showOnboardingWizard(), 500);
        localStorage.setItem('zta_onboarding_seen', 'true');
      }
    }
  } catch (err) {
    console.error('Failed to load sites:', err);
  }
}

// Show/hide loading skeleton
function showLoading(show) {
  const skeleton = document.getElementById('loading-skeleton');
  const content = document.getElementById('stats-content');
  if (skeleton) skeleton.style.display = show ? 'block' : 'none';
  if (content) content.style.display = show ? 'none' : 'block';
}

// Load stats for selected site
async function loadStats() {
  const selector = document.getElementById('site-selector');
  currentSiteId = selector.value;

  const settingsBtn = document.getElementById('site-settings-btn');

  if (!currentSiteId) {
    document.getElementById('stats-content').style.display = 'none';
    document.getElementById('loading-skeleton').style.display = 'none';
    if (settingsBtn) settingsBtn.style.display = 'none';
    stopRealtimeUpdates();
    return;
  }

  // Show skeleton while loading
  showLoading(true);
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
    showLoading(false);
    startRealtimeUpdates();

  } catch (err) {
    console.error('Failed to load stats:', err);
    showLoading(false);
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

// === ONBOARDING WIZARD ===

let onboardingStep = 1;
let onboardingSiteId = null;
let verificationInterval = null;

// Show onboarding wizard for new users
function showOnboardingWizard() {
  onboardingStep = 1;
  onboardingSiteId = null;

  // Reset UI state
  document.getElementById('onboarding-domain').value = '';
  document.getElementById('onboarding-error').classList.add('d-none');
  document.getElementById('onboarding-back').style.display = 'none';
  document.getElementById('onboarding-next').classList.remove('d-none');
  document.getElementById('onboarding-finish').classList.add('d-none');

  // Reset steps display
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`onboarding-step-${i}`).classList.add('d-none');
    document.querySelector(`[data-step="${i}"]`).classList.remove('active', 'completed');
  }
  document.getElementById('onboarding-step-1').classList.remove('d-none');
  document.querySelector('[data-step="1"]').classList.add('active');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('onboardingModal'));
  modal.show();
}

// Navigate to next step
async function onboardingNext() {
  const errorEl = document.getElementById('onboarding-error');
  errorEl.classList.add('d-none');

  if (onboardingStep === 1) {
    // Step 1 → 2: Create site
    const domain = document.getElementById('onboarding-domain').value.trim();

    if (!domain) {
      errorEl.textContent = 'Please enter your website domain';
      errorEl.classList.remove('d-none');
      return;
    }

    // Validate domain format
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/;
    if (!domainPattern.test(domain)) {
      errorEl.textContent = 'Please enter a valid domain (e.g., example.com)';
      errorEl.classList.remove('d-none');
      return;
    }

    // Disable button while creating
    const nextBtn = document.getElementById('onboarding-next');
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';

    try {
      const data = await ZTA.api.apiPost('/sites/create', { domain });
      onboardingSiteId = data.site.id;

      // Update embed code
      const embedCode = `<script src="https://ztas.io/js/analytics.js" data-site-id="${onboardingSiteId}"></script>`;
      document.getElementById('onboarding-embed-code').textContent = embedCode;

      // Move to step 2
      goToOnboardingStep(2);

    } catch (err) {
      errorEl.textContent = err.message || 'Failed to create site';
      errorEl.classList.remove('d-none');
    } finally {
      nextBtn.disabled = false;
      nextBtn.innerHTML = 'Continue <i class="bi bi-arrow-right ms-1"></i>';
    }

  } else if (onboardingStep === 2) {
    // Step 2 → 3: Start verification
    goToOnboardingStep(3);
    startVerification();
  }
}

// Navigate to previous step
function onboardingBack() {
  if (onboardingStep > 1) {
    goToOnboardingStep(onboardingStep - 1);
  }
}

// Go to specific onboarding step
function goToOnboardingStep(step) {
  // Hide current step
  document.getElementById(`onboarding-step-${onboardingStep}`).classList.add('d-none');
  document.querySelector(`[data-step="${onboardingStep}"]`).classList.remove('active');
  document.querySelector(`[data-step="${onboardingStep}"]`).classList.add('completed');

  // Show new step
  onboardingStep = step;
  document.getElementById(`onboarding-step-${step}`).classList.remove('d-none');
  document.querySelector(`[data-step="${step}"]`).classList.add('active');

  // Update buttons
  document.getElementById('onboarding-back').style.display = step > 1 ? 'inline-block' : 'none';

  if (step === 3) {
    document.getElementById('onboarding-next').classList.add('d-none');
  } else {
    document.getElementById('onboarding-next').classList.remove('d-none');
  }
}

// Copy embed code from onboarding
function copyOnboardingCode() {
  const code = document.getElementById('onboarding-embed-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = event.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-success');

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('btn-success');
      btn.classList.add('btn-outline-primary');
    }, 2000);
  });
}

// Start verification polling
function startVerification() {
  const spinner = document.getElementById('verification-spinner');
  const success = document.getElementById('verification-success');

  spinner.classList.remove('d-none');
  success.classList.add('d-none');

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes (every 5 seconds)

  verificationInterval = setInterval(async () => {
    attempts++;

    if (attempts > maxAttempts) {
      clearInterval(verificationInterval);
      spinner.innerHTML = `
        <i class="bi bi-clock text-warning" style="font-size: 2.5rem;"></i>
        <p class="mt-3 text-muted">Taking longer than expected?</p>
        <p class="small text-muted">Make sure the script is installed and visit your site.</p>
        <button class="btn btn-primary mt-2" onclick="startVerification()">
          <i class="bi bi-arrow-repeat me-1"></i>Check Again
        </button>
      `;
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/stats?siteId=${onboardingSiteId}&period=24h`, {
        headers: getAuthHeaders()
      });

      const data = await res.json();

      // Check if we have any pageviews
      if (data.pageviews && data.pageviews > 0) {
        clearInterval(verificationInterval);
        onVerificationSuccess();
      }
    } catch (err) {
      console.error('Verification check failed:', err);
    }

  }, 5000); // Check every 5 seconds
}

// Handle successful verification
function onVerificationSuccess() {
  const spinner = document.getElementById('verification-spinner');
  const success = document.getElementById('verification-success');

  spinner.classList.add('d-none');
  success.classList.remove('d-none');

  // Show finish button
  document.getElementById('onboarding-finish').classList.remove('d-none');
  document.getElementById('onboarding-back').style.display = 'none';

  // Celebration confetti effect
  createConfetti();
}

// Simple confetti effect
function createConfetti() {
  const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1'];
  const confettiCount = 50;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${Math.random() * 100}vw;
      top: -10px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
      pointer-events: none;
      z-index: 9999;
      animation: confetti-fall ${2 + Math.random() * 2}s linear forwards;
    `;
    document.body.appendChild(confetti);

    setTimeout(() => confetti.remove(), 4000);
  }

  // Add keyframe animation if not exists
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `
      @keyframes confetti-fall {
        to {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Finish onboarding
function finishOnboarding() {
  // Stop any running verification
  if (verificationInterval) {
    clearInterval(verificationInterval);
    verificationInterval = null;
  }

  // Reload sites and select the new one
  loadSites().then(() => {
    if (onboardingSiteId) {
      document.getElementById('site-selector').value = onboardingSiteId;
      loadStats();
    }
  });
}

// === KEYBOARD SHORTCUTS ===

const KEYBOARD_SHORTCUTS = {
  '?': { action: 'showHelp', description: 'Show keyboard shortcuts' },
  'r': { action: 'refresh', description: 'Refresh dashboard data' },
  'd': { action: 'toggleDarkMode', description: 'Toggle dark mode' },
  '1': { action: 'period24h', description: 'Set period to 24 hours' },
  '2': { action: 'period7d', description: 'Set period to 7 days' },
  '3': { action: 'period30d', description: 'Set period to 30 days' },
  '4': { action: 'period90d', description: 'Set period to 90 days' },
  '5': { action: 'period365d', description: 'Set period to 1 year' },
  'e': { action: 'exportJSON', description: 'Export data as JSON' },
  'c': { action: 'exportCSV', description: 'Export data as CSV' },
  'p': { action: 'exportPDF', description: 'Export as PDF' },
  's': { action: 'focusSiteSelector', description: 'Focus site selector' },
  'Escape': { action: 'closeModals', description: 'Close open modals' }
};

function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcut);
}

function handleKeyboardShortcut(e) {
  // Ignore if typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }

  // Ignore if modifier keys are pressed (except for ?)
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return;
  }

  const key = e.key;
  const shortcut = KEYBOARD_SHORTCUTS[key];

  if (!shortcut) return;

  e.preventDefault();

  switch (shortcut.action) {
    case 'showHelp':
      showKeyboardShortcutsHelp();
      break;
    case 'refresh':
      if (currentSiteId) loadStats();
      break;
    case 'toggleDarkMode':
      if (typeof toggleTheme === 'function') toggleTheme();
      break;
    case 'period24h':
      setPeriodByKey('24h');
      break;
    case 'period7d':
      setPeriodByKey('7d');
      break;
    case 'period30d':
      setPeriodByKey('30d');
      break;
    case 'period90d':
      setPeriodByKey('90d');
      break;
    case 'period365d':
      setPeriodByKey('365d');
      break;
    case 'exportJSON':
      if (currentSiteId) exportData('json');
      break;
    case 'exportCSV':
      if (currentSiteId) exportData('csv');
      break;
    case 'exportPDF':
      if (currentSiteId) exportPDF();
      break;
    case 'focusSiteSelector':
      document.getElementById('site-selector')?.focus();
      break;
    case 'closeModals':
      closeAllModals();
      break;
  }
}

// Set period without requiring event target
function setPeriodByKey(period) {
  if (!currentSiteId) return;

  currentPeriod = period;

  // Update button states
  document.querySelectorAll('.period-selector .btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.includes(period.replace('d', ' days').replace('h', ' hours').replace('365 days', '1 year'))) {
      btn.classList.add('active');
    }
  });

  // Find and activate the right button
  const periodLabels = { '24h': '24h', '7d': '7d', '30d': '30d', '90d': '90d', '365d': '1y' };
  document.querySelectorAll('.period-selector .btn').forEach(btn => {
    if (btn.textContent.trim() === periodLabels[period]) {
      btn.classList.add('active');
    }
  });

  loadStats();
}

function closeAllModals() {
  document.querySelectorAll('.modal.show').forEach(modal => {
    const bsModal = bootstrap.Modal.getInstance(modal);
    if (bsModal) bsModal.hide();
  });
}

// === SESSION MANAGEMENT ===

function openSessionsModal() {
  // Reset state
  document.getElementById('sessions-loading').classList.remove('d-none');
  document.getElementById('sessions-list').classList.add('d-none');
  document.getElementById('sessions-empty').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('sessionsModal'));
  modal.show();

  // Load sessions
  loadSessions();
}

async function loadSessions() {
  const loadingEl = document.getElementById('sessions-loading');
  const listEl = document.getElementById('sessions-list');
  const emptyEl = document.getElementById('sessions-empty');

  try {
    const res = await fetch(`${API_BASE}/user/sessions`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');

    if (!data.sessions || data.sessions.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = data.sessions.map(session => {
      const createdDate = new Date(session.createdAt).toLocaleDateString();
      const lastActive = formatRelativeTime(session.lastActiveAt);
      const deviceIcon = getDeviceIcon(session.device?.type);

      return `
        <div class="d-flex justify-content-between align-items-center py-3 border-bottom ${session.isCurrent ? 'bg-light rounded px-3' : ''}">
          <div class="d-flex align-items-center">
            <div class="me-3 text-muted" style="font-size: 1.5rem;">
              <i class="bi ${deviceIcon}"></i>
            </div>
            <div>
              <div class="fw-bold">
                ${session.device?.browser || 'Unknown'} on ${session.device?.os || 'Unknown'}
                ${session.isCurrent ? '<span class="badge bg-success ms-2">Current</span>' : ''}
              </div>
              <div class="small text-muted">
                ${session.device?.type || 'Unknown'} &bull; ${session.ipAddress} &bull; Active ${lastActive}
              </div>
              <div class="small text-muted">
                Signed in ${createdDate}
              </div>
            </div>
          </div>
          ${!session.isCurrent ? `
            <button class="btn btn-sm btn-outline-danger" onclick="revokeSession('${session.id}')" title="Sign out this device">
              <i class="bi bi-x-lg"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Load sessions error:', err);
    loadingEl.innerHTML = '<p class="text-danger">Failed to load sessions</p>';
  }
}

function getDeviceIcon(type) {
  switch (type?.toLowerCase()) {
    case 'mobile': return 'bi-phone';
    case 'tablet': return 'bi-tablet';
    default: return 'bi-laptop';
  }
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

async function revokeSession(sessionId) {
  if (!confirm('Sign out this device? They will need to log in again.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/user/sessions?sessionId=${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to revoke session');
    }

    // Reload sessions
    loadSessions();

  } catch (err) {
    console.error('Revoke session error:', err);
    alert('Failed to sign out device: ' + err.message);
  }
}

async function revokeAllSessions() {
  if (!confirm('Sign out all other devices? You will stay logged in on this device.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/user/sessions?all=true`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to revoke sessions');
    }

    alert(data.message || 'All other devices have been signed out');

    // Reload sessions
    loadSessions();

  } catch (err) {
    console.error('Revoke all sessions error:', err);
    alert('Failed to sign out devices: ' + err.message);
  }
}

// === SHARE DASHBOARD ===

function openShareModal() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  // Reset modal state
  showCreateShare();
  loadExistingShares();

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('shareModal'));
  modal.show();
}

function showCreateShare() {
  document.getElementById('share-create-section').classList.remove('d-none');
  document.getElementById('share-result-section').classList.add('d-none');
  document.getElementById('share-expiry').value = '';
}

async function createShareLink() {
  if (!currentSiteId) return;

  const expiry = document.getElementById('share-expiry').value;
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/sites/share`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        expiresIn: expiry || null
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create share link');
    }

    // Show result
    document.getElementById('share-url').value = data.shareUrl;
    document.getElementById('share-create-section').classList.add('d-none');
    document.getElementById('share-result-section').classList.remove('d-none');

    // Reload shares list
    loadExistingShares();

  } catch (err) {
    console.error('Create share error:', err);
    alert('Failed to create share link: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-link-45deg me-1"></i>Generate Share Link';
  }
}

function copyShareLink() {
  const url = document.getElementById('share-url').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="bi bi-check"></i>';
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 2000);
  });
}

async function loadExistingShares() {
  const container = document.getElementById('shares-list');

  try {
    const res = await fetch(`${API_BASE}/sites/share?siteId=${currentSiteId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    if (!data.shares || data.shares.length === 0) {
      container.innerHTML = '<p class="text-muted small">No active share links</p>';
      return;
    }

    container.innerHTML = data.shares.map(share => {
      const createdDate = new Date(share.createdAt).toLocaleDateString();
      const expiresText = share.expiresAt
        ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
        : 'Never expires';

      return `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
          <div>
            <code class="small">${share.token.substring(0, 12)}...</code>
            <div class="small text-muted">${createdDate} &bull; ${expiresText}</div>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="revokeShare('${share.token}')" title="Revoke">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Load shares error:', err);
    container.innerHTML = '<p class="text-danger small">Failed to load shares</p>';
  }
}

async function revokeShare(token) {
  if (!confirm('Are you sure you want to revoke this share link? Anyone with this link will no longer be able to access the dashboard.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/sites/share?token=${token}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to revoke share');
    }

    loadExistingShares();

  } catch (err) {
    console.error('Revoke share error:', err);
    alert('Failed to revoke share: ' + err.message);
  }
}

// === DATE RANGE PRESETS ===

function setDatePreset(preset) {
  const today = new Date();
  let startDate, endDate;

  switch (preset) {
    case 'today':
      startDate = endDate = new Date(today);
      break;

    case 'yesterday':
      startDate = endDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      break;

    case 'this-week':
      // Start of week (Monday)
      startDate = new Date(today);
      const dayOfWeek = startDate.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
      startDate.setDate(startDate.getDate() - diff);
      endDate = new Date(today);
      break;

    case 'this-month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today);
      break;

    case 'this-quarter':
      const currentQuarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
      endDate = new Date(today);
      break;

    case 'this-year':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today);
      break;

    case 'last-week':
      endDate = new Date(today);
      const lastWeekDay = endDate.getDay();
      const lastWeekDiff = lastWeekDay === 0 ? 6 : lastWeekDay - 1;
      endDate.setDate(endDate.getDate() - lastWeekDiff - 1); // Last Sunday
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6); // Previous Monday
      break;

    case 'last-month':
      endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of prev month
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1); // First day of prev month
      break;

    case 'last-quarter':
      const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
      const lastQuarterYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const adjustedQuarter = lastQuarter < 0 ? 3 : lastQuarter;
      startDate = new Date(lastQuarterYear, adjustedQuarter * 3, 1);
      endDate = new Date(lastQuarterYear, adjustedQuarter * 3 + 3, 0);
      break;

    case 'last-year':
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;

    default:
      return;
  }

  // Update date inputs
  document.getElementById('start-date').value = formatDateForInput(startDate);
  document.getElementById('end-date').value = formatDateForInput(endDate);

  // Update dropdown button text
  const presetLabels = {
    'today': 'Today',
    'yesterday': 'Yesterday',
    'this-week': 'This Week',
    'this-month': 'This Month',
    'this-quarter': 'This Quarter',
    'this-year': 'This Year',
    'last-week': 'Last Week',
    'last-month': 'Last Month',
    'last-quarter': 'Last Quarter',
    'last-year': 'Last Year'
  };

  const dropdownBtn = document.getElementById('datePresetDropdown');
  if (dropdownBtn) {
    dropdownBtn.innerHTML = `<i class="bi bi-calendar-range me-1"></i>${presetLabels[preset]}`;
  }

  // Clear period selector active state
  document.querySelectorAll('.period-selector .btn').forEach(btn => btn.classList.remove('active'));

  // Load stats with custom range
  if (currentSiteId) {
    loadStatsCustomRange();
  }
}

function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

// === PDF EXPORT ===

function exportPDF() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  // Update print header with current data
  const siteName = document.getElementById('current-site-domain').textContent;
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;
  const timestamp = new Date().toLocaleString();

  document.getElementById('print-site-name').textContent = siteName;
  document.getElementById('print-date-range').textContent = `${startDate} to ${endDate}`;
  document.getElementById('print-timestamp').textContent = timestamp;

  // Small delay to ensure charts are rendered, then print
  setTimeout(() => {
    window.print();
  }, 100);
}

function showKeyboardShortcutsHelp() {
  // Check if modal already exists
  let modal = document.getElementById('keyboardShortcutsModal');

  if (!modal) {
    // Create modal
    modal = document.createElement('div');
    modal.id = 'keyboardShortcutsModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-keyboard me-2"></i>Keyboard Shortcuts
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-6">
                <h6 class="text-muted mb-2">Navigation</h6>
                <ul class="list-unstyled">
                  <li class="mb-2"><kbd>?</kbd> <span class="ms-2">Show this help</span></li>
                  <li class="mb-2"><kbd>r</kbd> <span class="ms-2">Refresh data</span></li>
                  <li class="mb-2"><kbd>s</kbd> <span class="ms-2">Focus site selector</span></li>
                  <li class="mb-2"><kbd>Esc</kbd> <span class="ms-2">Close modals</span></li>
                </ul>
              </div>
              <div class="col-6">
                <h6 class="text-muted mb-2">Time Period</h6>
                <ul class="list-unstyled">
                  <li class="mb-2"><kbd>1</kbd> <span class="ms-2">24 hours</span></li>
                  <li class="mb-2"><kbd>2</kbd> <span class="ms-2">7 days</span></li>
                  <li class="mb-2"><kbd>3</kbd> <span class="ms-2">30 days</span></li>
                  <li class="mb-2"><kbd>4</kbd> <span class="ms-2">90 days</span></li>
                  <li class="mb-2"><kbd>5</kbd> <span class="ms-2">1 year</span></li>
                </ul>
              </div>
            </div>
            <hr>
            <div class="row">
              <div class="col-6">
                <h6 class="text-muted mb-2">Export</h6>
                <ul class="list-unstyled">
                  <li class="mb-2"><kbd>e</kbd> <span class="ms-2">Export JSON</span></li>
                  <li class="mb-2"><kbd>c</kbd> <span class="ms-2">Export CSV</span></li>
                  <li class="mb-2"><kbd>p</kbd> <span class="ms-2">Export PDF</span></li>
                </ul>
              </div>
              <div class="col-6">
                <h6 class="text-muted mb-2">Display</h6>
                <ul class="list-unstyled">
                  <li class="mb-2"><kbd>d</kbd> <span class="ms-2">Toggle dark mode</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}
