// Pronunciation Drills page — premium dark UI, 9 drill cards for Uzbek
// learners. Click a card to open the detail sheet with:
//   - level + category badges
//   - short explanation
//   - example chips
//   - in-browser recorder (record → playback → re-record)
//   - "I've practised this" button which calls /api/drills/:slug/practise
//     and bumps the user's practice counter + streak + badge checks.

(async function () {
  const grid       = document.getElementById('drills');
  const filtersEl  = document.getElementById('filters');
  const modalEl    = document.getElementById('drill-modal');
  const modalBody  = document.getElementById('drill-modal-inner');
  const toastEl    = document.getElementById('toast-stack');

  const user = await window.loadCurrentUser();
  if (user) {
    const signin = document.getElementById('nav-signin');
    const cta = document.getElementById('nav-cta');
    if (signin) signin.style.display = 'none';
    if (cta) { cta.textContent = 'Dashboard'; cta.setAttribute('href', '/dashboard.html'); }
  }

  let drills = [];
  let activeCat = 'all';

  async function load() {
    if (!user) {
      // The /api/drills endpoint is auth-gated. Show a sign-in prompt instead
      // of an empty list when the visitor isn't signed in.
      grid.innerHTML = `
        <div class="drills-signin">
          <h2>Sign in to start drilling</h2>
          <p>Pronunciation drills are part of your speaking practice account.</p>
          <div class="drills-signin-actions">
            <a class="btn btn-primary" href="/login.html">Sign in</a>
            <a class="btn btn-ghost" href="/register.html">Create account</a>
          </div>
        </div>`;
      return;
    }
    const { ok, data } = await window.api('/api/drills');
    drills = ok ? (data.drills || []) : [];
    render();
  }

  function render() {
    const list = activeCat === 'all' ? drills : drills.filter(d => d.category === activeCat);
    if (list.length === 0) {
      grid.innerHTML = `<div class="topics-empty">No drills match that filter.</div>`;
      return;
    }
    grid.innerHTML = list.map(d => `
      <article class="drill-card" data-slug="${escape(d.slug)}" tabindex="0" role="button" aria-label="Open ${escape(d.title)}">
        <div class="drill-card-head">
          <span class="badge badge-level-${escape(d.level)}">${escape(d.level)}</span>
          <span class="drill-card-cat">${escape(d.category)}</span>
        </div>
        <h3 class="drill-card-title">${escape(d.title)}</h3>
        <p class="drill-card-desc">${escape(truncate(d.explanation, 110))}</p>
        <div class="drill-card-footer">
          <span class="drill-card-count">${Number(d.practice_count || 0)} practised</span>
          <span class="topic-card-cta">Open →</span>
        </div>
      </article>
    `).join('');
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  // ----- Filters -----
  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.getAttribute('data-cat');
    render();
  });

  // ----- Card open -----
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-slug]');
    if (!card) return;
    openDrill(card.getAttribute('data-slug'));
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-slug]');
    if (!card) return;
    e.preventDefault();
    openDrill(card.getAttribute('data-slug'));
  });

  let currentRecorder = null;

  async function openDrill(slug) {
    const { ok, data } = await window.api(`/api/drills/${encodeURIComponent(slug)}`);
    if (!ok || !data.drill) { toast('Could not load drill', 'error'); return; }
    const d = data.drill;
    modalBody.innerHTML = renderDrillDetail(d);
    wireDrillDetail(d);
    modalEl.hidden = false;
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => modalEl.classList.add('open'));
  }

  function closeModal() {
    modalEl.classList.remove('open');
    setTimeout(() => {
      modalEl.hidden = true;
      modalEl.setAttribute('aria-hidden', 'true');
      modalBody.innerHTML = '';
      document.body.classList.remove('modal-open');
    }, 180);
    if (currentRecorder) { currentRecorder.dispose(); currentRecorder = null; }
  }
  modalEl.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) closeModal();
  });

  function renderDrillDetail(d) {
    const examples = Array.isArray(d.examples) ? d.examples : [];
    return `
      <header class="tm-head">
        <div class="tm-head-meta">
          <span class="badge badge-level-${escape(d.level)}">${escape(d.level)}</span>
          <span class="tm-cat">${escape(d.category)}</span>
        </div>
        <h2 id="dm-title">${escape(d.title)}</h2>
      </header>

      <div class="drill-detail">
        <section class="drill-rule">
          <div class="practice-eyebrow">Rule</div>
          <p>${escape(d.explanation || '')}</p>
        </section>

        <section class="drill-examples">
          <div class="practice-eyebrow">Try saying</div>
          <ul class="tm-chip-list">
            ${examples.map(ex => `<li class="tm-chip drill-chip">${escape(ex)}</li>`).join('')}
          </ul>
        </section>

        <section class="drill-practice">
          <div class="practice-eyebrow">Your turn</div>
          <p class="practice-hint">Record yourself saying the examples, then listen back and compare. When you're happy, mark the drill as practised.</p>
          <div class="practice-controls">
            <button class="btn btn-primary" id="dr-rec">Start recording</button>
            <button class="btn btn-ghost" id="dr-done">I've practised this${d.practice_count ? ` · ${d.practice_count}× so far` : ''}</button>
          </div>
          <div class="recorder-block" id="dr-recorder" hidden></div>
        </section>
      </div>
    `;
  }

  function wireDrillDetail(d) {
    const recBtn   = modalBody.querySelector('#dr-rec');
    const doneBtn  = modalBody.querySelector('#dr-done');
    const recHost  = modalBody.querySelector('#dr-recorder');

    recBtn.addEventListener('click', async () => {
      if (currentRecorder) {
        // stop branch
        const blob = await currentRecorder.stop();
        currentRecorder = null;
        recBtn.textContent = 'Start recording';
        mountPlayback(recHost, blob);
        return;
      }
      // start branch
      const rec = await Recorder.start();
      if (!rec) { toast('Microphone access denied', 'error'); return; }
      currentRecorder = rec;
      recBtn.textContent = 'Stop recording';
      recHost.hidden = true;
      recHost.innerHTML = '';
    });

    doneBtn.addEventListener('click', async () => {
      doneBtn.disabled = true;
      const orig = doneBtn.textContent;
      doneBtn.textContent = 'Saving…';
      try {
        const res = await window.api(`/api/drills/${encodeURIComponent(d.slug)}/practise`, { method: 'POST' });
        if (!res.ok) throw new Error('Save failed');
        toast('Nice — drill marked as practised.', 'success');
        (res.data.new_badges || []).forEach(slug => toast(`Badge unlocked: ${slug.replace(/-/g, ' ')}`, 'badge'));
        // Bump the local card counter
        const card = grid.querySelector(`[data-slug="${cssEscape(d.slug)}"] .drill-card-count`);
        if (card) {
          const m = card.textContent.match(/(\d+)/);
          const n = m ? Number(m[1]) + 1 : 1;
          card.textContent = `${n} practised`;
        }
        closeModal();
      } catch (e) {
        doneBtn.disabled = false;
        doneBtn.textContent = orig;
        toast('Could not save practice', 'error');
      }
    });
  }

  function mountPlayback(host, blob) {
    const url = URL.createObjectURL(blob);
    host.hidden = false;
    host.innerHTML = `
      <div class="recorder-bar">
        <audio class="recorder-audio" controls src="${url}"></audio>
        <p class="recorder-hint">Listen back and compare against the examples. Re-record any time.</p>
      </div>
    `;
  }

  // =========================================================
  // Recorder — same shape as topics.js
  // =========================================================
  const Recorder = {
    async start() {
      if (!navigator.mediaDevices || !window.MediaRecorder) return null;
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { return null; }
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      mr.addEventListener('dataavailable', e => { if (e.data && e.data.size > 0) chunks.push(e.data); });
      mr.start();

      let stopped = null;
      return {
        stop() {
          if (stopped) return stopped;
          stopped = new Promise(resolve => {
            mr.addEventListener('stop', () => {
              stream.getTracks().forEach(t => t.stop());
              resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
            }, { once: true });
            mr.stop();
          });
          return stopped;
        },
        dispose() {
          try { mr.stop(); } catch {}
          try { stream.getTracks().forEach(t => t.stop()); } catch {}
        }
      };

      function pickMime() {
        const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        for (const c of candidates) {
          if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(c)) return c;
        }
        return '';
      }
    }
  };

  // =========================================================
  // Toasts
  // =========================================================
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

  // =========================================================
  // Utils
  // =========================================================
  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c);
  }

  load();
})();
