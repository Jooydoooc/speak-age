// Topics page — premium speaking practice.
//
//   - Clean topic cards with part + category badges.
//   - Click a card to open the detail modal with 6 tabs:
//     Questions / Vocabulary / Mistakes / Follow-ups / Band 6.5 / Band 8.0.
//   - "Practice" button starts a focused recording flow:
//       * Part 1 / Part 3 — question wheel with optional 30s thinking timer.
//       * Part 2         — 1-minute prep ring, then 2-minute speaking ring
//                          with the recorder running.
//   - Every recording is uploaded to /api/recordings and goes into the
//     teacher review queue.

(async function () {
  const cardsEl   = document.getElementById('cards');
  const searchEl  = document.getElementById('search');
  const filtersEl = document.getElementById('filters');
  const modalEl   = document.getElementById('topic-modal');
  const modalBody = document.getElementById('topic-modal-inner');
  const toastEl   = document.getElementById('toast-stack');

  const user = await window.loadCurrentUser();
  if (user) {
    const signin = document.getElementById('nav-signin');
    const cta = document.getElementById('nav-cta');
    if (signin) signin.style.display = 'none';
    if (cta) { cta.textContent = 'Dashboard'; cta.setAttribute('href', '/dashboard.html'); }
  }

  let allTopics = [];
  let activePart = 'all';
  let activeCat = null;
  let query = '';

  // ===== Data =====
  async function load() {
    const { ok, data } = await window.api('/api/topics');
    allTopics = ok ? (data.topics || []) : [];
    renderCards();
  }

  // ===== Cards grid =====
  function renderCards() {
    const filtered = allTopics.filter(t => {
      if (activePart !== 'all' && String(t.part) !== String(activePart)) return false;
      if (activeCat && t.category !== activeCat) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = (t.title + ' ' + t.questions + ' ' + t.category).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      cardsEl.innerHTML = `<div class="topics-empty">No topics match your filters.</div>`;
      return;
    }

    cardsEl.innerHTML = filtered.map(t => {
      const questionCount = String(t.questions || '').split(/\n+/).filter(Boolean).length;
      const previewLine = String(t.questions || '').split(/\n+/).filter(Boolean)[0] || '';
      return `
        <article class="topic-card" data-topic-id="${t.id}" tabindex="0" role="button" aria-label="Open ${escape(t.title)}">
          <div class="topic-card-head">
            <span class="badge badge-part${t.part}">Part ${t.part}</span>
            <span class="topic-card-cat">${escape(t.category)}</span>
          </div>
          <h3 class="topic-card-title">${escape(t.title)}</h3>
          <p class="topic-card-preview">${escape(previewLine)}</p>
          <div class="topic-card-footer">
            <span class="topic-card-count">${questionCount} ${questionCount === 1 ? 'question' : 'questions'}</span>
            <span class="topic-card-cta">${user ? 'Open' : 'Sign in'} →</span>
          </div>
        </article>
      `;
    }).join('');
  }

  // ===== Filter clicks + search =====
  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-filter')) {
      filtersEl.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePart = btn.getAttribute('data-filter');
    } else if (btn.hasAttribute('data-cat')) {
      const cat = btn.getAttribute('data-cat');
      if (activeCat === cat) { btn.classList.remove('active'); activeCat = null; }
      else {
        filtersEl.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); activeCat = cat;
      }
    }
    renderCards();
  });
  searchEl.addEventListener('input', (e) => { query = e.target.value; renderCards(); });

  // ===== Card open =====
  cardsEl.addEventListener('click', (e) => {
    const card = e.target.closest('[data-topic-id]');
    if (!card) return;
    onCardOpen(Number(card.getAttribute('data-topic-id')));
  });
  cardsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-topic-id]');
    if (!card) return;
    e.preventDefault();
    onCardOpen(Number(card.getAttribute('data-topic-id')));
  });

  async function onCardOpen(id) {
    if (!user) { window.location.href = '/login.html'; return; }
    const { ok, data } = await window.api(`/api/topics/${id}`);
    if (!ok || !data.topic) { toast('Could not load topic', 'error'); return; }
    openTopicModal(data.topic);
  }

  // ===== Modal =====
  let currentRecorder = null;
  let currentTicker = null;

  function openTopicModal(topic) {
    modalBody.innerHTML = renderTopicDetail(topic);
    wireTopicDetail(topic);
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
    if (currentTicker)   { clearInterval(currentTicker); currentTicker = null; }
  }
  modalEl.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) closeModal();
  });

  // ===== Topic detail HTML =====
  function renderTopicDetail(t) {
    const questions = String(t.questions || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const followups = String(t.followup_questions || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const vocab     = String(t.useful_vocabulary || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const mistakes  = String(t.common_mistakes || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

    const tabs = [
      ['questions', 'Questions',    questions.length],
      ['vocab',     'Vocabulary',   vocab.length],
      ['mistakes',  'Mistakes',     mistakes.length],
      ['follow',    'Follow-ups',   followups.length],
      ['ans65',     'Band 6.5',     t.answer_65 ? 1 : 0],
      ['ans80',     'Band 8.0',     t.answer_80 ? 1 : 0]
    ];

    const tabBar = tabs.map((tb, i) => `
      <button class="tm-tab${i === 0 ? ' active' : ''}" data-tab="${tb[0]}">
        ${tb[1]} <span class="tm-tab-count">${tb[2]}</span>
      </button>
    `).join('');

    return `
      <header class="tm-head">
        <div class="tm-head-meta">
          <span class="badge badge-part${t.part}">Part ${t.part}</span>
          <span class="tm-cat">${escape(t.category)}</span>
        </div>
        <h2 id="tm-title">${escape(t.title)}</h2>
        <div class="tm-head-actions">
          <button class="btn btn-primary tm-practice" data-practice="${t.id}">
            ${t.part === 2 ? 'Start Part 2 practice' : 'Start practice'}
          </button>
        </div>
      </header>

      <div class="tm-tabs" role="tablist">${tabBar}</div>

      <div class="tm-panels">
        <div class="tm-panel active" data-panel="questions">
          ${questions.length
            ? `<ol class="tm-q-list">${questions.map(q => `<li>${escape(q)}</li>`).join('')}</ol>`
            : `<p class="tm-empty">No questions yet.</p>`}
        </div>
        <div class="tm-panel" data-panel="vocab">
          ${vocab.length
            ? `<ul class="tm-chip-list">${vocab.map(v => `<li class="tm-chip">${escape(v)}</li>`).join('')}</ul>`
            : `<p class="tm-empty">No vocabulary added yet.</p>`}
        </div>
        <div class="tm-panel" data-panel="mistakes">
          ${mistakes.length
            ? `<ul class="tm-bullets tm-mistakes">${mistakes.map(m => `<li>${escape(m)}</li>`).join('')}</ul>`
            : `<p class="tm-empty">No common mistakes added yet.</p>`}
        </div>
        <div class="tm-panel" data-panel="follow">
          ${followups.length
            ? `<ol class="tm-q-list">${followups.map(q => `<li>${escape(q)}</li>`).join('')}</ol>`
            : `<p class="tm-empty">No follow-up questions yet.</p>`}
        </div>
        <div class="tm-panel" data-panel="ans65">
          ${t.answer_65
            ? `<div class="tm-answer">${escape(t.answer_65).replace(/\n+/g, '<br><br>')}</div>`
            : `<p class="tm-empty">No band 6.5 answer yet.</p>`}
        </div>
        <div class="tm-panel" data-panel="ans80">
          ${t.answer_80
            ? `<div class="tm-answer">${escape(t.answer_80).replace(/\n+/g, '<br><br>')}</div>`
            : `<p class="tm-empty">No band 8.0 answer yet.</p>`}
        </div>
      </div>

      <!-- Practice surface — populated when "Start practice" is clicked -->
      <div class="tm-practice-surface" id="practice-surface" hidden></div>
    `;
  }

  function wireTopicDetail(t) {
    // Tab switching
    const tabs   = modalBody.querySelectorAll('.tm-tab');
    const panels = modalBody.querySelectorAll('.tm-panel');
    tabs.forEach(tb => tb.addEventListener('click', () => {
      const key = tb.getAttribute('data-tab');
      tabs.forEach(x => x.classList.toggle('active', x === tb));
      panels.forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === key));
    }));

    // Practice button
    const practiceBtn = modalBody.querySelector('.tm-practice');
    practiceBtn.addEventListener('click', () => startPractice(t));
  }

  // =========================================================
  // Practice flows
  // =========================================================

  function startPractice(t) {
    const surface = modalBody.querySelector('#practice-surface');
    surface.hidden = false;
    surface.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (t.part === 2) startPart2(t, surface);
    else              startPart1or3(t, surface);
  }

  // ----- Part 2 — cue card flow -----
  function startPart2(t, surface) {
    surface.innerHTML = `
      <div class="practice-card">
        <div class="practice-eyebrow">Part 2 · Long turn</div>
        <h3 class="practice-q">${escape(t.title)}</h3>
        <p class="practice-cue">${escape(t.questions || '').replace(/\n+/g, '<br>')}</p>

        <div class="timer-block">
          <div class="timer-ring-wrap">
            ${ringSvg('p2-ring')}
            <div class="timer-ring-label" id="p2-label">Prep<br><span id="p2-time">1:00</span></div>
          </div>
          <div class="practice-controls">
            <button class="btn btn-primary" id="p2-start">Start preparation</button>
            <button class="btn btn-ghost" id="p2-skip" hidden>Skip prep</button>
            <button class="btn btn-ghost" id="p2-stop" hidden>Stop speaking</button>
          </div>
          <p class="practice-hint" id="p2-hint">Tap start when you're ready. You get 1 minute to plan, then 2 minutes to speak.</p>
        </div>

        <div class="recorder-block" id="p2-recorder" hidden></div>
      </div>
    `;

    const startBtn = surface.querySelector('#p2-start');
    const skipBtn  = surface.querySelector('#p2-skip');
    const stopBtn  = surface.querySelector('#p2-stop');
    const label    = surface.querySelector('#p2-label');
    const timeEl   = surface.querySelector('#p2-time');
    const hintEl   = surface.querySelector('#p2-hint');
    const recHost  = surface.querySelector('#p2-recorder');

    let phase = 'idle';
    let blob  = null;

    startBtn.addEventListener('click', () => beginPrep());
    skipBtn .addEventListener('click', () => beginSpeak());
    stopBtn .addEventListener('click', () => endSpeak());

    function beginPrep() {
      phase = 'prep';
      startBtn.hidden = true;
      skipBtn.hidden = false;
      hintEl.textContent = 'You can plan an answer using the cue card prompts.';
      countdown(60, (sec, pct) => {
        label.innerHTML = `Prep<br><span>${fmtSec(sec)}</span>`;
        setRing('p2-ring', pct);
      }, () => beginSpeak());
    }

    async function beginSpeak() {
      if (currentTicker) clearInterval(currentTicker);
      phase = 'speak';
      skipBtn.hidden = true;
      stopBtn.hidden = false;
      hintEl.textContent = 'Speak for up to 2 minutes. The recorder is running.';
      setRing('p2-ring', 0);

      const rec = await Recorder.start();
      if (!rec) {
        toast('Microphone access denied', 'error');
        return resetUi();
      }
      currentRecorder = rec;

      countdown(120, (sec, pct) => {
        label.innerHTML = `Speaking<br><span>${fmtSec(sec)}</span>`;
        setRing('p2-ring', pct);
      }, () => endSpeak());
    }

    async function endSpeak() {
      if (currentTicker) { clearInterval(currentTicker); currentTicker = null; }
      stopBtn.hidden = true;
      hintEl.textContent = 'Listen back, then submit to your teacher when ready.';
      if (!currentRecorder) return;
      blob = await currentRecorder.stop();
      currentRecorder = null;
      mountPlayback(recHost, blob, { topic_id: t.id, part: 2 }, () => {
        // After submit, allow another take
        resetUi();
      });
    }

    function resetUi() {
      phase = 'idle';
      startBtn.hidden = false;
      skipBtn.hidden = true;
      stopBtn.hidden = true;
      setRing('p2-ring', 0);
      label.innerHTML = `Prep<br><span>1:00</span>`;
      hintEl.textContent = 'Tap start when you\'re ready. You get 1 minute to plan, then 2 minutes to speak.';
    }
  }

  // ----- Part 1 / Part 3 — question wheel -----
  function startPart1or3(t, surface) {
    const all = String(t.questions || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (all.length === 0) {
      surface.innerHTML = `<p class="tm-empty">No questions to practise yet.</p>`;
      return;
    }
    // Shuffle
    const order = [...all.keys()].sort(() => Math.random() - 0.5);
    let i = 0;

    const part = t.part;
    surface.innerHTML = `
      <div class="practice-card">
        <div class="practice-eyebrow">Part ${part} · Practice mode</div>
        <div class="practice-progress"><span id="pq-step">1</span> of ${all.length}</div>
        <h3 class="practice-q" id="pq-text">${escape(all[order[0]])}</h3>

        <div class="practice-controls" id="pq-controls">
          <button class="btn btn-primary" id="pq-think">30s think</button>
          <button class="btn btn-primary" id="pq-record">Record answer</button>
          <button class="btn btn-ghost" id="pq-skip">Skip</button>
        </div>
        <p class="practice-hint" id="pq-hint">Take a moment to plan, then record your answer.</p>

        <div class="thinking-ring" id="pq-think-ring" hidden>
          ${ringSvg('pq-ring')}
          <div class="timer-ring-label" id="pq-label">Think<br><span id="pq-time">0:30</span></div>
        </div>

        <div class="recorder-block" id="pq-recorder" hidden></div>
      </div>
    `;

    const stepEl    = surface.querySelector('#pq-step');
    const qText     = surface.querySelector('#pq-text');
    const thinkBtn  = surface.querySelector('#pq-think');
    const recordBtn = surface.querySelector('#pq-record');
    const skipBtn   = surface.querySelector('#pq-skip');
    const thinkRing = surface.querySelector('#pq-think-ring');
    const ringLabel = surface.querySelector('#pq-label');
    const ringTime  = surface.querySelector('#pq-time');
    const recHost   = surface.querySelector('#pq-recorder');

    thinkBtn .addEventListener('click', () => doThink());
    recordBtn.addEventListener('click', () => doRecord());
    skipBtn  .addEventListener('click', () => nextQ());

    function nextQ() {
      i++;
      if (i >= order.length) {
        surface.innerHTML = `
          <div class="practice-card">
            <div class="practice-eyebrow">All done</div>
            <h3 class="practice-q">Great work — you've practised every question for this topic.</h3>
            <div class="practice-controls">
              <button class="btn btn-primary" id="pq-restart">Practise again</button>
            </div>
          </div>
        `;
        surface.querySelector('#pq-restart').addEventListener('click', () => startPart1or3(t, surface));
        return;
      }
      stepEl.textContent = i + 1;
      qText.textContent = all[order[i]];
      thinkRing.hidden = true;
      recHost.hidden = true;
      recHost.innerHTML = '';
      setRing('pq-ring', 0);
    }

    function doThink() {
      thinkRing.hidden = false;
      countdown(30, (sec, pct) => {
        ringLabel.innerHTML = `Think<br><span>${fmtSec(sec)}</span>`;
        setRing('pq-ring', pct);
      }, () => {
        ringLabel.innerHTML = `Ready<br><span>0:00</span>`;
      });
    }

    async function doRecord() {
      if (currentTicker) { clearInterval(currentTicker); currentTicker = null; }
      const rec = await Recorder.start();
      if (!rec) { toast('Microphone access denied', 'error'); return; }
      currentRecorder = rec;
      recordBtn.disabled = true;
      thinkBtn.disabled = true;
      skipBtn.disabled = true;
      recordBtn.textContent = 'Stop recording';
      const stopOnce = async () => {
        recordBtn.removeEventListener('click', stopOnce);
        const blob = await currentRecorder.stop();
        currentRecorder = null;
        recordBtn.disabled = false;
        thinkBtn.disabled = false;
        skipBtn.disabled = false;
        recordBtn.textContent = 'Record answer';
        mountPlayback(recHost, blob, { topic_id: t.id, part }, () => nextQ());
      };
      recordBtn.addEventListener('click', stopOnce, { once: true });
    }
  }

  // =========================================================
  // Recorder
  // =========================================================

  const Recorder = {
    /**
     * Begin recording. Returns an object { stop() -> Promise<Blob> } or null if
     * mic permission was denied / MediaRecorder isn't supported.
     */
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

  function mountPlayback(host, blob, meta, onSubmitted) {
    const url = URL.createObjectURL(blob);
    host.hidden = false;
    host.innerHTML = `
      <div class="recorder-bar">
        <audio class="recorder-audio" controls src="${url}"></audio>
        <div class="recorder-actions">
          <button class="btn btn-ghost" data-act="discard">Re-record</button>
          <button class="btn btn-primary" data-act="submit">Submit to teacher</button>
        </div>
        <p class="recorder-hint">Recordings are uploaded securely and reviewed by your teacher.</p>
      </div>
    `;
    host.querySelector('[data-act="discard"]').addEventListener('click', () => {
      URL.revokeObjectURL(url);
      host.hidden = true;
      host.innerHTML = '';
    });
    host.querySelector('[data-act="submit"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        const ext = (blob.type.match(/audio\/([a-z0-9]+)/i) || [, 'webm'])[1];
        const fd = new FormData();
        fd.append('audio', new File([blob], `recording.${ext}`, { type: blob.type }));
        if (meta.topic_id) fd.append('topic_id', String(meta.topic_id));
        if (meta.part)     fd.append('part', String(meta.part));
        const res = await fetch('/api/recordings', { method: 'POST', body: fd, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        toast('Submitted — your teacher will review it.', 'success');
        (data.new_badges || []).forEach(slug => toast(`Badge unlocked: ${slug.replace(/-/g, ' ')}`, 'badge'));
        URL.revokeObjectURL(url);
        host.hidden = true;
        host.innerHTML = '';
        if (typeof onSubmitted === 'function') onSubmitted();
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Submit to teacher';
        toast(err.message || 'Upload failed', 'error');
      }
    });
  }

  // =========================================================
  // Timer ring helpers
  // =========================================================

  // Render an SVG circle that we'll animate via stroke-dashoffset.
  function ringSvg(id) {
    return `
      <svg class="timer-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="timer-ring-track" cx="60" cy="60" r="54" />
        <circle class="timer-ring-fill"  cx="60" cy="60" r="54" id="${id}" />
      </svg>
    `;
  }
  // pct = 0..1 of *elapsed* time
  function setRing(id, pct) {
    const c = document.getElementById(id);
    if (!c) return;
    const C = 2 * Math.PI * 54;
    c.style.strokeDasharray  = String(C);
    c.style.strokeDashoffset = String(C * pct);
  }

  // Generic countdown: calls onTick(secondsLeft, elapsedPct) every 100ms, then
  // onDone() at 0. Stores the interval id on the shared `currentTicker` slot
  // so the modal close can cancel it.
  function countdown(totalSec, onTick, onDone) {
    if (currentTicker) clearInterval(currentTicker);
    const start = Date.now();
    const total = totalSec * 1000;
    onTick(totalSec, 0);
    currentTicker = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / total);
      const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
      onTick(left, pct);
      if (elapsed >= total) {
        clearInterval(currentTicker);
        currentTicker = null;
        onDone();
      }
    }, 100);
  }

  function fmtSec(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

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
    }, 3800);
  }

  // =========================================================
  // Utils
  // =========================================================
  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  load();
})();
