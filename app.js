// app.js - Inventory Manager Pro v17.1.0 with Dashboard

// Get Supabase client from window
const supabaseClient = window.supabaseClient;

// Global variables
let parts = [];
let usageLogs = [];
let currentUser = null;
let isAdmin = false;
let currentEditingUser = null;
let windowCurrentPermissions = {
  canEditParts: false,
  canDeleteParts: false,
  canEditLogs: false,
  canDeleteLogs: false,
  canAddParts: false,
  canLogUsage: false,
};

// UI State
let allState = { page: 1, rows: 50, search: '' };
let needState = { page: 1, search: '' };
let criticalState = { page: 1, search: '' };
let logsSearch = '';
let currentEditPartId = null;
let currentEditLogId = null;
let selectedPartId = null;
let currentDetailsPartId = null;
let pendingDeletePartId = null;
let pendingDeleteLogId = null;
let pendingPhotoDeletePartId = null;
let html5QrCode = null;
let isScannerActive = false;

// Sorting state
let allSortField = 'part_number';
let allSortDirection = 'asc';

// Tab persistence
const STORAGE_KEY = 'inventoryManager_activeTab';

// Chart variable
let usageChart = null;

// Camera variables
let cameraStream = null;
let pendingPhotoPartId = null;
let reopenEditAfterPhoto = false;

// ========== AUTHENTICATION FUNCTIONS ==========

async function checkSession() {
  const loadingScreen = document.getElementById('loadingScreen');
  const authContainer = document.getElementById('authContainer');
  const appContainer = document.getElementById('appContainer');

  if (authContainer) authContainer.style.display = 'none';
  if (appContainer) appContainer.style.display = 'none';
  if (loadingScreen) loadingScreen.style.display = 'flex';

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (session) {
    currentUser = session.user;
    await checkAdminStatus();
    await updateUIByPermissions();
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    await loadAllData();
  } else {
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (authContainer) authContainer.style.display = 'flex';
  }
}

async function login(email, password) {
  showAuthMessage('', '');
  setAuthLoading(true);

  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'flex';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  setAuthLoading(false);

  if (error) {
    if (loadingScreen) loadingScreen.style.display = 'none';
    showAuthMessage(error.message, 'error');
    return false;
  }

  currentUser = data.user;
  await checkAdminStatus();
  await updateUIByPermissions();

  if (loadingScreen) loadingScreen.style.display = 'none';
  const authContainer = document.getElementById('authContainer');
  const appContainer = document.getElementById('appContainer');
  if (authContainer) authContainer.style.display = 'none';
  if (appContainer) appContainer.style.display = 'block';

  await loadAllData();
  return true;
}

async function register(email, password, confirmPassword) {
  showAuthMessage('', '');

  if (password !== confirmPassword) {
    showAuthMessage('Passwords do not match', 'error');
    return false;
  }

  if (password.length < 6) {
    showAuthMessage('Password must be at least 6 characters', 'error');
    return false;
  }

  setAuthLoading(true);

  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'flex';

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
  });

  setAuthLoading(false);

  if (error) {
    if (loadingScreen) loadingScreen.style.display = 'none';
    showAuthMessage(error.message, 'error');
    return false;
  }

  if (loadingScreen) loadingScreen.style.display = 'none';
  showAuthMessage('Account created! Please login.', 'success');
  switchToLogin();
  return true;
}

async function logout() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'flex';

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast(error.message, true);
    if (loadingScreen) loadingScreen.style.display = 'none';
  } else {
    currentUser = null;
    isAdmin = false;
    parts = [];
    usageLogs = [];
    if (loadingScreen) loadingScreen.style.display = 'none';
    showAuth();
  }
}

function showAuth() {
  document.getElementById('authContainer').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

function showApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
}

function showAuthMessage(message, type) {
  const msgDiv = document.getElementById('authMessage');
  msgDiv.textContent = message;
  msgDiv.className = 'auth-message ' + type;
  if (message) {
    msgDiv.style.display = 'block';
  } else {
    msgDiv.style.display = 'none';
  }
}

function setAuthLoading(isLoading) {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');

  if (isLoading) {
    if (loginBtn) loginBtn.classList.add('btn-loading');
    if (registerBtn) registerBtn.classList.add('btn-loading');
  } else {
    if (loginBtn) loginBtn.classList.remove('btn-loading');
    if (registerBtn) registerBtn.classList.remove('btn-loading');
  }
}

function switchToLogin() {
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('registerForm').classList.remove('active');
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  showAuthMessage('', '');
}

function switchToRegister() {
  document.getElementById('registerForm').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
  document.getElementById('registerTab').classList.add('active');
  document.getElementById('loginTab').classList.remove('active');
  document.getElementById('registerEmail').value = '';
  document.getElementById('registerPassword').value = '';
  document.getElementById('registerConfirmPassword').value = '';
  showAuthMessage('', '');
}

// ========== TAB PERSISTENCE FUNCTIONS ==========

function saveActiveTab(tabId) {
  localStorage.setItem(STORAGE_KEY, tabId);
}

function loadActiveTab() {
  return localStorage.getItem(STORAGE_KEY);
}

function activateTab(tabId) {
  const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
  const desktopTabBtns = document.querySelectorAll('.tab-btn');

  desktopTabBtns.forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  mobileTabBtns.forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach((tc) => {
    tc.classList.remove('active');
  });
  document.getElementById('tab-' + tabId).classList.add('active');

  // If dashboard is activated, load dashboard data
  if (tabId === 'dashboard') {
    loadDashboardData();
  }
}

function restoreActiveTab() {
  const savedTab = loadActiveTab();
  if (
    savedTab &&
    ['dashboard', 'all', 'needorder', 'critical', 'logs'].includes(savedTab)
  ) {
    activateTab(savedTab);
  } else {
    activateTab('dashboard');
  }
}

// ========== DASHBOARD FUNCTIONS ==========

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
  const totalParts = parts.length;
  const lowStockCount = parts.filter(
    (p) => p.current_qty < p.baseline_qty,
  ).length;
  const criticalCount = parts.filter(
    (p) => p.current_qty < p.baseline_qty * 0.5,
  ).length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLogs = usageLogs.filter(
    (l) => new Date(l.created_at) >= thirtyDaysAgo,
  );
  const logsCount = recentLogs.length;

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const partsAddedThisMonth = parts.filter(
    (p) => new Date(p.created_at) >= oneMonthAgo,
  ).length;

  document.getElementById('kpiTotalParts').innerText = totalParts;
  document.getElementById('kpiLowStock').innerText = lowStockCount;
  document.getElementById('kpiCritical').innerText = criticalCount;
  document.getElementById('kpiLogsCount').innerText = logsCount;

  document.getElementById('kpiPartsTrend').innerHTML =
    partsAddedThisMonth > 0
      ? `▲ +${partsAddedThisMonth} this month`
      : 'No new parts';
}

async function updateUsageTrendsChart() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const last30Days = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    last30Days.push({ date: dateStr, count: 0 });
  }

  usageLogs.forEach((log) => {
    const logDate = new Date(log.created_at);
    if (logDate >= thirtyDaysAgo) {
      const dateStr = logDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const dayData = last30Days.find((d) => d.date === dateStr);
      if (dayData) {
        dayData.count += log.qty_used;
      }
    }
  });

  const chartLabels = last30Days.map((d) => d.date);
  const chartData = last30Days.map((d) => d.count);

  const ctx = document.getElementById('usageTrendsChart').getContext('2d');

  if (usageChart) {
    usageChart.destroy();
  }

  usageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Parts Used',
          data: chartData,
          borderColor: '#2d6a4f',
          backgroundColor: 'rgba(45, 106, 79, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointBackgroundColor: '#2d6a4f',
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.raw} units used`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Units Used',
            font: { size: 11 },
          },
          ticks: {
            stepSize: 1,
          },
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10,
          },
        },
      },
    },
  });
}

async function updateTopUsedParts() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usageCount = {};
  usageLogs.forEach((log) => {
    const logDate = new Date(log.created_at);
    if (logDate >= thirtyDaysAgo) {
      if (!usageCount[log.part_number]) {
        usageCount[log.part_number] = {
          count: 0,
          description: log.part_number,
        };
      }
      usageCount[log.part_number].count += log.qty_used;
      const part = parts.find((p) => p.part_number === log.part_number);
      if (part) {
        usageCount[log.part_number].description =
          part.description || log.part_number;
      }
    }
  });

  const sortedParts = Object.entries(usageCount)
    .map(([part_number, data]) => ({ part_number, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const container = document.getElementById('topPartsList');
  if (sortedParts.length === 0) {
    container.innerHTML =
      '<div class="loading-placeholder">No usage data in the last 30 days</div>';
    return;
  }

  const maxCount = sortedParts[0]?.count || 1;

  let html = '';
  sortedParts.forEach((part, index) => {
    const percentage = (part.count / maxCount) * 100;
    html += `
            <div class="top-part-item">
                <div class="top-part-rank">${index + 1}</div>
                <div class="top-part-info">
                    <div class="top-part-name">${escapeHtml(part.part_number)}</div>
                    <div class="top-part-desc">${escapeHtml(part.description.substring(0, 40))}</div>
                </div>
                <div class="top-part-bar-container">
                    <div class="top-part-bar">
                        <div class="top-part-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="top-part-qty">${part.count} used</div>
                </div>
            </div>
        `;
  });
  container.innerHTML = html;
}

async function updateLowStockAlerts() {
  const lowStockParts = parts
    .filter((p) => p.current_qty < p.baseline_qty)
    .sort((a, b) => {
      const aPercent = a.current_qty / a.baseline_qty;
      const bPercent = b.current_qty / b.baseline_qty;
      return aPercent - bPercent;
    })
    .slice(0, 5);

  const container = document.getElementById('lowStockList');
  if (lowStockParts.length === 0) {
    container.innerHTML =
      '<div class="loading-placeholder">No low stock items! 🎉</div>';
    return;
  }

  let html = '';
  lowStockParts.forEach((part) => {
    const isCritical = part.current_qty < part.baseline_qty * 0.5;
    const shortage = part.baseline_qty - part.current_qty;

    html += `
            <div class="low-stock-item ${isCritical ? 'critical' : 'warning'}" onclick="showPartDetails(${part.id})">
                <div class="low-stock-info">
                    <div class="low-stock-number"><strong>${escapeHtml(part.part_number)}</strong></div>
                    <div class="low-stock-desc">${escapeHtml(part.description || '')}</div>
                </div>
                <div class="low-stock-stats">
                    <div class="low-stock-current">
                        <div class="label">Current</div>
                        <div class="value">${part.current_qty}</div>
                    </div>
                    <div class="low-stock-baseline">
                        <div class="label">Baseline</div>
                        <div class="value">${part.baseline_qty}</div>
                    </div>
                    <div class="low-stock-shortage ${isCritical ? 'critical' : 'warning'}">
                        Need ${shortage} more
                    </div>
                </div>
            </div>
        `;
  });
  container.innerHTML = html;
}

async function updateRecentActivity() {
  const recentLogs = usageLogs.slice(0, 10);
  const container = document.getElementById('recentActivityList');

  if (recentLogs.length === 0) {
    container.innerHTML =
      '<div class="loading-placeholder">No recent activity</div>';
    return;
  }

  let html = '';
  recentLogs.forEach((log) => {
    const date = new Date(log.created_at);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeAgo;
    if (diffMins < 1) timeAgo = 'Just now';
    else if (diffMins < 60) timeAgo = `${diffMins} min ago`;
    else if (diffHours < 24)
      timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    else timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    html += `
            <div class="activity-item" onclick="showLogDetails(${log.id})">
                <div class="activity-icon usage">
                    <i class="fas fa-minus"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-text">
                        <strong>${escapeHtml(log.qty_used)} x ${escapeHtml(log.part_number)}</strong> used
                        ${log.note ? `<span class="activity-note"> - ${escapeHtml(log.note)}</span>` : ''}
                    </div>
                    <div class="activity-time">${timeAgo} by ${escapeHtml(log.created_by_email || 'Unknown')}</div>
                </div>
            </div>
        `;
  });
  container.innerHTML = html;
}

function switchToTab(tabId) {
  const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
  const desktopTabBtns = document.querySelectorAll('.tab-btn');

  desktopTabBtns.forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  mobileTabBtns.forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach((tc) => {
    tc.classList.remove('active');
  });
  document.getElementById('tab-' + tabId).classList.add('active');

  saveActiveTab(tabId);

  if (tabId === 'dashboard') {
    loadDashboardData();
  }
}

// ========== ADMIN FUNCTIONS ==========

async function checkAdminStatus() {
  if (!currentUser) return false;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    console.error('Error checking admin status:', error);
    return false;
  }

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
  if (adminBtn) {
    adminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  return isAdmin;
}

async function loadAllUsers(searchTerm = '') {
  if (!isAdmin) return [];

  let query = supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (searchTerm) {
    query = query.ilike('email', `%${searchTerm}%`);
  }

  const { data, error } = await query;

  if (error) {
    showToast('Error loading users: ' + error.message, true);
    return [];
  }

  return data || [];
}

async function getUserPermissions(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    showToast('Error loading user permissions: ' + error.message, true);
    return null;
  }

  return data;
}

async function updateUserPermissions(userId, permissions) {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return false;
  }

  const { error } = await supabaseClient
    .from('profiles')
    .update({
      can_add_parts: permissions.can_add_parts,
      can_edit_parts: permissions.can_edit_parts,
      can_delete_parts: permissions.can_delete_parts,
      can_log_usage: permissions.can_log_usage,
      can_edit_logs: permissions.can_edit_logs,
      can_delete_logs: permissions.can_delete_logs,
      is_admin: permissions.is_admin,
      updated_at: new Date(),
    })
    .eq('id', userId);

  if (error) {
    showToast('Error updating permissions: ' + error.message, true);
    return false;
  }

  showToast('Permissions updated successfully');
  return true;
}

async function renderAdminPanel() {
  const userListDiv = document.getElementById('adminUserList');
  if (!userListDiv) return;

  const searchTerm = document.getElementById('adminUserSearch')?.value || '';
  const users = await loadAllUsers(searchTerm);
  const adminCount = users.filter((u) => u.is_admin).length;

  document.getElementById('totalUsersCount').innerText = users.length;
  document.getElementById('adminCount').innerText = adminCount;

  if (users.length === 0) {
    userListDiv.innerHTML =
      '<div style="text-align:center; padding:20px; color:#94a3b8;">No users found</div>';
    return;
  }

  let html = '';
  for (const user of users) {
    const isCurrentUser = user.id === currentUser?.id;
    html += `
            <div class="admin-user-item" data-user-id="${user.id}" data-user-email="${escapeHtml(user.email)}">
                <div class="admin-user-info">
                    <div class="admin-user-email">${escapeHtml(user.email)}</div>
                    <div>
                        <span class="admin-user-badge ${user.is_admin ? 'badge-admin' : 'badge-user'}">
                            ${user.is_admin ? '👑 Admin' : '👤 User'}
                        </span>
                        ${isCurrentUser ? ' <span style="font-size:0.7rem; color:#94a3b8;">(You)</span>' : ''}
                    </div>
                </div>
                <div class="admin-user-actions">
                    <button class="admin-action-btn" onclick="openUserPermissions('${user.id}')">
                        <i class="fas fa-sliders-h"></i> Permissions
                    </button>
                </div>
            </div>
        `;
  }
  userListDiv.innerHTML = html;
}

window.openUserPermissions = async function (userId) {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return;
  }

  currentEditingUser = await getUserPermissions(userId);
  if (!currentEditingUser) return;

  document.getElementById('userPermissionsHeader').innerHTML = `
        <h4>${escapeHtml(currentEditingUser.email)}</h4>
        <p>${currentEditingUser.is_admin ? 'Administrator - Full Access' : 'Standard User'}</p>
    `;

  document.getElementById('permAddParts').checked =
    currentEditingUser.can_add_parts || currentEditingUser.is_admin;
  document.getElementById('permEditParts').checked =
    currentEditingUser.can_edit_parts || currentEditingUser.is_admin;
  document.getElementById('permDeleteParts').checked =
    currentEditingUser.can_delete_parts || currentEditingUser.is_admin;
  document.getElementById('permLogUsage').checked =
    currentEditingUser.can_log_usage || currentEditingUser.is_admin;
  document.getElementById('permEditLogs').checked =
    currentEditingUser.can_edit_logs || currentEditingUser.is_admin;
  document.getElementById('permDeleteLogs').checked =
    currentEditingUser.can_delete_logs || currentEditingUser.is_admin;
  document.getElementById('permIsAdmin').checked = currentEditingUser.is_admin;

  const isEditingAdmin = currentEditingUser.is_admin;
  const isCurrentUser = currentEditingUser.id === currentUser?.id;

  const toggles = [
    'permAddParts',
    'permEditParts',
    'permDeleteParts',
    'permLogUsage',
    'permEditLogs',
    'permDeleteLogs',
    'permIsAdmin',
  ];
  toggles.forEach((toggleId) => {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.disabled =
        isEditingAdmin || (toggleId === 'permIsAdmin' && isCurrentUser);
      const parent = toggle.closest('.permission-item');
      if (parent) {
        parent.style.opacity =
          isEditingAdmin || (toggleId === 'permIsAdmin' && isCurrentUser)
            ? '0.5'
            : '1';
      }
    }
  });

  showModal('userPermissionsModal');
};

async function saveUserPermissions() {
  if (!currentEditingUser) return;

  if (currentEditingUser.id === currentUser?.id) {
    const newAdminStatus = document.getElementById('permIsAdmin').checked;
    if (!newAdminStatus && currentEditingUser.is_admin) {
      showToast('You cannot remove your own admin status!', true);
      return;
    }
  }

  const permissions = {
    can_add_parts: document.getElementById('permAddParts').checked,
    can_edit_parts: document.getElementById('permEditParts').checked,
    can_delete_parts: document.getElementById('permDeleteParts').checked,
    can_log_usage: document.getElementById('permLogUsage').checked,
    can_edit_logs: document.getElementById('permEditLogs').checked,
    can_delete_logs: document.getElementById('permDeleteLogs').checked,
    is_admin: document.getElementById('permIsAdmin').checked,
  };

  await updateUserPermissions(currentEditingUser.id, permissions);
  hideModal('userPermissionsModal');
  await renderAdminPanel();

  if (currentEditingUser.id === currentUser?.id) {
    await checkAdminStatus();
    await updateUIByPermissions();
  }
}

async function openAdminPanel() {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return;
  }
  await renderAdminPanel();
  showModal('adminPanelModal');
}

async function userHasPermission(permission) {
  if (!currentUser) return false;
  if (isAdmin) return true;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select(permission)
    .eq('id', currentUser.id)
    .single();

  if (error) return false;
  return data?.[permission] || false;
}

async function updateUIByPermissions() {
  if (!currentUser) return;

  const canAddParts = await userHasPermission('can_add_parts');
  const canLogUsage = await userHasPermission('can_log_usage');

  const addPartBtn = document.getElementById('addPartBtn');
  const quickLogBtn = document.getElementById('quickLogBtn');
  const importLabel = document.querySelector('.file-label');

  if (addPartBtn)
    addPartBtn.style.display = canAddParts ? 'inline-flex' : 'none';
  if (quickLogBtn)
    quickLogBtn.style.display = canLogUsage ? 'inline-flex' : 'none';
  if (importLabel) importLabel.style.display = isAdmin ? 'inline-flex' : 'none';

  windowCurrentPermissions = {
    canEditParts: await userHasPermission('can_edit_parts'),
    canDeleteParts: await userHasPermission('can_delete_parts'),
    canEditLogs: await userHasPermission('can_edit_logs'),
    canDeleteLogs: await userHasPermission('can_delete_logs'),
    canAddParts: canAddParts,
    canLogUsage: canLogUsage,
  };
}

// ========== DATABASE FUNCTIONS ==========

async function loadAllData() {
  await loadParts();
  await loadUsageLogs();
  refreshAll();
  if (document.getElementById('tab-dashboard').classList.contains('active')) {
    loadDashboardData();
  }
}

async function loadParts() {
  showSyncIndicator('Loading parts...');

  const { data, error } = await supabaseClient
    .from('parts')
    .select('*')
    .order('part_number');

  hideSyncIndicator();

  if (error) {
    showToast('Error loading parts: ' + error.message, true);
    return;
  }

  parts = data || [];
  showToast(`Loaded ${parts.length} parts`, false);
}

async function loadUsageLogs() {
  const { data, error } = await supabaseClient
    .from('usage_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Error loading logs: ' + error.message, true);
    return;
  }

  usageLogs = data || [];
}

async function savePart(part) {
  showSyncIndicator('Saving part...');

  const { data, error } = await supabaseClient
    .from('parts')
    .insert([part])
    .select();

  hideSyncIndicator();

  if (error) {
    showToast('Error saving part: ' + error.message, true);
    return null;
  }

  return data[0];
}

async function updatePart(id, updates) {
  showSyncIndicator('Updating part...');

  const { data, error } = await supabaseClient
    .from('parts')
    .update(updates)
    .eq('id', id)
    .select();

  hideSyncIndicator();

  if (error) {
    showToast('Error updating part: ' + error.message, true);
    return null;
  }

  return data[0];
}

async function deletePart(id) {
  showSyncIndicator('Deleting part...');

  const { error } = await supabaseClient.from('parts').delete().eq('id', id);

  hideSyncIndicator();

  if (error) {
    showToast('Error deleting part: ' + error.message, true);
    return false;
  }

  return true;
}

async function saveUsageLog(log) {
  const userEmail = currentUser?.email || 'Unknown User';

  const logWithUser = {
    ...log,
    created_by_email: userEmail,
  };

  const { data, error } = await supabaseClient
    .from('usage_logs')
    .insert([logWithUser])
    .select();

  if (error) {
    showToast('Error saving log: ' + error.message, true);
    return null;
  }

  return data[0];
}

async function updateUsageLog(id, updates) {
  const { data, error } = await supabaseClient
    .from('usage_logs')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    showToast('Error updating log: ' + error.message, true);
    return null;
  }

  return data[0];
}

async function deleteUsageLog(id) {
  const { error } = await supabaseClient
    .from('usage_logs')
    .delete()
    .eq('id', id);

  if (error) {
    showToast('Error deleting log: ' + error.message, true);
    return false;
  }

  return true;
}

async function uploadPhoto(partId, photoDataUrl) {
  const response = await fetch(photoDataUrl);
  const blob = await response.blob();

  const fileName = `part-${partId}-${Date.now()}.jpg`;

  const { data, error } = await supabaseClient.storage
    .from('part-photos')
    .upload(fileName, blob);

  if (error) {
    showToast('Error uploading photo: ' + error.message, true);
    return null;
  }

  const { data: urlData } = supabaseClient.storage
    .from('part-photos')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function deletePhoto(photoUrl) {
  if (!photoUrl) return true;

  const fileName = photoUrl.split('/').pop();

  const { error } = await supabaseClient.storage
    .from('part-photos')
    .remove([fileName]);

  if (error) {
    console.error('Error deleting photo:', error);
  }
}

// ========== UI HELPER FUNCTIONS ==========

function showToast(msg, isErr) {
  let t = document.createElement('div');
  t.className = 'success-toast';
  if (isErr) t.style.background = '#e76f51';
  t.innerHTML =
    '<i class="fas ' +
    (isErr ? 'fa-exclamation-triangle' : 'fa-check-circle') +
    '"></i> ' +
    msg;
  document.body.appendChild(t);
  setTimeout(function () {
    if (t) t.remove();
  }, 2500);
}

function showSyncIndicator(message) {
  let existing = document.querySelector('.sync-indicator');
  if (existing) existing.remove();

  let indicator = document.createElement('div');
  indicator.className = 'sync-indicator';
  indicator.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' + message;
  document.body.appendChild(indicator);
}

function hideSyncIndicator() {
  setTimeout(() => {
    let indicator = document.querySelector('.sync-indicator');
    if (indicator) indicator.remove();
  }, 500);
}

function hideModal(id) {
  let el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showModal(id) {
  let el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, function (m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== CAMERA FUNCTIONS ==========

async function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(function (track) {
      track.stop();
    });
    cameraStream = null;
  }
  let video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
}

async function startCamera() {
  await stopCamera();
  let video = document.getElementById('camera-video');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = cameraStream;
  } catch (err) {
    showToast('Camera error: ' + err.message, true);
  }
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
  let video = document.getElementById('camera-video');
  let canvas = document.getElementById('camera-canvas');
  let context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  let photoData = canvas.toDataURL('image/jpeg', 0.8);

  if (pendingPhotoPartId) {
    showSyncIndicator('Uploading photo...');
    let photoUrl = await uploadPhoto(pendingPhotoPartId, photoData);
    hideSyncIndicator();

    if (photoUrl) {
      let part = parts.find(function (p) {
        return p.id === pendingPhotoPartId;
      });
      if (part) {
        await updatePart(pendingPhotoPartId, { photo_url: photoUrl });
        part.photo_url = photoUrl;
        showToast('✓ Photo captured and saved');
      }
    }
  }
  closeCamera();
}

// ========== PHOTO DISPLAY FUNCTIONS ==========

function displayPartPhotoInDetails(part) {
  let photoDisplay = document.getElementById('photoDisplay');
  if (part.photo_url) {
    photoDisplay.innerHTML =
      '<img src="' + part.photo_url + '" class="part-photo" alt="Part photo">';
  } else {
    photoDisplay.innerHTML =
      '<div class="part-photo-placeholder"><i class="fas fa-camera fa-2x"></i><span>No photo</span></div>';
  }
}

function displayPartPhotoInEdit(part) {
  let photoDisplay = document.getElementById('editPhotoDisplay');
  let removeBtn = document.getElementById('editRemovePhotoBtn');
  if (part.photo_url) {
    photoDisplay.innerHTML =
      '<img src="' + part.photo_url + '" class="part-photo" alt="Part photo">';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    photoDisplay.innerHTML =
      '<div class="part-photo-placeholder"><i class="fas fa-camera fa-2x"></i><span>No photo</span></div>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function handleRemovePhotoInEdit(partId) {
  pendingPhotoDeletePartId = partId;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Remove Photo';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to remove this photo?';
  document.getElementById('confirmDetails').style.display = 'block';
  let part = parts.find(function (p) {
    return p.id === partId;
  });
  document.getElementById('confirmDetails').innerHTML =
    '<strong>Part:</strong> ' +
    escapeHtml(part.part_number) +
    '<br><strong>Description:</strong> ' +
    escapeHtml(part.description || '');
  showModal('confirmDeleteModal');
}

async function executePhotoDelete() {
  if (pendingPhotoDeletePartId) {
    let part = parts.find(function (p) {
      return p.id === pendingPhotoDeletePartId;
    });
    if (part && part.photo_url) {
      await deletePhoto(part.photo_url);
      await updatePart(pendingPhotoDeletePartId, { photo_url: null });
      part.photo_url = null;
      displayPartPhotoInEdit(part);
      showToast('✓ Photo removed');
    }
    pendingPhotoDeletePartId = null;
  }
  hideModal('confirmDeleteModal');
}

// ========== QR SCANNER FUNCTIONS ==========

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

async function startQrScanner() {
  if (!document.getElementById('qr-reader')) return;
  await stopQrScanner();
  let statusDiv = document.getElementById('qr-status');
  statusDiv.innerHTML =
    '<i class="fas fa-spinner fa-pulse"></i> Starting camera...';
  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      function (decodedText) {
        onQrCodeSuccess(decodedText);
      },
      function (err) {},
    );
    isScannerActive = true;
    statusDiv.innerHTML =
      '<i class="fas fa-camera"></i> Position QR code in frame';
  } catch (err) {
    statusDiv.innerHTML =
      '<i class="fas fa-exclamation-triangle"></i> Camera error';
  }
}

async function onQrCodeSuccess(text) {
  await stopQrScanner();
  hideModal('qrScannerModal');
  findPartByQrCode(text);
}

async function openQrScanner() {
  await stopQrScanner();
  document.getElementById('manualQrInput').value = '';
  document.getElementById('qr-status').innerHTML =
    '<i class="fas fa-camera"></i> Initializing...';
  showModal('qrScannerModal');
  setTimeout(function () {
    startQrScanner();
  }, 300);
}

async function closeQrScanner() {
  await stopQrScanner();
  hideModal('qrScannerModal');
}

function findPartByQrCode(val) {
  let found = parts.find(function (p) {
    return p.part_number.toLowerCase() === val.toLowerCase();
  });
  if (found) {
    showToast('✓ Found: ' + found.part_number);
    showPartDetails(found.id);
  } else {
    if (confirm('Part "' + val + '" not found. Create new?')) {
      document.getElementById('newPartNumber').value = val;
      document.getElementById('newDescription').value = '';
      document.getElementById('newLocation').value = '';
      document.getElementById('newQuantity').value = 0;
      showModal('addPartModal');
    } else {
      showToast('Part not found', true);
    }
  }
}

function manualQrLookup() {
  let val = document.getElementById('manualQrInput').value.trim();
  if (!val) {
    showToast('Enter part number', true);
    return;
  }
  closeQrScanner();
  findPartByQrCode(val);
}

// ========== CORE FUNCTIONS ==========

function showPartDetails(id) {
  let p = parts.find(function (x) {
    return x.id === id;
  });
  if (!p) return;
  currentDetailsPartId = id;
  let need = p.current_qty < p.baseline_qty;
  let crit = p.current_qty < p.baseline_qty * 0.5;
  let statusText = need ? (crit ? 'CRITICAL' : 'Order Needed') : 'OK';
  let statusClass = need
    ? crit
      ? 'status-critical'
      : 'status-warning'
    : 'status-ok';
  let percent = Math.round((p.current_qty / p.baseline_qty) * 100);
  let locHtml = p.location
    ? '<div class="details-row"><div class="details-label"><i class="fas fa-map-marker-alt"></i> Location</div><div class="details-value"><span class="location-badge">' +
      escapeHtml(p.location) +
      '</span></div></div>'
    : '<div class="details-row"><div class="details-label"><i class="fas fa-map-marker-alt"></i> Location</div><div class="details-value"><span style="color:#94a3b8;">Not specified</span></div></div>';
  let html =
    '<div class="details-row"><div class="details-label">Part Number</div><div class="details-value"><strong>' +
    escapeHtml(p.part_number) +
    '</strong></div></div>' +
    '<div class="details-row"><div class="details-label">Description</div><div class="details-value">' +
    escapeHtml(p.description || '') +
    '</div></div>' +
    locHtml +
    '<div class="details-row"><div class="details-label">Current Quantity</div><div class="details-value"><span class="current-qty-display">' +
    p.current_qty +
    '</span></div></div>' +
    '<div class="details-row"><div class="details-label">Baseline</div><div class="details-value">' +
    p.baseline_qty +
    '</div></div>' +
    '<div class="details-row"><div class="details-label">Stock Level</div><div class="details-value">' +
    percent +
    '% of baseline</div></div>' +
    '<div class="details-row"><div class="details-label">Status</div><div class="details-value"><span class="status-badge ' +
    statusClass +
    '">' +
    statusText +
    '</span></div></div>' +
    (need
      ? '<div class="details-row"><div class="details-label">Shortage</div><div class="details-value" style="color: #e76f51; font-weight: 600;">' +
        (p.baseline_qty - p.current_qty) +
        ' units needed</div></div>'
      : '');
  document.getElementById('partDetailsContent').innerHTML = html;
  displayPartPhotoInDetails(p);
  showModal('partDetailsModal');
}

function editFromDetails() {
  const canEdit = windowCurrentPermissions.canEditParts || isAdmin;
  if (!canEdit) {
    showToast('You do not have permission to edit parts', true);
    return;
  }

  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openEditPart(currentDetailsPartId);
  }
}

function logFromDetails() {
  const canLog = windowCurrentPermissions.canLogUsage || isAdmin;
  if (!canLog) {
    showToast('You do not have permission to log usage', true);
    return;
  }

  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openQuickLog(currentDetailsPartId);
  }
}

async function logUsage(partId, qty, note) {
  let part = parts.find(function (p) {
    return p.id === partId;
  });
  if (!part) return false;
  if (qty <= 0 || part.current_qty < qty) {
    showToast('Invalid quantity or insufficient stock', true);
    return false;
  }

  let prev = part.current_qty;
  let newQty = prev - qty;

  let updatedPart = await updatePart(partId, { current_qty: newQty });
  if (!updatedPart) return false;

  let log = {
    part_id: part.id,
    part_number: part.part_number,
    qty_used: qty,
    note: note || '',
    previous_stock: prev,
    new_stock: newQty,
  };

  let newLog = await saveUsageLog(log);
  if (newLog) {
    usageLogs.unshift(newLog);
  }

  part.current_qty = newQty;

  refreshAll();
  showToast(
    '✓ Used ' + qty + ' x ' + part.part_number + ', remaining: ' + newQty,
  );
  return true;
}

// ========== LOG DETAILS FUNCTION ==========

function showLogDetails(logId) {
  let log = usageLogs.find(function (l) {
    return l.id === logId;
  });
  if (!log) return;

  const canEdit = windowCurrentPermissions.canEditLogs || isAdmin;
  const canDelete = windowCurrentPermissions.canDeleteLogs || isAdmin;

  let html = `
        <div class="details-row">
            <div class="details-label">Part Number</div>
            <div class="details-value"><strong>${escapeHtml(log.part_number)}</strong></div>
        </div>
        <div class="details-row">
            <div class="details-label">Quantity Used</div>
            <div class="details-value"><span style="color:#e76f51; font-weight:600;">-${log.qty_used}</span></div>
        </div>
        <div class="details-row">
            <div class="details-label">Stock Change</div>
            <div class="details-value">${log.previous_stock} → ${log.new_stock}</div>
        </div>
        <div class="details-row">
            <div class="details-label">Date & Time</div>
            <div class="details-value">${escapeHtml(new Date(log.created_at).toLocaleString())}</div>
        </div>
        <div class="details-row">
            <div class="details-label">Created By</div>
            <div class="details-value"><i class="fas fa-user"></i> ${escapeHtml(log.created_by_email || 'Unknown User')}</div>
        </div>
        <div class="details-row">
            <div class="details-label">Note</div>
            <div class="details-value">${escapeHtml(log.note || '—')}</div>
        </div>
    `;

  document.getElementById('logDetailsContent').innerHTML = html;

  const editBtn = document.getElementById('logDetailsEditBtn');
  const deleteBtn = document.getElementById('logDetailsDeleteBtn');

  if (editBtn) {
    if (canEdit) {
      editBtn.style.display = 'inline-flex';
      editBtn.onclick = function () {
        hideModal('logDetailsModal');
        openEditLog(log.id);
      };
    } else {
      editBtn.style.display = 'none';
    }
  }

  if (deleteBtn) {
    if (canDelete) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = function () {
        hideModal('logDetailsModal');
        showConfirmDeleteLog(log.id);
      };
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  showModal('logDetailsModal');
}

// ========== RENDER FUNCTIONS ==========

function handleSort(field) {
  if (allSortField === field) {
    allSortDirection = allSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    allSortField = field;
    allSortDirection = 'asc';
  }
  allState.page = 1;
  renderAllParts();
}

function updateSortIcons() {
  const headers = document.querySelectorAll('#tab-all .sortable');
  headers.forEach((header) => {
    const field = header.getAttribute('data-sort');
    const icon = header.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');

      if (field === allSortField) {
        if (allSortDirection === 'asc') {
          icon.classList.add('fa-sort-up');
        } else {
          icon.classList.add('fa-sort-down');
        }
        header.classList.add(allSortDirection);
      } else {
        icon.classList.add('fa-sort');
        header.classList.remove('asc', 'desc');
      }
    }
  });
}

function renderAllParts() {
  let filtered = parts;
  if (allState.search && allState.search.length > 0) {
    filtered = parts.filter(function (p) {
      return (
        p.part_number.toLowerCase().indexOf(allState.search) !== -1 ||
        (p.description || '').toLowerCase().indexOf(allState.search) !== -1
      );
    });
  }

  filtered = [...filtered].sort(function (a, b) {
    let valA = a[allSortField];
    let valB = b[allSortField];

    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (allSortField === 'current_qty' || allSortField === 'baseline_qty') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return allSortDirection === 'asc' ? valA - valB : valB - valA;
    }

    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (allSortDirection === 'asc') {
      return valA.localeCompare(valB);
    } else {
      return valB.localeCompare(valA);
    }
  });

  let totalPages = Math.ceil(filtered.length / allState.rows) || 1;
  if (allState.page > totalPages) allState.page = 1;
  let pageItems = filtered.slice(
    (allState.page - 1) * allState.rows,
    allState.page * allState.rows,
  );
  let tbody = document.getElementById('allPartsBody');
  if (!tbody) return;
  if (pageItems.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:30px;">No parts found<\/td><\/tr>';
  } else {
    tbody.innerHTML = '';
    for (let i = 0; i < pageItems.length; i++) {
      let p = pageItems[i];
      let need = p.current_qty < p.baseline_qty;
      let crit = p.current_qty < p.baseline_qty * 0.5;
      let row = tbody.insertRow();
      if (need) row.className = crit ? 'stock-critical' : 'stock-low';
      row.insertCell(0).innerHTML =
        '<span class="clickable-part" onclick="showPartDetails(' +
        p.id +
        ')"><strong>' +
        escapeHtml(p.part_number) +
        '</strong></span>';
      row.insertCell(1).innerHTML = escapeHtml(p.description || '').substring(
        0,
        50,
      );
      row.insertCell(2).innerHTML =
        '<span class="current-qty-display">' + p.current_qty + '</span>';
      row.insertCell(3).innerHTML = p.baseline_qty;
      let statusHtml = need
        ? crit
          ? '<span class="status-badge status-critical">CRITICAL</span>'
          : '<span class="status-badge status-warning">Order needed</span>'
        : '<span class="status-badge status-ok">OK</span>';
      row.insertCell(4).innerHTML = statusHtml;
    }
  }
  let container = document.getElementById('allPagination');
  if (container) {
    container.innerHTML = renderPagination(
      allState.page,
      totalPages,
      'changeAllPage',
    );
  }
  document.getElementById('totalPartsStat').innerHTML = parts.length;
  document.getElementById('lowStockStat').innerHTML = parts.filter(
    function (p) {
      return p.current_qty < p.baseline_qty;
    },
  ).length;

  updateSortIcons();
}

function renderPagination(page, total, func) {
  if (total <= 1) return '';
  let html =
    '<button class="page-btn" onclick="' +
    func +
    '(' +
    Math.max(1, page - 1) +
    ')">◀</button>';
  for (let i = Math.max(1, page - 2); i <= Math.min(total, page + 2); i++) {
    html +=
      '<button class="page-btn ' +
      (i === page ? 'active' : '') +
      '" onclick="' +
      func +
      '(' +
      i +
      ')">' +
      i +
      '</button>';
  }
  html +=
    '<button class="page-btn" onclick="' +
    func +
    '(' +
    Math.min(total, page + 1) +
    ')">▶</button><span class="pagination-info">Page ' +
    page +
    ' of ' +
    total +
    '</span>';
  return html;
}

function changeAllPage(p) {
  allState.page = p;
  renderAllParts();
}

function renderNeedOrder() {
  let needParts = parts.filter(function (p) {
    return p.current_qty < p.baseline_qty;
  });
  if (needState.search && needState.search.length > 0) {
    let searchTerm = needState.search.toLowerCase();
    needParts = needParts.filter(function (p) {
      return (
        p.part_number.toLowerCase().indexOf(searchTerm) !== -1 ||
        (p.description || '').toLowerCase().indexOf(searchTerm) !== -1
      );
    });
  }
  let tbody = document.getElementById('needOrderBody');
  if (tbody) {
    if (needParts.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:30px;">No parts need ordering<\/td><\/tr>';
    } else {
      let html = '';
      for (let i = 0; i < needParts.length; i++) {
        let p = needParts[i];
        let shortage = p.baseline_qty - p.current_qty;
        html +=
          '<tr>' +
          '<td><span class="clickable-part" onclick="showPartDetails(' +
          p.id +
          ')"><strong>' +
          escapeHtml(p.part_number) +
          '</strong></span></td>' +
          '<td>' +
          escapeHtml(p.description || '').substring(0, 40) +
          '</td>' +
          '<td><span class="current-qty-display">' +
          p.current_qty +
          '</span></td>' +
          '<td>' +
          p.baseline_qty +
          '</td>' +
          '<td style="color:#e76f51;font-weight:600;">' +
          shortage +
          '<\/td>' +
          '<\/tr>';
      }
      tbody.innerHTML = html;
    }
  }
}

function renderCritical() {
  let criticalParts = parts.filter(function (p) {
    return p.current_qty < p.baseline_qty * 0.5;
  });
  if (criticalState.search && criticalState.search.length > 0) {
    let searchTerm = criticalState.search.toLowerCase();
    criticalParts = criticalParts.filter(function (p) {
      return (
        p.part_number.toLowerCase().indexOf(searchTerm) !== -1 ||
        (p.description || '').toLowerCase().indexOf(searchTerm) !== -1
      );
    });
  }
  let tbody = document.getElementById('criticalBody');
  if (tbody) {
    if (criticalParts.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:30px;">No critical parts<\/td><\/tr>';
    } else {
      let html = '';
      for (let i = 0; i < criticalParts.length; i++) {
        let p = criticalParts[i];
        let percent = Math.round((p.current_qty / p.baseline_qty) * 100);
        html +=
          '<tr class="stock-critical">' +
          '<td><span class="clickable-part" onclick="showPartDetails(' +
          p.id +
          ')"><strong>' +
          escapeHtml(p.part_number) +
          '</strong></span></td>' +
          '<td>' +
          escapeHtml(p.description || '').substring(0, 40) +
          '</td>' +
          '<td><span class="current-qty-display">' +
          p.current_qty +
          '</span></td>' +
          '<td>' +
          p.baseline_qty +
          '</td>' +
          '<td style="color:#c2410c;font-weight:600;">' +
          percent +
          '%<\/td>' +
          '<\/tr>';
      }
      tbody.innerHTML = html;
    }
  }
}

function renderLogs() {
  let filtered = usageLogs;
  if (logsSearch && logsSearch.length > 0) {
    filtered = usageLogs.filter(function (l) {
      return (
        l.part_number.toLowerCase().indexOf(logsSearch) !== -1 ||
        (l.note || '').toLowerCase().indexOf(logsSearch) !== -1
      );
    });
  }
  document.getElementById('logCount').innerHTML = '(' + filtered.length + ')';
  let container = document.getElementById('logsListContainer');
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML =
        '<div style="padding:60px;text-align:center;color:#94a3b8;">No usage records</div>';
    } else {
      let html = '';
      for (let i = 0; i < filtered.length; i++) {
        let l = filtered[i];
        html += `
                    <div class="log-entry clickable-log" data-log-id="${l.id}" onclick="showLogDetails(${l.id})">
                        <div><i class="far fa-calendar-alt"></i> ${escapeHtml(new Date(l.created_at).toLocaleString())}</div>
                        <div><strong>${escapeHtml(l.part_number)}</strong></div>
                        <div><span style="color:#e76f51; font-weight:600;">-${l.qty_used}</span></div>
                        <div>${l.previous_stock} → ${l.new_stock}</div>
                        <div><i class="fas fa-comment"></i> ${escapeHtml(l.note || '—')}</div>
                    </div>
                `;
      }
      container.innerHTML = html;
    }
  }
}

function refreshAll() {
  renderAllParts();
  renderNeedOrder();
  renderCritical();
  renderLogs();
}

// ========== EDIT FUNCTIONS ==========

window.openEditPart = function (id) {
  const canEdit = windowCurrentPermissions.canEditParts || isAdmin;
  if (!canEdit) {
    showToast('You do not have permission to edit parts', true);
    return;
  }

  let p = parts.find(function (x) {
    return x.id === id;
  });
  if (p) {
    currentEditPartId = id;
    document.getElementById('editPartNumber').value = p.part_number;
    document.getElementById('editDescription').value = p.description || '';
    document.getElementById('editLocation').value = p.location || '';
    document.getElementById('editCurrentQtyDisplay').innerText = p.current_qty;
    document.getElementById('editCurrentQty').value = p.current_qty;
    document.getElementById('editBaselineQty').value = p.baseline_qty;
    displayPartPhotoInEdit(p);

    let takePhotoBtn = document.getElementById('editTakePhotoBtn');
    let removePhotoBtn = document.getElementById('editRemovePhotoBtn');
    let newTakeBtn = takePhotoBtn.cloneNode(true);
    let newRemoveBtn = removePhotoBtn.cloneNode(true);
    takePhotoBtn.parentNode.replaceChild(newTakeBtn, takePhotoBtn);
    removePhotoBtn.parentNode.replaceChild(newRemoveBtn, removePhotoBtn);
    newTakeBtn.onclick = function () {
      openCameraForEdit(p.id);
    };
    newRemoveBtn.onclick = function () {
      handleRemovePhotoInEdit(p.id);
    };
    showModal('editModal');
  }
};

window.openQuickLog = function (id) {
  let p = parts.find(function (x) {
    return x.id === id;
  });
  if (p) {
    selectedPartId = id;
    document.getElementById('partSearchInput').value = p.part_number;
    let selectedDisplay = document.getElementById('selectedPartDisplay');
    selectedDisplay.innerHTML =
      '<i class="fas fa-check-circle"></i> Selected: <strong>' +
      escapeHtml(p.part_number) +
      '</strong> - Stock: ' +
      p.current_qty +
      ' units';
    selectedDisplay.classList.add('show');

    setTimeout(function () {
      if (selectedDisplay && selectedDisplay.classList) {
        selectedDisplay.classList.remove('show');
      }
    }, 3000);

    document.getElementById('usageQty').value = 1;
    document.getElementById('usageQty').max = p.current_qty;
    document.getElementById('usageNote').value = '';
    document.getElementById('partListDropdown').innerHTML = '';
    document.getElementById('partListDropdown').style.display = 'none';
    showModal('usageModal');
  }
};

window.openEditLog = function (id) {
  const canEdit = windowCurrentPermissions.canEditLogs || isAdmin;
  if (!canEdit) {
    showToast('You do not have permission to edit logs', true);
    return;
  }

  let log = usageLogs.find(function (l) {
    return l.id === id;
  });
  if (log) {
    currentEditLogId = id;
    document.getElementById('editLogPartNumber').value = log.part_number;
    document.getElementById('editLogQty').value = log.qty_used;
    document.getElementById('editLogDate').value = new Date(
      log.created_at,
    ).toLocaleString();
    document.getElementById('editLogNote').value = log.note || '';
    showModal('editLogModal');
  }
};

async function saveEditLog() {
  let log = usageLogs.find(function (l) {
    return l.id === currentEditLogId;
  });
  if (log) {
    let newQty = parseInt(document.getElementById('editLogQty').value);
    if (isNaN(newQty) || newQty <= 0) {
      showToast('Invalid quantity', true);
      return;
    }

    let updatedLog = await updateUsageLog(currentEditLogId, {
      qty_used: newQty,
      note: document.getElementById('editLogNote').value,
    });

    if (updatedLog) {
      let index = usageLogs.findIndex((l) => l.id === currentEditLogId);
      if (index !== -1) usageLogs[index] = updatedLog;
      refreshAll();
      hideModal('editLogModal');
      showToast('✓ Log entry updated successfully');
    }
  }
}

async function addNewPart() {
  const canAdd = windowCurrentPermissions.canAddParts || isAdmin;
  if (!canAdd) {
    showToast('You do not have permission to add parts', true);
    return;
  }

  let pn = document.getElementById('newPartNumber').value.trim();
  if (!pn) {
    showToast('Part number required', true);
    return;
  }
  if (
    parts.some(function (p) {
      return p.part_number === pn;
    })
  ) {
    showToast('Part number already exists', true);
    return;
  }

  let qty = parseInt(document.getElementById('newQuantity').value) || 0;
  let location = document.getElementById('newLocation').value.trim();

  let newPart = {
    part_number: pn,
    description:
      document.getElementById('newDescription').value.trim() || 'New Part',
    current_qty: qty,
    baseline_qty: qty,
    location: location || '',
  };

  let savedPart = await savePart(newPart);
  if (savedPart) {
    parts.push(savedPart);
    refreshAll();
    hideModal('addPartModal');
    document.getElementById('newPartNumber').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newLocation').value = '';
    document.getElementById('newQuantity').value = 0;
    showToast('✓ Part "' + pn + '" added successfully');
  }
}

async function saveEditPart() {
  let p = parts.find(function (x) {
    return x.id === currentEditPartId;
  });
  if (p) {
    let newPn = document.getElementById('editPartNumber').value.trim();
    if (!newPn) {
      showToast('Part number required', true);
      return;
    }
    if (
      parts.some(function (x) {
        return x.id !== currentEditPartId && x.part_number === newPn;
      })
    ) {
      showToast('Part number already exists', true);
      return;
    }

    let updates = {
      part_number: newPn,
      description: document.getElementById('editDescription').value,
      location: document.getElementById('editLocation').value,
      current_qty: parseInt(document.getElementById('editCurrentQty').value),
      baseline_qty: parseInt(document.getElementById('editBaselineQty').value),
    };

    let updatedPart = await updatePart(currentEditPartId, updates);
    if (updatedPart) {
      let index = parts.findIndex((x) => x.id === currentEditPartId);
      if (index !== -1) parts[index] = updatedPart;
      refreshAll();
      hideModal('editModal');
      showToast('✓ Part updated successfully');
    }
  }
}

function adjustQty(delta) {
  let disp = document.getElementById('editCurrentQtyDisplay');
  let val = parseInt(disp.innerText) + delta;
  if (val < 0) val = 0;
  disp.innerText = val;
  document.getElementById('editCurrentQty').value = val;
}

function showOrderReport() {
  let need = parts.filter(function (p) {
    return p.current_qty < p.baseline_qty;
  });
  let container = document.getElementById('reportListContainer');
  let totalNeeded = 0;
  if (need.length === 0) {
    container.innerHTML =
      '<div class="report-empty"><i class="fas fa-check-circle" style="font-size: 3rem; color: #2d6a4f; margin-bottom: 12px; display: block;"></i>All parts have sufficient stock!<br>No orders needed at this time.</div>';
  } else {
    container.innerHTML = '';
    for (let i = 0; i < need.length; i++) {
      let p = need[i];
      let shortage = p.baseline_qty - p.current_qty;
      totalNeeded += shortage;
      let div = document.createElement('div');
      div.className = 'report-item';
      div.innerHTML =
        '<div class="report-item-info"><div class="report-item-part">' +
        escapeHtml(p.part_number) +
        '</div><div class="report-item-desc">' +
        escapeHtml(p.description || '') +
        '</div></div><div class="report-item-qty">Need ' +
        shortage +
        '</div>';
      container.appendChild(div);
    }
    document.getElementById('reportTotalItems').innerHTML =
      'Total: ' + need.length + ' part(s) | ' + totalNeeded + ' units needed';
  }
  showModal('orderReportModal');
}

function copyOrderAndRedirect() {
  let need = parts.filter(function (p) {
    return p.current_qty < p.baseline_qty;
  });
  if (need.length === 0) {
    showToast('No items to order', true);
    return;
  }
  let text = '';
  for (let i = 0; i < need.length; i++) {
    text +=
      need[i].part_number +
      ' - need ' +
      (need[i].baseline_qty - need[i].current_qty) +
      '\n';
  }
  text = text.trim();
  navigator.clipboard
    .writeText(text)
    .then(function () {
      showToast(need.length + ' item(s) copied to clipboard!');
      window.open(
        'https://mckessonpa.atlassian.net/servicedesk/customer/portal/2/group/3/create/14',
        '_blank',
      );
    })
    .catch(function () {
      showToast('Failed to copy', true);
    });
}

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
    let lower = rows[0].map(function (h) {
      return String(h).toLowerCase();
    });
    pIdx = lower.findIndex(function (h) {
      return h.indexOf('part') !== -1 || h.indexOf('number') !== -1;
    });
    if (pIdx === -1) pIdx = 0;
    dIdx = lower.findIndex(function (h) {
      return h.indexOf('desc') !== -1 || h.indexOf('description') !== -1;
    });
    if (dIdx === -1) dIdx = 1;
    qIdx = lower.findIndex(function (h) {
      return h.indexOf('qty') !== -1 || h.indexOf('quantity') !== -1;
    });
    if (qIdx === -1) qIdx = 2;
    lIdx = lower.findIndex(function (h) {
      return (
        h.indexOf('loc') !== -1 ||
        h.indexOf('location') !== -1 ||
        h.indexOf('position') !== -1
      );
    });
  }
  let start =
    rows[0] && String(rows[0][0]).toLowerCase().indexOf('part') !== -1 ? 1 : 0;
  let added = 0,
    updated = 0;

  showSyncIndicator('Importing parts...');

  for (let i = start; i < rows.length; i++) {
    let row = rows[i];
    if (!row || row.length < 2) continue;
    let pn = row[pIdx] ? String(row[pIdx]).trim() : '';
    if (!pn) continue;
    let desc = row[dIdx] ? String(row[dIdx]).trim() : '';
    let qty = parseFloat(row[qIdx]) || 0;
    let loc = lIdx !== -1 && row[lIdx] ? String(row[lIdx]).trim() : '';

    let existing = parts.find(function (p) {
      return p.part_number === pn;
    });
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
      let newPart = await savePart({
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
  showToast('Imported: ' + added + ' new, ' + updated + ' updated');
}

function updatePartDropdown(search) {
  let searchLower = search.toLowerCase();
  let filtered = parts.filter(function (p) {
    return (
      p.part_number.toLowerCase().indexOf(searchLower) !== -1 ||
      (p.description || '').toLowerCase().indexOf(searchLower) !== -1
    );
  });
  let dropdown = document.getElementById('partListDropdown');
  if (filtered.length === 0) {
    dropdown.innerHTML =
      '<div class="part-option" style="text-align:center;color:#999;">No parts found</div>';
    dropdown.style.display = 'block';
    return;
  }
  dropdown.innerHTML = '';
  dropdown.style.display = 'block';
  for (let i = 0; i < Math.min(filtered.length, 20); i++) {
    let part = filtered[i];
    let div = document.createElement('div');
    div.className = 'part-option';
    div.innerHTML =
      '<strong>' +
      escapeHtml(part.part_number) +
      '</strong><br><small>' +
      escapeHtml(part.description || '').substring(0, 40) +
      ' | Stock: ' +
      part.current_qty +
      '</small>';
    div.onclick = (function (p) {
      return function () {
        selectedPartId = p.id;
        let selectedDisplay = document.getElementById('selectedPartDisplay');
        selectedDisplay.innerHTML =
          '<i class="fas fa-check-circle"></i> Selected: <strong>' +
          escapeHtml(p.part_number) +
          '</strong> - Stock: ' +
          p.current_qty +
          ' units';
        selectedDisplay.classList.add('show');
        document.getElementById('partSearchInput').value = p.part_number;
        dropdown.style.display = 'none';
        document.getElementById('usageQty').max = p.current_qty;

        setTimeout(function () {
          if (selectedDisplay && selectedDisplay.classList) {
            selectedDisplay.classList.remove('show');
          }
        }, 3000);
      };
    })(part);
    dropdown.appendChild(div);
  }
}

function showConfirmDeletePart(partId) {
  const canDelete = windowCurrentPermissions.canDeleteParts || isAdmin;
  if (!canDelete) {
    showToast('You do not have permission to delete parts', true);
    return;
  }

  let part = parts.find(function (p) {
    return p.id === partId;
  });
  if (!part) return;
  pendingDeletePartId = partId;
  pendingDeleteLogId = null;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Delete Part';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to permanently delete this part?';
  document.getElementById('confirmDetails').style.display = 'block';
  document.getElementById('confirmDetails').innerHTML =
    '<strong>Part Number:</strong> ' +
    escapeHtml(part.part_number) +
    '<br><strong>Description:</strong> ' +
    escapeHtml(part.description || '') +
    '<br><strong>Current Stock:</strong> ' +
    part.current_qty +
    '<br><strong>Baseline:</strong> ' +
    part.baseline_qty;
  showModal('confirmDeleteModal');
}

function showConfirmDeleteLog(logId) {
  const canDelete = windowCurrentPermissions.canDeleteLogs || isAdmin;
  if (!canDelete) {
    showToast('You do not have permission to delete logs', true);
    return;
  }

  let log = usageLogs.find(function (l) {
    return l.id === logId;
  });
  if (!log) return;
  pendingDeleteLogId = logId;
  pendingDeletePartId = null;
  document.getElementById('confirmTitle').innerHTML =
    '<i class="fas fa-trash-alt"></i> Delete Log Entry';
  document.getElementById('confirmMessage').innerHTML =
    'Are you sure you want to delete this log entry? Stock quantity will NOT be restored.';
  document.getElementById('confirmDetails').style.display = 'block';
  document.getElementById('confirmDetails').innerHTML =
    '<strong>Part:</strong> ' +
    escapeHtml(log.part_number) +
    '<br><strong>Quantity Used:</strong> ' +
    log.qty_used +
    '<br><strong>Date:</strong> ' +
    escapeHtml(new Date(log.created_at).toLocaleString()) +
    '<br><strong>Note:</strong> ' +
    escapeHtml(log.note || '—');
  showModal('confirmDeleteModal');
}

async function executeDelete() {
  if (pendingDeletePartId !== null) {
    let success = await deletePart(pendingDeletePartId);
    if (success) {
      parts = parts.filter(function (p) {
        return p.id !== pendingDeletePartId;
      });
      refreshAll();
      showToast('✓ Part deleted successfully');
    }
    pendingDeletePartId = null;
  } else if (pendingDeleteLogId !== null) {
    let success = await deleteUsageLog(pendingDeleteLogId);
    if (success) {
      usageLogs = usageLogs.filter(function (l) {
        return l.id !== pendingDeleteLogId;
      });
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

// ========== UI INITIALIZATION ==========

function initUsageQuantityControls() {
  let decrementBtn = document.getElementById('decrementUsageQty');
  let incrementBtn = document.getElementById('incrementUsageQty');
  let qtyInput = document.getElementById('usageQty');

  if (decrementBtn) {
    decrementBtn.onclick = function () {
      let val = parseInt(qtyInput.value) || 1;
      if (val > 1) {
        qtyInput.value = val - 1;
      }
    };
  }

  if (incrementBtn) {
    incrementBtn.onclick = function () {
      let val = parseInt(qtyInput.value) || 1;
      let max = parseInt(qtyInput.getAttribute('max')) || 9999;
      if (val < max) {
        qtyInput.value = val + 1;
      }
    };
  }
}

function initMobileMenu() {
  const hamburger = document.getElementById('hamburgerMenu');
  const dropdown = document.getElementById('mobileDropdown');
  const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
  const desktopTabBtns = document.querySelectorAll('.tab-btn');

  if (hamburger) {
    hamburger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
  }

  document.addEventListener('click', function (e) {
    if (dropdown && dropdown.classList.contains('show')) {
      if (!hamburger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    }
  });

  // Mobile tab clicks with persistence
  mobileTabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      let tabId = this.getAttribute('data-tab');
      mobileTabBtns.forEach(function (b) {
        b.classList.remove('active');
      });
      this.classList.add('active');
      desktopTabBtns.forEach(function (b) {
        if (b.getAttribute('data-tab') === tabId) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      document.querySelectorAll('.tab-content').forEach(function (tc) {
        tc.classList.remove('active');
      });
      document.getElementById('tab-' + tabId).classList.add('active');

      saveActiveTab(tabId);

      if (tabId === 'dashboard') {
        loadDashboardData();
      }

      dropdown.classList.remove('show');
    });
  });

  // Desktop tab clicks with persistence
  desktopTabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      let tabId = this.getAttribute('data-tab');
      desktopTabBtns.forEach(function (b) {
        b.classList.remove('active');
      });
      this.classList.add('active');
      mobileTabBtns.forEach(function (b) {
        if (b.getAttribute('data-tab') === tabId) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      document.querySelectorAll('.tab-content').forEach(function (tc) {
        tc.classList.remove('active');
      });
      document.getElementById('tab-' + tabId).classList.add('active');

      saveActiveTab(tabId);

      if (tabId === 'dashboard') {
        loadDashboardData();
      }
    });
  });
}

// ========== EVENT LISTENERS ==========

// Auth event listeners
document.getElementById('loginTab')?.addEventListener('click', switchToLogin);
document
  .getElementById('registerTab')
  ?.addEventListener('click', switchToRegister);
document.getElementById('loginBtn')?.addEventListener('click', function () {
  let email = document.getElementById('loginEmail').value;
  let password = document.getElementById('loginPassword').value;
  if (email && password) login(email, password);
  else showAuthMessage('Please enter email and password', 'error');
});
document.getElementById('registerBtn')?.addEventListener('click', function () {
  let email = document.getElementById('registerEmail').value;
  let password = document.getElementById('registerPassword').value;
  let confirm = document.getElementById('registerConfirmPassword').value;
  if (email && password) register(email, password, confirm);
  else showAuthMessage('Please fill in all fields', 'error');
});
document.getElementById('logoutBtn')?.addEventListener('click', logout);

// Main app event listeners
document
  .getElementById('excelUpload')
  ?.addEventListener('change', function (e) {
    let f = e.target.files[0];
    if (f) {
      let r = new FileReader();
      r.onload = function (ev) {
        let wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          defval: '',
        });
        if (rows) importExcel(rows);
        e.target.value = '';
      };
      r.readAsArrayBuffer(f);
    }
  });

document
  .getElementById('allSearchInput')
  ?.addEventListener('input', function (e) {
    allState.search = e.target.value.toLowerCase();
    allState.page = 1;
    renderAllParts();
  });
document
  .getElementById('allRowsPerPage')
  ?.addEventListener('change', function (e) {
    allState.rows = parseInt(e.target.value);
    allState.page = 1;
    renderAllParts();
  });
document
  .getElementById('needSearchInput')
  ?.addEventListener('input', function (e) {
    needState.search = e.target.value.toLowerCase();
    renderNeedOrder();
  });
document
  .getElementById('criticalSearchInput')
  ?.addEventListener('input', function (e) {
    criticalState.search = e.target.value.toLowerCase();
    renderCritical();
  });
document
  .getElementById('logsSearchInput')
  ?.addEventListener('input', function (e) {
    logsSearch = e.target.value.toLowerCase();
    renderLogs();
  });
document
  .getElementById('reportBtn')
  ?.addEventListener('click', showOrderReport);
document.getElementById('addPartBtn')?.addEventListener('click', function () {
  showModal('addPartModal');
});
document.getElementById('quickLogBtn')?.addEventListener('click', function () {
  if (parts.length === 0) {
    showToast('No parts in inventory', true);
    return;
  }
  selectedPartId = null;
  document.getElementById('partSearchInput').value = '';
  let selectedDisplay = document.getElementById('selectedPartDisplay');
  selectedDisplay.classList.remove('show');
  selectedDisplay.innerHTML = '';
  document.getElementById('partListDropdown').innerHTML = '';
  document.getElementById('partListDropdown').style.display = 'none';
  document.getElementById('usageQty').value = 1;
  document.getElementById('usageQty').max = 9999;
  document.getElementById('usageNote').value = '';
  updatePartDropdown('');
  showModal('usageModal');
});
document.getElementById('scanQrBtn')?.addEventListener('click', openQrScanner);
document
  .getElementById('manualQrSubmit')
  ?.addEventListener('click', manualQrLookup);
document
  .getElementById('cancelScanBtn')
  ?.addEventListener('click', closeQrScanner);
document
  .getElementById('decrementQtyBtn')
  ?.addEventListener('click', function () {
    adjustQty(-1);
  });
document
  .getElementById('incrementQtyBtn')
  ?.addEventListener('click', function () {
    adjustQty(1);
  });
document.getElementById('saveEditBtn')?.addEventListener('click', saveEditPart);
document
  .getElementById('cancelEditBtn')
  ?.addEventListener('click', function () {
    hideModal('editModal');
  });
document
  .getElementById('deleteFromEditBtn')
  ?.addEventListener('click', function () {
    if (currentEditPartId) {
      hideModal('editModal');
      showConfirmDeletePart(currentEditPartId);
    }
  });
document.getElementById('saveAddBtn')?.addEventListener('click', addNewPart);
document.getElementById('cancelAddBtn')?.addEventListener('click', function () {
  hideModal('addPartModal');
});
document
  .getElementById('confirmUsageBtn')
  ?.addEventListener('click', function () {
    if (!selectedPartId) {
      showToast('Select a part', true);
      return;
    }
    let qty = parseInt(document.getElementById('usageQty').value);
    let note = document.getElementById('usageNote').value;
    if (logUsage(selectedPartId, qty, note)) {
      hideModal('usageModal');
      selectedPartId = null;
      document.getElementById('partSearchInput').value = '';
      let selectedDisplay = document.getElementById('selectedPartDisplay');
      selectedDisplay.classList.remove('show');
      selectedDisplay.innerHTML = '';
      document.getElementById('partListDropdown').innerHTML = '';
      document.getElementById('partListDropdown').style.display = 'none';
    }
  });
document
  .getElementById('confirmProceedBtn')
  ?.addEventListener('click', function () {
    if (pendingPhotoDeletePartId !== null) {
      executePhotoDelete();
    } else {
      executeDelete();
    }
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
  ?.addEventListener('input', function (e) {
    updatePartDropdown(e.target.value);
  });
document
  .getElementById('saveEditLogBtn')
  ?.addEventListener('click', saveEditLog);
document
  .getElementById('cancelEditLogBtn')
  ?.addEventListener('click', function () {
    hideModal('editLogModal');
  });
document.getElementById('deleteLogBtn')?.addEventListener('click', function () {
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

// Admin panel event listeners
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

// Log Details Modal event listeners
document
  .getElementById('logDetailsCloseBtn')
  ?.addEventListener('click', function () {
    hideModal('logDetailsModal');
  });

// Dashboard refresh button
document
  .getElementById('refreshDashboardBtn')
  ?.addEventListener('click', function () {
    loadDashboardData();
    showToast('Dashboard refreshed', false);
  });

// Sorting event listeners
document.querySelectorAll('#tab-all .sortable').forEach((header) => {
  header.addEventListener('click', function () {
    const sortField = this.getAttribute('data-sort');
    handleSort(sortField);
  });
});

// Close modal buttons
let closeButtons = document.querySelectorAll('.close-modal');
for (let i = 0; i < closeButtons.length; i++) {
  closeButtons[i].addEventListener('click', function (e) {
    e.stopPropagation();
    let modalId = this.getAttribute('data-modal');
    if (modalId) {
      if (modalId === 'qrScannerModal') {
        closeQrScanner();
      } else if (modalId === 'cameraModal') {
        closeCamera();
      } else {
        hideModal(modalId);
      }
    }
  });
}

window.onclick = function (e) {
  if (e.target.classList.contains('modal')) {
    let modalId = e.target.id;
    if (modalId === 'qrScannerModal') {
      closeQrScanner();
    } else if (modalId === 'cameraModal') {
      closeCamera();
    } else {
      hideModal(modalId);
    }
  }
};

// Hide dropdown when clicking outside
document.addEventListener('click', function (e) {
  let dropdown = document.getElementById('partListDropdown');
  let searchInput = document.getElementById('partSearchInput');
  if (dropdown && searchInput) {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  }
});

// Initialize
initMobileMenu();
initUsageQuantityControls();
window.changeAllPage = changeAllPage;
window.showPartDetails = showPartDetails;
window.showLogDetails = showLogDetails;
window.switchToTab = switchToTab;
window.openUserPermissions = window.openUserPermissions;
checkSession();

// Restore the last active tab after everything is loaded
restoreActiveTab();
