// Speak_Age — shared client utilities
// Handles: nav state, mobile menu, current user fetch, space canvas

(function () {
  // Mobile menu toggle — closes on link tap and on outside click
  const toggle = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      links.classList.toggle('open');
    });
    links.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') links.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (links.classList.contains('open') && !links.contains(e.target) && e.target !== toggle) {
        links.classList.remove('open');
      }
    });
  }

  // Highlight active nav link based on URL
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
})();

// Lightweight API helper used across pages
window.api = async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  };
  if (options.body) opts.body = JSON.stringify(options.body);
  try {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Network error' } };
  }
};

// Fetch the current user (from JWT cookie) and expose globally
window.currentUser = null;
window.loadCurrentUser = async function () {
  const { ok, data } = await window.api('/api/auth/me');
  window.currentUser = ok ? data.user : null;
  return window.currentUser;
};

// Gatekeeper: redirect to /login.html if not authed; optional role check.
// On bounce we preserve the intended URL via ?return_to= so the login flow
// lands the user exactly where they were trying to go.
window.requireAuth = async function (roles = null) {
  const user = await window.loadCurrentUser();
  if (!user) {
    const target = location.pathname + location.search;
    location.href = '/login.html?return_to=' + encodeURIComponent(target);
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    location.href = '/dashboard.html';
    return null;
  }
  return user;
};

// Render avatar initials from a name string
window.initials = function (name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
};

// ---------- Shared modal + toast helpers ----------
window.openModal = function (id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = false;
  document.body.classList.add('modal-open');
  // Focus the first focusable input inside the modal for keyboard users.
  setTimeout(() => {
    const focusable = m.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus({ preventScroll: true });
  }, 50);
};
window.closeModal = function (id) {
  const m = id ? document.getElementById(id) : null;
  if (!m) return;
  m.hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) {
    document.body.classList.remove('modal-open');
  }
};
window.toast = function (text, type) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type || 'success'}`;
  el.textContent = text;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  setTimeout(() => {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 250);
  }, 3000);
};

// Global click + key handlers for declarative modal triggers.
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open-modal]');
  if (opener) {
    e.preventDefault();
    window.openModal(opener.getAttribute('data-open-modal'));
    return;
  }
  const closer = e.target.closest('[data-modal-close]');
  if (closer) {
    const m = closer.closest('.modal');
    if (m) window.closeModal(m.id);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not([hidden])').forEach(m => window.closeModal(m.id));
  }
});

// ---------- Profile menu in navbar ----------
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function avatarMarkup(user, size) {
  const dim = `width:${size}px;height:${size}px`;
  if (user.avatar_url) {
    return `<img src="${escHtml(user.avatar_url)}" alt="" class="profile-avatar-img" style="${dim}" referrerpolicy="no-referrer">`;
  }
  const initials = window.initials(user.display_name || user.name || user.email);
  const fontSize = Math.max(11, Math.round(size * 0.36));
  return `<span class="profile-avatar-initials" style="${dim};font-size:${fontSize}px">${escHtml(initials)}</span>`;
}
window.avatarMarkup = avatarMarkup;

async function setupProfileMenu() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight) return;

  // Always make sure any old admin pill is gone — it's been retired for every
  // role. setupProfileMenu runs on every page so this self-heals.
  document.querySelectorAll('.nav-admin-pill').forEach(el => el.remove());

  const user = await window.loadCurrentUser();
  if (!user) return; // public/anonymous — leave nav-right as-is (Sign in / Get started)

  const name = user.display_name || user.name || user.email;
  const roleLabel = user.role === 'admin' ? 'Admin'
                  : user.role === 'teacher' ? 'Teacher' : '';

  // Floating settings FAB — single entry point for the profile (and from there
  // to the admin panel, for admin/teacher). Always purple, always /profile.html.
  const onProfile = /\/profile(?:\.html)?$/.test(location.pathname);
  if (!onProfile && !document.querySelector('.admin-fab')) {
    const fab = document.createElement('a');
    fab.href = '/profile.html';
    fab.className = 'admin-fab';
    fab.setAttribute('aria-label', 'Open profile');
    fab.innerHTML = '<span aria-hidden="true">⚙</span>';
    document.body.appendChild(fab);
  }

  // Replace nav-right contents with the avatar + dropdown (logo · nav-links · avatar).
  navRight.innerHTML = `
    <div class="profile-menu" data-profile-menu>
      <button class="profile-avatar-btn" type="button" data-profile-toggle aria-haspopup="menu" aria-expanded="false" aria-label="Open profile menu">
        ${avatarMarkup(user, 36)}
      </button>
      <div class="profile-dropdown" data-profile-dropdown role="menu" aria-hidden="true">
        <div class="profile-dropdown-head">
          <div class="profile-dropdown-name">
            ${escHtml(name)}
            ${roleLabel ? `<span class="profile-role-badge role-${user.role}">${roleLabel}</span>` : ''}
          </div>
          <div class="profile-dropdown-email">${escHtml(user.email)}</div>
        </div>
        <div class="profile-dropdown-divider"></div>
        <a class="profile-dropdown-item" href="/profile.html" role="menuitem">
          <span class="profile-dropdown-icon" aria-hidden="true">👤</span>
          My Profile
        </a>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item profile-dropdown-signout" type="button" data-profile-signout role="menuitem">
          <span class="profile-dropdown-icon" aria-hidden="true">⎋</span>
          Sign out
        </button>
      </div>
    </div>
  `;

  // Backdrop for the mobile bottom-sheet variant.
  let backdrop = document.querySelector('.profile-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'profile-backdrop';
    document.body.appendChild(backdrop);
  }

  const menu     = navRight.querySelector('[data-profile-menu]');
  const toggle   = navRight.querySelector('[data-profile-toggle]');
  const dropdown = navRight.querySelector('[data-profile-dropdown]');
  const signOut  = navRight.querySelector('[data-profile-signout]');

  function open() {
    menu.classList.add('open');
    backdrop.classList.add('open');
    dropdown.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    menu.classList.remove('open');
    backdrop.classList.remove('open');
    dropdown.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.contains('open') ? close() : open();
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('open')) return;
    if (!menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  signOut.addEventListener('click', async () => {
    try { await window.api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    location.href = '/login.html';
  });
}
window.setupProfileMenu = setupProfileMenu;

// ---------- Space background (hero only) ----------
// Pure decoration: ~160 tiny stars, faint cluster, two planets and a ring.
function initSpace() {
  const canvas = document.getElementById('space-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, stars, cluster;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    w = rect.width; h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  function buildStars() {
    stars = [];
    for (let i = 0; i < 160; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.3,
        a: Math.random() * 0.4 + 0.05,
        // tiny twinkle phase
        p: Math.random() * Math.PI * 2,
        s: 0.002 + Math.random() * 0.004
      });
    }
    // faint star cluster top-left
    cluster = [];
    const cx = w * 0.18, cy = h * 0.22;
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 110;
      cluster.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: Math.random() * 0.9 + 0.2,
        a: Math.random() * 0.25 + 0.05
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);

    // Cluster glow — faint purple
    ctx.fillStyle = 'rgba(168,85,247,0.4)';
    cluster.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Tilted ring behind top-right planet
    const px = w - 90, py = 100;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(168,85,247,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 95, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Top-right planet (110px circle, opacity 0.55)
    ctx.fillStyle = 'rgba(76,29,149,0.55)';
    ctx.beginPath();
    ctx.arc(px, py, 55, 0, Math.PI * 2);
    ctx.fill();
    // subtle inner shading
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(px + 10, py + 6, 50, 0, Math.PI * 2);
    ctx.fill();

    // Bottom-left small planet (44px circle, opacity 0.4)
    const bx = 80, by = h - 70;
    ctx.fillStyle = 'rgba(109,40,217,0.4)';
    ctx.beginPath();
    ctx.arc(bx, by, 22, 0, Math.PI * 2);
    ctx.fill();

    // Tiny stars with gentle twinkle
    stars.forEach(s => {
      const tw = 0.5 + 0.5 * Math.sin(t * s.s + s.p);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#fafafa';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    requestAnimationFrame(draw);
  }

  // Debounced resize so rapid mobile-viewport changes (URL bar collapse,
  // orientation flip) don't thrash the canvas.
  let resizeTimer = null;
  function scheduleResize() {
    if (resizeTimer) cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(resize);
  }

  resize();
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  // iOS visualViewport reflects the actual viewport when the URL bar shows/hides
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleResize);
  }
  requestAnimationFrame(draw);
}

document.addEventListener('DOMContentLoaded', initSpace);

// Fire the profile menu setup ASAP. Each call is idempotent because
// loadCurrentUser caches the result.
document.addEventListener('DOMContentLoaded', () => { setupProfileMenu(); });
