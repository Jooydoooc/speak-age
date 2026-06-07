// Topics page — render cards from API, support filtering + search
// Sample answers (band 6.5 / 8.0) are gated to logged-in users.

(async function () {
  const cardsEl = document.getElementById('cards');
  const searchEl = document.getElementById('search');
  const filtersEl = document.getElementById('filters');

  const user = await window.loadCurrentUser();
  // When logged in, main.js replaces .nav-right with the profile avatar
  // dropdown, so the signin/cta links won't exist any more — guard the lookups.
  if (user) {
    const signin = document.getElementById('nav-signin');
    const cta = document.getElementById('nav-cta');
    if (signin) signin.style.display = 'none';
    if (cta) {
      cta.textContent = 'Dashboard';
      cta.setAttribute('href', '/dashboard.html');
    }
  }

  let allTopics = [];
  let activePart = 'all';
  let activeCat = null;
  let query = '';

  async function load() {
    const { ok, data } = await window.api('/api/topics');
    allTopics = ok ? (data.topics || []) : [];
    render();
  }

  function render() {
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
      cardsEl.innerHTML = `<div style="padding:48px;color:var(--muted);text-align:center;grid-column:1/-1">No topics match your filters.</div>`;
      return;
    }

    cardsEl.innerHTML = filtered.map((t, i) => `
      <article class="card">
        <div class="card-head">
          <div class="card-title">${escape(t.title)}</div>
          <span class="badge badge-part${t.part}">Part ${t.part}</span>
        </div>
        <div class="card-meta">${escape(t.category)}</div>
        <div class="card-body">${escape(t.questions).replace(/\n/g, '<br>')}</div>

        ${user ? `
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" data-show="65" data-idx="${i}">Band 6.5 answer</button>
            <button class="btn btn-ghost btn-sm" data-show="80" data-idx="${i}">Band 8.0 answer</button>
            ${t.part === 2 ? `<button class="btn btn-primary btn-sm" data-timer="${i}">2-min timer</button>` : ''}
          </div>
          <div class="answer-block" id="ans-${i}-65">${escape(t.answer_65 || '').replace(/\n/g,'<br>')}</div>
          <div class="answer-block" id="ans-${i}-80">${escape(t.answer_80 || '').replace(/\n/g,'<br>')}</div>
          <div class="answer-block" id="timer-${i}">
            <div style="font-size:32px;font-weight:600;font-feature-settings:'tnum';text-align:center" id="td-${i}">2:00</div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
              <button class="btn btn-primary btn-sm" data-tstart="${i}">Start</button>
              <button class="btn btn-ghost btn-sm" data-treset="${i}">Reset</button>
            </div>
          </div>
        ` : `
          <div class="locked-overlay">
            Sample answers locked. <a href="/login.html">Sign in</a> or <a href="/register.html">create a free account</a> to view band-graded answers.
          </div>
        `}
      </article>
    `).join('');

    if (user) wireCardActions(filtered);
  }

  const timers = {};
  function wireCardActions(list) {
    cardsEl.querySelectorAll('[data-show]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-idx');
        const which = btn.getAttribute('data-show');
        document.getElementById(`ans-${idx}-${which}`).classList.toggle('open');
      });
    });
    cardsEl.querySelectorAll('[data-timer]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-timer');
        document.getElementById(`timer-${idx}`).classList.toggle('open');
      });
    });
    cardsEl.querySelectorAll('[data-tstart]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-tstart');
        if (timers[idx]) return;
        let remaining = 120;
        const display = document.getElementById(`td-${idx}`);
        timers[idx] = setInterval(() => {
          remaining--;
          const m = Math.floor(remaining / 60);
          const s = String(remaining % 60).padStart(2, '0');
          display.textContent = `${m}:${s}`;
          if (remaining <= 0) {
            clearInterval(timers[idx]); timers[idx] = null;
            display.textContent = "0:00 — time's up";
          }
        }, 1000);
      });
    });
    cardsEl.querySelectorAll('[data-treset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-treset');
        if (timers[idx]) { clearInterval(timers[idx]); timers[idx] = null; }
        document.getElementById(`td-${idx}`).textContent = '2:00';
      });
    });
  }

  // Filter clicks
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
    render();
  });

  searchEl.addEventListener('input', (e) => { query = e.target.value; render(); });

  function escape(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  load();
})();
