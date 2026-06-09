// Speaking Dashboard — single-screen view of where the student stands.
//
//   - Band ring (current vs target) + speaking rank.
//   - Streak chip.
//   - "Next recommended task" CTA driven by weakest_area.
//   - Five sub-score bars (fluency / pronunciation / grammar / vocabulary / coherence).
//   - Counter strip (topics, recordings, current/longest streak).
//   - Badge cabinet (earned + locked, locked are dimmed).
//   - Teacher feedback history (collapsed cards, click to expand).
//
// All data comes from two parallel fetches: /api/dashboard/speaking and /api/badges.

(async function () {
  const user = await window.requireAuth();
  if (!user) return;

  // Greeting + avatar
  const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];
  document.getElementById('avatar').textContent = window.initials(user.name || user.email);
  document.getElementById('greeting').textContent = `Welcome back, ${firstName}`;

  // Logout
  document.getElementById('logout').addEventListener('click', async () => {
    await window.api('/api/auth/logout', { method: 'POST' });
    location.href = '/index.html';
  });

  // ---------- Initial data ----------
  const [dashRes, badgesRes] = await Promise.all([
    window.api('/api/dashboard/speaking'),
    window.api('/api/badges')
  ]);
  if (!dashRes.ok) {
    toast('Could not load dashboard data', 'error');
    document.getElementById('subgreet').textContent = 'Something went wrong while loading. Try refreshing.';
    return;
  }
  const dash = dashRes.data;
  const badges = (badgesRes.ok && badgesRes.data && badgesRes.data.badges) || [];

  renderHero(dash);
  renderCounters(dash);
  renderBars(dash.progress);
  renderBadges(badges);
  renderFeedback(dash.feedback_history || []);
  wireTargetForm(dash.progress.target_band);
  updateSubgreet(dash);

  // =========================================================
  // Renderers
  // =========================================================

  function renderHero(d) {
    const p = d.progress;
    const cur = Number(p.current_band || 0);
    const tgt = Number(p.target_band || 7.0);
    document.getElementById('band-num').textContent = cur > 0 ? cur.toFixed(1) : '—';
    document.getElementById('band-target').textContent = tgt.toFixed(1);
    setRing('band-ring', Math.max(0, Math.min(1, cur / 9)));

    document.getElementById('rank-name').textContent = d.rank || 'Silent Starter';

    const nextTask = d.next_task || { title: 'Pick a topic and record yourself', href: 'topics.html' };
    document.getElementById('next-task-title').textContent = nextTask.title;
    document.getElementById('next-task').setAttribute('href', nextTask.href || 'topics.html');

    if (d.streak && Number(d.streak.current_streak) > 0) {
      document.getElementById('streak-chip').hidden = false;
      document.getElementById('streak-num').textContent = d.streak.current_streak;
    }
  }

  function renderCounters(d) {
    document.getElementById('c-topics').textContent     = d.progress.topics_practiced || 0;
    document.getElementById('c-recordings').textContent = d.progress.recordings_submitted || 0;
    document.getElementById('c-streak').textContent     = (d.streak && d.streak.current_streak) || 0;
    document.getElementById('c-longest').textContent    = (d.streak && d.streak.longest_streak) || 0;
  }

  function renderBars(p) {
    const bars = [
      ['Fluency',       p.fluency_pct,       '#a855f7'],
      ['Pronunciation', p.pronunciation_pct, '#6d28d9'],
      ['Grammar',       p.grammar_pct,       '#14b8a6'],
      ['Vocabulary',    p.vocabulary_pct,    '#f59e0b'],
      ['Coherence',     p.coherence_pct,     '#3b82f6']
    ];
    document.getElementById('dash-bars').innerHTML = bars.map(([label, pct, color]) => `
      <div class="dash-bar-row">
        <div class="dash-bar-label">${escape(label)}</div>
        <div class="dash-bar-track">
          <div class="dash-bar-fill" style="width:${Number(pct) || 0}%; background:${color};"></div>
        </div>
        <div class="dash-bar-pct">${Number(pct) || 0}%</div>
      </div>
    `).join('');

    const weakest = p.weakest_area;
    const w = document.getElementById('dash-weakest');
    if (weakest) {
      w.hidden = false;
      document.getElementById('weakest-name').textContent = capitalize(weakest);
    } else {
      w.hidden = true;
    }
  }

  function renderBadges(list) {
    if (!list.length) {
      document.getElementById('badge-grid').innerHTML = `<p class="tm-empty">No badges configured.</p>`;
      return;
    }
    document.getElementById('badge-grid').innerHTML = list.map(b => `
      <div class="badge-card ${b.earned ? 'earned' : 'locked'}" title="${escape(b.description || '')}">
        <div class="badge-icon">${escape(b.icon || '🏅')}</div>
        <div class="badge-title">${escape(b.title)}</div>
        <div class="badge-desc">${escape(b.description || '')}</div>
        ${b.earned
          ? `<div class="badge-status earned-status">Earned</div>`
          : `<div class="badge-status">Locked</div>`}
      </div>
    `).join('');
  }

  function renderFeedback(items) {
    if (!items.length) {
      document.getElementById('feedback-list').innerHTML = `
        <p class="tm-empty">No teacher feedback yet. Submit a recording from a topic to get started.</p>`;
      return;
    }
    document.getElementById('feedback-list').innerHTML = items.map((f, i) => {
      const dateStr = f.reviewed_at ? new Date(f.reviewed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const subscores = ['fluency', 'pronunciation', 'grammar', 'vocabulary', 'coherence']
        .map(k => `<span class="fb-score" title="${capitalize(k)}">${capitalize(k).slice(0,2)} <strong>${f[k] != null ? f[k] : '–'}</strong></span>`)
        .join('');
      return `
        <details class="fb-card">
          <summary>
            <div class="fb-head">
              <div class="fb-head-main">
                <div class="fb-head-title">${escape(f.topic_title || (f.part ? `Part ${f.part} recording` : 'Recording'))}</div>
                <div class="fb-head-meta">${dateStr}${f.reviewer_name ? ' · ' + escape(f.reviewer_name) : ''}</div>
              </div>
              <div class="fb-head-band">
                <span class="fb-band-eyebrow">Band</span>
                <span class="fb-band-num">${f.estimated_band != null ? Number(f.estimated_band).toFixed(1) : '–'}</span>
              </div>
            </div>
            <div class="fb-subscores">${subscores}</div>
          </summary>
          <div class="fb-body">
            ${f.written_feedback ? escape(f.written_feedback).replace(/\n+/g, '<br><br>') : '<em>No written feedback was provided.</em>'}
          </div>
        </details>
      `;
    }).join('');
  }

  function wireTargetForm(currentTarget) {
    const input = document.getElementById('target-input');
    input.value = Number(currentTarget || 7.0).toFixed(1);
    document.getElementById('target-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = Number(input.value);
      if (!Number.isFinite(t) || t < 4 || t > 9) { toast('Target band must be between 4 and 9', 'error'); return; }
      const res = await window.api('/api/dashboard/speaking/target', { method: 'POST', body: { target_band: t } });
      if (!res.ok) { toast('Could not save target', 'error'); return; }
      document.getElementById('band-target').textContent = t.toFixed(1);
      toast(`Target band set to ${t.toFixed(1)}`, 'success');
    });
  }

  function updateSubgreet(d) {
    const submitted = Number(d.progress.recordings_submitted || 0);
    const cur = Number(d.progress.current_band || 0);
    if (submitted === 0) {
      document.getElementById('subgreet').textContent = 'Submit your first recording to start tracking progress.';
    } else if (cur >= Number(d.progress.target_band || 7)) {
      document.getElementById('subgreet').textContent = `You've hit your target band of ${Number(d.progress.target_band).toFixed(1)} — set a new goal!`;
    } else {
      document.getElementById('subgreet').textContent = `You're a ${d.rank}. Keep practising to reach band ${Number(d.progress.target_band).toFixed(1)}.`;
    }
  }

  // =========================================================
  // SVG ring helper — same idea as topics page, sized for the hero.
  // =========================================================
  function setRing(id, pct) {
    const c = document.getElementById(id);
    if (!c) return;
    const C = 2 * Math.PI * 96; // r=96 here
    c.style.strokeDasharray  = String(C);
    // Animate from empty to target — set offset to full first, then to value
    c.style.strokeDashoffset = String(C);
    requestAnimationFrame(() => {
      c.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.2, 0.7, 0.2, 1)';
      c.style.strokeDashoffset = String(C * (1 - pct));
    });
  }

  // =========================================================
  // Toasts
  // =========================================================
  const toastEl = document.getElementById('toast-stack');
  function toast(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    toastEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    setTimeout(() => {
      el.classList.remove('open');
      setTimeout(() => el.remove(), 250);
    }, 3500);
  }

  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function capitalize(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
})();
