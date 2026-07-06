// Apply theme immediately
(function () {
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
})();

// Global API client utility
const API = {
  async get(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Terjadi kesalahan');
      }
      return res.json();
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  async post(url, data) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Terjadi kesalahan');
      }
      return res.json();
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  async put(url, data) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Terjadi kesalahan');
      }
      return res.json();
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  async delete(url) {
    try {
      const res = await fetch(url, {
        method: 'DELETE'
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Terjadi kesalahan');
      }
      return res.json();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
};
// Alias for backward compatibility — admin pages use API.del()
API.del = API.delete;

// Formatting helpers
function formatIDR(amount) {
  if (amount === undefined || amount === null) return 'Rp 0';
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  const statusMap = {
    'new': { label: 'Baru', class: 'badge-pending' },
    'contacted': { label: 'Dihubungi', class: 'badge-pending' },
    'interested': { label: 'Tertarik', class: 'badge-pending' },
    'proposal_sent': { label: 'Proposal Dikirim', class: 'badge-pending' },
    'booked': { label: 'Booked', class: 'badge-confirmed' },
    'lost': { label: 'Hilang', class: 'badge-cancelled' },
    'pending_verification': { label: 'Menunggu Verifikasi', class: 'badge-pending' },
    'confirmed': { label: 'Confirmed', class: 'badge-confirmed' },
    'in_progress': { label: 'Persiapan', class: 'badge-progress' },
    'event_day': { label: 'Hari H', class: 'badge-progress' },
    'completed': { label: 'Selesai', class: 'badge-completed' },
    'cancelled': { label: 'Batal', class: 'badge-cancelled' }
  };

  const val = statusMap[status] || { label: status, class: 'badge-pending' };
  return `<span class="badge ${val.class}">${val.label}</span>`;
}

// Modal management
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    // scroll overlay to top so long modals always start from the beginning
    modal.scrollTop = 0;
    requestAnimationFrame(() => modal.classList.add('active'));
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 150);
  }
}

// Close modals when clicking on the dark overlay background
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal(e.target.id);
  }
});

// Sidebar rendering helper
function renderSidebar(activePage) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  const menuItems = [
    { id: 'dashboard', label: '📊 Dashboard', url: '/admin' },
    { id: 'leads', label: '📥 Leads / Inquiry', url: '/admin/leads' },
    { id: 'clients', label: '👥 Clients', url: '/admin/clients' },
    { id: 'bookings', label: '📋 Bookings', url: '/admin/bookings' },
    { id: 'freelancers', label: '💼 Freelancers', url: '/admin/freelancers' },
    { id: 'packages', label: '📦 Packages', url: '/admin/packages' },
    { id: 'sessions', label: '⏰ Sessions', url: '/admin/sessions' },
    { id: 'products', label: '🏷️ Products', url: '/admin/products' },
    { id: 'calendar', label: '📅 Calendar', url: '/admin/calendar' },
    { id: 'settings', label: '⚙️ Settings', url: '/admin/settings' },
    { id: 'archive', label: '🗄️ Archive', url: '/admin/archive' }
  ];

  const currentTheme = localStorage.getItem('theme') || 'light';
  const themeLabel = currentTheme === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';

  let html = `
    <div class="sidebar-title" style="display:flex; align-items:center; justify-content:center; padding: 0 14px 20px;">
      <img src="/logo.png" id="sidebar-logo" style="max-height:80px; max-width:100%; object-fit:contain; object-position:center;" onerror="this.style.display='none'; document.getElementById('sidebar-text-title').style.display='block';">
      <span id="sidebar-text-title" style="display:none">Sorehari 📸</span>
    </div>
    <div class="tab-sidebar">
  `;

  menuItems.forEach(item => {
    const isActive = item.id === activePage ? 'active' : '';
    html += `
      <a href="${item.url}" class="nav-tab-btn ${isActive}">
        <span class="tab-icon"></span>
        ${item.label}
      </a>
    `;
  });

  html += `
      <div class="nav-tab-divider"></div>
      <button class="nav-tab-btn" id="theme-toggle-btn" style="width:100%; text-align:left; background:none; border:none; cursor:pointer;">
        <span class="tab-icon"></span>
        <span id="theme-toggle-text">${themeLabel}</span>
      </button>
      <button class="nav-tab-btn" id="logout-btn" style="color:var(--red); width:100%; text-align:left; background:none; border:none; cursor:pointer;">
        <span class="tab-icon"></span>
        🚪 Logout
      </button>
    </div>
  `;

  sidebarEl.innerHTML = html;

  const themeToggleBtn = sidebarEl.querySelector('#theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  const logoutBtn = sidebarEl.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutAdmin);
  }
}

// Toggle Theme helper
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  const themeText = document.getElementById('theme-toggle-text');
  if (themeText) {
    themeText.textContent = newTheme === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';
  }
}

// Admin logout helper
async function logoutAdmin() {
  if (confirm('Apakah Anda yakin ingin logout?')) {
    try {
      const res = await fetch('/logout', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }
    } catch (e) {
      window.location.href = '/login';
    }
  }
}

// Init Developer Watermark (AMS Signature)
function initDeveloperWatermark() {
  // Create button
  const btn = document.createElement('div');
  btn.className = 'dev-watermark-btn';
  btn.title = 'Developer Info';

  const logo = document.createElement('img');
  logo.src = '/ams-logo.png';
  logo.alt = 'AMS Logo';
  logo.style.width = '38px';
  logo.style.height = '38px';
  logo.style.objectFit = 'contain';
  btn.appendChild(logo);

  // Create popup
  const popup = document.createElement('div');
  popup.className = 'dev-watermark-popup';
  popup.style.display = 'none';

  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700">Developer Credit</span>
      <div class="dev-watermark-status">
        <span class="dev-watermark-dot"></span>
        <span>Active Release</span>
      </div>
    </div>
    <div>
      <img src="/ams-logo.png" alt="AMS Logo" style="height:36px;object-fit:contain;margin-bottom:8px;display:block" />
      <p style="margin:0;font-size:12px;color:#64748b;line-height:1.4">
        Designed, built, and optimized with Next.js, Prisma, and custom styling.
      </p>
    </div>
    <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px">
      <span style="color:#64748b">System Version</span>
      <strong style="color:#1e293b">v.2.0.0</strong>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <a href="https://github.com/armansyam" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;background:var(--primary,#6366F1);color:white;padding:8px 0;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;box-shadow:0 2px 8px rgba(99,102,241,0.2)">
        GitHub Profile
      </a>
      <button id="close-dev-watermark" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#64748b;font-size:12px;cursor:pointer;font-weight:600">
        Tutup
      </button>
    </div>
  `;

  // Event listeners
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = popup.style.display === 'flex';
    popup.style.display = isShown ? 'none' : 'flex';
  });

  popup.querySelector('#close-dev-watermark').addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = 'none';
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && !btn.contains(e.target)) {
      popup.style.display = 'none';
    }
  });

  document.body.appendChild(btn);
  document.body.appendChild(popup);
}

// Automatically trigger watermark initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDeveloperWatermark);
} else {
  initDeveloperWatermark();
}
