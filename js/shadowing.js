// Shadowing list — students only. Cards link to /shadowing-lesson.html?id=N.
// Filters by level (sidebar), full-text search, and sort (newest / oldest / A-Z).

(async function () {
  const user = await window.requireAuth();
  if (!user) return;

  const lessonsEl = document.getElementById('lessons');
  const filtersEl = document.getElementById('filters');
  const searchEl  = document.getElementById('search');
  const sortEl    = document.getElementById('sort');

  let lessons = [];
  let level   = 'all';
  let query   = '';
  let sortBy  = 'newest';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function ytId(url) {
    const m = (url || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? m[1] : '';
  }

  // Best thumbnail for a lesson: YouTube maxres → stored thumbnail_url → '' (fallback tile).
  function thumbUrl(l) {
    const vid = ytId(l.youtube_url);
    if (vid) return `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`;
    return l.thumbnail_url || '';
  }

  // Embed markup for the preview modal — first 30s only.
  // YouTube: end=30 stops playback; Cloudinary/other: <video> capped via timeupdate (wired on open).
  function videoEmbed(l) {
    const vid = ytId(l.youtube_url);
    if (vid) {
      return `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&start=0&end=30&rel=0&modestbranding=1&playsinline=1" title="${esc(l.title)} preview" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }
    const src = l.video_url || l.cloudinary_url || '';
    if (src) return `<video src="${esc(src)}" autoplay muted controls playsinline></video>`;
    return '<div class="preview-modal-noembed">No preview available</div>';
  }

  function metaLine(l) {
    const sc = Number(l.sentence_count || 0);
    return [esc(l.topic || ''), esc(l.duration || ''), sc ? `${sc} sentences` : '']
      .filter(Boolean).join(' · ');
  }

  // Copy a lesson link to the clipboard (or open the native share sheet on mobile).
  function shareLesson(l, url) {
    if (navigator.share) {
      navigator.share({ title: l ? l.title : 'Shadowing lesson', url }).catch(() => {});
      return;
    }
    const done = () => window.toast && window.toast('Lesson link copied');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
    } else {
      fallbackCopy(url, done);
    }
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    cb && cb();
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
    let list = level === 'all' ? lessons.slice() : lessons.filter(l => l.level === level);

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(l => {
        const hay = ((l.title || '') + ' ' + (l.topic || '') + ' ' + (l.level || '')).toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort — API returns newest first by default; we re-sort client-side
    // because both other modes (oldest, A-Z) need it.
    list.sort((a, b) => {
      if (sortBy === 'az') return String(a.title || '').localeCompare(String(b.title || ''));
      const at = new Date(a.created_at).getTime() || 0;
      const bt = new Date(b.created_at).getTime() || 0;
      return sortBy === 'oldest' ? at - bt : bt - at;
    });

    if (list.length === 0) {
      lessonsEl.innerHTML = `<div class="shadowing-empty">${query ? 'No lessons match your search.' : 'No lessons available.'}</div>`;
      return;
    }
    lessonsEl.innerHTML = list.map(l => {
      const vid = ytId(l.youtube_url);
      const thumb = thumbUrl(l);
      const hq = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '';
      const sc = Number(l.sentence_count || 0);
      const pc = Number(l.practiced_count || 0);
      const pct = sc > 0 ? Math.round((pc / sc) * 100) : 0;
      const meta = metaLine(l);
      const cta = l.completed ? 'Review →' : (pct > 0 ? 'Continue →' : 'Start lesson →');
      return `
        <div class="card lesson-card" data-id="${l.id}">
          <button class="lesson-thumb" type="button" data-preview aria-label="Preview: ${esc(l.title)}">
            ${thumb
              ? `<img src="${esc(thumb)}" alt="" loading="lazy"${hq ? ` onerror="this.onerror=null;this.src='${hq}'"` : ''}>`
              : '<div class="lesson-thumb-fallback"></div>'}
            <span class="lesson-thumb-overlay"><span class="lesson-thumb-play" aria-hidden="true">▶</span></span>
            <span class="badge badge-level-${l.level} lesson-thumb-level">${esc(l.level)}</span>
            ${l.completed ? '<span class="lesson-thumb-badge">Completed ✓</span>' : ''}
          </button>
          <a class="lesson-card-body" href="/shadowing-lesson.html?id=${l.id}">
            <div class="card-title">${esc(l.title)}</div>
            ${meta ? `<div class="card-meta"><span class="card-meta-text">${meta}</span></div>` : ''}
            <div class="lesson-card-progress">
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
              <span class="progress-pct">${pct}%</span>
            </div>
          </a>
          <div class="lesson-card-actions">
            <button class="btn-preview" type="button" data-preview>▶ Preview</button>
            <a class="btn-start" href="/shadowing-lesson.html?id=${l.id}">${cta}</a>
            <button class="btn-share" type="button" data-share aria-label="Share lesson link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // ---------- Preview modal ----------
  let modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.className = 'preview-modal';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="preview-modal-overlay" data-preview-close></div>
      <div class="preview-modal-box" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div class="preview-modal-video" data-preview-video></div>
        <div class="preview-modal-info">
          <h3 class="preview-modal-title" id="preview-modal-title" data-preview-title></h3>
          <div class="preview-modal-meta" data-preview-meta></div>
        </div>
        <div class="preview-modal-actions">
          <button class="btn-preview-close" type="button" data-preview-close>✕ Close</button>
          <a class="btn-start" data-preview-start href="#">Start lesson →</a>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    modalEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-preview-close]')) closePreview();
    });
    return modalEl;
  }

  function openPreview(l) {
    const m = ensureModal();
    m.querySelector('[data-preview-video]').innerHTML = videoEmbed(l);
    m.querySelector('[data-preview-title]').textContent = l.title || 'Lesson';
    const meta = metaLine(l);
    m.querySelector('[data-preview-meta]').innerHTML =
      `<span class="badge badge-level-${l.level}">${esc(l.level)}</span>${meta ? `<span class="card-meta-text">· ${meta}</span>` : ''}`;
    m.querySelector('[data-preview-start]').setAttribute('href', `/shadowing-lesson.html?id=${l.id}`);
    // Cloudinary/other <video>: cap playback at 30s (YouTube uses end=30 in the URL).
    const v = m.querySelector('video');
    if (v) v.addEventListener('timeupdate', () => { if (v.currentTime >= 30) { v.pause(); } });
    m.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closePreview() {
    if (!modalEl || modalEl.hidden) return;
    modalEl.querySelector('[data-preview-video]').innerHTML = ''; // stop playback
    modalEl.hidden = true;
    document.body.classList.remove('modal-open');
  }

  // Card actions (event delegation): Share copies/shares the link; thumbnail
  // and Preview button open the preview modal. The body link + Start button are
  // plain anchors that navigate to the lesson player.
  lessonsEl.addEventListener('click', (e) => {
    const shareBtn = e.target.closest('[data-share]');
    if (shareBtn) {
      const card = shareBtn.closest('[data-id]');
      if (!card) return;
      const id = card.getAttribute('data-id');
      const lesson = lessons.find(l => String(l.id) === id);
      shareLesson(lesson, `${location.origin}/shadowing-lesson.html?id=${id}`);
      return;
    }
    const trigger = e.target.closest('[data-preview]');
    if (!trigger) return;
    const card = trigger.closest('[data-id]');
    if (!card) return;
    const lesson = lessons.find(l => String(l.id) === card.getAttribute('data-id'));
    if (lesson) openPreview(lesson);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    level = btn.getAttribute('data-level');
    render();
  });

  if (searchEl) searchEl.addEventListener('input', (e) => { query = e.target.value.trim(); render(); });
  if (sortEl)   sortEl.addEventListener('change', (e) => { sortBy = e.target.value; render(); });

  load();
})();
