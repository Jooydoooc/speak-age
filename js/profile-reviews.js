// Teacher review inbox — lives in the Reviews tab inside /profile.html.
// Exposes window.loadReviewInbox() which profile.js calls when the tab is
// first opened. Filters by status, renders an inline detail panel with the
// audio player + 5 sub-score sliders + estimated band + written feedback +
// status radio. Submits to POST /api/recordings/:id/feedback.

(function () {
  const inboxEl   = document.getElementById('review-inbox');
  const filtersEl = document.getElementById('review-filters');
  if (!inboxEl || !filtersEl) return; // not on profile page

  let cache  = [];
  let status = 'all';
  let loaded = false;

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    status = btn.getAttribute('data-status');
    refresh();
  });

  async function refresh() {
    const q = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    inboxEl.innerHTML = `<div class="review-empty">Loading…</div>`;
    const { ok, data } = await window.api(`/api/recordings${q}`);
    if (!ok) { inboxEl.innerHTML = `<div class="review-empty">Could not load recordings.</div>`; return; }
    cache = data.recordings || [];
    render();
  }

  function render() {
    if (cache.length === 0) {
      inboxEl.innerHTML = `<div class="review-empty">No recordings to show.</div>`;
      return;
    }
    inboxEl.innerHTML = cache.map(r => `
      <details class="review-card" data-rec-id="${r.id}">
        <summary>
          <div class="review-row">
            <div class="review-row-main">
              <div class="review-row-title">${escape(r.student_name || r.student_email || 'Unknown student')}</div>
              <div class="review-row-meta">
                ${r.topic_title ? `${escape(r.topic_title)} · ` : ''}
                ${r.part ? `Part ${r.part} · ` : ''}
                ${r.duration_sec ? `${r.duration_sec}s · ` : ''}
                ${escape(formatDate(r.created_at))}
              </div>
            </div>
            <span class="review-status review-status-${r.status}">${labelStatus(r.status)}</span>
          </div>
        </summary>
        <div class="review-detail" data-detail-for="${r.id}"></div>
      </details>
    `).join('');

    // Lazy-fill detail panel when a card is opened.
    inboxEl.querySelectorAll('.review-card').forEach(card => {
      card.addEventListener('toggle', async () => {
        if (!card.open) return;
        const id = card.getAttribute('data-rec-id');
        const host = card.querySelector('.review-detail');
        if (host.dataset.loaded) return;
        host.innerHTML = `<div class="review-empty">Loading…</div>`;
        const { ok, data } = await window.api(`/api/recordings/${id}`);
        if (!ok || !data.recording) { host.innerHTML = `<div class="review-empty">Could not load this recording.</div>`; return; }
        host.dataset.loaded = '1';
        renderDetail(host, data.recording);
      });
    });
  }

  function renderDetail(host, r) {
    const f = {
      fluency:       r.fluency,
      pronunciation: r.pronunciation,
      grammar:       r.grammar,
      vocabulary:    r.vocabulary,
      coherence:     r.coherence
    };
    const band = r.estimated_band != null ? Number(r.estimated_band) : '';

    host.innerHTML = `
      <div class="review-grid">
        <div class="review-grid-left">
          ${r.topic_questions ? `<div class="review-cue"><div class="practice-eyebrow">Prompt</div><p>${escape(r.topic_questions).replace(/\n+/g,'<br>')}</p></div>` : ''}
          <audio class="recorder-audio" controls preload="metadata" src="${escape(r.cloudinary_url)}"></audio>
          ${r.reviewer_name ? `<p class="review-prev-meta">Last reviewed by ${escape(r.reviewer_name)} · ${escape(formatDate(r.reviewed_at))}</p>` : ''}
        </div>

        <form class="review-form" data-rec-id="${r.id}">
          ${renderSlider('fluency',       'Fluency',       f.fluency)}
          ${renderSlider('pronunciation', 'Pronunciation', f.pronunciation)}
          ${renderSlider('grammar',       'Grammar',       f.grammar)}
          ${renderSlider('vocabulary',    'Vocabulary',    f.vocabulary)}
          ${renderSlider('coherence',     'Coherence',     f.coherence)}

          <label class="review-field">
            <span class="review-field-label">Estimated band</span>
            <input type="number" name="estimated_band" min="0" max="9" step="0.5" value="${band}" />
          </label>

          <label class="review-field">
            <span class="review-field-label">Written feedback</span>
            <textarea name="written_feedback" rows="4" maxlength="4000" placeholder="What went well, what to work on, examples…">${escape(r.written_feedback || '')}</textarea>
          </label>

          <fieldset class="review-status-group">
            <legend>Status</legend>
            <label><input type="radio" name="status" value="reviewed" checked> Reviewed</label>
            <label><input type="radio" name="status" value="needs_improvement"> Needs improvement</label>
          </fieldset>

          <div class="review-form-msg" hidden></div>
          <div class="review-form-actions">
            <button type="submit" class="btn btn-primary">Save feedback</button>
          </div>
        </form>
      </div>
    `;

    // Slider value mirrors
    host.querySelectorAll('.review-slider input[type=range]').forEach(input => {
      const out = input.parentNode.querySelector('output');
      out.textContent = input.value;
      input.addEventListener('input', () => {
        out.textContent = input.value;
        autoEstimateBand(host);
      });
    });
    autoEstimateBand(host);

    host.querySelector('.review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const msg  = form.querySelector('.review-form-msg');
      msg.hidden = true;
      const body = {
        fluency:          numOrNull(form.fluency.value),
        pronunciation:    numOrNull(form.pronunciation.value),
        grammar:          numOrNull(form.grammar.value),
        vocabulary:       numOrNull(form.vocabulary.value),
        coherence:        numOrNull(form.coherence.value),
        estimated_band:   form.estimated_band.value === '' ? null : Number(form.estimated_band.value),
        written_feedback: form.written_feedback.value,
        status:           form.status.value
      };
      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
      const { ok, data } = await window.api(`/api/recordings/${r.id}/feedback`, { method: 'POST', body });
      submitBtn.disabled = false; submitBtn.textContent = 'Save feedback';
      if (!ok) {
        msg.hidden = false;
        msg.className = 'review-form-msg review-form-msg-error';
        msg.textContent = (data && data.error) || 'Could not save feedback';
        return;
      }
      msg.hidden = false;
      msg.className = 'review-form-msg review-form-msg-success';
      msg.textContent = 'Saved — student will see the update on their dashboard.';
      toast('Feedback saved.', 'success');
      // Update the card status pill
      const card = host.closest('.review-card');
      const pill = card.querySelector('.review-status');
      pill.className = `review-status review-status-${body.status}`;
      pill.textContent = labelStatus(body.status);
    });
  }

  function renderSlider(name, label, value) {
    const v = (value == null || value === '') ? 5 : Number(value);
    return `
      <label class="review-slider">
        <div class="review-slider-head">
          <span class="review-field-label">${label}</span>
          <output>${v}</output>
        </div>
        <input type="range" name="${name}" min="0" max="9" step="1" value="${v}" />
      </label>
    `;
  }

  // When a slider moves, auto-fill the estimated band as the average of the
  // five sub-scores (rounded to nearest 0.5) — teachers can override.
  function autoEstimateBand(host) {
    const fields = ['fluency', 'pronunciation', 'grammar', 'vocabulary', 'coherence'];
    const form = host.querySelector('.review-form');
    if (!form) return;
    let sum = 0;
    for (const k of fields) sum += Number(form[k].value);
    const avg = sum / fields.length;
    const rounded = Math.round(avg * 2) / 2;
    // Only auto-set if the field is empty or hasn't been touched manually.
    const bandInput = form.estimated_band;
    if (!bandInput.dataset.touched) bandInput.value = rounded.toFixed(1);
  }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function labelStatus(s) {
    return s === 'reviewed'          ? 'Reviewed'
         : s === 'needs_improvement' ? 'Needs improvement'
         : 'Submitted';
  }
  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }
  function escape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function toast(msg, kind = 'info') {
    const host = document.getElementById('toast-stack');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    setTimeout(() => { el.classList.remove('open'); setTimeout(() => el.remove(), 250); }, 3000);
  }

  // Exposed for profile.js lazy-load.
  window.loadReviewInbox = function () {
    if (loaded) return;
    loaded = true;
    refresh();
  };
})();
