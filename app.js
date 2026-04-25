// =============================================
// INVENTORY MANAGER PRO v22.0.0
// =============================================
// A complete inventory management system with Supabase backend
// Features: Authentication, CRUD operations, Dashboard, QR scanning,
//           Dark mode, Pull-to-refresh, Mobile responsive, Admin panel

const supabaseClient = window.supabaseClient;

// =============================================
// GLOBAL VARIABLES
// =============================================

// Data stores
let parts = [],
  usageLogs = [],
  currentUser = null,
  isAdmin = false,
  currentEditingUser = null;

// QR Scanner & Camera
let html5QrCode = null,
  isScannerActive = false,
  cameraStream = null,
  usageChart = null;

// Edit state trackers
let currentEditPartId = null,
  currentEditLogId = null,
  selectedPartId = null,
  currentDetailsPartId = null;

// Delete pending trackers
let pendingDeletePartId = null,
  pendingDeleteLogId = null,
  pendingPhotoDeletePartId = null,
  pendingPhotoPartId = null;

// UI state
let reopenEditAfterPhoto = false;
let scrollPosition = 0;
let pullToRefreshActive = false;
let touchStartY = 0;
let isRefreshing = false;

// Tab UI state
let allState = { page: 1, rows: 50, search: '' };
let needState = { search: '' };
let criticalState = { search: '' };
let logsSearch = '';
let allSortField = 'part_number',
  allSortDirection = 'asc';

// User permissions cache
let windowCurrentPermissions = {
  canEditParts: false,
  canDeleteParts: false,
  canEditLogs: false,
  canDeleteLogs: false,
  canAddParts: false,
  canLogUsage: false,
};

// Local storage keys
const STORAGE_KEY = 'inventoryManager_activeTab';
const DARK_MODE_KEY = 'inventoryManager_darkMode';

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Pull to refresh functionality for mobile devices
 * Performs a full page reload when user pulls down from top
 */
function initPullToRefresh() {
  let startY = 0;
  let pulling = false;

  document.addEventListener(
    'touchstart',
    (e) => {
      // Don't trigger if a modal is open
      if (window.isModalOpen) return;

      if (window.scrollY === 0 && !isRefreshing) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    },
    { passive: true },
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      // Don't trigger if a modal is open
      if (window.isModalOpen) return;

      if (!pulling || isRefreshing) return;

      const pullDistance = e.touches[0].clientY - startY;

      if (pullDistance > 40 && window.scrollY === 0) {
        e.preventDefault();
        showSyncIndicator('');
      }
    },
    { passive: false },
  );

  document.addEventListener('touchend', async (e) => {
    // Don't trigger if a modal is open
    if (window.isModalOpen) {
      pulling = false;
      return;
    }

    if (!pulling || isRefreshing) {
      pulling = false;
      return;
    }

    const pullDistance = e.changedTouches[0].clientY - startY;

    if (pullDistance > 50 && window.scrollY === 0) {
      isRefreshing = true;
      await silentRefresh();
      isRefreshing = false;
    }

    pulling = false;
    startY = 0;
    hideSyncIndicator();
  });
}

// HEADER CLICK REFRESH (Hidden)
function initHeaderRefresh() {
  const header = document.querySelector('.header h1');
  if (header) {
    let tapCount = 0;
    let tapTimer = null;

    header.addEventListener('click', () => {
      tapCount++;

      if (tapTimer) clearTimeout(tapTimer);

      tapTimer = setTimeout(() => {
        if (tapCount >= 2) {
          // Double tap detected - refresh the app
          showToast('Refreshing app...', false);
          setTimeout(() => {
            location.reload();
          }, 200);
        }
        tapCount = 0;
      }, 300);
    });
  }
}

//Silent refresh - performs a full page reload
async function silentRefresh() {
  location.reload();
}

//Display a toast notification
const showToast = (msg, isErr) => {
  const t = document.createElement('div');
  t.className = 'success-toast';
  if (isErr) t.style.background = '#e76f51';
  t.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
};

//Show a loading indicator for async operations
const showSyncIndicator = (msg) => {
  document.querySelector('.sync-indicator')?.remove();
  const indicator = document.createElement('div');
  indicator.className = 'sync-indicator';
  indicator.innerHTML = `<i class="fas fa-spinner fa-pulse"></i> ${msg}`;
  document.body.appendChild(indicator);
};

const hideSyncIndicator = () =>
  setTimeout(() => document.querySelector('.sync-indicator')?.remove(), 500);

//Disable body scroll when modal is open (prevents background scrolling)
function disableBodyScroll() {
  scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  document.body.classList.add('modal-open');
  document.body.style.top = `-${scrollPosition}px`;
}

//Re-enable body scroll when modal is closed
function enableBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, scrollPosition);
}

//Hide a modal with animation
const hideModal = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
    setTimeout(() => {
      el.style.display = 'none';
      const openModals = document.querySelectorAll('.modal.active');
      if (openModals.length === 0) {
        enableBodyScroll();
        // Clear flag when no modals are open
        window.isModalOpen = false;
      }
    }, 200);
  }
};

//Show a modal with animation
const showModal = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
    el.style.display = 'flex';
    void el.offsetHeight;
    el.classList.add('active');
    disableBodyScroll();
    // Set flag to disable pull-to-refresh
    window.isModalOpen = true;
  }
};

// Show fullscreen image viewer
function showFullscreenImage(imageUrl) {
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'modal fullscreen-image-modal';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.backgroundColor = 'transparent';
  modal.style.backdropFilter = 'blur(20px)';
  modal.style.WebkitBackdropFilter = 'blur(20px)';
  modal.style.zIndex = '10001';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';

  // Create image element
  const img = document.createElement('img');
  img.src = imageUrl;
  img.style.maxWidth = '90%';
  img.style.maxHeight = '90%';
  img.style.objectFit = 'contain';
  img.style.borderRadius = '16px';
  img.style.cursor = 'zoom-out';
  img.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.2)';

  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '20px';
  closeBtn.style.right = '20px';
  closeBtn.style.width = '44px';
  closeBtn.style.height = '44px';
  closeBtn.style.borderRadius = '40px';
  closeBtn.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
  closeBtn.style.backdropFilter = 'blur(10px)';
  closeBtn.style.color = 'white';
  closeBtn.style.fontSize = '1.2rem';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.zIndex = '10002';
  closeBtn.style.transition = 'all 0.2s ease';

  closeBtn.onmouseover = () => {
    closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    closeBtn.style.transform = 'scale(1.05)';
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    closeBtn.style.transform = 'scale(1)';
  };

  // Function to close modal
  function closeModal() {
    modal.remove();
    enableBodyScroll();
    document.removeEventListener('keydown', escHandler);
  }

  // Close on X button click
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeModal();
  };

  // Close on image click
  img.onclick = (e) => {
    e.stopPropagation();
    closeModal();
  };

  // Close on backdrop click
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };

  // Close on ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', escHandler);

  // Add to body
  modal.appendChild(img);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);

  // Disable body scroll
  disableBodyScroll();
}

//Escape HTML to prevent XSS attacks
const escapeHtml = (s) =>
  s
    ? String(s).replace(
        /[&<>]/g,
        (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m],
      )
    : '';

// Show a custom confirmation dialog instead of browser confirm
function showCustomConfirm(title, message, onConfirm, onCancel) {
  // Get or create a hidden modal container
  let modal = document.getElementById('customConfirmModal');

  if (!modal) {
    // Create the modal if it doesn't exist
    modal = document.createElement('div');
    modal.id = 'customConfirmModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-card confirm-modal" style="max-width: 350px; text-align: center;">
        <div class="warning-icon">
          <i class="fas fa-qrcode"></i>
        </div>
        <h3 id="customConfirmTitle" style="margin-bottom: 12px;">Part Not Found</h3>
        <p id="customConfirmMessage" style="margin-bottom: 20px;"></p>
        <div class="confirm-actions" style="display: flex; gap: 12px; justify-content: center;">
          <button id="customConfirmCancel" class="btn btn-secondary">Cancel</button>
          <button id="customConfirmOk" class="btn btn-primary">Create Part</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Set the title and message
  document.getElementById('customConfirmTitle').innerHTML =
    `<i class="fas fa-qrcode"></i> ${escapeHtml(title)}`;
  document.getElementById('customConfirmMessage').innerHTML =
    escapeHtml(message);

  // Store callbacks
  const confirmHandler = () => {
    hideModal('customConfirmModal');
    if (onConfirm) onConfirm();
    cleanup();
  };

  const cancelHandler = () => {
    hideModal('customConfirmModal');
    if (onCancel) onCancel();
    cleanup();
  };

  const cleanup = () => {
    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');
    okBtn.removeEventListener('click', confirmHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  // Add event listeners
  const okBtn = document.getElementById('customConfirmOk');
  const cancelBtn = document.getElementById('customConfirmCancel');
  okBtn.removeEventListener('click', confirmHandler);
  cancelBtn.removeEventListener('click', cancelHandler);
  okBtn.addEventListener('click', confirmHandler);
  cancelBtn.addEventListener('click', cancelHandler);

  // Show the modal
  showModal('customConfirmModal');
}

// =============================================
// SKELETON LOADING STATES
// =============================================

/**
 * Show skeleton loading for All Parts table
 */
function showAllPartsSkeleton() {
  const tbody = document.getElementById('allPartsBody');
  if (!tbody) return;

  const rows = [];
  const rowsToShow = Math.min(allState.rows, 25);

  for (let i = 0; i < rowsToShow; i++) {
    rows.push(`
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-cell" style="width: 80%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 90%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 70px"></div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join('');
}

/**
 * Show skeleton loading for Need Order table
 */
function showNeedOrderSkeleton() {
  const tbody = document.getElementById('needOrderBody');
  if (!tbody) return;

  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(`
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-cell" style="width: 80%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 90%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 60px"></div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join('');
}

/**
 * Show skeleton loading for Critical table
 */
function showCriticalSkeleton() {
  const tbody = document.getElementById('criticalBody');
  if (!tbody) return;

  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(`
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-cell" style="width: 80%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 90%"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
        <td><div class="skeleton skeleton-cell" style="width: 50px"></div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join('');
}

/**
 * Show skeleton loading for Logs
 */
function showLogsSkeleton() {
  const container = document.getElementById('logsListContainer');
  if (!container) return;

  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push(`
      <div class="skeleton-log-entry">
        <div class="skeleton skeleton-log-cell"></div>
        <div class="skeleton skeleton-log-cell"></div>
        <div class="skeleton skeleton-log-cell" style="width: 60px"></div>
        <div class="skeleton skeleton-log-cell"></div>
        <div class="skeleton skeleton-log-cell"></div>
      </div>
    `);
  }

  container.innerHTML = items.join('');
}

/**
 * Show skeleton loading for Dashboard
 */
function showDashboardSkeleton() {
  // KPI cards skeleton - complete replacement
  const kpiGrid = document.querySelector('.dashboard-kpi-grid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card skeleton-card">
        <div class="kpi-icon skeleton-icon"><div class="skeleton" style="width:55px;height:55px;border-radius:50%;"></div></div>
        <div class="kpi-info">
          <div class="skeleton" style="height:32px;width:60px;margin-bottom:8px;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:80px;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:100px;margin-top:8px;border-radius:4px;"></div>
        </div>
      </div>
      <div class="kpi-card skeleton-card">
        <div class="kpi-icon skeleton-icon"><div class="skeleton" style="width:55px;height:55px;border-radius:50%;"></div></div>
        <div class="kpi-info">
          <div class="skeleton" style="height:32px;width:60px;margin-bottom:8px;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:80px;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:100px;margin-top:8px;border-radius:4px;"></div>
        </div>
      </div>
      <div class="kpi-card skeleton-card">
        <div class="kpi-icon skeleton-icon"><div class="skeleton" style="width:55px;height:55px;border-radius:50%;"></div></div>
        <div class="kpi-info">
          <div class="skeleton" style="height:32px;width:60px;margin-bottom:8px;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:80px;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:100px;margin-top:8px;border-radius:4px;"></div>
        </div>
      </div>
      <div class="kpi-card skeleton-card">
        <div class="kpi-icon skeleton-icon"><div class="skeleton" style="width:55px;height:55px;border-radius:50%;"></div></div>
        <div class="kpi-info">
          <div class="skeleton" style="height:32px;width:60px;margin-bottom:8px;border-radius:6px;"></div>
          <div class="skeleton" style="height:14px;width:80px;border-radius:4px;"></div>
          <div class="skeleton" style="height:12px;width:100px;margin-top:8px;border-radius:4px;"></div>
        </div>
      </div>
    `;
  }

  // Chart skeleton - clear and show skeleton
  const chartContainer = document.querySelector('.chart-container');
  if (chartContainer) {
    chartContainer.innerHTML =
      '<div class="skeleton" style="height:250px;width:100%;border-radius:12px;"></div>';
  }

  // Top parts skeleton
  const topPartsList = document.getElementById('topPartsList');
  if (topPartsList) {
    const items = [];
    for (let i = 0; i < 5; i++) {
      items.push(`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color);">
          <div class="skeleton" style="width:30px;height:20px;border-radius:4px;"></div>
          <div style="flex:2">
            <div class="skeleton" style="height:16px;width:120px;margin-bottom:6px;border-radius:4px;"></div>
            <div class="skeleton" style="height:12px;width:180px;border-radius:4px;"></div>
          </div>
          <div class="skeleton" style="flex:3;height:8px;border-radius:4px;"></div>
        </div>
      `);
    }
    topPartsList.innerHTML = items.join('');
  }

  // Low stock skeleton
  const lowStockList = document.getElementById('lowStockList');
  if (lowStockList) {
    const items = [];
    for (let i = 0; i < 3; i++) {
      items.push(`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--stat-card-bg);border-radius:12px;">
          <div style="flex:1">
            <div class="skeleton" style="height:16px;width:100px;margin-bottom:6px;border-radius:4px;"></div>
            <div class="skeleton" style="height:12px;width:150px;border-radius:4px;"></div>
          </div>
          <div style="display:flex;gap:20px;">
            <div class="skeleton" style="height:30px;width:50px;border-radius:20px;"></div>
            <div class="skeleton" style="height:30px;width:50px;border-radius:20px;"></div>
            <div class="skeleton" style="height:30px;width:60px;border-radius:20px;"></div>
          </div>
        </div>
      `);
    }
    lowStockList.innerHTML = items.join('');
  }

  // Recent activity skeleton
  const recentActivity = document.getElementById('recentActivityList');
  if (recentActivity) {
    const items = [];
    for (let i = 0; i < 5; i++) {
      items.push(`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color);">
          <div class="skeleton" style="width:32px;height:32px;border-radius:50%;"></div>
          <div style="flex:1">
            <div class="skeleton" style="height:14px;width:200px;margin-bottom:6px;border-radius:4px;"></div>
            <div class="skeleton" style="height:12px;width:120px;border-radius:4px;"></div>
          </div>
        </div>
      `);
    }
    recentActivity.innerHTML = items.join('');
  }
  attachKpiCardClickHandlers();
}
// =============================================
// AUTHENTICATION
// =============================================

//Check if user has an active session on page load
async function checkSession() {
  const auth = document.getElementById('authContainer');
  const app = document.getElementById('appContainer');
  if (auth) auth.style.display = 'none';
  if (app) app.style.display = 'none';

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    currentUser = session.user;
    await checkAdminStatus();
    await updateUIByPermissions();

    // Show app screen IMMEDIATELY with skeletons
    if (app) app.style.display = 'block';

    // Show skeletons right away
    showAllPartsSkeleton();
    showNeedOrderSkeleton();
    showCriticalSkeleton();
    showLogsSkeleton();

    const dashboardTab = document.getElementById('tab-dashboard');
    if (dashboardTab && dashboardTab.classList.contains('active')) {
      showDashboardSkeleton();
    }

    // Load data in background
    loadAllData();
  } else {
    if (auth) auth.style.display = 'flex';
  }
}

//Login user with email and password
async function login(email, password) {
  showAuthMessage('', '');
  setAuthLoading(true);

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  setAuthLoading(false);

  if (error) {
    showAuthMessage(error.message, 'error');
    return false;
  }

  currentUser = data.user;
  await checkAdminStatus();
  await updateUIByPermissions();

  // Show app screen IMMEDIATELY with skeletons
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';

  // Show skeletons right away (no waiting for data)
  showAllPartsSkeleton();
  showNeedOrderSkeleton();
  showCriticalSkeleton();
  showLogsSkeleton();

  const dashboardTab = document.getElementById('tab-dashboard');
  if (dashboardTab && dashboardTab.classList.contains('active')) {
    showDashboardSkeleton();
  }

  // Load data in background (don't await - let it load async)
  loadAllData();

  return true;
}

//Register a new user account
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

  const { error } = await supabaseClient.auth.signUp({ email, password });
  setAuthLoading(false);

  if (error) {
    showAuthMessage(error.message, 'error');
    return false;
  }
  showAuthMessage('Account created! Please login.', 'success');
  switchToLogin();
  return true;
}

//Logout current user
async function logout() {
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
}

//Display authentication message
function showAuthMessage(msg, type) {
  const div = document.getElementById('authMessage');
  div.textContent = msg;
  div.className = `auth-message ${type}`;
  div.style.display = msg ? 'block' : 'none';
}

//Set loading state on auth buttons
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

//Switch to login form view
function switchToLogin() {
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('registerForm').classList.remove('active');
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
  showAuthMessage('', '');
}

//Switch to register form view
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

//Activate a specific tab by ID
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

//Check current user's admin status and permissions
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

//Check if user has a specific permission
async function userHasPermission(perm) {
  if (!currentUser || isAdmin) return isAdmin;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select(perm)
    .eq('id', currentUser.id)
    .single();
  return !error && data?.[perm];
}

//Update UI elements based on user permissions
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

//Show/hide mobile bottom action bar buttons based on permissions
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
// DATABASE CRUD OPERATIONS
// =============================================

//Load all data from database (parts and usage logs)
async function loadAllData() {
  // Load parts and logs in parallel (faster than one after another)
  await Promise.all([loadParts(), loadUsageLogs()]);

  refreshAll();

  const dashboardTab = document.getElementById('tab-dashboard');
  if (dashboardTab && dashboardTab.classList.contains('active')) {
    await loadDashboardData();
  }
}

//Load parts from Supabase
async function loadParts() {
  // Show skeleton immediately
  showSyncIndicator('Loading parts...');
  const { data, error } = await supabaseClient
    .from('parts')
    .select('*')
    .order('part_number');
  hideSyncIndicator();
  if (error) showToast(`Error loading parts: ${error.message}`, true);
  else parts = data || [];
}

//Load usage logs from Supabase
async function loadUsageLogs() {
  const { data, error } = await supabaseClient
    .from('usage_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) showToast(`Error loading logs: ${error.message}`, true);
  else usageLogs = data || [];
}

//Save a part to database
async function savePart(part) {
  return await saveToTable('parts', part);
}

//Update an existing part
async function updatePart(id, updates) {
  return await updateInTable('parts', id, updates);
}

//Delete a part from database
async function deletePart(id) {
  return await deleteFromTable('parts', id);
}

//Save a usage log entry
async function saveUsageLog(log) {
  return await saveToTable('usage_logs', {
    ...log,
    created_by_email: currentUser?.email || 'Unknown User',
  });
}

//Update an existing usage log
async function updateUsageLog(id, updates) {
  return await updateInTable('usage_logs', id, updates);
}

//Delete a usage log
async function deleteUsageLog(id) {
  return await deleteFromTable('usage_logs', id);
}

//Generic save to table function
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

//Generic update in table function
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

//Generic delete from table function
async function deleteFromTable(table, id) {
  showSyncIndicator('Deleting...');
  const { error } = await supabaseClient.from(table).delete().eq('id', id);
  hideSyncIndicator();
  if (error) showToast(`Error deleting: ${error.message}`, true);
  return !error;
}

//Upload a photo to Supabase Storage
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

//Delete a photo from Supabase Storage
async function deletePhoto(url) {
  if (!url) return;
  const fileName = url.split('/').pop();
  await supabaseClient.storage.from('part-photos').remove([fileName]);
}

// =============================================
// DASHBOARD
// =============================================

//Load all dashboard components
async function loadDashboardData() {
  // Clear existing chart to prevent "straight line" issue
  if (usageChart) {
    usageChart.destroy();
    usageChart = null;
  }

  // Show skeleton immediately
  showDashboardSkeleton();

  // Small delay to ensure skeleton renders (200ms makes it visible)
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Now load real data
  await updateKPICards();
  await updateUsageTrendsChart();
  await updateTopUsedParts();
  await updateLowStockAlerts();
  await updateRecentActivity();
}

//Update KPI cards with current statistics
//Update KPI cards with current statistics
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

  // Completely rebuild the KPI cards HTML
  const kpiGrid = document.querySelector('.dashboard-kpi-grid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fas fa-cubes"></i></div>
        <div class="kpi-info">
          <div class="kpi-value" id="kpiTotalParts">${total}</div>
          <div class="kpi-label">Total Parts</div>
          <div class="kpi-trend" id="kpiPartsTrend">${added ? `<i class="fas fa-arrow-up"></i> +${added} this month` : 'No new parts'}</div>
        </div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="kpi-info">
          <div class="kpi-value" id="kpiLowStock">${low}</div>
          <div class="kpi-label">Low Stock</div>
          <div class="kpi-trend">Below baseline</div>
        </div>
      </div>
      <div class="kpi-card critical">
        <div class="kpi-icon"><i class="fas fa-bell"></i></div>
        <div class="kpi-info">
          <div class="kpi-value" id="kpiCritical">${critical}</div>
          <div class="kpi-label">Critical Stock</div>
          <div class="kpi-trend">Below 50% of baseline</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fas fa-history"></i></div>
        <div class="kpi-info">
          <div class="kpi-value" id="kpiLogsCount">${logsCount}</div>
          <div class="kpi-label">Logs (30 days)</div>
          <div class="kpi-trend">Last 30 days</div>
        </div>
      </div>
    `;
  }

  // ATTACH CLICK HANDLERS AFTER CARDS ARE CREATED
  attachKpiCardClickHandlers();
}

// Separate function to attach click handlers to KPI cards
function attachKpiCardClickHandlers() {
  // Total Parts card - opens All Parts tab
  const totalPartsCard = document.querySelector('.kpi-card:first-child');
  if (totalPartsCard) {
    totalPartsCard.style.cursor = 'pointer';
    totalPartsCard.onclick = () => {
      switchToTab('all');
    };
  }

  // Low Stock card - opens Need Order tab
  const lowStockCard = document.querySelector('.kpi-card.warning');
  if (lowStockCard) {
    lowStockCard.style.cursor = 'pointer';
    lowStockCard.onclick = () => {
      switchToTab('needorder');
    };
  }

  // Critical Stock card - opens Critical tab
  const criticalCard = document.querySelector('.kpi-card.critical');
  if (criticalCard) {
    criticalCard.style.cursor = 'pointer';
    criticalCard.onclick = () => {
      switchToTab('critical');
    };
  }

  // Logs card - opens Usage Logs tab
  const logsCard = document.querySelector('.kpi-card:last-child');
  if (logsCard) {
    logsCard.style.cursor = 'pointer';
    logsCard.onclick = () => {
      switchToTab('logs');
    };
  }
}

//Update usage trends chart (30 day history)
async function updateUsageTrendsChart() {
  // Make sure chart container has canvas
  const chartContainer = document.querySelector('.chart-container');
  if (chartContainer) {
    // Clear container and add canvas
    chartContainer.innerHTML = '<canvas id="usageTrendsChart"></canvas>';
  }

  const canvas = document.getElementById('usageTrendsChart');
  if (!canvas) return;

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
  usageChart = new Chart(canvas.getContext('2d'), {
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
  });
}

//Update top 5 most used parts (last 30 days)
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

//Update low stock alerts section
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

//Update recent activity feed (last 10 usage logs)
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

//Refresh all rendered views
function refreshAll() {
  renderAllParts();
  renderNeedOrder();
  renderCritical();
  renderLogs();
}

//Handle table sorting
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

//Update sort icon states in table header
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

//Render the All Parts table with pagination and sorting
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
        return `<tr class="clickable-part-row ${need ? (crit ? 'stock-critical' : 'stock-low') : ''}" onclick="showPartDetails(${p.id})">
      <td><strong>${escapeHtml(p.part_number)}</strong></td>
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

//Generate pagination HTML
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

//Render the Need Order tab (parts below baseline)
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
          `<tr class="clickable-part-row ${p.current_qty < p.baseline_qty * 0.5 ? 'stock-critical' : 'stock-low'}" onclick="showPartDetails(${p.id})">
        <td><strong>${escapeHtml(p.part_number)}</strong></td>
        <td>${escapeHtml(p.description || '').substring(0, 40)}</td>
        <td><span class="current-qty-display">${p.current_qty}</span></td>
        <td>${p.baseline_qty}</td>
        <td style="color:#e76f51;font-weight:600;">${p.baseline_qty - p.current_qty}</td>
      </tr>`,
      )
      .join('');
}

//Render the Critical tab (parts below 50% of baseline)
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
      '<td><td colspan="5" style="text-align:center;padding:30px;">No critical parts<\/td><\/tr>';
  else
    tbody.innerHTML = critical
      .map(
        (p) =>
          `<tr class="clickable-part-row stock-critical" onclick="showPartDetails(${p.id})">
        <td><strong>${escapeHtml(p.part_number)}</strong></td>
        <td>${escapeHtml(p.description || '').substring(0, 40)}</td>
        <td><span class="current-qty-display">${p.current_qty}</span></td>
        <td>${p.baseline_qty}</td>
        <td style="color:#c2410c;font-weight:600;">${Math.round((p.current_qty / p.baseline_qty) * 100)}%<\/td>
      </table>`,
      )
      .join('');
}

//Render the Usage Logs tab
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
      '<div class="empty-state" style="padding:60px;text-align:center;color:#94a3b8;"><i class="fas fa-history" style="font-size:3rem;margin-bottom:12px;display:block;opacity:0.5;"></i>No usage records found</div>';
  else
    container.innerHTML = filtered
      .map(
        (l) =>
          `<div class="log-entry clickable-log" onclick="showLogDetails(${l.id})"><div><i class="far fa-calendar-alt"></i> ${escapeHtml(new Date(l.created_at).toLocaleString())}</div><div><strong>${escapeHtml(l.part_number)}</strong></div><div><span style="color:#e76f51;font-weight:600;">-${l.qty_used}</span></div><div>${l.previous_stock} → ${l.new_stock}</div><div><i class="fas fa-comment"></i> ${escapeHtml(l.note || '—')}</div></div>`,
      )
      .join('');
}

// =============================================
// DETAILS & LOGS MODALS
// =============================================

//Show part details modal
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
    photoDiv.innerHTML = `<img src="${p.photo_url}" class="part-photo clickable-photo" alt="Part photo" onclick="showFullscreenImage('${p.photo_url}')">`;
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

//Show usage log details modal
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

//Log usage of a part (decrease quantity)
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

//Open edit part modal
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

//Open quick log modal for a specific part
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

//Open edit log modal
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

//Save edited part to database
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

//Save edited log to database
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

//Add a new part to inventory
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

//Adjust quantity in edit modal
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

//Open QR scanner modal and initialize scanner
async function openQrScanner() {
  await stopQrScanner();
  document.getElementById('manualQrInput').value = '';
  document.getElementById('qr-status').innerHTML =
    '<i class="fas fa-camera"></i> Initializing...';
  showModal('qrScannerModal');
  setTimeout(() => startQrScanner(), 300);
}

//Start the QR code scanner
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

//Stop the QR code scanner
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

//Handle successful QR code scan
async function onQrCodeSuccess(text) {
  await stopQrScanner();
  hideModal('qrScannerModal');

  // Trim whitespace from beginning and end
  const trimmedText = text.trim();

  const found = parts.find(
    (p) => p.part_number.toLowerCase() === trimmedText.toLowerCase(),
  );
  if (found) {
    showToast(`✓ Found: ${found.part_number}`);
    showPartDetails(found.id);
  } else {
    // Replace browser confirm with custom modal
    showCustomConfirm(
      'Part Not Found',
      `Part "${trimmedText}" was not found in inventory. Would you like to create it?`,
      () => {
        // On confirm - open add part modal with pre-filled part number
        document.getElementById('newPartNumber').value = trimmedText;
        document.getElementById('newDescription').value = '';
        document.getElementById('newLocation').value = '';
        document.getElementById('newQuantity').value = 0;
        showModal('addPartModal');
        showToast('Fill in the details and click Add', false);
      },
      () => {
        // On cancel - just show toast
        showToast('Part not added', false);
      },
    );
  }
}

//Manual part lookup by part number
function manualQrLookup() {
  const val = document.getElementById('manualQrInput').value.trim();
  if (!val) {
    showToast('Enter part number', true);
    return;
  }
  closeQrScanner();

  // Trim whitespace from beginning and end
  const trimmedVal = val.trim();

  const found = parts.find(
    (p) => p.part_number.toLowerCase() === trimmedVal.toLowerCase(),
  );
  if (found) {
    showToast(`✓ Found: ${found.part_number}`);
    showPartDetails(found.id);
  } else {
    // Replace browser confirm with custom modal
    showCustomConfirm(
      'Part Not Found',
      `Part "${trimmedVal}" was not found in inventory. Would you like to create it?`,
      () => {
        document.getElementById('newPartNumber').value = trimmedVal;
        document.getElementById('newDescription').value = '';
        document.getElementById('newLocation').value = '';
        document.getElementById('newQuantity').value = 0;
        showModal('addPartModal');
        showToast('Fill in the details and click Add', false);
      },
      () => {
        showToast('Part not added', false);
      },
    );
  }
}

//Close QR scanner and modal
async function closeQrScanner() {
  await stopQrScanner();
  hideModal('qrScannerModal');
}

// =============================================
// CAMERA FUNCTIONS
// =============================================

//Start camera for photo capture
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

//Stop camera stream
async function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
}

//Open camera for editing part photo
async function openCameraForEdit(partId) {
  pendingPhotoPartId = partId;
  reopenEditAfterPhoto = true;
  hideModal('editModal');
  await startCamera();
  showModal('cameraModal');
}

//Close camera modal
async function closeCamera() {
  await stopCamera();
  hideModal('cameraModal');
  if (reopenEditAfterPhoto && pendingPhotoPartId) {
    openEditPart(pendingPhotoPartId);
    reopenEditAfterPhoto = false;
  }
  pendingPhotoPartId = null;
}

//Capture photo from camera and upload
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

//Show confirmation modal for photo removal
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

//Execute photo deletion
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
// REPORT & DELETE FUNCTIONS
// =============================================

//Show order report modal (parts that need reordering)
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

//Copy order report to clipboard and open ordering system
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

//Show confirmation modal for part deletion
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

//Show confirmation modal for log deletion
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

//Execute the pending delete operation (part or log)
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

//Cancel pending delete operation
function cancelDelete() {
  pendingDeletePartId = null;
  pendingDeleteLogId = null;
  pendingPhotoDeletePartId = null;
  hideModal('confirmDeleteModal');
}

// =============================================
// ADMIN PANEL
// =============================================

//Open admin panel modal
async function openAdminPanel() {
  if (!isAdmin) {
    showToast('Admin access required', true);
    return;
  }
  await renderAdminPanel();
  showModal('adminPanelModal');
}

//Render the admin panel user list
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

//Open user permissions modal for editing
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

//Save user permissions to database
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
// EXCEL IMPORT
// =============================================

//Import parts from Excel/CSV file
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

//Update part dropdown for usage modal
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

//Edit part from details modal
function editFromDetails() {
  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openEditPart(currentDetailsPartId);
  }
}

//Log usage from details modal
function logFromDetails() {
  if (currentDetailsPartId) {
    hideModal('partDetailsModal');
    openQuickLog(currentDetailsPartId);
  }
}

// =============================================
// INITIALIZATION
// =============================================

//Initialize mobile hamburger menu
function initMobileMenu() {
  const hamburger = document.getElementById('hamburgerMenu');
  const dropdown = document.getElementById('mobileDropdown');

  if (hamburger && dropdown) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    dropdown.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (btn) {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) {
          dropdown.classList.remove('show');
          switchToTab(tabId);
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (
        dropdown.classList.contains('show') &&
        !hamburger.contains(e.target) &&
        !dropdown.contains(e.target)
      ) {
        dropdown.classList.remove('show');
      }
    });
  }

  // Handle desktop tab clicks
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.removeEventListener('click', btn._listener);
    const listener = () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        switchToTab(tabId);
      }
    };
    btn.addEventListener('click', listener);
    btn._listener = listener;
  });
}

// Initialize quantity controls for usage modal
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
initPullToRefresh();
initHeaderRefresh();
window.changeAllPage = changeAllPage;
window.showPartDetails = showPartDetails;
window.showLogDetails = showLogDetails;
window.switchToTab = switchToTab;
window.openUserPermissions = window.openUserPermissions;
window.showFullscreenImage = showFullscreenImage;
initDarkMode();
checkSession();
restoreActiveTab();
// Initialize modal flag
window.isModalOpen = false;
