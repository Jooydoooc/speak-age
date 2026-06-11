// Shadowing lesson player.
// Wires the YouTube IFrame API to a timestamped transcript, sentence highlight,
// playback controls (speed/repeat/3s rewind/auto-pause), shadow mode and
// per-user progress tracking against /api/shadowing/:id.

(function () {

  // --- Helpers -----------------------------------------------------------
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  // --- IPA dictionary ----------------------------------------------------
  // Keys are lowercase; punctuation is stripped before lookup. Stored values
  // are bare IPA (no surrounding pipes — those are added in the tooltip view).
  const IPA = {
    // People & relationships
    colleague: 'ˈkɒliːɡ', friend: 'frend', family: 'ˈfæmɪli',
    neighbour: 'ˈneɪbər', stranger: 'ˈstreɪndʒər',
    // Common verbs
    achieve: 'əˈtʃiːv', improve: 'ɪmˈpruːv', develop: 'dɪˈveləp',
    consider: 'kənˈsɪdər', suggest: 'səˈdʒest', require: 'rɪˈkwaɪər',
    believe: 'bɪˈliːv', receive: 'rɪˈsiːv', increase: 'ɪnˈkriːs',
    provide: 'prəˈvaɪd', never: 'ˈnevər', always: 'ˈɔːlweɪz',
    usually: 'ˈjuːʒuəli', often: 'ˈɒfən', sometimes: 'ˈsʌmtaɪmz',
    // Common adjectives
    important: 'ɪmˈpɔːtənt', different: 'ˈdɪfrənt', difficult: 'ˈdɪfɪkəlt',
    comfortable: 'ˈkʌmftəbəl', available: 'əˈveɪləbəl', responsible: 'rɪˈspɒnsɪbəl',
    significant: 'sɪɡˈnɪfɪkənt', appropriate: 'əˈprəʊpriɪt',
    // IELTS topic words
    environment: 'ɪnˈvaɪrənmənt', technology: 'tekˈnɒlədʒi',
    education: 'ˌedʒuˈkeɪʃən', government: 'ˈɡʌvənmənt',
    communication: 'kəˌmjuːnɪˈkeɪʃən', society: 'səˈsaɪɪti',
    economy: 'ɪˈkɒnəmi', culture: 'ˈkʌltʃər', experience: 'ɪkˈspɪəriəns',
    opportunity: 'ˌɒpəˈtjuːnɪti', community: 'kəˈmjuːnɪti',
    population: 'ˌpɒpjuˈleɪʃən', pollution: 'pəˈluːʃən',
    // Pronunciation traps
    pronunciation: 'prəˌnʌnsiˈeɪʃən', clothes: 'kləʊðz',
    vegetable: 'ˈvedʒtəbəl', february: 'ˈfebruəri',
    wednesday: 'ˈwenzdeɪ', schedule: 'ˈʃedjuːl',
    particularly: 'pəˈtɪkjʊləli', necessary: 'ˈnesəsəri',
    especially: 'ɪˈspeʃəli', basically: 'ˈbeɪsɪkli',
    beautiful: 'ˈbjuːtɪfəl', people: 'ˈpiːpəl',
    world: 'wɜːld', thought: 'θɔːt', through: 'θruː',
    enough: 'ɪˈnʌf', although: 'ɔːlˈðəʊ', throughout: 'θruːˈaʊt',
    whole: 'həʊl', while: 'waɪl', what: 'wɒt', where: 'weər'
  };
  function ipaFor(word) {
    const k = String(word || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(IPA, k) ? IPA[k] : null;
  }
  // Tokenize a sentence so we can wrap word characters in <span class="word">
  // while keeping the original punctuation/whitespace verbatim. The pattern
  // accepts internal apostrophes and hyphens (don't, well-being), but not
  // trailing ones (which would tag e.g. "Mary's," weirdly).
  function wrapWordsHtml(text) {
    const parts = String(text || '').split(/([A-Za-z][A-Za-z'\-]*)/g);
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      if (!chunk) continue;
      // Odd-indexed parts are the captured words; even-indexed are the
      // separator chunks (whitespace + punctuation) between them.
      if (i % 2 === 1) {
        const ipa = ipaFor(chunk);
        if (ipa) {
          out += `<span class="word" data-ipa="${esc(ipa)}">${esc(chunk)}</span>`;
        } else {
          out += `<span class="word no-ipa">${esc(chunk)}</span>`;
        }
      } else {
        out += esc(chunk);
      }
    }
    return out;
  }

  function ytId(url) {
    if (!url) return '';
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? m[1] : '';
  }
  function fmtTs(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${ss}` : `${m}:${ss}`;
  }
  function estimatePracticeMinutes(sentences) {
    // Heuristic: each sentence ~25 s to listen + repeat once. Min 1 min.
    if (!sentences || sentences.length === 0) return 0;
    return Math.max(1, Math.ceil(sentences.length * 25 / 60));
  }

  // --- Boot --------------------------------------------------------------
  const lessonId = Number(new URLSearchParams(location.search).get('id'));
  if (!lessonId) { location.href = '/shadowing.html'; return; }

  let lesson, sentences = [], phrases = [], practiced = new Set(), completed = false, rating = null;
  let player = null, playerReady = false;
  let lastSentenceIdx = -1;            // for auto-pause + progress
  let pauseGateIdx = -1;                // sentence whose entry already triggered an auto-pause
  let singlePlayIdx = -1;               // sentence currently being played in single-sentence mode (-1 = not active)
  let slowModeRestoreRate = null;        // playback rate to restore after slow single-play ends
  let repeatSentenceOn = false;
  let repeatAllOn = false;
  let autoPauseOn = false;
  let shadowOn = false;
  let pollTimer = null;
  // Transcript-vs-video time offset, in seconds.
  //   lessonOffset = admin-set in DB (e.g. transcript starts at 0:01 but
  //                  speaker starts at 0:25 → offset = 24).
  //   userOffset   = per-student fine-tune in localStorage (±10s in 0.5s steps).
  // Relationship: playerTime = transcriptTime + lessonOffset + userOffset.
  let lessonOffset = 0;
  let userOffset = 0;
  const USER_OFFSET_MIN = -10;
  const USER_OFFSET_MAX = 10;
  const USER_OFFSET_STEP = 0.5;
  const userOffsetKey = () => `shadowing.lesson.${lessonId}.userOffset`;
  // Suppress auto-scroll while the student is manually scrolling the
  // transcript. Reset 2s after the last manual scroll event.
  let userScrolling = false;
  let userScrollTimer = null;
  let programmaticScroll = false;
  let programmaticScrollTimer = null;

  const $ = (id) => document.getElementById(id);
  const transcriptListEl = $('transcript-list');

  async function loadData() {
    const user = await window.requireAuth();
    if (!user) return false;
    const { ok, data, status } = await window.api(`/api/shadowing/${lessonId}`);
    if (!ok) {
      if (status === 404) {
        $('lesson-title').textContent = 'Lesson not found';
        transcriptListEl.innerHTML = '<div style="color:var(--muted);padding:24px 0">This lesson does not exist or has been removed.</div>';
      } else {
        $('lesson-title').textContent = 'Could not load lesson';
      }
      return false;
    }
    lesson = data.lesson;
    // Drop any sentence with empty text — defensive in case stale data slipped through.
    sentences = (data.sentences || []).filter(s => s && String(s.text).trim().length > 0);
    phrases = Array.isArray(lesson.phrases) ? lesson.phrases : [];
    practiced = new Set((data.progress && data.progress.sentences_completed) || []);
    completed = !!(data.progress && data.progress.completed);
    rating    = (data.progress && data.progress.difficulty_rating) || null;
    lessonOffset = Number(lesson.offset_seconds) || 0;
    userOffset = loadUserOffset();
    return true;
  }

  // --- Time-frame helpers ------------------------------------------------
  // The transcript stores sentence timestamps in "transcript time". The video
  // plays in "player time". They differ by lessonOffset + userOffset. We pass
  // transcript times into findSentenceIdxAt(), and player times into
  // player.seekTo(), so most bugs in this area come from mixing the frames up.
  function toPlayerTime(transcriptT) {
    return Math.max(0, (Number(transcriptT) || 0) + lessonOffset + userOffset);
  }
  function toTranscriptTime(playerT) {
    return (Number(playerT) || 0) - lessonOffset - userOffset;
  }
  function loadUserOffset() {
    try {
      const raw = localStorage.getItem(userOffsetKey());
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(USER_OFFSET_MIN, Math.min(USER_OFFSET_MAX, n));
    } catch (_) { return 0; }
  }
  function saveUserOffset() {
    try { localStorage.setItem(userOffsetKey(), String(userOffset)); } catch (_) {}
  }
  function renderSyncWidget() {
    const wrap = $('lesson-sync');
    const val  = $('sync-value');
    if (!wrap || !val) return;
    const sign = userOffset > 0 ? '+' : '';
    val.textContent = `${sign}${userOffset.toFixed(1)}s`;
    wrap.classList.toggle('is-active', userOffset !== 0);
  }
  function adjustUserOffset(delta) {
    const next = Math.max(USER_OFFSET_MIN, Math.min(USER_OFFSET_MAX, userOffset + delta));
    // Avoid sticky floating-point trail (e.g. 1.5000000000000002s)
    userOffset = Math.round(next * 10) / 10;
    saveUserOffset();
    renderSyncWidget();
    // Re-evaluate highlight against the new offset right away so the student
    // sees the change without waiting for the next 100ms poll.
    if (playerReady) tick();
  }

  // --- Renders -----------------------------------------------------------
  function renderHeader() {
    document.title = `${lesson.title} — Shadowing — Speak_Age`;
    $('lesson-title').textContent = lesson.title;
    const lvl = $('lesson-level');
    lvl.textContent = lesson.level;
    lvl.className = `badge badge-level-${lesson.level}`;
    const parts = [];
    if (lesson.duration) parts.push(lesson.duration);
    if (lesson.topic) parts.push(lesson.topic);
    $('lesson-meta-extras').textContent = parts.join(' · ');

    const mins = estimatePracticeMinutes(sentences);
    $('lesson-practice-time').textContent = mins ? `~${mins} min practice` : '';
    renderCompleteButton();
    renderStars();
  }

  function renderCompleteButton() {
    const btn = $('mark-complete');
    if (completed) {
      btn.textContent = 'Completed ✓';
      btn.classList.add('completed');
    } else {
      btn.textContent = 'Mark as complete';
      btn.classList.remove('completed');
    }
  }

  function renderStars() {
    document.querySelectorAll('.lesson-rating .star').forEach(el => {
      const r = Number(el.dataset.rate);
      el.classList.toggle('filled', rating != null && r <= rating);
    });
    $('rating-hint').textContent = rating ? `You rated this ${rating}/5` : 'Tap to rate';
  }

  function renderTranscript() {
    if (!sentences.length) {
      transcriptListEl.innerHTML = `
        <div class="transcript-empty">
          No transcript available for this lesson yet.
        </div>`;
      $('transcript-count').textContent = '0 sentences';
      renderProgress();
      return;
    }
    $('transcript-count').textContent = `${sentences.length} sentences`;
    transcriptListEl.innerHTML = sentences.map(s => `
      <div class="t-sentence ${practiced.has(s.idx) ? 'practiced' : ''}" data-idx="${s.idx}" data-ts="${s.ts_seconds}">
        <button class="t-play" data-idx="${s.idx}" type="button" aria-label="Play this sentence">▶</button>
        <span class="t-ts">${fmtTs(s.ts_seconds)}</span>
        <span class="t-text">${wrapWordsHtml(s.text)}</span>
        <button class="t-slow" data-idx="${s.idx}" type="button" aria-label="Play this sentence slowly" title="Play at half speed">🐢</button>
        <span class="t-tick" title="practiced" aria-hidden="true">✓</span>
      </div>
    `).join('');
    transcriptListEl.querySelectorAll('.t-sentence').forEach(el => {
      // Row click: seek + continuous play. Clicks on the per-sentence buttons
      // are handled separately and shouldn't trigger the row's seek.
      el.addEventListener('click', (e) => {
        if (e.target.closest('.t-play, .t-slow')) return;
        const ts = Number(el.dataset.ts);
        const idx = Number(el.dataset.idx);
        if (shadowOn) el.classList.add('revealed');
        seekTo(toPlayerTime(ts), idx);
      });
    });
    transcriptListEl.querySelectorAll('.t-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSingleSentence(Number(btn.dataset.idx), false);
      });
    });
    transcriptListEl.querySelectorAll('.t-slow').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSingleSentence(Number(btn.dataset.idx), true);
      });
    });
    renderProgress();
  }

  function renderPhrases() {
    const list = $('phrases-list');
    if (!phrases.length) {
      $('phrases-count').textContent = '(0)';
      list.innerHTML = '<div class="muted-inline" style="padding:8px 0">No key phrases added for this lesson yet.</div>';
      return;
    }
    $('phrases-count').textContent = `(${phrases.length})`;
    list.innerHTML = phrases.map((p, i) => `
      <div class="phrase-card">
        <div class="phrase-text">${esc(p.phrase)}</div>
        ${p.meaning ? `<div class="phrase-meaning">${esc(p.meaning)}</div>` : ''}
        ${p.example ? `<div class="phrase-example">“${esc(p.example)}”</div>` : ''}
        <div class="phrase-actions">
          <button class="btn btn-ghost btn-sm phrase-jump" data-pi="${i}">
            Jump to sentence · ${fmtTs(p.ts_seconds || 0)}
          </button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.phrase-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = phrases[Number(btn.dataset.pi)];
        if (!p) return;
        const ts = Math.max(0, Number(p.ts_seconds) || 0);
        const idx = findSentenceIdxAt(ts);
        seekTo(toPlayerTime(ts), idx);
      });
    });
  }

  function renderProgress() {
    const total = sentences.length;
    const done = practiced.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    $('lesson-fill').style.width = pct + '%';
    $('lesson-progress-text').textContent = `${done} / ${total} sentences`;
  }

  // --- Sentence helpers --------------------------------------------------
  function findSentenceIdxAt(timeSec) {
    if (!sentences.length) return -1;
    let idx = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].ts_seconds <= timeSec + 0.05) idx = i;
      else break;
    }
    return idx;
  }
  function sentenceEnd(i) {
    if (i < 0 || i >= sentences.length) return Infinity;
    const next = sentences[i + 1];
    if (next) return next.ts_seconds;
    // Fallback for the last sentence: player.getDuration() is in player-time, so
    // translate to transcript-time to stay consistent with sentence timestamps.
    const dur = playerReady && player.getDuration ? player.getDuration() : 0;
    return dur > 0 ? toTranscriptTime(dur) : sentences[i].ts_seconds + 30;
  }

  function highlightSentence(idx) {
    transcriptListEl.querySelectorAll('.t-sentence.current').forEach(el => el.classList.remove('current'));
    if (idx < 0) return;
    const el = transcriptListEl.querySelector(`.t-sentence[data-idx="${idx}"]`);
    if (!el) return;
    el.classList.add('current');
    // Center the active sentence — but defer to the student if they're
    // actively scrolling the transcript (paused for 2s after their last
    // manual scroll, see the userScrolling listener below).
    if (userScrolling) return;
    const panel = transcriptListEl;
    const panelRect = panel.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetTop = panel.scrollTop + (elRect.top - panelRect.top) - (panel.clientHeight / 2) + (el.clientHeight / 2);
    // Flag our own scroll so it doesn't get mis-detected as a manual scroll.
    programmaticScroll = true;
    clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => { programmaticScroll = false; }, 600);
    panel.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  // User-scroll detection on the transcript panel. While true, auto-scroll
  // is suppressed so the student can browse upcoming sentences without the
  // player snapping their view back to the current one.
  if (transcriptListEl) {
    transcriptListEl.addEventListener('scroll', () => {
      if (programmaticScroll) return; // ignore our own auto-scrolls
      userScrolling = true;
      clearTimeout(userScrollTimer);
      userScrollTimer = setTimeout(() => { userScrolling = false; }, 2000);
    }, { passive: true });
  }

  // --- Pronunciation tooltip --------------------------------------------
  // One reusable element appended to <body> so it escapes the transcript's
  // overflow:hidden / scroll containers. Uses fixed positioning so coords
  // from getBoundingClientRect() can be used directly.
  let tipEl = null;
  let tipHideTimer = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'pron-tip';
    tipEl.hidden = true;
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function hideTip() {
    if (!tipEl) return;
    tipEl.hidden = true;
    tipEl.classList.remove('below');
    if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null; }
  }
  function showTipFor(wordEl, opts) {
    if (!wordEl) return;
    // Shadow mode masks the sentence — don't expose words via the tooltip.
    const sentenceEl = wordEl.closest('.t-sentence');
    if (sentenceEl
        && transcriptListEl.classList.contains('shadow-mode-on')
        && !sentenceEl.classList.contains('revealed')) {
      return;
    }
    const ipa = wordEl.dataset.ipa;
    const tip = ensureTip();
    tip.textContent = ipa ? `| ${ipa} |` : 'No pronunciation available';
    tip.classList.toggle('no-ipa', !ipa);
    tip.hidden = false;
    // Measure after content is set, then position.
    const wordRect = wordEl.getBoundingClientRect();
    const tipRect  = tip.getBoundingClientRect();
    const margin   = 8;
    let above = true;
    let top   = wordRect.top - tipRect.height - margin;
    if (top < margin) { above = false; top = wordRect.bottom + margin; }
    let left = wordRect.left + (wordRect.width / 2) - (tipRect.width / 2);
    left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));
    tip.style.top  = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.classList.toggle('below', !above);

    // Mobile / tap path: auto-hide after a short window.
    if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null; }
    if (opts && opts.autoHideMs) {
      tipHideTimer = setTimeout(hideTip, opts.autoHideMs);
    }
  }

  // Event delegation on the transcript list — one set of listeners covers
  // every sentence even though innerHTML is rebuilt on each render.
  if (transcriptListEl) {
    // Desktop hover
    transcriptListEl.addEventListener('mouseover', (e) => {
      const w = e.target.closest('.word');
      if (!w || !transcriptListEl.contains(w)) return;
      showTipFor(w);
    });
    transcriptListEl.addEventListener('mouseout', (e) => {
      const w = e.target.closest('.word');
      if (!w) return;
      // Only hide if the pointer is actually leaving the word (not moving
      // onto a child element).
      if (w.contains(e.relatedTarget)) return;
      hideTip();
    });
    // Mobile tap (also fires on desktop click — fine, mouseout still hides).
    transcriptListEl.addEventListener('click', (e) => {
      const w = e.target.closest('.word');
      if (!w) return;
      showTipFor(w, { autoHideMs: 2500 });
    });
    // Tooltip can't follow the word during scroll without jitter, so hide.
    transcriptListEl.addEventListener('scroll', hideTip, { passive: true });
  }
  // Tapping anywhere outside the transcript dismisses any open tooltip.
  document.addEventListener('click', (e) => {
    if (!tipEl || tipEl.hidden) return;
    if (e.target.closest('.word')) return;
    hideTip();
  });
  window.addEventListener('resize', hideTip);

  // --- Progress recording ------------------------------------------------
  const queuedSends = new Set();
  async function recordPracticed(idx) {
    if (idx < 0 || practiced.has(idx) || queuedSends.has(idx)) return;
    queuedSends.add(idx);
    practiced.add(idx);
    const el = transcriptListEl.querySelector(`.t-sentence[data-idx="${idx}"]`);
    if (el) el.classList.add('practiced');
    renderProgress();
    window.api(`/api/shadowing/${lessonId}/progress`, { method: 'POST', body: { sentence_idx: idx } })
      .finally(() => queuedSends.delete(idx));
  }

  // --- Per-sentence single play -----------------------------------------
  // When `singlePlayIdx >= 0`, the player is playing exactly that one
  // sentence — tick() will pause at the next sentence's timestamp (or loop
  // if Repeat-sentence is on). Speed is honoured, and slow mode temporarily
  // halves the rate, restoring whatever was selected when it ends.

  function stopSingleSentencePlay() {
    if (singlePlayIdx < 0) return;
    if (slowModeRestoreRate != null && playerReady) {
      try { player.setPlaybackRate(slowModeRestoreRate); } catch (_) {}
    }
    const el = transcriptListEl.querySelector(`.t-sentence.single-play`);
    if (el) el.classList.remove('single-play');
    singlePlayIdx = -1;
    slowModeRestoreRate = null;
    updatePlayButtonIcons();
  }

  function playSingleSentence(idx, slow) {
    if (!playerReady) return;
    if (idx < 0 || idx >= sentences.length) return;

    // Toggle: clicking the play button for the sentence already in single
    // play pauses it.
    if (singlePlayIdx === idx && !slow) {
      try { player.pauseVideo(); } catch (_) {}
      stopSingleSentencePlay();
      return;
    }
    // Switching to another sentence — stop the current one first so we
    // restore the speed cleanly before starting the new one.
    if (singlePlayIdx >= 0) stopSingleSentencePlay();

    const s = sentences[idx];
    if (slow) {
      try {
        slowModeRestoreRate = player.getPlaybackRate();
        player.setPlaybackRate(0.5);
      } catch (_) { slowModeRestoreRate = null; }
    }

    singlePlayIdx = idx;
    lastSentenceIdx = idx;
    pauseGateIdx = idx; // prevent the auto-pause logic from firing on entry

    const row = transcriptListEl.querySelector(`.t-sentence[data-idx="${idx}"]`);
    if (row) row.classList.add('single-play');

    player.seekTo(toPlayerTime(s.ts_seconds), true);
    player.playVideo();
    highlightSentence(idx);
    updatePlayButtonIcons();
  }

  function updatePlayButtonIcons() {
    const isPlaying = playerReady && player.getPlayerState && player.getPlayerState() === 1;
    transcriptListEl.querySelectorAll('.t-sentence').forEach(el => {
      const idx = Number(el.dataset.idx);
      const btn = el.querySelector('.t-play');
      if (!btn) return;
      const showPause = (singlePlayIdx === idx)
        || (singlePlayIdx === -1 && idx === lastSentenceIdx && isPlaying);
      const desired = showPause ? '⏸' : '▶';
      if (btn.textContent !== desired) btn.textContent = desired;
    });
  }

  // --- Playback control --------------------------------------------------
  function seekTo(seconds, idx) {
    if (!playerReady) return;
    // Any seek exits single-play mode (and restores speed if we were slow).
    if (singlePlayIdx >= 0) stopSingleSentencePlay();
    player.seekTo(seconds, true);
    player.playVideo();
    if (idx != null && idx >= 0) {
      lastSentenceIdx = idx;
      pauseGateIdx = idx;
      highlightSentence(idx);
    }
    updatePlayButtonIcons();
  }

  function attachControlHandlers() {
    document.querySelectorAll('.ctrl-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ctrl-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (playerReady) player.setPlaybackRate(Number(btn.dataset.speed));
      });
    });

    $('rewind3').addEventListener('click', () => {
      if (!playerReady) return;
      const t = player.getCurrentTime();
      const newPlayerT = Math.max(0, t - 3);
      seekTo(newPlayerT, findSentenceIdxAt(toTranscriptTime(newPlayerT)));
    });

    // --- Sync adjuster (per-student fine-tune, persisted in localStorage) ---
    const syncDown = $('sync-down');
    const syncUp   = $('sync-up');
    const syncReset = $('sync-reset');
    if (syncDown)  syncDown.addEventListener('click',  () => adjustUserOffset(-USER_OFFSET_STEP));
    if (syncUp)    syncUp.addEventListener('click',    () => adjustUserOffset(+USER_OFFSET_STEP));
    if (syncReset) syncReset.addEventListener('click', () => adjustUserOffset(-userOffset));
    renderSyncWidget();

    function setToggle(btn, value) {
      if (value) btn.classList.add('active'); else btn.classList.remove('active');
    }
    $('repeat-sentence').addEventListener('click', () => {
      repeatSentenceOn = !repeatSentenceOn;
      if (repeatSentenceOn) { repeatAllOn = false; setToggle($('repeat-all'), false); }
      setToggle($('repeat-sentence'), repeatSentenceOn);
    });
    $('repeat-all').addEventListener('click', () => {
      repeatAllOn = !repeatAllOn;
      if (repeatAllOn) { repeatSentenceOn = false; setToggle($('repeat-sentence'), false); }
      setToggle($('repeat-all'), repeatAllOn);
    });
    $('auto-pause').addEventListener('click', () => {
      autoPauseOn = !autoPauseOn;
      setToggle($('auto-pause'), autoPauseOn);
    });

    $('shadow-mode').addEventListener('click', () => {
      shadowOn = !shadowOn;
      setToggle($('shadow-mode'), shadowOn);
      transcriptListEl.classList.toggle('shadow-mode-on', shadowOn);
      transcriptListEl.querySelectorAll('.t-sentence.revealed').forEach(el => el.classList.remove('revealed'));
    });
    $('reveal-current').addEventListener('click', () => {
      const cur = transcriptListEl.querySelector('.t-sentence.current');
      if (cur) cur.classList.add('revealed');
    });

    $('mark-complete').addEventListener('click', async () => {
      const newValue = !completed;
      const r = await window.api(`/api/shadowing/${lessonId}/complete`, {
        method: 'POST', body: { completed: newValue }
      });
      if (r.ok) {
        completed = newValue;
        renderCompleteButton();
      }
    });

    document.querySelectorAll('.lesson-rating .star').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = Number(btn.dataset.rate);
        // Optimistic update
        rating = r;
        renderStars();
        const res = await window.api(`/api/shadowing/${lessonId}/rate`, {
          method: 'POST', body: { rating: r }
        });
        if (!res.ok) {
          // Roll back if server rejected
          rating = null;
          renderStars();
        }
      });
    });

    // --- Practice Mode panel ---------------------------------------------
    // Sits ABOVE the existing controls and only swaps the on-screen instruction
    // + active pill style. It intentionally does NOT touch the speed/repeat/
    // auto-pause/shadow controls. Record mode reveals a local recording panel.
    (function wirePracticeModes() {
      const panel = $('practice-mode');
      if (!panel) return;
      const hint = $('practice-mode-hint');
      const recordPanel = $('record-panel');
      const recorder = setupRecorder();
      const HINTS = {
        listen: 'Listen carefully without speaking. Focus on rhythm and intonation.',
        repeat: 'Pause after each sentence and repeat clearly.',
        shadow: 'Speak together with the speaker. Copy rhythm, stress, and speed.',
        record: 'Record yourself and compare your answer with the original.'
      };
      panel.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.mode;
          panel.querySelectorAll('[data-mode]').forEach(b => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          if (hint && HINTS[key]) hint.textContent = HINTS[key];
          if (recordPanel) {
            const isRecord = key === 'record';
            recordPanel.hidden = !isRecord;
            // Leaving Record mode discards any in-progress/finished recording.
            if (!isRecord && recorder) recorder.reset();
          }
        });
      });
    })();

    // --- Local recording panel (MediaRecorder) ---------------------------
    // Browser-only: audio is held in a Blob in memory and never uploaded or
    // saved. Microphone access is requested on the first Start click.
    function setupRecorder() {
      const panelEl = $('record-panel');
      if (!panelEl) return null;
      const liveEl = $('rec-live');
      const startBtn = $('rec-start');
      const stopBtn = $('rec-stop');
      const playBtn = $('rec-play');
      const delBtn = $('rec-delete');
      const statusEl = $('rec-status');
      const timerEl = $('rec-timer');
      const dotEl = $('rec-dot');
      const audioEl = $('rec-audio');
      const unsupportedEl = $('rec-unsupported');

      const supported = !!(navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia && window.MediaRecorder);
      if (!supported) {
        // iOS Safari and other unsupported browsers: show a graceful message.
        if (liveEl) liveEl.hidden = true;
        if (unsupportedEl) {
          unsupportedEl.hidden = false;
          unsupportedEl.textContent =
            'Recording is not supported on this browser. Please use Chrome on Android or desktop.';
        }
        return { reset() {} };
      }

      let mediaRecorder = null, chunks = [], stream = null;
      let blobUrl = null, timerId = null, startTime = 0, discarding = false;

      const fmt = (ms) => {
        const s = Math.floor(ms / 1000);
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
      const setButtons = (s) => {
        startBtn.disabled = !s.start;
        stopBtn.disabled = !s.stop;
        playBtn.disabled = !s.play;
        delBtn.disabled = !s.del;
      };
      const stopStream = () => {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      };
      const clearRecording = () => {
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.hidden = true;
        chunks = [];
        timerEl.textContent = '00:00';
      };

      async function start() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          setStatus('Microphone blocked');
          return;
        }
        clearRecording();
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        mediaRecorder.onstop = () => {
          stopStream();
          clearInterval(timerId);
          dotEl.hidden = true;
          if (discarding) { discarding = false; return; }
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          blobUrl = URL.createObjectURL(blob);
          audioEl.src = blobUrl;
          audioEl.hidden = false;
          setStatus('Recorded');
          setButtons({ start: true, stop: false, play: true, del: true });
        };
        mediaRecorder.start();
        startTime = Date.now();
        timerEl.textContent = '00:00';
        timerId = setInterval(() => { timerEl.textContent = fmt(Date.now() - startTime); }, 250);
        setStatus('Recording');
        dotEl.hidden = false;
        setButtons({ start: false, stop: true, play: false, del: false });
      }

      function stop() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      }
      function play() { if (blobUrl) { audioEl.currentTime = 0; audioEl.play(); } }
      function del() {
        clearRecording();
        setStatus('Ready');
        setButtons({ start: true, stop: false, play: false, del: false });
      }

      startBtn.addEventListener('click', start);
      stopBtn.addEventListener('click', stop);
      playBtn.addEventListener('click', play);
      delBtn.addEventListener('click', del);

      setStatus('Ready');
      setButtons({ start: true, stop: false, play: false, del: false });

      return {
        reset() {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            discarding = true;
            try { mediaRecorder.stop(); } catch (_) {}
          }
          stopStream();
          if (timerId) clearInterval(timerId);
          clearRecording();
          dotEl.hidden = true;
          setStatus('Ready');
          setButtons({ start: true, stop: false, play: false, del: false });
        }
      };
    }
  }

  // --- YouTube IFrame API ------------------------------------------------
  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) return resolve();
      window.onYouTubeIframeAPIReady = () => resolve();
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
  }

  // --- HTML5 video adapter -----------------------------------------------
  // Cloudinary-hosted lessons use a native <video> element. We wrap it in a
  // shim that exposes the same surface area as YT.Player so the rest of the
  // file (tick, seekTo, single-play, speed control, repeat, etc.) keeps
  // working without further branching.
  function createCloudinaryPlayer(elementId, { videoUrl, poster, onReady, onStateChange, onTimeUpdate }) {
    const slot = document.getElementById(elementId);
    if (!slot) return null;
    const video = document.createElement('video');
    video.id = elementId;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.crossOrigin = 'anonymous';
    if (poster) video.poster = poster;
    video.src = videoUrl;
    slot.replaceWith(video);

    function stateValue() {
      if (video.ended) return 0;   // mimics YT ENDED
      if (video.paused) return 2;  // PAUSED
      return 1;                    // PLAYING
    }
    function fire() {
      if (typeof onStateChange === 'function') onStateChange({ data: stateValue() });
    }

    let firedReady = false;
    video.addEventListener('loadedmetadata', () => {
      if (firedReady) return;
      firedReady = true;
      if (typeof onReady === 'function') onReady();
    });
    video.addEventListener('play', fire);
    video.addEventListener('pause', fire);
    video.addEventListener('ended', fire);
    // Native HTML5 timeupdate fires ~4 Hz during playback — much cheaper
    // than relying solely on polling and gives instant sync on seek.
    if (typeof onTimeUpdate === 'function') {
      video.addEventListener('timeupdate', () => onTimeUpdate(video.currentTime));
    }

    return {
      seekTo(seconds /* , allowSeekAhead */) {
        try { video.currentTime = Math.max(0, seconds || 0); } catch (_) {}
      },
      playVideo() { const p = video.play(); if (p && p.catch) p.catch(() => {}); },
      pauseVideo() { try { video.pause(); } catch (_) {} },
      getCurrentTime() { return video.currentTime || 0; },
      getDuration()    { return video.duration || 0; },
      setPlaybackRate(r) { try { video.playbackRate = r; } catch (_) {} },
      getPlaybackRate()  { return video.playbackRate || 1; },
      getPlayerState()   { return stateValue(); }
    };
  }

  async function initPlayer() {
    // Cloudinary-hosted videos take the HTML5 <video> path.
    if (lesson.video_source === 'cloudinary' && lesson.video_url) {
      player = createCloudinaryPlayer('yt-player', {
        videoUrl: lesson.video_url,
        poster:   lesson.thumbnail_url,
        onReady:  () => { playerReady = true; },
        onStateChange: (e) => {
          if (e.data === 1) { pauseGateIdx = -1; startPolling(); }                    // PLAYING
          if (e.data === 2 || e.data === 0) { tick(); stopPolling(); }                 // PAUSED / ENDED
          if (e.data === 0 && repeatAllOn) { player.seekTo(0, true); player.playVideo(); }
          updatePlayButtonIcons();
        },
        // HTML5 video fires `timeupdate` ~4 Hz natively — pipe it through tick()
        // for snappier sync alongside the 100 ms polling loop.
        onTimeUpdate: () => tick()
      });
      return;
    }

    // Otherwise YouTube IFrame API.
    const videoId = ytId(lesson.youtube_url);
    if (!videoId) {
      $('yt-player').outerHTML = '<div class="lesson-no-video">No valid video URL on this lesson.</div>';
      return;
    }
    await loadYouTubeAPI();
    player = new YT.Player('yt-player', {
      videoId,
      playerVars: { modestbranding: 1, rel: 0, playsinline: 1, controls: 1, iv_load_policy: 3 },
      events: {
        onReady: () => { playerReady = true; },
        onStateChange: (e) => {
          // YT.PlayerState: -1 unstarted · 0 ENDED · 1 PLAYING · 2 PAUSED · 3 buffering · 5 cued
          if (e.data === 1) { pauseGateIdx = -1; startPolling(); }                      // PLAYING
          if (e.data === 2 || e.data === 0) { tick(); stopPolling(); }                  // PAUSED / ENDED
          if (e.data === 0 && repeatAllOn) { player.seekTo(0, true); player.playVideo(); }
          updatePlayButtonIcons();
        }
      }
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(tick, 100); // poll every 100 ms (was 250 ms) for snappier sync
    tick(); // immediate first paint so the highlight doesn't wait a frame
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function tick() {
    if (!playerReady || !player.getCurrentTime) return;
    const t = player.getCurrentTime();
    if (sentences.length === 0) return;

    // All sentence timestamps live in transcript-time; translate the player's
    // clock once so every comparison below uses the same frame.
    const adjT = toTranscriptTime(t);

    // Single-sentence play: stop (or loop) at the next sentence boundary.
    if (singlePlayIdx >= 0) {
      const cur = sentences[singlePlayIdx];
      const end = sentenceEnd(singlePlayIdx);
      if (adjT >= end - 0.05) {
        if (repeatSentenceOn) {
          // Repeat-sentence wins: loop this sentence rather than pausing.
          player.seekTo(toPlayerTime(cur.ts_seconds), true);
        } else {
          try { player.pauseVideo(); } catch (_) {}
          stopSingleSentencePlay();
        }
      }
      updatePlayButtonIcons();
      return;
    }

    // Fire highlight 0.15s early to compensate for browser/iframe render
    // delay so the active sentence flips slightly BEFORE the speaker reaches
    // it, instead of trailing behind. findSentenceIdxAt already adds 0.05s
    // tolerance — bumping the input by another 0.10s gives the full 0.15s.
    const idx = findSentenceIdxAt(adjT + 0.10);

    if (repeatSentenceOn && lastSentenceIdx >= 0 && idx !== lastSentenceIdx) {
      const cur = sentences[lastSentenceIdx];
      if (cur) {
        player.seekTo(toPlayerTime(cur.ts_seconds), true);
        player.playVideo();
        return;
      }
    }

    if (idx !== lastSentenceIdx) {
      if (lastSentenceIdx >= 0 && idx > lastSentenceIdx) {
        recordPracticed(lastSentenceIdx);
      }
      lastSentenceIdx = idx;
      highlightSentence(idx);

      if (autoPauseOn && idx >= 0 && idx !== pauseGateIdx) {
        pauseGateIdx = idx;
        setTimeout(() => { try { player.pauseVideo(); } catch (_) {} }, 80);
      }
    }
    updatePlayButtonIcons();
  }

  // --- Go ----------------------------------------------------------------
  (async () => {
    const ok = await loadData();
    if (!ok) return;
    renderHeader();
    renderTranscript();
    renderPhrases();
    attachControlHandlers();
    initPlayer();
  })();
})();
