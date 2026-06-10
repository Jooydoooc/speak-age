// /profile — top-level tabs, profile editing, role-based visibility.
//
// Tab strip: [Profile] · [Progress (student)] · [Content/Students/Stats (staff)]
// Tab routing is reflected in location.hash so /profile#stats deep-links.
// js/admin.js exposes load-on-demand helpers (loadAdminContent / loadAdminStudents /
// loadAdminSiteStats); this file calls them when their tab is activated.

(async function () {
  const user = await window.requireAuth();
  if (!user) return;

  document.body.classList.add('role-' + user.role);
  const isStaff = user.role === 'admin' || user.role === 'teacher';

  const $ = (id) => document.getElementById(id);
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function setMsg(text, type) {
    const el = $('profile-msg');
    if (!el) return;
    el.innerHTML = `<div class="alert alert-${type || 'error'}">${escHtml(text)}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 3500);
  }

  // --- Profile tab ------------------------------------------------------
  function renderProfileCard(u) {
    $('profile-avatar-slot').innerHTML = window.avatarMarkup(u, 80);
    $('profile-display-name').textContent = u.display_name || u.name || u.email;
    $('profile-email').textContent = u.email;
    const badgeEl = $('profile-role-badge');
    let badgeHtml = '';
    if (u.role === 'admin')   badgeHtml = '<span class="profile-role-badge role-admin">Admin</span>';
    if (u.role === 'teacher') badgeHtml = '<span class="profile-role-badge role-teacher">Teacher</span>';
    if (u.role === 'student') badgeHtml = '<span class="profile-role-badge role-student">Student</span>';
    badgeEl.outerHTML = `<span id="profile-role-badge">${badgeHtml}</span>`;
  }
  renderProfileCard(user);
  document.title = `${user.display_name || user.name || user.email} — Profile — Speak_Age`;

  // Edit display name
  const editForm = $('profile-edit-form');
  const nameInput = $('profile-name-input');
  const displayRow = $('profile-display-row');
  $('profile-edit-toggle').addEventListener('click', () => {
    nameInput.value = $('profile-display-name').textContent;
    displayRow.hidden = true;
    editForm.hidden = false;
    nameInput.focus(); nameInput.select();
  });
  $('profile-cancel').addEventListener('click', () => {
    editForm.hidden = true;
    displayRow.hidden = false;
  });
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) return setMsg('Name cannot be empty');
    const r = await window.api('/api/auth/profile', { method: 'PUT', body: { display_name: value } });
    if (!r.ok) return setMsg(r.data.error || 'Could not save');
    user.display_name = r.data.display_name;
    window.currentUser = user;
    renderProfileCard(user);
    editForm.hidden = true;
    displayRow.hidden = false;
    window.toast('Profile saved');
  });

  // Sign-out lives only in the navbar avatar dropdown now — keeping a second
  // button on this page made it too easy to click by accident.

  // --- Tab visibility by role -------------------------------------------
  document.querySelectorAll('.profile-tab').forEach(t => {
    if (t.hasAttribute('data-role-staff') && !isStaff) t.style.display = 'none';
    if (t.hasAttribute('data-role-student') && user.role !== 'student') t.style.display = 'none';
  });

  // --- Tab switching (URL hash <-> active panel) ------------------------
  const tabs   = document.querySelectorAll('.profile-tab');
  const panels = document.querySelectorAll('.profile-tab-panel');
  const allowed = Array.from(tabs)
    .filter(t => t.style.display !== 'none')
    .map(t => t.dataset.ptab);

  function selectTab(name) {
    if (!allowed.includes(name)) name = 'profile';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.ptab === name));
    panels.forEach(p => p.classList.toggle('active', p.dataset.ptabPanel === name));
    const desired = '#' + name;
    if (location.hash !== desired) history.replaceState(null, '', desired);
    // Lazy-load each tab's data on first activation.
    if (name === 'progress' && user.role === 'student') renderProgressTab();
    if (name === 'content'  && isStaff && window.loadAdminContent)    window.loadAdminContent();
    if (name === 'students' && isStaff && window.loadAdminStudents)   window.loadAdminStudents();
    if (name === 'stats'    && isStaff && window.loadAdminSiteStats)  window.loadAdminSiteStats();
    if (name === 'reviews'  && isStaff && window.loadReviewInbox)     window.loadReviewInbox();
  }
  tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.ptab)));
  window.addEventListener('hashchange', () => selectTab((location.hash || '').replace(/^#/, '')));
  selectTab((location.hash || '').replace(/^#/, '') || 'profile');

  // --- Progress tab (students) ------------------------------------------
  // Skill % stored in localStorage (per spec): UI mirror, not sensitive.
  // Stat counts + activity feed come from /api/progress/activity.
  let progressLoaded = false;
  async function renderProgressTab() {
    if (progressLoaded || user.role !== 'student') return;
    progressLoaded = true;

    const KEY = `speak_age_progress_${user.id}`;
    const defaults = { flu: 35, pro: 50, voc: 42, topics: 12, lessons: 8, exercises: 5, band: '7.5' };
    let p = JSON.parse(localStorage.getItem(KEY) || 'null') || defaults;
    const save = () => localStorage.setItem(KEY, JSON.stringify(p));

    function paint() {
      $('prog-topics').textContent    = p.topics;
      $('prog-lessons').textContent   = p.lessons;
      $('prog-exercises').textContent = p.exercises;
      $('prog-band').textContent      = p.band;
      ['flu','pro','voc'].forEach(k => {
        const pct = Math.max(0, Math.min(100, p[k]));
        $(`prog-${k}`).style.width = pct + '%';
        $(`prog-${k}-pct`).textContent = pct + '%';
      });
    }
    paint();
    document.querySelectorAll('[data-bump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-bump');
        p[k] = Math.min(100, (p[k] || 0) + 5);
        save(); paint();
      });
    });

    // Recent activity
    function timeAgo(iso) {
      if (!iso) return '';
      const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60)    return 'just now';
      if (s < 3600)  return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }
    const { ok, data } = await window.api('/api/progress/activity');
    const items = ok && data.activity && data.activity.length ? data.activity : [];
    const list = $('prog-activity');
    if (items.length === 0) {
      list.innerHTML = `<div class="muted-inline" style="padding:16px">No activity yet — start practicing to fill this up.</div>`;
      return;
    }
    list.innerHTML = items.map(a => `
      <div class="activity-item">
        <div class="activity-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="activity-text">${escHtml(a.detail)}</div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>
    `).join('');
  }

  // Expose user for admin.js
  window._profileUser = user;
})();
