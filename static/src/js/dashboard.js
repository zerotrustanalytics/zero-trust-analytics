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

    // Load annotations for chart
    loadAnnotationsForChart();

  } catch (err) {
    showLoading(false);
  }
}

// Load annotations silently for chart display
async function loadAnnotationsForChart() {
  if (!currentSiteId) return;

  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  try {
    let url = `${API_BASE}/annotations?siteId=${currentSiteId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    const res = await fetch(url, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (res.ok) {
      currentAnnotations = data.annotations || [];
      updateAnnotationMarkers(currentAnnotations);
    }
  } catch (err) {
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

// === ACTIVITY LOG ===

let activityOffset = 0;

function openActivityModal() {
  // Reset state
  activityOffset = 0;
  document.getElementById('activity-loading').classList.remove('d-none');
  document.getElementById('activity-list').classList.add('d-none');
  document.getElementById('activity-empty').classList.add('d-none');
  document.getElementById('activity-load-more').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('activityModal'));
  modal.show();

  // Load activity
  loadActivity();
}

async function loadActivity(append = false) {
  const loadingEl = document.getElementById('activity-loading');
  const listEl = document.getElementById('activity-list');
  const emptyEl = document.getElementById('activity-empty');
  const loadMoreEl = document.getElementById('activity-load-more');

  if (!append) {
    loadingEl.classList.remove('d-none');
    listEl.classList.add('d-none');
  }

  try {
    const res = await fetch(`${API_BASE}/activity?limit=20&offset=${activityOffset}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');

    if (!data.activities || data.activities.length === 0) {
      if (activityOffset === 0) {
        emptyEl.classList.remove('d-none');
      }
      loadMoreEl.classList.add('d-none');
      return;
    }

    listEl.classList.remove('d-none');

    const activitiesHtml = data.activities.map(activity => {
      const icon = getActivityIcon(activity.type);
      const timeAgo = formatRelativeTime(activity.timestamp);

      return `
        <div class="d-flex py-3 border-bottom">
          <div class="me-3 text-muted" style="font-size: 1.25rem;">
            <i class="bi ${icon}"></i>
          </div>
          <div class="flex-grow-1">
            <div class="fw-medium">${escapeHtml(activity.message)}</div>
            <div class="small text-muted">
              ${timeAgo} &bull; ${maskIP(activity.ipAddress)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (append) {
      listEl.innerHTML += activitiesHtml;
    } else {
      listEl.innerHTML = activitiesHtml;
    }

    activityOffset += data.activities.length;

    if (data.hasMore) {
      loadMoreEl.classList.remove('d-none');
    } else {
      loadMoreEl.classList.add('d-none');
    }

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load activity</p>';
  }
}

function loadMoreActivity() {
  loadActivity(true);
}

function getActivityIcon(type) {
  const icons = {
    'auth.login': 'bi-box-arrow-in-right',
    'auth.logout': 'bi-box-arrow-left',
    'auth.password_change': 'bi-key',
    'auth.password_reset': 'bi-key-fill',
    'site.create': 'bi-plus-circle',
    'site.update': 'bi-pencil',
    'site.delete': 'bi-trash',
    'api_key.create': 'bi-key',
    'api_key.revoke': 'bi-key-fill',
    'share.create': 'bi-share',
    'share.revoke': 'bi-share-fill',
    'session.revoke': 'bi-x-circle',
    'session.revoke_all': 'bi-x-circle-fill',
    'data.export': 'bi-download',
    'billing.subscribe': 'bi-credit-card',
    'billing.cancel': 'bi-credit-card-2-front'
  };
  return icons[type] || 'bi-circle';
}

function maskIP(ip) {
  if (!ip || ip === 'Unknown') return 'Unknown location';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return ip.substring(0, 8) + '***';
}

// === TRAFFIC ALERTS ===

function openAlertsModal() {
  // Reset state
  document.getElementById('alerts-loading').classList.remove('d-none');
  document.getElementById('alerts-list').classList.add('d-none');
  document.getElementById('alerts-empty').classList.add('d-none');
  document.getElementById('alerts-no-site').classList.add('d-none');
  document.getElementById('alerts-baseline').classList.add('d-none');
  document.getElementById('alert-create-section').classList.remove('d-none');
  document.getElementById('new-alert-name').value = '';
  document.getElementById('new-alert-type').value = 'traffic_spike';
  document.getElementById('new-alert-threshold').value = '200';
  document.getElementById('new-alert-window').value = '60';
  document.getElementById('new-alert-cooldown').value = '60';
  document.getElementById('new-alert-email').checked = true;
  document.getElementById('new-alert-webhook').checked = false;

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('alertsModal'));
  modal.show();

  // Check if site selected
  if (!currentSiteId) {
    document.getElementById('alerts-loading').classList.add('d-none');
    document.getElementById('alerts-no-site').classList.remove('d-none');
    document.getElementById('alert-create-section').classList.add('d-none');
    return;
  }

  // Load alerts
  loadAlerts();
}

async function loadAlerts() {
  const loadingEl = document.getElementById('alerts-loading');
  const listEl = document.getElementById('alerts-list');
  const emptyEl = document.getElementById('alerts-empty');
  const baselineEl = document.getElementById('alerts-baseline');

  try {
    const res = await fetch(`${API_BASE}/alerts?siteId=${currentSiteId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');

    // Show baseline if available
    if (data.baseline) {
      document.getElementById('baseline-hourly').textContent = data.baseline.avgHourly;
      document.getElementById('baseline-daily').textContent = data.baseline.avgDaily;
      document.getElementById('baseline-days').textContent = data.baseline.daysWithData;
      baselineEl.classList.remove('d-none');
    }

    if (!data.alerts || data.alerts.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = data.alerts.map(alert => {
      const createdDate = new Date(alert.createdAt).toLocaleDateString();
      const lastTriggered = alert.lastTriggeredAt ? formatRelativeTime(alert.lastTriggeredAt) : 'Never';
      const typeLabel = alert.type === 'traffic_spike' ? 'Spike' : 'Low Traffic';
      const statusBadge = alert.isActive
        ? '<span class="badge bg-success">Active</span>'
        : '<span class="badge bg-secondary">Paused</span>';

      return `
        <div class="d-flex justify-content-between align-items-center py-3 border-bottom">
          <div class="d-flex align-items-center flex-grow-1">
            <div class="me-3 text-muted" style="font-size: 1.5rem;">
              <i class="bi ${alert.type === 'traffic_spike' ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow'}"></i>
            </div>
            <div class="flex-grow-1">
              <div class="fw-bold">${escapeHtml(alert.name)} ${statusBadge}</div>
              <div class="small text-muted">
                ${typeLabel} &bull; ${alert.threshold}% threshold &bull; ${alert.timeWindow}min window
              </div>
              <div class="small text-muted">
                ${alert.notifyEmail ? '<i class="bi bi-envelope me-1"></i>' : ''}
                ${alert.notifyWebhook ? '<i class="bi bi-lightning me-1"></i>' : ''}
                Last triggered: ${lastTriggered} &bull; ${alert.triggerCount} total
              </div>
            </div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-${alert.isActive ? 'warning' : 'success'}"
                    onclick="toggleAlert('${alert.id}', ${!alert.isActive})"
                    title="${alert.isActive ? 'Pause' : 'Resume'}">
              <i class="bi ${alert.isActive ? 'bi-pause' : 'bi-play'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteAlert('${alert.id}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load alerts</p>';
  }
}

async function createAlert() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const name = document.getElementById('new-alert-name').value.trim() || 'Traffic Alert';
  const type = document.getElementById('new-alert-type').value;
  const threshold = document.getElementById('new-alert-threshold').value;
  const timeWindow = document.getElementById('new-alert-window').value;
  const cooldown = document.getElementById('new-alert-cooldown').value;
  const notifyEmail = document.getElementById('new-alert-email').checked;
  const notifyWebhook = document.getElementById('new-alert-webhook').checked;

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/alerts`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        name,
        type,
        threshold: parseInt(threshold),
        timeWindow: parseInt(timeWindow),
        cooldown: parseInt(cooldown),
        notifyEmail,
        notifyWebhook
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create alert');
    }

    // Reset form
    document.getElementById('new-alert-name').value = '';

    // Reload alerts list
    loadAlerts();

  } catch (err) {
    alert('Failed to create alert: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Create Alert';
  }
}

async function toggleAlert(alertId, isActive) {
  try {
    const res = await fetch(`${API_BASE}/alerts`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alertId, isActive })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update alert');
    }

    loadAlerts();

  } catch (err) {
    alert('Failed to update alert: ' + err.message);
  }
}

async function deleteAlert(alertId) {
  if (!confirm('Are you sure you want to delete this alert?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/alerts?alertId=${alertId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete alert');
    }

    loadAlerts();

  } catch (err) {
    alert('Failed to delete alert: ' + err.message);
  }
}

// === WEBHOOK MANAGEMENT ===

function openWebhooksModal() {
  // Reset state
  document.getElementById('webhooks-loading').classList.remove('d-none');
  document.getElementById('webhooks-list').classList.add('d-none');
  document.getElementById('webhooks-empty').classList.add('d-none');
  document.getElementById('new-webhook-display').classList.add('d-none');
  document.getElementById('webhooks-no-site').classList.add('d-none');
  document.getElementById('webhook-create-section').classList.remove('d-none');
  document.getElementById('new-webhook-name').value = '';
  document.getElementById('new-webhook-url').value = '';

  // Reset checkboxes
  document.getElementById('webhook-event-event').checked = true;
  document.getElementById('webhook-event-pageview').checked = false;
  document.getElementById('webhook-event-daily').checked = false;
  document.getElementById('webhook-event-spike').checked = false;

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('webhooksModal'));
  modal.show();

  // Check if site selected
  if (!currentSiteId) {
    document.getElementById('webhooks-loading').classList.add('d-none');
    document.getElementById('webhooks-no-site').classList.remove('d-none');
    document.getElementById('webhook-create-section').classList.add('d-none');
    return;
  }

  // Load webhooks
  loadWebhooks();
}

async function loadWebhooks() {
  const loadingEl = document.getElementById('webhooks-loading');
  const listEl = document.getElementById('webhooks-list');
  const emptyEl = document.getElementById('webhooks-empty');

  try {
    const res = await fetch(`${API_BASE}/webhooks?siteId=${currentSiteId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');

    if (!data.webhooks || data.webhooks.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = data.webhooks.map(webhook => {
      const createdDate = new Date(webhook.createdAt).toLocaleDateString();
      const lastTriggered = webhook.lastTriggeredAt ? formatRelativeTime(webhook.lastTriggeredAt) : 'Never';
      const eventsStr = webhook.events.join(', ');
      const statusBadge = webhook.isActive
        ? '<span class="badge bg-success">Active</span>'
        : '<span class="badge bg-danger">Disabled</span>';

      return `
        <div class="d-flex justify-content-between align-items-center py-3 border-bottom">
          <div class="d-flex align-items-center flex-grow-1">
            <div class="me-3 text-muted" style="font-size: 1.5rem;">
              <i class="bi bi-lightning"></i>
            </div>
            <div class="flex-grow-1">
              <div class="fw-bold">${escapeHtml(webhook.name)} ${statusBadge}</div>
              <div class="small text-muted text-truncate" style="max-width: 300px;">
                ${escapeHtml(webhook.url)}
              </div>
              <div class="small text-muted">
                Events: ${eventsStr} &bull; Last: ${lastTriggered} &bull; ${webhook.successCount} sent
              </div>
            </div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary" onclick="testWebhook('${webhook.id}')" title="Send test">
              <i class="bi bi-send"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteWebhook('${webhook.id}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load webhooks</p>';
  }
}

async function createWebhook() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const name = document.getElementById('new-webhook-name').value.trim() || 'Unnamed Webhook';
  const url = document.getElementById('new-webhook-url').value.trim();

  if (!url) {
    alert('Please enter a webhook URL');
    return;
  }

  if (!url.startsWith('https://')) {
    alert('Webhook URL must use HTTPS');
    return;
  }

  // Collect selected events
  const events = [];
  if (document.getElementById('webhook-event-event').checked) events.push('event');
  if (document.getElementById('webhook-event-pageview').checked) events.push('pageview');
  if (document.getElementById('webhook-event-daily').checked) events.push('daily_summary');
  if (document.getElementById('webhook-event-spike').checked) events.push('traffic_spike');

  if (events.length === 0) {
    alert('Please select at least one event type');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        name,
        url,
        events
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create webhook');
    }

    // Show the signing secret
    document.getElementById('new-webhook-secret').value = data.webhook.secret;
    document.getElementById('new-webhook-display').classList.remove('d-none');

    // Reset form
    document.getElementById('new-webhook-name').value = '';
    document.getElementById('new-webhook-url').value = '';

    // Reload webhooks list
    loadWebhooks();

  } catch (err) {
    alert('Failed to create webhook: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Create Webhook';
  }
}

function copyWebhookSecret() {
  const secretValue = document.getElementById('new-webhook-secret').value;
  navigator.clipboard.writeText(secretValue).then(() => {
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="bi bi-check"></i>';
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 2000);
  });
}

async function testWebhook(webhookId) {
  const btn = event.target.closest('button');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const res = await fetch(`${API_BASE}/webhooks`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'test',
        webhookId
      })
    });

    const data = await res.json();

    if (data.success) {
      alert('Test webhook delivered successfully!');
    } else {
      alert('Test failed: ' + data.message);
    }

    // Reload to update stats
    loadWebhooks();

  } catch (err) {
    alert('Failed to test webhook: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send"></i>';
  }
}

async function deleteWebhook(webhookId) {
  if (!confirm('Are you sure you want to delete this webhook?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/webhooks?webhookId=${webhookId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete webhook');
    }

    loadWebhooks();

  } catch (err) {
    alert('Failed to delete webhook: ' + err.message);
  }
}

// === API KEY MANAGEMENT ===

function openApiKeysModal() {
  // Reset state
  document.getElementById('api-keys-loading').classList.remove('d-none');
  document.getElementById('api-keys-list').classList.add('d-none');
  document.getElementById('api-keys-empty').classList.add('d-none');
  document.getElementById('new-key-display').classList.add('d-none');
  document.getElementById('new-key-name').value = '';
  document.getElementById('new-key-permissions').value = 'read';

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('apiKeysModal'));
  modal.show();

  // Load keys
  loadApiKeys();
}

async function loadApiKeys() {
  const loadingEl = document.getElementById('api-keys-loading');
  const listEl = document.getElementById('api-keys-list');
  const emptyEl = document.getElementById('api-keys-empty');

  try {
    const res = await fetch(`${API_BASE}/keys`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');

    if (!data.keys || data.keys.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = data.keys.map(key => {
      const createdDate = new Date(key.createdAt).toLocaleDateString();
      const lastUsed = key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : 'Never used';
      const permissions = key.permissions.join(', ');

      return `
        <div class="d-flex justify-content-between align-items-center py-3 border-bottom">
          <div class="d-flex align-items-center">
            <div class="me-3 text-muted" style="font-size: 1.5rem;">
              <i class="bi bi-key"></i>
            </div>
            <div>
              <div class="fw-bold">${escapeHtml(key.name)}</div>
              <div class="small">
                <code class="text-muted">${key.keyPrefix}</code>
              </div>
              <div class="small text-muted">
                ${permissions} &bull; Created ${createdDate} &bull; ${lastUsed}
              </div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="revokeApiKey('${key.id}')" title="Revoke key">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load API keys</p>';
  }
}

async function createApiKey() {
  const nameInput = document.getElementById('new-key-name');
  const permissionsSelect = document.getElementById('new-key-permissions');
  const name = nameInput.value.trim() || 'Unnamed Key';
  const permissions = permissionsSelect.value.split(',');

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/keys`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, permissions })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create API key');
    }

    // Show the new key
    document.getElementById('new-key-value').value = data.key.key;
    document.getElementById('new-key-display').classList.remove('d-none');

    // Reset form
    nameInput.value = '';
    permissionsSelect.value = 'read';

    // Reload keys list
    loadApiKeys();

  } catch (err) {
    alert('Failed to create API key: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Generate API Key';
  }
}

function copyNewApiKey() {
  const keyValue = document.getElementById('new-key-value').value;
  navigator.clipboard.writeText(keyValue).then(() => {
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="bi bi-check"></i>';
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 2000);
  });
}

async function revokeApiKey(keyId) {
  if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/keys?keyId=${keyId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to revoke key');
    }

    // Reload keys
    loadApiKeys();

  } catch (err) {
    alert('Failed to revoke API key: ' + err.message);
  }
}

// Helper to escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

// === CHART ANNOTATIONS ===

let currentAnnotations = [];

function openAnnotationModal() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  // Reset form
  document.getElementById('annotation-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('annotation-title').value = '';
  document.getElementById('annotation-description').value = '';
  document.getElementById('annotation-color').value = '#0d6efd';
  document.querySelectorAll('.annotation-icon-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.annotation-icon-btn[data-icon="star"]')?.classList.add('active');

  // Reset state
  document.getElementById('annotations-loading').classList.remove('d-none');
  document.getElementById('annotations-list').classList.add('d-none');
  document.getElementById('annotations-empty').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('annotationModal'));
  modal.show();

  // Load existing annotations
  loadAnnotations();
}

async function loadAnnotations() {
  if (!currentSiteId) return;

  const loadingEl = document.getElementById('annotations-loading');
  const listEl = document.getElementById('annotations-list');
  const emptyEl = document.getElementById('annotations-empty');

  // Get date range from inputs
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  try {
    let url = `${API_BASE}/annotations?siteId=${currentSiteId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    const res = await fetch(url, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');
    currentAnnotations = data.annotations || [];

    if (currentAnnotations.length === 0) {
      emptyEl.classList.remove('d-none');
      updateAnnotationMarkers([]);
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = currentAnnotations.map(annotation => {
      const date = new Date(annotation.date).toLocaleDateString();
      const iconClass = getAnnotationIconClass(annotation.icon);

      return `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
          <div class="d-flex align-items-center">
            <div class="me-3" style="color: ${annotation.color}; font-size: 1.25rem;">
              <i class="bi ${iconClass}"></i>
            </div>
            <div>
              <div class="fw-medium">${escapeHtml(annotation.title)}</div>
              <div class="small text-muted">${date}</div>
              ${annotation.description ? `<div class="small text-muted">${escapeHtml(annotation.description)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAnnotation('${annotation.id}')" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    }).join('');

    // Update chart markers
    updateAnnotationMarkers(currentAnnotations);

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load annotations</p>';
  }
}

async function createAnnotation() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const date = document.getElementById('annotation-date').value;
  const title = document.getElementById('annotation-title').value.trim();
  const description = document.getElementById('annotation-description').value.trim();
  const color = document.getElementById('annotation-color').value;
  const activeIconBtn = document.querySelector('.annotation-icon-btn.active');
  const icon = activeIconBtn ? activeIconBtn.dataset.icon : 'star';

  if (!date) {
    alert('Please select a date');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/annotations`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        date,
        title: title || 'Event',
        description,
        color,
        icon
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create annotation');
    }

    // Reset form
    document.getElementById('annotation-title').value = '';
    document.getElementById('annotation-description').value = '';

    // Reload annotations
    loadAnnotations();

  } catch (err) {
    alert('Failed to create annotation: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Add Annotation';
  }
}

async function deleteAnnotation(annotationId) {
  if (!confirm('Are you sure you want to delete this annotation?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/annotations?annotationId=${annotationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete annotation');
    }

    // Reload annotations
    loadAnnotations();

  } catch (err) {
    alert('Failed to delete annotation: ' + err.message);
  }
}

function selectAnnotationIcon(btn) {
  // Remove active from all
  document.querySelectorAll('.annotation-icon-btn').forEach(b => b.classList.remove('active'));
  // Add active to clicked
  btn.classList.add('active');
}

function getAnnotationIconClass(icon) {
  const icons = {
    'star': 'bi-star-fill',
    'flag': 'bi-flag-fill',
    'rocket': 'bi-rocket-takeoff-fill',
    'bug': 'bi-bug-fill',
    'megaphone': 'bi-megaphone-fill',
    'lightning': 'bi-lightning-fill',
    'calendar': 'bi-calendar-event-fill',
    'gear': 'bi-gear-fill'
  };
  return icons[icon] || 'bi-star-fill';
}

function updateAnnotationMarkers(annotations) {
  const markersContainer = document.getElementById('annotation-markers');
  if (!markersContainer) return;

  if (!annotations || annotations.length === 0) {
    markersContainer.innerHTML = '<span class="text-muted small">No annotations in this period</span>';
    return;
  }

  // Sort by date
  const sorted = [...annotations].sort((a, b) => new Date(a.date) - new Date(b.date));

  markersContainer.innerHTML = sorted.map(annotation => {
    const date = new Date(annotation.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const iconClass = getAnnotationIconClass(annotation.icon);

    return `
      <span class="badge me-2 mb-1" style="background-color: ${annotation.color}; cursor: help;"
            title="${escapeHtml(annotation.title)} - ${date}${annotation.description ? '\n' + escapeHtml(annotation.description) : ''}">
        <i class="bi ${iconClass} me-1"></i>${escapeHtml(annotation.title)}
      </span>
    `;
  }).join('');

  // Initialize tooltips on markers
  markersContainer.querySelectorAll('[title]').forEach(el => {
    new bootstrap.Tooltip(el, {
      trigger: 'hover',
      placement: 'top'
    });
  });
}

// === TEAM MANAGEMENT ===

let currentTeamId = null;
let currentTeamRole = null;
let userTeams = [];

function openTeamsModal() {
  // Reset state
  document.getElementById('teams-no-team').classList.add('d-none');
  document.getElementById('team-create-form').classList.add('d-none');
  document.getElementById('team-selector-section').classList.add('d-none');
  document.getElementById('team-details').classList.add('d-none');
  document.getElementById('teams-loading').classList.remove('d-none');
  document.getElementById('invite-success').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('teamsModal'));
  modal.show();

  // Load teams
  loadUserTeams();
}

async function loadUserTeams() {
  try {
    const res = await fetch(`${API_BASE}/teams`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    document.getElementById('teams-loading').classList.add('d-none');
    userTeams = data.teams || [];

    if (userTeams.length === 0) {
      // Show "no team" state
      document.getElementById('teams-no-team').classList.remove('d-none');
    } else if (userTeams.length === 1) {
      // Load single team directly
      currentTeamId = userTeams[0].id;
      loadTeamDetails();
    } else {
      // Show team selector
      const selector = document.getElementById('team-selector');
      selector.innerHTML = '<option value="">Select a team...</option>';
      userTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.id;
        option.textContent = `${team.name} (${team.role})`;
        selector.appendChild(option);
      });
      document.getElementById('team-selector-section').classList.remove('d-none');
    }

  } catch (err) {
    document.getElementById('teams-loading').innerHTML = '<p class="text-danger">Failed to load teams</p>';
  }
}

function showCreateTeamForm() {
  document.getElementById('teams-no-team').classList.add('d-none');
  document.getElementById('team-create-form').classList.remove('d-none');
  document.getElementById('new-team-name').value = '';
  document.getElementById('new-team-name').focus();
}

function hideCreateTeamForm() {
  document.getElementById('team-create-form').classList.add('d-none');
  if (userTeams.length === 0) {
    document.getElementById('teams-no-team').classList.remove('d-none');
  }
}

async function createTeam() {
  const name = document.getElementById('new-team-name').value.trim();

  if (!name) {
    alert('Please enter a team name');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create team');
    }

    // Reload teams
    document.getElementById('team-create-form').classList.add('d-none');
    currentTeamId = data.team.id;
    loadUserTeams();

  } catch (err) {
    alert('Failed to create team: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Create Team';
  }
}

async function loadTeamDetails() {
  const selector = document.getElementById('team-selector');
  if (selector.value) {
    currentTeamId = selector.value;
  }

  if (!currentTeamId) return;

  document.getElementById('teams-loading').classList.remove('d-none');
  document.getElementById('team-details').classList.add('d-none');
  document.getElementById('team-members-list').classList.add('d-none');

  try {
    const res = await fetch(`${API_BASE}/teams?teamId=${currentTeamId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    document.getElementById('teams-loading').classList.add('d-none');
    document.getElementById('team-details').classList.remove('d-none');

    // Update team info
    document.getElementById('current-team-name').textContent = data.team.name;
    document.getElementById('current-user-role').textContent = capitalizeFirst(data.userRole);
    currentTeamRole = data.userRole;

    // Update role badge color
    const roleBadge = document.getElementById('current-user-role');
    roleBadge.className = 'badge ' + getRoleBadgeClass(data.userRole);

    // Show/hide invite section based on role
    const inviteSection = document.getElementById('team-invite-section');
    if (data.userRole === 'owner' || data.userRole === 'admin') {
      inviteSection.classList.remove('d-none');
    } else {
      inviteSection.classList.add('d-none');
    }

    // Show/hide sites section based on role
    const sitesSection = document.getElementById('team-sites-section');
    if (data.userRole === 'owner' || data.userRole === 'admin') {
      sitesSection.classList.remove('d-none');
      populateSiteSelector();
    } else {
      sitesSection.classList.add('d-none');
    }

    // Update leave button (owner can't leave)
    const leaveBtn = document.querySelector('#team-actions button');
    if (data.userRole === 'owner') {
      leaveBtn.style.display = 'none';
    } else {
      leaveBtn.style.display = 'inline-block';
    }

    // Display members
    displayTeamMembers(data.members, data.userRole);

    // Display pending invites
    displayTeamInvites(data.invites, data.userRole);

    // Display team sites
    displayTeamSites(data.sites);

  } catch (err) {
    document.getElementById('teams-loading').innerHTML = '<p class="text-danger">Failed to load team details</p>';
  }
}

function displayTeamMembers(members, userRole) {
  const listEl = document.getElementById('team-members-list');
  listEl.classList.remove('d-none');

  const canManage = userRole === 'owner' || userRole === 'admin';

  listEl.innerHTML = members.map(member => {
    const joinedDate = new Date(member.joinedAt).toLocaleDateString();
    const roleOptions = canManage && member.role !== 'owner' ? `
      <select class="form-select form-select-sm" style="width: auto;" onchange="updateMemberRole('${member.userId}', this.value)">
        <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
        <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
        <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    ` : `<span class="badge ${getRoleBadgeClass(member.role)}">${capitalizeFirst(member.role)}</span>`;

    const removeBtn = canManage && member.role !== 'owner' ? `
      <button class="btn btn-sm btn-outline-danger ms-2" onclick="removeMember('${member.userId}')" title="Remove member">
        <i class="bi bi-x-lg"></i>
      </button>
    ` : '';

    return `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <div class="d-flex align-items-center">
          <div class="me-3" style="font-size: 1.5rem;">
            <i class="bi bi-person-circle text-muted"></i>
          </div>
          <div>
            <div class="fw-medium">${escapeHtml(member.email)}</div>
            <div class="small text-muted">Joined ${joinedDate}</div>
          </div>
        </div>
        <div class="d-flex align-items-center">
          ${roleOptions}
          ${removeBtn}
        </div>
      </div>
    `;
  }).join('');
}

function displayTeamInvites(invites, userRole) {
  const sectionEl = document.getElementById('team-invites-section');
  const listEl = document.getElementById('team-invites-list');

  if (!invites || invites.length === 0) {
    sectionEl.classList.add('d-none');
    return;
  }

  sectionEl.classList.remove('d-none');
  const canManage = userRole === 'owner' || userRole === 'admin';

  listEl.innerHTML = invites.map(invite => {
    const expiresDate = new Date(invite.expiresAt).toLocaleDateString();
    return `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <div>
          <div class="fw-medium">${escapeHtml(invite.email)}</div>
          <div class="small text-muted">
            <span class="badge bg-secondary me-1">${capitalizeFirst(invite.role)}</span>
            Expires ${expiresDate}
          </div>
        </div>
        ${canManage ? `
          <button class="btn btn-sm btn-outline-danger" onclick="revokeInvite('${invite.id}')" title="Revoke invite">
            <i class="bi bi-x-lg"></i>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

function displayTeamSites(sites) {
  const listEl = document.getElementById('team-sites-list');

  if (!sites || sites.length === 0) {
    listEl.innerHTML = '<span class="text-muted">No sites shared with this team yet.</span>';
    return;
  }

  listEl.innerHTML = sites.map(siteId => `
    <span class="badge bg-secondary me-1 mb-1">${siteId}</span>
  `).join('');
}

async function populateSiteSelector() {
  const selector = document.getElementById('site-to-add');
  selector.innerHTML = '<option value="">Select a site to share...</option>';

  // Get sites from the main site selector
  const mainSelector = document.getElementById('site-selector');
  Array.from(mainSelector.options).forEach(opt => {
    if (opt.value) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.textContent;
      selector.appendChild(option);
    }
  });
}

async function inviteTeamMember() {
  if (!currentTeamId) return;

  const email = document.getElementById('invite-email').value.trim();
  const role = document.getElementById('invite-role').value;

  if (!email) {
    alert('Please enter an email address');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'invite',
        teamId: currentTeamId,
        email,
        role
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to send invite');
    }

    // Show invite link
    document.getElementById('invite-email-display').textContent = email;
    document.getElementById('invite-link').value = data.inviteUrl;
    document.getElementById('invite-success').classList.remove('d-none');

    // Clear form
    document.getElementById('invite-email').value = '';

    // Reload team details
    loadTeamDetails();

  } catch (err) {
    alert('Failed to send invite: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Invite';
  }
}

function copyInviteLink() {
  const link = document.getElementById('invite-link').value;
  navigator.clipboard.writeText(link).then(() => {
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="bi bi-check"></i>';
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 2000);
  });
}

async function updateMemberRole(memberId, newRole) {
  if (!currentTeamId) return;

  try {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'updateRole',
        teamId: currentTeamId,
        memberId,
        role: newRole
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to update role');
    }

    // Reload team details
    loadTeamDetails();

  } catch (err) {
    alert('Failed to update role: ' + err.message);
  }
}

async function removeMember(memberId) {
  if (!currentTeamId) return;

  if (!confirm('Are you sure you want to remove this member from the team?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/teams?teamId=${currentTeamId}&memberId=${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove member');
    }

    // Reload team details
    loadTeamDetails();

  } catch (err) {
    alert('Failed to remove member: ' + err.message);
  }
}

async function revokeInvite(inviteId) {
  if (!currentTeamId) return;

  if (!confirm('Are you sure you want to revoke this invite?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/teams?teamId=${currentTeamId}&inviteId=${inviteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to revoke invite');
    }

    // Reload team details
    loadTeamDetails();

  } catch (err) {
    alert('Failed to revoke invite: ' + err.message);
  }
}

async function addSiteToTeam() {
  if (!currentTeamId) return;

  const siteId = document.getElementById('site-to-add').value;
  if (!siteId) {
    alert('Please select a site');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'addSite',
        teamId: currentTeamId,
        siteId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to add site');
    }

    // Reset selector
    document.getElementById('site-to-add').value = '';

    // Reload team details
    loadTeamDetails();

  } catch (err) {
    alert('Failed to add site: ' + err.message);
  }
}

async function leaveCurrentTeam() {
  if (!currentTeamId) return;

  if (!confirm('Are you sure you want to leave this team? You will lose access to all shared sites.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/teams?teamId=${currentTeamId}&action=leave`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to leave team');
    }

    // Reset and reload
    currentTeamId = null;
    loadUserTeams();

  } catch (err) {
    alert('Failed to leave team: ' + err.message);
  }
}

function getRoleBadgeClass(role) {
  const classes = {
    'owner': 'bg-danger',
    'admin': 'bg-warning text-dark',
    'editor': 'bg-info',
    'viewer': 'bg-secondary'
  };
  return classes[role] || 'bg-secondary';
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// === GOAL TRACKING ===

let currentGoals = [];

function openGoalsModal() {
  if (!currentSiteId) {
    document.getElementById('goals-no-site').classList.remove('d-none');
    document.getElementById('goal-create-section').classList.add('d-none');
  } else {
    document.getElementById('goals-no-site').classList.add('d-none');
    document.getElementById('goal-create-section').classList.remove('d-none');
  }

  // Reset form
  document.getElementById('new-goal-name').value = '';
  document.getElementById('new-goal-metric').value = 'pageviews';
  document.getElementById('new-goal-target').value = '';
  document.getElementById('new-goal-period').value = 'monthly';
  document.getElementById('new-goal-comparison').value = 'gte';
  document.getElementById('new-goal-notify').checked = true;

  // Reset state
  document.getElementById('goals-loading').classList.remove('d-none');
  document.getElementById('goals-list').classList.add('d-none');
  document.getElementById('goals-empty').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('goalsModal'));
  modal.show();

  // Load existing goals
  if (currentSiteId) {
    loadGoals();
  } else {
    document.getElementById('goals-loading').classList.add('d-none');
  }
}

async function loadGoals() {
  if (!currentSiteId) return;

  const loadingEl = document.getElementById('goals-loading');
  const listEl = document.getElementById('goals-list');
  const emptyEl = document.getElementById('goals-empty');

  try {
    const res = await fetch(`${API_BASE}/goals?siteId=${currentSiteId}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');
    currentGoals = data.goals || [];

    if (currentGoals.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = currentGoals.map(goal => {
      const progressClass = goal.isComplete ? 'bg-success' : (goal.progress >= 75 ? 'bg-warning' : 'bg-primary');
      const statusBadge = goal.isComplete
        ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Complete</span>'
        : `<span class="badge bg-secondary">${goal.progress}%</span>`;

      const metricLabel = getMetricLabel(goal.metric);
      const periodLabel = getPeriodLabel(goal.period);
      const comparisonLabel = goal.comparison === 'gte' ? '≥' : '≤';
      const targetDisplay = formatMetricValue(goal.target, goal.metric);
      const currentDisplay = formatMetricValue(goal.currentValue, goal.metric);

      return `
        <div class="card mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h6 class="mb-1">${escapeHtml(goal.name)}</h6>
                <div class="small text-muted">
                  ${metricLabel} ${comparisonLabel} ${targetDisplay} ${periodLabel}
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                ${statusBadge}
                <button class="btn btn-sm btn-outline-danger" onclick="deleteGoal('${goal.id}')" title="Delete goal">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
            <div class="progress mb-2" style="height: 8px;">
              <div class="progress-bar ${progressClass}" role="progressbar" style="width: ${goal.progress}%"
                   aria-valuenow="${goal.progress}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <div class="d-flex justify-content-between small">
              <span class="text-muted">Current: <strong>${currentDisplay}</strong></span>
              <span class="text-muted">Target: <strong>${targetDisplay}</strong></span>
            </div>
            ${goal.completedAt ? `
              <div class="small text-success mt-2">
                <i class="bi bi-trophy me-1"></i>Completed ${new Date(goal.completedAt).toLocaleDateString()}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load goals</p>';
  }
}

async function createGoal() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const name = document.getElementById('new-goal-name').value.trim();
  const metric = document.getElementById('new-goal-metric').value;
  const target = document.getElementById('new-goal-target').value;
  const period = document.getElementById('new-goal-period').value;
  const comparison = document.getElementById('new-goal-comparison').value;
  const notifyOnComplete = document.getElementById('new-goal-notify').checked;

  if (!target || parseInt(target) < 1) {
    alert('Please enter a valid target');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/goals`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        name: name || `${getMetricLabel(metric)} Goal`,
        metric,
        target: parseInt(target),
        period,
        comparison,
        notifyOnComplete
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create goal');
    }

    // Reset form
    document.getElementById('new-goal-name').value = '';
    document.getElementById('new-goal-target').value = '';

    // Reload goals
    loadGoals();

  } catch (err) {
    alert('Failed to create goal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Create Goal';
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Are you sure you want to delete this goal?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/goals?goalId=${goalId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete goal');
    }

    // Reload goals
    loadGoals();

  } catch (err) {
    alert('Failed to delete goal: ' + err.message);
  }
}

function getMetricLabel(metric) {
  const labels = {
    'pageviews': 'Pageviews',
    'visitors': 'Unique Visitors',
    'sessions': 'Sessions',
    'events': 'Events',
    'bounce_rate': 'Bounce Rate',
    'session_duration': 'Avg Session Duration'
  };
  return labels[metric] || metric;
}

function getPeriodLabel(period) {
  const labels = {
    'daily': 'per Day',
    'weekly': 'per Week',
    'monthly': 'per Month',
    'quarterly': 'per Quarter',
    'yearly': 'per Year'
  };
  return labels[period] || period;
}

function formatMetricValue(value, metric) {
  if (metric === 'bounce_rate') {
    return `${value}%`;
  }
  if (metric === 'session_duration') {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
  return value.toLocaleString();
}

// === FUNNEL ANALYSIS ===

let currentFunnels = [];

function openFunnelsModal() {
  if (!currentSiteId) {
    document.getElementById('funnels-no-site').classList.remove('d-none');
    document.getElementById('funnel-create-section').classList.add('d-none');
  } else {
    document.getElementById('funnels-no-site').classList.add('d-none');
    document.getElementById('funnel-create-section').classList.remove('d-none');
  }

  // Reset form
  document.getElementById('new-funnel-name').value = '';
  resetFunnelSteps();

  // Reset state
  document.getElementById('funnels-loading').classList.remove('d-none');
  document.getElementById('funnels-list').classList.add('d-none');
  document.getElementById('funnels-empty').classList.add('d-none');

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('funnelsModal'));
  modal.show();

  // Load existing funnels
  if (currentSiteId) {
    loadFunnels();
  } else {
    document.getElementById('funnels-loading').classList.add('d-none');
  }
}

function resetFunnelSteps() {
  const container = document.getElementById('funnel-steps-container');
  container.innerHTML = `
    <div class="funnel-step mb-2">
      <div class="row g-2">
        <div class="col-md-3">
          <input type="text" class="form-control form-control-sm" placeholder="Step name" data-field="name">
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="type">
            <option value="page">Page</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="operator">
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
          </select>
        </div>
        <div class="col-md-4">
          <input type="text" class="form-control form-control-sm" placeholder="e.g., /home" data-field="value">
        </div>
        <div class="col-md-1">
          <button class="btn btn-sm btn-outline-danger" onclick="removeFunnelStep(this)" disabled>
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="funnel-step mb-2">
      <div class="row g-2">
        <div class="col-md-3">
          <input type="text" class="form-control form-control-sm" placeholder="Step name" data-field="name">
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="type">
            <option value="page">Page</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="operator">
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
          </select>
        </div>
        <div class="col-md-4">
          <input type="text" class="form-control form-control-sm" placeholder="e.g., /checkout" data-field="value">
        </div>
        <div class="col-md-1">
          <button class="btn btn-sm btn-outline-danger" onclick="removeFunnelStep(this)" disabled>
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function addFunnelStep() {
  const container = document.getElementById('funnel-steps-container');
  const stepCount = container.querySelectorAll('.funnel-step').length;

  const stepHtml = `
    <div class="funnel-step mb-2">
      <div class="row g-2">
        <div class="col-md-3">
          <input type="text" class="form-control form-control-sm" placeholder="Step name" data-field="name">
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="type">
            <option value="page">Page</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" data-field="operator">
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="starts_with">Starts with</option>
          </select>
        </div>
        <div class="col-md-4">
          <input type="text" class="form-control form-control-sm" placeholder="URL or event" data-field="value">
        </div>
        <div class="col-md-1">
          <button class="btn btn-sm btn-outline-danger" onclick="removeFunnelStep(this)">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', stepHtml);
  updateRemoveButtons();
}

function removeFunnelStep(btn) {
  btn.closest('.funnel-step').remove();
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const container = document.getElementById('funnel-steps-container');
  const steps = container.querySelectorAll('.funnel-step');
  const buttons = container.querySelectorAll('.btn-outline-danger');

  buttons.forEach((btn, index) => {
    btn.disabled = steps.length <= 2;
  });
}

function getFunnelSteps() {
  const container = document.getElementById('funnel-steps-container');
  const stepElements = container.querySelectorAll('.funnel-step');
  const steps = [];

  stepElements.forEach((stepEl, index) => {
    const name = stepEl.querySelector('[data-field="name"]').value.trim() || `Step ${index + 1}`;
    const type = stepEl.querySelector('[data-field="type"]').value;
    const operator = stepEl.querySelector('[data-field="operator"]').value;
    const value = stepEl.querySelector('[data-field="value"]').value.trim();

    if (value) {
      steps.push({ name, type, operator, value });
    }
  });

  return steps;
}

async function loadFunnels() {
  if (!currentSiteId) return;

  const loadingEl = document.getElementById('funnels-loading');
  const listEl = document.getElementById('funnels-list');
  const emptyEl = document.getElementById('funnels-empty');

  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  try {
    let url = `${API_BASE}/funnels?siteId=${currentSiteId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    const res = await fetch(url, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    loadingEl.classList.add('d-none');
    currentFunnels = data.funnels || [];

    if (currentFunnels.length === 0) {
      emptyEl.classList.remove('d-none');
      return;
    }

    listEl.classList.remove('d-none');
    listEl.innerHTML = currentFunnels.map(funnel => {
      const funnelData = funnel.data || {};
      const steps = funnelData.steps || [];

      return `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h6 class="mb-0">${escapeHtml(funnel.name)}</h6>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-primary">${funnelData.overallConversion || 0}% conversion</span>
              <button class="btn btn-sm btn-outline-danger" onclick="deleteFunnel('${funnel.id}')" title="Delete funnel">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="card-body">
            <div class="funnel-visualization">
              ${steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                const widthPercent = steps[0].count > 0
                  ? Math.max(20, Math.round((step.count / steps[0].count) * 100))
                  : 100;

                return `
                  <div class="funnel-step-display mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <span class="small fw-medium">${escapeHtml(step.name)}</span>
                      <span class="small text-muted">${step.count.toLocaleString()} visitors</span>
                    </div>
                    <div class="progress" style="height: 24px;">
                      <div class="progress-bar ${index === 0 ? 'bg-primary' : (isLast ? 'bg-success' : 'bg-info')}"
                           role="progressbar" style="width: ${widthPercent}%">
                        ${step.conversionRate}%
                      </div>
                    </div>
                    ${!isLast ? `
                      <div class="text-end small text-muted mt-1">
                        <i class="bi bi-arrow-down me-1"></i>${step.dropoff.toLocaleString()} dropped (${step.dropoffRate}%)
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
            <div class="mt-3 pt-2 border-top">
              <div class="row text-center small">
                <div class="col">
                  <div class="fw-bold">${(funnelData.totalEntered || 0).toLocaleString()}</div>
                  <div class="text-muted">Entered</div>
                </div>
                <div class="col">
                  <div class="fw-bold">${(funnelData.totalCompleted || 0).toLocaleString()}</div>
                  <div class="text-muted">Completed</div>
                </div>
                <div class="col">
                  <div class="fw-bold">${funnelData.overallConversion || 0}%</div>
                  <div class="text-muted">Conversion</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingEl.innerHTML = '<p class="text-danger">Failed to load funnels</p>';
  }
}

async function createFunnel() {
  if (!currentSiteId) {
    alert('Please select a site first');
    return;
  }

  const name = document.getElementById('new-funnel-name').value.trim();
  const steps = getFunnelSteps();

  if (steps.length < 2) {
    alert('A funnel requires at least 2 steps with values');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creating...';

  try {
    const res = await fetch(`${API_BASE}/funnels`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        siteId: currentSiteId,
        name: name || 'New Funnel',
        steps
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create funnel');
    }

    // Reset form
    document.getElementById('new-funnel-name').value = '';
    resetFunnelSteps();

    // Collapse the create form
    const collapseEl = document.getElementById('funnelCreateForm');
    const bsCollapse = bootstrap.Collapse.getInstance(collapseEl);
    if (bsCollapse) bsCollapse.hide();

    // Reload funnels
    loadFunnels();

  } catch (err) {
    alert('Failed to create funnel: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Create Funnel';
  }
}

async function deleteFunnel(funnelId) {
  if (!confirm('Are you sure you want to delete this funnel?')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/funnels?funnelId=${funnelId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete funnel');
    }

    // Reload funnels
    loadFunnels();

  } catch (err) {
    alert('Failed to delete funnel: ' + err.message);
  }
}

// ============================================
// HEATMAPS
// ============================================

let heatmapPages = [];

function openHeatmapsModal() {
  const modal = new bootstrap.Modal(document.getElementById('heatmapsModal'));
  modal.show();

  // Set default date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  document.getElementById('heatmap-start-date').value = startDate.toISOString().split('T')[0];
  document.getElementById('heatmap-end-date').value = endDate.toISOString().split('T')[0];

  // Check if site is selected
  if (!currentSiteId) {
    document.getElementById('heatmaps-no-site').classList.remove('d-none');
    document.getElementById('heatmap-controls').classList.add('d-none');
    hideAllHeatmapViews();
    return;
  }

  document.getElementById('heatmaps-no-site').classList.add('d-none');
  document.getElementById('heatmap-controls').classList.remove('d-none');

  loadHeatmapPages();
}

function hideAllHeatmapViews() {
  document.getElementById('heatmap-loading').classList.add('d-none');
  document.getElementById('heatmap-clicks-view').classList.add('d-none');
  document.getElementById('heatmap-scroll-view').classList.add('d-none');
  document.getElementById('heatmap-no-data').classList.add('d-none');
  document.getElementById('heatmap-no-pages').classList.add('d-none');
}

async function loadHeatmapPages() {
  const select = document.getElementById('heatmap-page-select');
  select.innerHTML = '<option value="">Loading pages...</option>';
  hideAllHeatmapViews();

  const startDate = document.getElementById('heatmap-start-date').value;
  const endDate = document.getElementById('heatmap-end-date').value;

  try {
    const res = await fetch(
      `${API_BASE}/heatmaps?siteId=${currentSiteId}&type=pages&startDate=${startDate}&endDate=${endDate}`,
      { headers: getAuthHeaders() }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load pages');
    }

    heatmapPages = data.pages || [];

    if (heatmapPages.length === 0) {
      select.innerHTML = '<option value="">No pages with data</option>';
      document.getElementById('heatmap-no-pages').classList.remove('d-none');
      return;
    }

    // Populate page select
    select.innerHTML = '<option value="">Select a page...</option>';
    heatmapPages.forEach(page => {
      const opt = document.createElement('option');
      opt.value = page.path;
      opt.textContent = page.path;
      select.appendChild(opt);
    });

    // Auto-select first page
    if (heatmapPages.length > 0) {
      select.value = heatmapPages[0].path;
      loadHeatmapData();
    }

  } catch (err) {
    select.innerHTML = '<option value="">Failed to load pages</option>';
  }
}

async function loadHeatmapData() {
  const path = document.getElementById('heatmap-page-select').value;
  const viewType = document.getElementById('heatmap-view-type').value;
  const startDate = document.getElementById('heatmap-start-date').value;
  const endDate = document.getElementById('heatmap-end-date').value;

  if (!path) {
    hideAllHeatmapViews();
    return;
  }

  hideAllHeatmapViews();
  document.getElementById('heatmap-loading').classList.remove('d-none');

  try {
    const res = await fetch(
      `${API_BASE}/heatmaps?siteId=${currentSiteId}&type=${viewType}&path=${encodeURIComponent(path)}&startDate=${startDate}&endDate=${endDate}`,
      { headers: getAuthHeaders() }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to load heatmap data');
    }

    document.getElementById('heatmap-loading').classList.add('d-none');

    if (viewType === 'clicks') {
      renderClickHeatmap(data);
    } else {
      renderScrollHeatmap(data);
    }

  } catch (err) {
    document.getElementById('heatmap-loading').classList.add('d-none');
    document.getElementById('heatmap-no-data').classList.remove('d-none');
  }
}

function renderClickHeatmap(data) {
  const clicksView = document.getElementById('heatmap-clicks-view');
  clicksView.classList.remove('d-none');

  // Update total clicks
  document.getElementById('heatmap-total-clicks').textContent = `${data.totalClicks.toLocaleString()} clicks`;

  if (data.totalClicks === 0) {
    clicksView.classList.add('d-none');
    document.getElementById('heatmap-no-data').classList.remove('d-none');
    return;
  }

  // Render viewport distribution
  const viewportsList = document.getElementById('heatmap-viewports-list');
  const viewportEntries = Object.entries(data.viewport || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalViewports = Object.values(data.viewport || {}).reduce((a, b) => a + b, 0);

  if (viewportEntries.length > 0) {
    viewportsList.innerHTML = viewportEntries.map(([vp, count]) => {
      const pct = totalViewports > 0 ? Math.round((count / totalViewports) * 100) : 0;
      return `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small">${vp}</span>
          <span class="badge bg-secondary">${pct}%</span>
        </div>
        <div class="progress mb-2" style="height: 4px;">
          <div class="progress-bar" style="width: ${pct}%"></div>
        </div>
      `;
    }).join('');
  } else {
    viewportsList.innerHTML = '<p class="text-muted small">No viewport data</p>';
  }

  // Render heatmap on canvas
  renderHeatmapCanvas(data.density, data.maxDensity);
}

function renderHeatmapCanvas(density, maxDensity) {
  const canvas = document.getElementById('heatmap-canvas');
  const ctx = canvas.getContext('2d');

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, width, height);

  if (!density || maxDensity === 0) {
    ctx.fillStyle = '#6c757d';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No click data to display', width / 2, height / 2);
    return;
  }

  // Draw heatmap
  const cellWidth = width / 100;
  const cellHeight = height / 100;

  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const value = density[y][x];
      if (value > 0) {
        ctx.fillStyle = getHeatmapColor(value);
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }
  }
}

function getHeatmapColor(value) {
  // Value is 0-1, return color from blue -> cyan -> lime -> yellow -> red
  const hue = (1 - value) * 240; // 240 (blue) to 0 (red)
  const saturation = 100;
  const lightness = 50;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${Math.max(0.3, value)})`;
}

function renderScrollHeatmap(data) {
  const scrollView = document.getElementById('heatmap-scroll-view');
  scrollView.classList.remove('d-none');

  // Update total sessions
  document.getElementById('heatmap-total-sessions').textContent = `${data.totalSessions.toLocaleString()} sessions`;

  if (data.totalSessions === 0) {
    scrollView.classList.add('d-none');
    document.getElementById('heatmap-no-data').classList.remove('d-none');
    return;
  }

  // Update metrics
  document.getElementById('heatmap-avg-scroll').textContent = `${data.avgMaxDepth}%`;

  const reach = data.reach || {};
  document.getElementById('heatmap-reach-25').textContent = `${reach[30] || 0}%`;
  document.getElementById('heatmap-reach-50').textContent = `${reach[50] || 0}%`;
  document.getElementById('heatmap-reach-75').textContent = `${reach[80] || 0}%`;
  document.getElementById('heatmap-reach-100').textContent = `${reach[100] || 0}%`;

  // Render scroll depth chart
  const chartContainer = document.getElementById('scroll-depth-chart');
  const depths = data.depths || {};

  // Create bars for each 10% bucket
  const buckets = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
  const maxCount = Math.max(...Object.values(depths), 1);

  chartContainer.innerHTML = `
    <div class="scroll-depth-bars">
      ${buckets.map((bucket, i) => {
        const count = depths[bucket] || 0;
        const pct = Math.round((count / data.totalSessions) * 100);
        const barHeight = Math.max(5, (count / maxCount) * 100);
        const depthPct = (i + 1) * 10;

        // Color gradient from green to red as depth increases
        const hue = 120 - (i * 12); // 120 (green) to 0 (red)

        return `
          <div class="scroll-bar-wrapper text-center" style="flex: 1;">
            <div class="scroll-bar-container" style="height: 200px; display: flex; align-items: flex-end; justify-content: center;">
              <div class="scroll-bar" style="
                width: 80%;
                height: ${barHeight}%;
                background: hsl(${hue}, 70%, 50%);
                border-radius: 4px 4px 0 0;
                min-height: 5px;
              "></div>
            </div>
            <div class="scroll-bar-label mt-2">
              <div class="small fw-bold">${depthPct}%</div>
              <div class="text-muted small">${pct}%</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="text-center mt-3 text-muted small">
      Scroll Depth → (% of visitors reaching each depth)
    </div>
  `;
}
