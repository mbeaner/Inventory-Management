// =============================================
// INVENTORY MANAGER PRO v19.0.0
// =============================================

const supabaseClient = window.supabaseClient;

// =============================================
// GLOBAL VARIABLES
// =============================================
let parts = [],
  usageLogs = [],
  currentUser = null,
  isAdmin = false,
  currentEditingUser = null;
let html5QrCode = null,
  isScannerActive = false,
  cameraStream = null,
  usageChart = null;
let currentEditPartId = null,
  currentEditLogId = null,
  selectedPartId = null,
  currentDetailsPartId = null;
let pendingDeletePartId = null,
  pendingDeleteLogId = null,
  pendingPhotoDeletePartId = null,
  pendingPhotoPartId = null;
let reopenEditAfterPhoto = false;

// UI State
let allState = { page: 1, rows: 50, search: '' };
let needState = { search: '' };
let criticalState = { search: '' };
let logsSearch = '';
let allSortField = 'part_number',
  allSortDirection = 'asc';

// Permissions
let windowCurrentPermissions = {
  canEditParts: false,
  canDeleteParts: false,
  canEditLogs: false,
  canDeleteLogs: false,
  canAddParts: false,
  canLogUsage: false,
};

// Constants
const STORAGE_KEY = 'inventoryManager_activeTab';
const DARK_MODE_KEY = 'inventoryManager_darkMode';

// =============================================
// HELPER FUNCTIONS
// =============================================
const showToast = (msg, isErr) => {
  const t = document.createElement('div');
  t.className = 'success-toast';
  if (isErr) t.style.background = '#e76f51';
  t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
};

const showSyncIndicator = (msg) => {
  document.querySelector('.sync-indicator')?.remove();
  const indicator = document.createElement('div');
  indicator.className = 'sync-indicator';
  indicator.innerHTML = `<i class="fas fa-spinner fa-pulse"></i> ${msg}`;
  document.body.appendChild(indicator);
};

const hideSyncIndicator = () =>
  setTimeout(() => document.querySelector('.sync-indicator')?.remove(), 500);
const hideModal = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    // Only re-enable scroll if no other modals are open
    const openModals = document.querySelectorAll(
      '.modal[style*="display: flex"]',
    );
    if (openModals.length === 0) {
      enableBodyScroll();
    }
  }
};
const showModal = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    disableBodyScroll();
  }
};
const escapeHtml = (s) =>
  s
    ? String(s).replace(
        /[&<>]/g,
        (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m],
      )
    : '';

// Prevent body scroll when modal is open
function disableBodyScroll() {
  document.body.classList.add('modal-open');
}

function enableBodyScroll() {
  document.body.classList.remove('modal-open');
}
// =============================================
// AUTHENTICATION
// =============================================
async function checkSession() {
  const loading = document.getElementById('loadingScreen');
  const auth = document.getElementById('authContainer');
  const app = document.getElementById('appContainer');
  if (auth) auth.style.display = 'none';
  if (app) app.style.display = 'none';
  if (loading) loading.style.display = 'flex';

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    currentUser = session.user;
    await checkAdminStatus();
    await updateUIByPermissions();
    if (loading) loading.style.display = 'none';
    if (app) app.style.display = 'block';
    await loadAllData();
  } else {
    if (loading) loading.style.display = 'none';
    if (auth) auth.style.display = 'flex';
  }
}

async function login(email, password) {
  showAuthMessage('', '');
  setAuthLoading(true);
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'flex';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  setAuthLoading(false);

  if (error) {
    if (loading) loading.style.display = 'none';
    showAuthMessage(error.message, 'error');
    return false;
  }

  currentUser = data.user;
  await checkAdminStatus();
  await updateUIByPermissions();
  if (loading) loading.style.display = 'none';
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  await loadAllData();
  return true;
}

async function register(email, password, confirm) {
  showAuthMessage('', '');
  if (password !== confirm) {
    showAuthMessage('Passwords do not match', 'error');
    return false;
  }
  if (password.length < 6) {
    showAuthMessage('Password must be at least 6 characters', 'error');
    return false;
  }

  setAuthLoading(true);
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'flex';

  const { error } = await supabaseClient.auth.signUp({ email, password });
  setAuthLoading(false);
  if (loading) loading.style.display = 'none';

  if (error) {
    showAuthMessage(error.message, 'error');
    return false;
  }
  showAuthMessage('Account created! Please login.', 'success');
  switchToLogin();
  return true;
}

async function logout() {
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'flex';
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast(error.message, true);
  } else {
    currentUser = null;
    isAdmin = false;
    parts = [];
    usageLogs = [];
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
  }
  if (loading) loading.style.display = 'none';
}

function showAuthMessage(msg, type) {
  const div = document.getElementById('authMessage');
  div.textContent = msg;
  div.className = `auth-message ${type}`;
  div.style.display = msg ? 'block' : 'none';
}

function setAuthLoading(loading) {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  if (loading) {
    loginBtn?.classList.add('btn-loading');
    registerBtn?.classList.add('btn-loading');
  } else {
    loginBtn?.classList.remove('btn-loading');
    registerBtn?.classList.remove('btn-loading');
  }
}

function switchToLogin() {
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('registerForm').classList.remove('active');
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
  showAuthMessage('', '');
}

function switchToRegister() {
  document.getElementById('registerForm').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
  document.getElementById('registerTab').classList.add('active');
  document.getElementById('loginTab').classList.remove('active');
  showAuthMessage('', '');
}

// =============================================
// DARK MODE
// =============================================
function initDarkMode() {
  const isDark = localStorage.getItem(DARK_MODE_KEY) === 'dark';
  document.body.classList.toggle('dark', isDark);
  updateDarkModeButton(isDark);
}

function updateDarkModeButton(isDark) {
  const btn = document.getElementById('darkModeToggle');
  if (btn) {
    btn.innerHTML = isDark
      ? '<i class="fas fa-sun"></i> Light'
      : '<i class="fas fa-moon"></i> Dark';
    btn.style.background = isDark ? '#f59e0b' : '#1e466e';
  }
}

function toggleDarkMode() {
  const isDark = !document.body.classList.contains('dark');
  document.body.classList.toggle('dark', isDark);
  localStorage.setItem(DARK_MODE_KEY, isDark ? 'dark' : 'light');
  updateDarkModeButton(isDark);
  showToast(`${isDark ? 'Dark' : 'Light'} mode activated`, false);
}

// =============================================
// TAB MANAGEMENT
// =============================================
function saveActiveTab(tabId) {
  localStorage.setItem(STORAGE_KEY, tabId);
}
function restoreActiveTab() {
  const saved = localStorage.getItem(STORAGE_KEY);
  activateTab(
    saved &&
      ['dashboard', 'all', 'needorder', 'critical', 'logs'].includes(saved)
      ? saved
      : 'dashboard',
  );
}
function activateTab(tabId) {
  document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document
    .querySelectorAll('.tab-content')
    .forEach((tc) => tc.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  if (tabId === 'dashboard') loadDashboardData();
}
function switchToTab(tabId) {
  activateTab(tabId);
  saveActiveTab(tabId);
}

// =============================================
// PERMISSIONS
// =============================================
async function checkAdminStatus() {
  if (!currentUser) return false;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) return false;
  isAdmin = data?.is_admin === true;
  windowCurrentPermissions = {
    canEditParts: data?.can_edit_parts || isAdmin,
    canDeleteParts: data?.can_delete_parts || isAdmin,
    canEditLogs: data?.can_edit_logs || isAdmin,
    canDeleteLogs: data?.can_delete_logs || isAdmin,
    canAddParts: data?.can_add_parts || isAdmin,
    canLogUsage: data?.can_log_usage || isAdmin,
  };
  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  return isAdmin;
}

async function userHasPermission(perm) {
  if (!currentUser || isAdmin) return isAdmin;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select(perm)
    .eq('id', currentUser.id)
    .single();
  return !error && data?.[perm];
}

async function updateUIByPermissions() {
  if (!currentUser) return;
  const canAddParts = await userHasPermission('can_add_parts');
  const canLogUsage = await userHasPermission('can_log_usage');
  const addBtn = document.getElementById('addPartBtn');
  const logBtn = document.getElementById('quickLogBtn');
  const importLabel = document.querySelector('.file-label');
  if (addBtn) addBtn.style.display = canAddParts ? 'inline-flex' : 'none';
  if (logBtn) logBtn.style.display = canLogUsage ? 'inline-flex' : 'none';
  if (importLabel) importLabel.style.display = isAdmin ? 'inline-flex' : 'none';
  windowCurrentPermissions = {
    canEditParts: await userHasPermission('can_edit_parts'),
    canDeleteParts: await userHasPermission('can_delete_parts'),
    canEditLogs: await userHasPermission('can_edit_logs'),
    canDeleteLogs: await userHasPermission('can_delete_logs'),
    canAddParts,
    canLogUsage,
  };
  updateBottomActionBarVisibility();
}

function updateBottomActionBarVisibility() {
  const btns = {
    add: document.getElementById('mobileAddPartBtn'),
    log: document.getElementById('mobileLogUsageBtn'),
    scan: document.getElementById('mobileScanBtn'),
    report: document.getElementById('mobileReportBtn'),
    imp: document.getElementById('mobileImportBtn'),
  };
  if (btns.add)
    btns.add.style.display =
      windowCurrentPermissions.canAddParts || isAdmin ? 'flex' : 'none';
  if (btns.log)
    btns.log.style.display =
      windowCurrentPermissions.canLogUsage || isAdmin ? 'flex' : 'none';
  if (btns.scan) btns.scan.style.display = 'flex';
  if (btns.report) btns.report.style.display = 'flex';
  if (btns.imp) btns.imp.style.display = isAdmin ? 'flex' : 'none';
  const bar = document.querySelector('.bottom-action-bar');
  if (bar)
    bar.style.display = Object.values(btns).some(
      (b) => b && b.style.display !== 'none',
    )
      ? 'block'
      : 'none';
}

// =============================================
// DATABASE CRUD
// =============================================
async function loadAllData() {
  await loadParts();
  await loadUsageLogs();
  refreshAll();
  // Load dashboard data if dashboard tab is active
  const dashboardTab = document.getElementById('tab-dashboard');
  if (dashboardTab && dashboardTab.classList.contains('active')) {
    await loadDashboardData();
  }
}
async function loadParts() {
  showSyncIndicator('Loading parts...');
  const { data, error } = await supabaseClient
    .from('parts')
    .select('*')
    .order('part_number');
  hideSyncIndicator();
  if (error) showToast(`Error loading parts: ${error.message}`, true);
  else parts = data || [];
}
async function loadUsageLogs() {
  const { data, error } = await supabaseClient
    .from('usage_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) showToast(`Error loading logs: ${error.message}`, true);
  else usageLogs = data || [];
}
async function savePart(part) {
  return await saveToTable('parts', part);
}
async function updatePart(id, updates) {
  return await updateInTable('parts', id, updates);
}
async function deletePart(id) {
  return await deleteFromTable('parts', id);
}
async function saveUsageLog(log) {
  return await saveToTable('usage_logs', {
    ...log,
    created_by_email: currentUser?.email || 'Unknown User',
  });
}
async function updateUsageLog(id, updates) {
  return await updateInTable('usage_logs', id, updates);
}
async function deleteUsageLog(id) {
  return await deleteFromTable('usage_logs', id);
}

async function saveToTable(table, data) {
  showSyncIndicator('Saving...');
  const { data: result, error } = await supabaseClient
    .from(table)
    .insert([data])
    .select();
  hideSyncIndicator();
  if (error) showToast(`Error saving: ${error.message}`, true);
  return result?.[0];
}
async function updateInTable(table, id, updates) {
  showSyncIndicator('Updating...');
  const { data, error } = await supabaseClient
    .from(table)
    .update(updates)
    .eq('id', id)
    .select();
  hideSyncIndicator();
  if (error) showToast(`Error updating: ${error.message}`, true);
  return data?.[0];
}
async function deleteFromTable(table, id) {
  showSyncIndicator('Deleting...');
  const { error } = await supabaseClient.from(table).delete().eq('id', id);
  hideSyncIndicator();
  if (error) showToast(`Error deleting: ${error.message}`, true);
  return !error;
}
async function uploadPhoto(partId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const fileName = `part-${partId}-${Date.now()}.jpg`;
  const { error } = await supabaseClient.storage
    .from('part-photos')
    .upload(fileName, blob);
  if (error) {
    showToast(`Error uploading photo: ${error.message}`, true);
    return null;
  }
  const { data } = supabaseClient.storage
    .from('part-photos')
    .getPublicUrl(fileName);
  return data.publicUrl;
}
async function deletePhoto(url) {
  if (!url) return;
  const fileName = url.split('/').pop();
  await supabaseClient.storage.from('part-photos').remove([fileName]);
}

// =============================================
// DASHBOARD
// =============================================
async function loadDashboardData() {
  await Promise.all([
    updateKPICards(),
    updateUsageTrendsChart(),
    updateTopUsedParts(),
    updateLowStockAlerts(),
    updateRecentActivity(),
  ]);
}
async function updateKPICards() {
  const total = parts.length;
  const low = parts.filter((p) => p.current_qty < p.baseline_qty).length;
  const critical = parts.filter(
    (p) => p.current_qty < p.baseline_qty * 0.5,
  ).length;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const logsCount = usageLogs.filter(
    (l) => new Date(l.created_at) >= thirtyDaysAgo,
  ).length;
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const added = parts.filter((p) => new Date(p.created_at) >= monthAgo).length;
  document.getElementById('kpiTotalParts').innerText = total;
  document.getElementById('kpiLowStock').innerText = low;
  document.getElementById('kpiCritical').innerText = critical;
  document.getElementById('kpiLogsCount').innerText = logsCount;
  document.getElementById('kpiPartsTrend').innerHTML = added
    ? `▲ +${added} this month`
    : 'No new parts';
}
async function updateUsageTrendsChart() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
    });
  }
  usageLogs.forEach((log) => {
    const logDate = new Date(log.created_at);
    if (logDate >= new Date(Date.now() - 30 * 86400000)) {
      const dateStr = logDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const day = days.find((d) => d.date === dateStr);
      if (day) day.count += log.qty_used;
    }
  });
  if (usageChart) usageChart.destroy();
  usageChart = new Chart(
    document.getElementById('usageTrendsChart').getContext('2d'),
    {
      type: 'line',
      data: {
        labels: days.map((d) => d.date),
        datasets: [
          {
            label: 'Parts Used',
            data: days.map((d) => d.count),
            borderColor: '#2d6a4f',
            backgroundColor: 'rgba(45,106,79,0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    },
  );
}
async function updateTopUsedParts() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const count = {};
  usageLogs.forEach((log) => {
    if (new Date(log.created_at) >= thirtyDaysAgo) {
      if (!count[log.part_number])
        count[log.part_number] = { count: 0, desc: log.part_number };
      count[log.part_number].count += log.qty_used;
      const part = parts.find((p) => p.part_number === log.part_number);
      if (part)
        count[log.part_number].desc = part.description || log.part_number;
    }
  });
  const sorted = Object.entries(count)
    .map(([pn, d]) => ({ part_number: pn, ...d }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const container = document.getElementById('topPartsList');
  if (!sorted.length) {
    container.innerHTML =
      '<div class="loading-placeholder">No usage data in the last 30 days</div>';
    return;
  }
  const max = sorted[0]?.count || 1;
  container.innerHTML = sorted
    .map(
      (p, i) => `
    <div class="top-part-item">
      <div class="top-part-rank">${i + 1}</div>
      <div class="top-part-info"><div class="top-part-name">${escapeHtml(p.part_number)}</div><div class="top-part-desc">${escapeHtml(p.desc.substring(0, 40))}</div></div>
      <div class="top-part-bar-container"><div class="top-part-bar"><div class="top-part-bar-fill" style="width: ${(p.count / max) * 100}%"></div></div><div class="top-part-qty">${p.count} used</div></div>
    </div>`,
    )
    .join('');
}
async function updateLowStockAlerts() {
  const low = parts
    .filter((p) => p.current_qty < p.baseline_qty)
    .sort(
      (a, b) => a.current_qty / a.baseline_qty - b.current_qty / b.baseline_qty,
    )
    .slice(0, 5);
  const container = document.getElementById('lowStockList');
  if (!low.length) {
    container.innerHTML =
      '<div class="loading-placeholder">No low stock items! 🎉</div>';
    return;
  }
  container.innerHTML = low
    .map((p) => {
      const critical = p.current_qty < p.baseline_qty * 0.5;
      return `<div class="low-stock-item ${critical ? 'critical' : 'warning'}" onclick="showPartDetails(${p.id})">
      <div class="low-stock-info"><div class="low-stock-number"><strong>${escapeHtml(p.part_number)}</strong></div><div class="low-stock-desc">${escapeHtml(p.description || '')}</div></div>
      <div class="low-stock-stats">
        <div class="low-stock-current"><div class="label">Current</div><div class="value">${p.current_qty}</div></div>
        <div class="low-stock-baseline"><div class="label">Baseline</div><div class="value">${p.baseline_qty}</div></div>
        <div class="low-stock-shortage ${critical ? 'critical' : 'warning'}">Need ${p.baseline_qty - p.current_qty} more</div>
      </div>
    </div>`;
    })
    .join('');
}
async function updateRecentActivity() {
  const container = document.getElementById('recentActivityList');
  if (!usageLogs.length) {
    container.innerHTML =
      '<div class="loading-placeholder">No recent activity</div>';
    return;
  }
  container.innerHTML = usageLogs
    .slice(0, 10)
    .map((log) => {
      const date = new Date(log.created_at);
      const mins = Math.floor((Date.now() - date) / 60000);
      const timeAgo =
        mins < 1
          ? 'Just now'
          : mins < 60
            ? `${mins} min ago`
            : mins < 1440
              ? `${Math.floor(mins / 60)} hour${Math.floor(mins / 60) > 1 ? 's' : ''} ago`
              : `${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) > 1 ? 's' : ''} ago`;
      return `<div class="activity-item" onclick="showLogDetails(${log.id})"><div class="activity-icon usage"><i class="fas fa-minus"></i></div><div class="activity-content"><div class="activity-text"><strong>${escapeHtml(log.qty_used)} x ${escapeHtml(log.part_number)}</strong> used${log.note ? ` - ${escapeHtml(log.note)}` : ''}</div><div class="activity-time">${timeAgo} by ${escapeHtml(log.created_by_email || 'Unknown')}</div></div></div>`;
    })
    .join('');
}

// =============================================
// RENDER FUNCTIONS
// =============================================
function refreshAll() {
  renderAllParts();
  renderNeedOrder();
  renderCritical();
  renderLogs();
}
function handleSort(field) {
  if (allSortField === field)
    allSortDirection = allSortDirection === 'asc' ? 'desc' : 'asc';
  else {
    allSortField = field;
    allSortDirection = 'asc';
  }
  allState.page = 1;
  renderAllParts();
}
function updateSortIcons() {
  document.querySelectorAll('#tab-all .sortable').forEach((h) => {
    const field = h.getAttribute('data-sort');
    const icon = h.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
      if (field === allSortField)
        icon.classList.add(
          allSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down',
        );
      else icon.classList.add('fa-sort');
    }
  });
}
function renderAllParts() {
  let filtered = parts.filter(
    (p) =>
      !allState.search ||
      p.part_number.toLowerCase().includes(allState.search) ||
      (p.description || '').toLowerCase().includes(allState.search),
  );
  filtered.sort((a, b) => {
    let va = a[allSortField] ?? '',
      vb = b[allSortField] ?? '';
    if (['current_qty', 'baseline_qty'].includes(allSortField)) {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }
    return allSortDirection === 'asc' ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
  });
  const total = Math.ceil(filtered.length / allState.rows) || 1;
  if (allState.page > total) allState.page = 1;
  const pageItems = filtered.slice(
    (allState.page - 1) * allState.rows,
    allState.page * allState.rows,
  );
  const tbody = document.getElementById('allPartsBody');
  if (!tbody) return;
  if (!pageItems.length)
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:30px;">No parts found<\/td><\/tr>';
  else
    tbody.innerHTML = pageItems
      .map((p) => {
        const need = p.current_qty < p.baseline_qty;
        const crit = p.current_qty < p.baseline_qty * 0.5;
        return `<tr class="${need ? (crit ? 'stock-critical' : 'stock-low') : ''}">
      <td><span class="clickable-part" onclick="showPartDetails(${p.id})"><strong>${escapeHtml(p.part_number)}</strong></span></td>
      <td>${escapeHtml(p.description || '').substring(0, 50)}</td>
      <td><span class="current-qty-display">${p.current_qty}</span></td>
      <td>${p.baseline_qty}</td>
      <td>${need ? (crit ? '<span class="status-badge status-critical">CRITICAL</span>' : '<span class="status-badge status-warning">Order needed</span>') : '<span class="status-badge status-ok">OK</span>'}</td>
    </tr>`;
      })
      .join('');
  const pageDiv = document.getElementById('allPagination');
  if (pageDiv)
    pageDiv.innerHTML = renderPagination(allState.page, total, 'changeAllPage');
  document.getElementById('totalPartsStat').innerHTML = parts.length;
  document.getElementById('lowStockStat').innerHTML = parts.filter(
    (p) => p.current_qty < p.baseline_qty,
  ).length;
  updateSortIcons();
}
function renderPagination(page, total, func) {
  if (total <= 1) return '';
  let html = `<button class="page-btn" onclick="${func}(${Math.max(1, page - 1)})">◀</button>`;
  for (let i = Math.max(1, page - 2); i <= Math.min(total, page + 2); i++)
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="${func}(${i})">${i}</button>`;
  html += `<button class="page-btn" onclick="${func}(${Math.min(total, page + 1)})">▶</button><span class="pagination-info">Page ${page} of ${total}</span>`;
  return html;
}
function changeAllPage(p) {
  allState.page = p;
  renderAllParts();
}
function renderNeedOrder() {
  let need = parts.filter((p) => p.current_qty < p.baseline_qty);
  if (needState.search)
    need = need.filter(
      (p) =>
        p.part_number.toLowerCase().includes(needState.search) ||
        (p.description || '').toLowerCase().includes(needState.search),
    );
  const tbody = document.getElementById('needOrderBody');
  if (!tbody) return;
  if (!need.length)
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:30px;">No parts need ordering<\/td><\/tr>';
  else
    tbody.innerHTML = need
      .map(
        (p) =>
          `<tr><td><span class="clickable-part" onclick="showPartDetails(${p.id})"><strong>${escapeHtml(p.part_number)}</strong></span></td><td>${escapeHtml(p.description || '').substring(0, 40)}</td><td><span class="current-qty-display">${p.current_qty}</span></td><td>${p.baseline_qty}</td><td style="color:#e76f51;font-weight:600;">${p.baseline_qty - p.current_qty}</td></tr>`,
      )
      .join('');
}
function renderCritical() {
  let critical = parts.filter((p) => p.current_qty < p.baseline_qty * 0.5);
  if (criticalState.search)
    critical = critical.filter(
      (p) =>
        p.part_number.toLowerCase().includes(criticalState.search) ||
        (p.description || '').toLowerCase().includes(criticalState.search),
    );
  const tbody = document.getElementById('criticalBody');
  if (!tbody) return;
  if (!critical.length)
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:30px;">No critical parts<\/td><\/tr>';
  else
    tbody.innerHTML = critical
      .map(
        (p) =>
          `<tr class="stock-critical"><td><span class="clickable-part" onclick="showPartDetails(${p.id})"><strong>${escapeHtml(p.part_number)}</strong></span></td><td>${escapeHtml(p.description || '').substring(0, 40)}</td><td><span class="current-qty-display">${p.current_qty}</span></td><td>${p.baseline_qty}</td><td style="color:#c2410c;font-weight:600;">${Math.round((p.current_qty / p.baseline_qty) * 100)}%<\/td><\/tr>`,
      )
      .join('');
}
function renderLogs() {
  let filtered = usageLogs.filter(
    (l) =>
      !logsSearch ||
      l.part_number.toLowerCase().includes(logsSearch) ||
      (l.note || '').toLowerCase().includes(logsSearch),
  );
  document.getElementById('logCount').innerHTML = `(${filtered.length})`;
  const container = document.getElementById('logsListContainer');
  if (!container) return;
  if (!filtered.length)
    container.innerHTML =
      '<div style="padding:60px;text-align:center;color:#94a3b8;">No usage records</div>';
  else
    container.innerHTML = filtered
      .map(
        (l) =>
          `<div class="log-entry clickable-log" onclick="showLogDetails(${l.id})"><div><i class="far fa-calendar-alt"></i> ${escapeHtml(new Date(l.created_at).toLocaleString())}</div><div><strong>${escapeHtml(l.part_number)}</strong></div><div><span style="color:#e76f51;font-weight:600;">-${l.qty_used}</span></div><div>${l.previous_stock} → ${l.new_stock}</div><div><i class="fas fa-comment"></i> ${escapeHtml(l.note || '—')}</div></div>`,
      )
      .join('');
}

// =============================================
// DETAILS & LOGS
// =============================================
function showPartDetails(id) {
  const p = parts.find((x) => x.id === id);
  if (!p) return;
  currentDetailsPartId = id;
  const need = p.current_qty < p.baseline_qty;
  const crit = p.current_qty < p.baseline_qty * 0.5;
  document.getElementById('partDetailsContent').innerHTML = `
    <div class="details-row"><div class="details-label">Part Number</div><div class="details-value"><strong>${escapeHtml(p.part_number)}</strong></div></div>
    <div class="details-row"><div class="details-label">Description</div><div class="details-value">${escapeHtml(p.description || '')}</div></div>
    <div class="details-row"><div class="details-label"><i class="fas fa-map-marker-alt"></i> Location</div><div class="details-value">${p.location ? `<span class="location-badge">${escapeHtml(p.location)}</span>` : '<span style="color:#94a3b8;">Not specified</span>'}</div></div>
    <div class="details-row"><div class="details-label">Current Quantity</div><div class="details-value"><span class="current-qty-display">${p.current_qty}</span></div></div>
    <div class="details-row"><div class="details-label">Baseline</div><div class="details-value">${p.baseline_qty}</div></div>
    <div class="details-row"><div class="details-label">Stock Level</div><div class="details-value">${Math.round((p.current_qty / p.baseline_qty) * 100)}% of baseline</div></div>
    <div class="details-row"><div class="details-label">Status</div><div class="details-value"><span class="status-badge ${need ? (crit ? 'status-critical' : 'status-warning') : 'status-ok'}">${need ? (crit ? 'CRITICAL' : 'Order Needed') : 'OK'}</span></div></div>
    ${need ? `<div class="details-row"><div class="details-label">Shortage</div><div class="details-value" style="color:#e76f51;font-weight:600;">${p.baseline_qty - p.current_qty} units needed</div></div>` : ''}
  `;
  const photoDiv = document.getElementById('photoDisplay');
  if (p.photo_url)
    photoDiv.innerHTML = `<img src="${p.photo_url}" class="part-photo" alt="Part photo">`;
  else
    photoDiv.innerHTML =
      '<div class="part-photo-placeholder"><i class="fas fa-camera fa-2x"></i><span>No photo</span></div>';
  const canEdit = windowCurrentPermissions.canEditParts || isAdmin;
  const canLog = windowCurrentPermissions.canLogUsage || isAdmin;
  const editBtn = document.getElementById('detailsEditBtn');
  const logBtn = document.getElementById('detailsLogBtn');
  if (editBtn) editBtn.style.display = canEdit ? 'inline-flex' : 'none';
  if (logBtn) logBtn.style.display = canLog ? 'inline-flex' : 'none';
  showModal('partDetailsModal');
}
function showLogDetails(id) {
  const log = usageLogs.find((l) => l.id === id);
  if (!log) return;
  const canEdit = windowCurrentPermissions.canEditLogs || isAdmin;
  const canDelete = windowCurrentPermissions.canDeleteLogs || isAdmin;
  document.getElementById('logDetailsContent').innerHTML = `
    <div class="details-row"><div class="details-label">Part Number</div><div class="details-value"><strong>${escapeHtml(log.part_number)}</strong></div></div>
    <div class="details-row"><div class="details-label">Quantity Used</div><div class="details-value"><span style="color:#e76f51;font-weight:600;">-${log.qty_used}</span></div></div>
    <div class="details-row"><div class="details-label">Stock Change</div><div class="details-value">${log.previous_stock} → ${log.new_stock}</div></div>
    <div class="details-row"><div class="details-label">Date & Time</div><div class="details-value">${escapeHtml(new Date(log.created_at).toLocaleString())}</div></div>
    <div class="details-row"><div class="details-label">Created By</div><div class="details-value"><i class="fas fa-user"></i> ${escapeHtml(log.created_by_email || 'Unknown User')}</div></div>
    <div class="details-row"><div class="details-label">Note</div><div class="details-value">${escapeHtml(log.note || '—')}</div></div>
  `;
  const editBtn = document.getElementById('logDetailsEditBtn');
  const delBtn = document.getElementById('logDetailsDeleteBtn');
  if (editBtn) {
    editBtn.style.display = canEdit ? 'inline-flex' : 'none';
    if (canEdit)
      editBtn.onclick = () => {
        hideModal('logDetailsModal');
        openEditLog(id);
      };
  }
  if (delBtn) {
    delBtn.style.display = canDelete ? 'inline-flex' : 'none';
    if (canDelete)
      delBtn.onclick = () => {
        hideModal('logDetailsModal');
        showConfirmDeleteLog(id);
      };
  }
  showModal('logDetailsModal');
}
async function logUsage(partId, qty, note) {
  const part = parts.find((p) => p.id === partId);
  if (!part || qty <= 0 || part.current_qty < qty) {
    showToast('Invalid quantity or insufficient stock', true);
    return false;
  }
  const newQty = part.current_qty - qty;
  const updated = await updatePart(partId, { current_qty: newQty });
  if (!updated) return false;
  const newLog = await saveUsageLog({
    part_id: part.id,
    part_number: part.part_number,
    qty_used: qty,
    note: note || '',
    previous_stock: part.current_qty,
    new_stock: newQty,
  });
  if (newLog) usageLogs.unshift(newLog);
  part.current_qty = newQty;
  refreshAll();
  showToast(`✓ Used ${qty} x ${part.part_number}, remaining: ${newQty}`);
  return true;
}

// =============================================
// EDIT FUNCTIONS
// =============================================
function openEditPart(id) {
  if (!(windowCurrentPermissions.canEditParts || isAdmin)) {
    showToast('You do not have permission to edit parts', true);
    return;
  }
  const p = parts.find((x) => x.id === id);
  if (!p) return;
  currentEditPartId = id;
  document.getElementById('editPartNumber').value = p.part_number;
  document.getElementById('editDescription').value = p.description || '';
  document.getElementById('editLocation').value = p.location || '';
  document.getElementById('editCurrentQtyDisplay').innerText = p.current_qty;
  document.getElementById('editCurrentQty').value = p.current_qty;
  document.getElementById('editBaselineQty').value = p.baseline_qty;
  const photoDiv = document.getElementById('editPhotoDisplay');
  const removeBtn = document.getElementById('editRemovePhotoBtn');
  if (p.photo_url) {
    photoDiv.innerHTML = `<img src="${p.photo_url}" class="part-photo" alt="Part photo">`;
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    photoDiv.innerHTML =
      '<div class="part-photo-placeholder"><i class="fas fa-camera fa-2x"></i><span>No photo</span></div>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  const takeBtn = document.getElementById('editTakePhotoBtn');
  const newTakeBtn = takeBtn.cloneNode(true);
  const newRemoveBtn = removeBtn.cloneNode(true);
  takeBtn.parentNode.replaceChild(newTakeBtn, takeBtn);
  removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);
  newTakeBtn.onclick = () => openCameraForEdit(p.id);
  newRemoveBtn.onclick = () => handleRemovePhotoInEdit(p.id);
  showModal('editModal');
}
function openQuickLog(id) {
  const p = parts.find((x) => x.id === id);
  if (!p) return;
  selectedPartId = id;
  document.getElementById('partSearchInput').value = p.part_number;
  const display = document.getElementById('selectedPartDisplay');
  display.innerHTML = `<i class="fas fa-check-circle"></i> Selected: <strong>${escapeHtml(p.part_number)}</strong> - Stock: ${p.current_qty} units`;
  display.classList.add('show');
  setTimeout(() => display.classList.remove('show'), 3000);
  document.getElementById('usageQty').value = 1;
  document.getElementById('usageQty').max = p.current_qty;
  document.getElementById('usageNote').value = '';
  document.getElementById('partListDropdown').innerHTML = '';
  document.getElementById('partListDropdown').style.display = 'none';
  showModal('usageModal');
}
function openEditLog(id) {
  if (!(windowCurrentPermissions.canEditLogs || isAdmin)) {
    showToast('You do not have permission to edit logs', true);
    return;
  }
  const log = usageLogs.find((l) => l.id === id);
  if (!log) return;
  currentEditLogId = id;
  document.getElementById('editLogPartNumber').value = log.part_number;
  document.getElementById('editLogQty').value = log.qty_used;
  document.getElementById('editLogDate').value = new Date(
    log.created_at,
  ).toLocaleString();
  document.getElementById('editLogNote').value = log.note || '';
  showModal('editLogModal');
}
async function saveEditPart() {
  const p = parts.find((x) => x.id === currentEditPartId);
  if (!p) return;
  const newPn = document.getElementById('editPartNumber').value.trim();
  if (!newPn) {
    showToast('Part number required', true);
    return;
  }
  if (
    parts.some((x) => x.id !== currentEditPartId && x.part_number === newPn)
  ) {
    showToast('Part number already exists', true);
    return;
  }
  const updates = {
    part_number: newPn,
    description: document.getElementById('editDescription').value,
    location: document.getElementById('editLocation').value,
    current_qty: parseInt(document.getElementById('editCurrentQty').value),
    baseline_qty: parseInt(document.getElementById('editBaselineQty').value),
  };
  const updated = await updatePart(currentEditPartId, updates);
  if (updated) {
    const idx = parts.findIndex((x) => x.id === currentEditPartId);
    if (idx !== -1) parts[idx] = updated;
    refreshAll();
    hideModal('editModal');
    showToast('✓ Part updated successfully');
  }
}
async function saveEditLog() {
  const log = usageLogs.find((l) => l.id === currentEditLogId);
  if (!log) return;
  const newQty = parseInt(document.getElementById('editLogQty').value);
  if (isNaN(newQty) || newQty <= 0) {
    showToast('Invalid quantity', true);
    return;
  }
  const updated = await updateUsageLog(currentEditLogId, {
    qty_used: newQty,
    note: document.getElementById('editLogNote').value,
  });
  if (updated) {
    const idx = usageLogs.findIndex((l) => l.id === currentEditLogId);
    if (idx !== -1) usageLogs[idx] = updated;
    refreshAll();
    hideModal('editLogModal');
    showToast('✓ Log entry updated successfully');
  }
}
async function addNewPart() {
  if (!(windowCurrentPermissions.canAddParts || isAdmin)) {
    showToast('You do not have permission to add parts', true);
    return;
  }
  const pn = document.getElementById('newPartNumber').value.trim();
  if (!pn) {
    showToast('Part number required', true);
    return;
  }
  if (parts.some((p) => p.part_number === pn)) {
    showToast('Part number already exists', true);
    return;
  }
  const newPart = {
    part_number: pn,
    description:
      document.getElementById('newDescription').value.trim() || 'New Part',
    current_qty: parseInt(document.getElementById('newQuantity').value) || 0,
    baseline_qty: parseInt(document.getElementById('newQuantity').value) || 0,
    location: document.getElementById('newLocation').value.trim() || '',
  };
  const saved = await savePart(newPart);
  if (saved) {
    parts.push(saved);
    refreshAll();
    hideModal('addPartModal');
    document.getElementById('newPartNumber').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newLocation').value = '';
    document.getElementById('newQuantity').value = 0;
    showToast(`✓ Part "${pn}" added successfully`);
  }
}
function adjustQty(delta) {
  const disp = document.getElementById('editCurrentQtyDisplay');
  let val = parseInt(disp.innerText) + delta;
  if (val < 0) val = 0;
  disp.innerText = val;
  document.getElementById('editCurrentQty').value = val;
}

// =============================================
// QR SCANNER
// =============================================
async function openQrScanner() {
  await stopQrScanner();
  document.getElementById('manualQrInput').value = '';
  document.getElementById('qr-status').innerHTML =
    '<i class="fas fa-camera"></i> Initializing...';
  showModal('qrScannerModal');
  setTimeout(() => startQrScanner(), 300);
}
async function startQrScanner() {
  if (!document.getElementById('qr-reader')) return;
  await stopQrScanner();
  const status = document.getElementById('qr-status');
  status.innerHTML =
    '<i class="fas fa-spinner fa-pulse"></i> Starting camera...';
  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      (text) => onQrCodeSuccess(text),
      () => {},
    );
    isScannerActive = true;
    status.innerHTML =
      '<i class="fas fa-camera"></i> Position QR code in frame';
  } catch (err) {
    status.innerHTML =
      '<i class="fas fa-exclamation-triangle"></i> Camera error';
  }
}
async function stopQrScanner() {
  if (html5QrCode && isScannerActive) {
    try {
      await html5QrCode.stop();
    } catch (e) {}
    try {
      await html5QrCode.clear();
    } catch (e) {}
    isScannerActive = false;
  }
  html5QrCode = null;
}
async function onQrCodeSuccess(text) {
  await stopQrScanner();
  hideModal('qrScannerModal');
  const found = parts.find(
    (p) => p.part_number.toLowerCase() === text.toLowerCase(),
  );
  if (found) {
    showToast(`✓ Found: ${found.part_number}`);
    showPartDetails(found.id);
  } else if (confirm(`Part "${text}" not found. Create new?`)) {
    document.getElementById('newPartNumber').value = text;
    document.getElementById('newDescription').value = '';
    document.getElementById('newLocation').value = '';
    document.getElementById('newQuantity').value = 0;
    showModal('addPartModal');
  } else showToast('Part not found', true);
}
function manualQrLookup() {
  const val = document.getElementById('manualQrInput').value.trim();
  if (!val) {
    showToast('Enter part number', true);
    return;
  }
  closeQrScanner();
  const found = parts.find(
    (p) => p.part_number.toLowerCase() === val.toLowerCase(),
  );
  if (found) {
    showToast(`✓ Found: ${found.part_number}`);
    showPartDetails(found.id);
  } else if (confirm(`Part "${val}" not found. Create new?`)) {
    document.getElementById('newPartNumber').value = val;
    document.getElementById('newDescription').value = '';
    document.getElementById('newLocation').value = '';
    document.getElementById('newQuantity').value = 0;
    showModal('addPartModal');
  } else showToast('Part not found', true);
}
async function closeQrScanner() {
  await stopQrScanner();
  hideModal('qrScannerModal');
}

// =============================================
// CAMERA
// =============================================
async function startCamera() {
  await stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    document.getElementById('camera-video').srcObject = cameraStream;
  } catch (err) {
    showToast(`Camera error: ${err.message}`, true);
  }
}
async function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
}
async function openCameraForEdit(partId) {
  pendingPhotoPartId = partId;
  reopenEditAfterPhoto = true;
  hideModal('editModal');
  await startCamera();
  showModal('cameraModal');
}
async function closeCamera() {
  await stopCamera();
  hideModal('cameraModal');
  if (reopenEditAfterPhoto && pendingPhotoPartId) {
    openEditPart(pendingPhotoPartId);
    reopenEditAfterPhoto = false;
  }
  pendingPhotoPartId = null;
}
async function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const photoData = canvas.toDataURL('image/jpeg', 0.8);
  if (pendingPhotoPartId) {
    showSyncIndicator('Uploading photo...');
    const url = await uploadPhoto(pendingPhotoPartId, photoData);
    hideSyncIndicator();
    if (url) {
      const part = parts.find((p) => p.id === pendingPhotoPartId);
      if (part) {
        await updatePart(pendingPhotoPartId, { photo_url: url });
        part.photo_url = url;
        showToast('✓ Photo captured and saved');
      }
    }
  }
  closeCamera();
}
function handleRemovePhotoInEdit(partId) {
  pendingPhotoDeletePartId = partId;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Remove Photo';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to remove this photo?';
  const part = parts.find((p) => p.id === partId);
  document.getElementById('confirmDetails').innerHTML =
    `<strong>Part:</strong> ${escapeHtml(part.part_number)}<br><strong>Description:</strong> ${escapeHtml(part.description || '')}`;
  showModal('confirmDeleteModal');
}
async function executePhotoDelete() {
  if (pendingPhotoDeletePartId) {
    const part = parts.find((p) => p.id === pendingPhotoDeletePartId);
    if (part && part.photo_url) {
      await deletePhoto(part.photo_url);
      await updatePart(pendingPhotoDeletePartId, { photo_url: null });
      part.photo_url = null;
      showToast('✓ Photo removed');
    }
    pendingPhotoDeletePartId = null;
  }
  hideModal('confirmDeleteModal');
}

// =============================================
// REPORT & DELETE
// =============================================
function showOrderReport() {
  const need = parts.filter((p) => p.current_qty < p.baseline_qty);
  const container = document.getElementById('reportListContainer');
  if (!need.length)
    container.innerHTML =
      '<div class="report-empty"><i class="fas fa-check-circle" style="font-size:3rem;color:#2d6a4f;margin-bottom:12px;display:block;"></i>All parts have sufficient stock!<br>No orders needed at this time.</div>';
  else {
    container.innerHTML = '';
    let total = 0;
    need.forEach((p) => {
      const shortage = p.baseline_qty - p.current_qty;
      total += shortage;
      const div = document.createElement('div');
      div.className = 'report-item';
      div.innerHTML = `<div class="report-item-info"><div class="report-item-part">${escapeHtml(p.part_number)}</div><div class="report-item-desc">${escapeHtml(p.description || '')}</div></div><div class="report-item-qty">Need ${shortage}</div>`;
      container.appendChild(div);
    });
    document.getElementById('reportTotalItems').innerHTML =
      `Total: ${need.length} part(s) | ${total} units needed`;
  }
  showModal('orderReportModal');
}
function copyOrderAndRedirect() {
  const need = parts.filter((p) => p.current_qty < p.baseline_qty);
  if (!need.length) {
    showToast('No items to order', true);
    return;
  }
  const text = need
    .map((p) => `${p.part_number} - need ${p.baseline_qty - p.current_qty}`)
    .join('\n');
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast(`${need.length} item(s) copied to clipboard!`);
      window.open(
        'https://mckessonpa.atlassian.net/servicedesk/customer/portal/2/group/3/create/14',
        '_blank',
      );
    })
    .catch(() => showToast('Failed to copy', true));
}
function showConfirmDeletePart(id) {
  if (!(windowCurrentPermissions.canDeleteParts || isAdmin)) {
    showToast('You do not have permission to delete parts', true);
    return;
  }
  const part = parts.find((p) => p.id === id);
  if (!part) return;
  pendingDeletePartId = id;
  pendingDeleteLogId = null;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Delete Part';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to permanently delete this part?';
  document.getElementById('confirmDetails').innerHTML =
    `<strong>Part Number:</strong> ${escapeHtml(part.part_number)}<br><strong>Description:</strong> ${escapeHtml(part.description || '')}<br><strong>Current Stock:</strong> ${part.current_qty}<br><strong>Baseline:</strong> ${part.baseline_qty}`;
  showModal('confirmDeleteModal');
}
function showConfirmDeleteLog(id) {
  if (!(windowCurrentPermissions.canDeleteLogs || isAdmin)) {
    showToast('You do not have permission to delete logs', true);
    return;
  }
  const log = usageLogs.find((l) => l.id === id);
  if (!log) return;
  pendingDeleteLogId = id;
  pendingDeletePartId = null;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Delete Log Entry';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to delete this log entry? Stock quantity will NOT be restored.';
  document.getElementById('confirmDetails').innerHTML =
    `<strong>Part:</strong> ${escapeHtml(log.part_number)}<br><strong>Quantity Used:</strong> ${log.qty_used}<br><strong>Date:</strong> ${escapeHtml(new Date(log.created_at).toLocaleString())}<br><strong>Note:</strong> ${escapeHtml(log.note || '—')}`;
  showModal('confirmDeleteModal');
}
async function executeDelete() {
  if (pendingDeletePartId !== null) {
    const success = await deletePart(pendingDeletePartId);
    if (success) {
      parts = parts.filter((p) => p.id !== pendingDeletePartId);
      refreshAll();
      showToast('✓ Part deleted successfully');
    }
    pendingDeletePartId = null;
  } else if (pendingDeleteLogId !== null) {
    const success = await deleteUsageLog(pendingDeleteLogId);
    if (success) {
      usageLogs = usageLogs.filter((l) => l.id !== pendingDeleteLogId);
      refreshAll();
      showToast('✓ Log entry deleted successfully');
    }
    pendingDeleteLogId = null;
  }
  hideModal('confirmDeleteModal');
}
function cancelDelete() {
  pendingDeletePartId = null;
  pendingDeleteLogId = null;
  pendingPhotoDeletePartId = null;
  hideModal('confirmDeleteModal');
}

// =============================================
// ADMIN PANEL
// =============================================
async function openAdminPanel() {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return;
  }
  await renderAdminPanel();
  showModal('adminPanelModal');
}
async function renderAdminPanel() {
  const listDiv = document.getElementById('adminUserList');
  if (!listDiv) return;
  const search = document.getElementById('adminUserSearch')?.value || '';
  let query = supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (search) query = query.ilike('email', `%${search}%`);
  const { data, error } = await query;
  if (error) {
    showToast('Error loading users: ' + error.message, true);
    return;
  }
  const users = data || [];
  document.getElementById('totalUsersCount').innerText = users.length;
  document.getElementById('adminCount').innerText = users.filter(
    (u) => u.is_admin,
  ).length;
  if (!users.length) {
    listDiv.innerHTML =
      '<div style="text-align:center;padding:20px;color:#94a3b8;">No users found</div>';
    return;
  }
  listDiv.innerHTML = users
    .map(
      (user) => `
    <div class="admin-user-item" data-user-id="${user.id}" data-user-email="${escapeHtml(user.email)}" onclick="openUserPermissions('${user.id}')">
      <div class="admin-user-info">
        <div class="admin-user-email">${escapeHtml(user.email)}</div>
        <div><span class="admin-user-badge ${user.is_admin ? 'badge-admin' : 'badge-user'}">${user.is_admin ? '👑 Admin' : '👤 User'}</span>${user.id === currentUser?.id ? ' <span style="font-size:0.7rem;color:#94a3b8;">(You)</span>' : ''}</div>
      </div>
      <div class="admin-user-actions"><button class="admin-action-btn"><i class="fas fa-sliders-h"></i> Permissions</button></div>
    </div>`,
    )
    .join('');
}
window.openUserPermissions = async function (userId) {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return;
  }
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    showToast('Error loading user permissions: ' + error.message, true);
    return;
  }
  currentEditingUser = data;
  document.getElementById('userPermissionsHeader').innerHTML =
    `<h4>${escapeHtml(data.email)}</h4><p>${data.is_admin ? 'Administrator - Full Access' : 'Standard User'}</p>`;
  document.getElementById('permAddParts').checked =
    data.can_add_parts || data.is_admin;
  document.getElementById('permEditParts').checked =
    data.can_edit_parts || data.is_admin;
  document.getElementById('permDeleteParts').checked =
    data.can_delete_parts || data.is_admin;
  document.getElementById('permLogUsage').checked =
    data.can_log_usage || data.is_admin;
  document.getElementById('permEditLogs').checked =
    data.can_edit_logs || data.is_admin;
  document.getElementById('permDeleteLogs').checked =
    data.can_delete_logs || data.is_admin;
  document.getElementById('permIsAdmin').checked = data.is_admin;
  const isEditingAdmin = data.is_admin;
  const isCurrentUser = data.id === currentUser?.id;
  [
    'permAddParts',
    'permEditParts',
    'permDeleteParts',
    'permLogUsage',
    'permEditLogs',
    'permDeleteLogs',
    'permIsAdmin',
  ].forEach((id) => {
    const toggle = document.getElementById(id);
    if (toggle) {
      toggle.disabled =
        isEditingAdmin || (id === 'permIsAdmin' && isCurrentUser);
      const parent = toggle.closest('.permission-item');
      if (parent)
        parent.style.opacity =
          isEditingAdmin || (id === 'permIsAdmin' && isCurrentUser)
            ? '0.5'
            : '1';
    }
  });
  showModal('userPermissionsModal');
};
async function saveUserPermissions() {
  if (!currentEditingUser) return;
  if (
    currentEditingUser.id === currentUser?.id &&
    !document.getElementById('permIsAdmin').checked &&
    currentEditingUser.is_admin
  ) {
    showToast('You cannot remove your own admin status!', true);
    return;
  }
  const perms = {
    can_add_parts: document.getElementById('permAddParts').checked,
    can_edit_parts: document.getElementById('permEditParts').checked,
    can_delete_parts: document.getElementById('permDeleteParts').checked,
    can_log_usage: document.getElementById('permLogUsage').checked,
    can_edit_logs: document.getElementById('permEditLogs').checked,
    can_delete_logs: document.getElementById('permDeleteLogs').checked,
    is_admin: document.getElementById('permIsAdmin').checked,
  };
  const { error } = await supabaseClient
    .from('profiles')
    .update({ ...perms, updated_at: new Date() })
    .eq('id', currentEditingUser.id);
  if (error) {
    showToast('Error updating permissions: ' + error.message, true);
    return;
  }
  showToast('Permissions updated successfully');
  hideModal('userPermissionsModal');
  await renderAdminPanel();
  if (currentEditingUser.id === currentUser?.id) {
    await checkAdminStatus();
    await updateUIByPermissions();
  }
}

// =============================================
// IMPORT EXCEL
// =============================================
async function importExcel(rows) {
  if (!rows.length) return;
  if (!isAdmin) {
    showToast('Only admins can import Excel files', true);
    return;
  }
  let pIdx = 0,
    dIdx = 1,
    qIdx = 2,
    lIdx = -1;
  if (rows[0]) {
    const lower = rows[0].map((h) => String(h).toLowerCase());
    pIdx = lower.findIndex((h) => h.includes('part') || h.includes('number'));
    if (pIdx === -1) pIdx = 0;
    dIdx = lower.findIndex(
      (h) => h.includes('desc') || h.includes('description'),
    );
    if (dIdx === -1) dIdx = 1;
    qIdx = lower.findIndex((h) => h.includes('qty') || h.includes('quantity'));
    if (qIdx === -1) qIdx = 2;
    lIdx = lower.findIndex(
      (h) =>
        h.includes('loc') || h.includes('location') || h.includes('position'),
    );
  }
  const start =
    rows[0] && String(rows[0][0]).toLowerCase().includes('part') ? 1 : 0;
  let added = 0,
    updated = 0;
  showSyncIndicator('Importing parts...');
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const pn = row[pIdx] ? String(row[pIdx]).trim() : '';
    if (!pn) continue;
    const desc = row[dIdx] ? String(row[dIdx]).trim() : '';
    const qty = parseFloat(row[qIdx]) || 0;
    const loc = lIdx !== -1 && row[lIdx] ? String(row[lIdx]).trim() : '';
    const existing = parts.find((p) => p.part_number === pn);
    if (existing) {
      await updatePart(existing.id, {
        description: desc,
        baseline_qty: qty,
        location: loc,
      });
      existing.description = desc;
      existing.baseline_qty = qty;
      if (loc) existing.location = loc;
      updated++;
    } else {
      const newPart = await savePart({
        part_number: pn,
        description: desc,
        current_qty: qty,
        baseline_qty: qty,
        location: loc,
      });
      if (newPart) parts.push(newPart);
      added++;
    }
  }
  hideSyncIndicator();
  refreshAll();
  showToast(`Imported: ${added} new, ${updated} updated`);
}
function updatePartDropdown(search) {
  const searchLower = search.toLowerCase();
  const filtered = parts.filter(
    (p) =>
      p.part_number.toLowerCase().includes(searchLower) ||
      (p.description || '').toLowerCase().includes(searchLower),
  );
  const dropdown = document.getElementById('partListDropdown');
  if (!filtered.length) {
    dropdown.innerHTML =
      '<div class="part-option" style="text-align:center;color:#999;">No parts found</div>';
    dropdown.style.display = 'block';
    return;
  }
  dropdown.innerHTML = '';
  dropdown.style.display = 'block';
  filtered.slice(0, 20).forEach((part) => {
    const div = document.createElement('div');
    div.className = 'part-option';
    div.innerHTML = `<strong>${escapeHtml(part.part_number)}</strong><br><small>${escapeHtml(part.description || '').substring(0, 40)} | Stock: ${part.current_qty}</small>`;
    div.onclick = () => {
      selectedPartId = part.id;
      const display = document.getElementById('selectedPartDisplay');
      display.innerHTML = `<i class="fas fa-check-circle"></i> Selected: <strong>${escapeHtml(part.part_number)}</strong> - Stock: ${part.current_qty} units`;
      display.classList.add('show');
      document.getElementById('partSearchInput').value = part.part_number;
      dropdown.style.display = 'none';
      document.getElementById('usageQty').max = part.current_qty;
      setTimeout(() => display.classList.remove('show'), 3000);
    };
    dropdown.appendChild(div);
  });
}
function editFromDetails() {
  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openEditPart(currentDetailsPartId);
  }
}
function logFromDetails() {
  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openQuickLog(currentDetailsPartId);
  }
}

// =============================================
// INITIALIZATION
// =============================================
function initMobileMenu() {
  const hamburger = document.getElementById('hamburgerMenu');
  const dropdown = document.getElementById('mobileDropdown');
  if (hamburger)
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
  document.addEventListener('click', (e) => {
    if (
      dropdown?.classList.contains('show') &&
      !hamburger?.contains(e.target) &&
      !dropdown.contains(e.target)
    )
      dropdown.classList.remove('show');
  });
  document.querySelectorAll('.mobile-tab-btn, .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchToTab(btn.getAttribute('data-tab'));
      if (dropdown) dropdown.classList.remove('show');
    });
  });
}
function initUsageQuantityControls() {
  const dec = document.getElementById('decrementUsageQty');
  const inc = document.getElementById('incrementUsageQty');
  const input = document.getElementById('usageQty');
  if (dec)
    dec.onclick = () => {
      let v = parseInt(input.value) || 1;
      if (v > 1) input.value = v - 1;
    };
  if (inc)
    inc.onclick = () => {
      let v = parseInt(input.value) || 1;
      let max = parseInt(input.max) || 9999;
      if (v < max) input.value = v + 1;
    };
}

// =============================================
// EVENT LISTENERS
// =============================================
document.getElementById('loginTab')?.addEventListener('click', switchToLogin);
document
  .getElementById('registerTab')
  ?.addEventListener('click', switchToRegister);
document
  .getElementById('loginBtn')
  ?.addEventListener('click', () =>
    login(
      document.getElementById('loginEmail').value,
      document.getElementById('loginPassword').value,
    ),
  );
document
  .getElementById('registerBtn')
  ?.addEventListener('click', () =>
    register(
      document.getElementById('registerEmail').value,
      document.getElementById('registerPassword').value,
      document.getElementById('registerConfirmPassword').value,
    ),
  );
document.getElementById('logoutBtn')?.addEventListener('click', logout);
document
  .getElementById('darkModeToggle')
  ?.addEventListener('click', toggleDarkMode);
document.getElementById('scanQrBtn')?.addEventListener('click', openQrScanner);
document
  .getElementById('manualQrSubmit')
  ?.addEventListener('click', manualQrLookup);
document
  .getElementById('cancelScanBtn')
  ?.addEventListener('click', closeQrScanner);
document
  .getElementById('reportBtn')
  ?.addEventListener('click', showOrderReport);
document
  .getElementById('addPartBtn')
  ?.addEventListener('click', () => showModal('addPartModal'));
document.getElementById('quickLogBtn')?.addEventListener('click', () => {
  if (!parts.length) {
    showToast('No parts in inventory', true);
    return;
  }
  selectedPartId = null;
  document.getElementById('partSearchInput').value = '';
  document.getElementById('selectedPartDisplay').classList.remove('show');
  document.getElementById('selectedPartDisplay').innerHTML = '';
  document.getElementById('partListDropdown').innerHTML = '';
  document.getElementById('usageQty').value = 1;
  document.getElementById('usageNote').value = '';
  updatePartDropdown('');
  showModal('usageModal');
});
document
  .getElementById('decrementQtyBtn')
  ?.addEventListener('click', () => adjustQty(-1));
document
  .getElementById('incrementQtyBtn')
  ?.addEventListener('click', () => adjustQty(1));
document.getElementById('saveEditBtn')?.addEventListener('click', saveEditPart);
document
  .getElementById('cancelEditBtn')
  ?.addEventListener('click', () => hideModal('editModal'));
document.getElementById('deleteFromEditBtn')?.addEventListener('click', () => {
  if (currentEditPartId) {
    hideModal('editModal');
    showConfirmDeletePart(currentEditPartId);
  }
});
document.getElementById('saveAddBtn')?.addEventListener('click', addNewPart);
document
  .getElementById('cancelAddBtn')
  ?.addEventListener('click', () => hideModal('addPartModal'));
document.getElementById('confirmUsageBtn')?.addEventListener('click', () => {
  if (!selectedPartId) {
    showToast('Select a part', true);
    return;
  }
  if (
    logUsage(
      selectedPartId,
      parseInt(document.getElementById('usageQty').value),
      document.getElementById('usageNote').value,
    )
  ) {
    hideModal('usageModal');
    selectedPartId = null;
    document.getElementById('partSearchInput').value = '';
    document.getElementById('selectedPartDisplay').classList.remove('show');
    document.getElementById('selectedPartDisplay').innerHTML = '';
    document.getElementById('partListDropdown').innerHTML = '';
  }
});
document.getElementById('confirmProceedBtn')?.addEventListener('click', () => {
  if (pendingPhotoDeletePartId !== null) executePhotoDelete();
  else executeDelete();
});
document
  .getElementById('confirmCancelBtn')
  ?.addEventListener('click', cancelDelete);
document
  .getElementById('createOrderBtn')
  ?.addEventListener('click', copyOrderAndRedirect);
document
  .getElementById('detailsEditBtn')
  ?.addEventListener('click', editFromDetails);
document
  .getElementById('detailsLogBtn')
  ?.addEventListener('click', logFromDetails);
document
  .getElementById('partSearchInput')
  ?.addEventListener('input', (e) => updatePartDropdown(e.target.value));
document
  .getElementById('saveEditLogBtn')
  ?.addEventListener('click', saveEditLog);
document
  .getElementById('cancelEditLogBtn')
  ?.addEventListener('click', () => hideModal('editLogModal'));
document.getElementById('deleteLogBtn')?.addEventListener('click', () => {
  if (currentEditLogId) {
    hideModal('editLogModal');
    showConfirmDeleteLog(currentEditLogId);
  }
});
document
  .getElementById('capturePhotoBtn')
  ?.addEventListener('click', capturePhoto);
document
  .getElementById('cancelCameraBtn')
  ?.addEventListener('click', closeCamera);
document
  .getElementById('adminPanelBtn')
  ?.addEventListener('click', openAdminPanel);
document
  .getElementById('closeAdminPanelBtn')
  ?.addEventListener('click', () => hideModal('adminPanelModal'));
document
  .getElementById('adminUserSearch')
  ?.addEventListener('input', () => renderAdminPanel());
document
  .getElementById('savePermissionsBtn')
  ?.addEventListener('click', saveUserPermissions);
document
  .getElementById('cancelPermissionsBtn')
  ?.addEventListener('click', () => hideModal('userPermissionsModal'));
document
  .getElementById('logDetailsCloseBtn')
  ?.addEventListener('click', () => hideModal('logDetailsModal'));
document
  .getElementById('refreshDashboardBtn')
  ?.addEventListener('click', () => {
    loadDashboardData();
    showToast('Dashboard refreshed', false);
  });
document.getElementById('excelUpload')?.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = (ev) => {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        defval: '',
      });
      if (rows) importExcel(rows);
      e.target.value = '';
    };
    r.readAsArrayBuffer(f);
  }
});
document.getElementById('allSearchInput')?.addEventListener('input', (e) => {
  allState.search = e.target.value.toLowerCase();
  allState.page = 1;
  renderAllParts();
});
document.getElementById('allRowsPerPage')?.addEventListener('change', (e) => {
  allState.rows = parseInt(e.target.value);
  allState.page = 1;
  renderAllParts();
});
document.getElementById('needSearchInput')?.addEventListener('input', (e) => {
  needState.search = e.target.value.toLowerCase();
  renderNeedOrder();
});
document
  .getElementById('criticalSearchInput')
  ?.addEventListener('input', (e) => {
    criticalState.search = e.target.value.toLowerCase();
    renderCritical();
  });
document.getElementById('logsSearchInput')?.addEventListener('input', (e) => {
  logsSearch = e.target.value.toLowerCase();
  renderLogs();
});
document
  .querySelectorAll('#tab-all .sortable')
  .forEach((h) =>
    h.addEventListener('click', () => handleSort(h.getAttribute('data-sort'))),
  );
document.getElementById('mobileAddPartBtn')?.addEventListener('click', () => {
  if (windowCurrentPermissions.canAddParts || isAdmin)
    showModal('addPartModal');
  else showToast('You do not have permission to add parts', true);
});
document.getElementById('mobileLogUsageBtn')?.addEventListener('click', () => {
  if (!(windowCurrentPermissions.canLogUsage || isAdmin)) {
    showToast('You do not have permission to log usage', true);
    return;
  }
  if (!parts.length) {
    showToast('No parts in inventory', true);
    return;
  }
  selectedPartId = null;
  document.getElementById('partSearchInput').value = '';
  document.getElementById('selectedPartDisplay').classList.remove('show');
  document.getElementById('selectedPartDisplay').innerHTML = '';
  document.getElementById('partListDropdown').innerHTML = '';
  document.getElementById('usageQty').value = 1;
  document.getElementById('usageNote').value = '';
  updatePartDropdown('');
  showModal('usageModal');
});
document
  .getElementById('mobileScanBtn')
  ?.addEventListener('click', openQrScanner);
document
  .getElementById('mobileReportBtn')
  ?.addEventListener('click', showOrderReport);
document.getElementById('mobileImportBtn')?.addEventListener('click', () => {
  if (isAdmin) document.getElementById('excelUpload').click();
  else showToast('Only admins can import Excel files', true);
});
document.querySelectorAll('.close-modal').forEach((btn) =>
  btn.addEventListener('click', (e) => {
    const id = btn.getAttribute('data-modal');
    if (id === 'qrScannerModal') closeQrScanner();
    else if (id === 'cameraModal') closeCamera();
    else hideModal(id);
  }),
);
window.onclick = (e) => {
  if (e.target.classList.contains('modal')) {
    const id = e.target.id;
    if (id === 'qrScannerModal') closeQrScanner();
    else if (id === 'cameraModal') closeCamera();
    else hideModal(id);
  }
};
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('partListDropdown');
  const input = document.getElementById('partSearchInput');
  if (
    dropdown &&
    input &&
    !input.contains(e.target) &&
    !dropdown.contains(e.target)
  )
    dropdown.style.display = 'none';
});

// =============================================
// START APPLICATION
// =============================================
initMobileMenu();
initUsageQuantityControls();
window.changeAllPage = changeAllPage;
window.showPartDetails = showPartDetails;
window.showLogDetails = showLogDetails;
window.switchToTab = switchToTab;
window.openUserPermissions = window.openUserPermissions;
initDarkMode();
checkSession();
restoreActiveTab();
