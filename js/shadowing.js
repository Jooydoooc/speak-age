// Shadowing list — students only. Cards link to /shadowing-lesson.html?id=N.

(async function () {
  const user = await window.requireAuth();
  if (!user) return;

  const lessonsEl = document.getElementById('lessons');
  const filtersEl = document.getElementById('filters');
  let lessons = [];
  let level = 'all';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function ytId(url) {
    const m = (url || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  async function load() {
    const { ok, data } = await window.api('/api/shadowing');
    lessons = ok ? (data.lessons || []) : [];
    paintCounts();
    render();
  }

  // Fill the count badge next to each level in the sidebar.
  function paintCounts() {
    const counts = {};
    for (const l of lessons) counts[l.level] = (counts[l.level] || 0) + 1;
    document.querySelectorAll('[data-count]').forEach(el => {
      const key = el.getAttribute('data-count');
      el.textContent = key === 'all' ? lessons.length : (counts[key] || 0);
    });
  }

  function render() {
    const list = level === 'all' ? lessons : lessons.filter(l => l.level === level);
    if (list.length === 0) {
      lessonsEl.innerHTML = `<div style="padding:48px;color:var(--muted);text-align:center;grid-column:1/-1">No lessons available.</div>`;
      return;
    }
    lessonsEl.innerHTML = list.map(l => {
      const vid = ytId(l.youtube_url);
      const thumb = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '';
      const sc = Number(l.sentence_count || 0);
      const pc = Number(l.practiced_count || 0);
      const pct = sc > 0 ? Math.round((pc / sc) * 100) : 0;
      return `
        <a class="card lesson-card" href="/shadowing-lesson.html?id=${l.id}">
          <div class="lesson-thumb">
            ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<div class="lesson-thumb-fallback">No preview</div>'}
            ${l.completed ? '<span class="lesson-thumb-badge">Completed ✓</span>' : ''}
          </div>
          <div class="card-head">
            <div class="card-title">${esc(l.title)}</div>
            <span class="badge badge-level-${l.level}">${esc(l.level)}</span>
          </div>
          <div class="card-meta">${esc(l.duration || '')}${l.topic ? ' · ' + esc(l.topic) : ''}${sc ? ` · ${sc} sentences` : ''}</div>
          ${sc > 0 ? `
            <div class="lesson-card-progress">
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
              <span class="progress-pct">${pct}%</span>
            </div>` : ''}
        </a>`;
    }).join('');
  }

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    level = btn.getAttribute('data-level');
    render();
  });

  load();
})();
