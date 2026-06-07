// Exercises page — students only
// Renders stress words, runs the 2-minute fluency timer.

(async function () {
  const user = await window.requireAuth();
  if (!user) return;

  // Stress words — { word, stressed_syllable_index }
  const stressWords = [
    { word: 'photograph', parts: ['pho', 'to', 'graph'], stress: 0 },
    { word: 'photography', parts: ['pho', 'to', 'gra', 'phy'], stress: 1 },
    { word: 'photographer', parts: ['pho', 'to', 'gra', 'pher'], stress: 1 },
    { word: 'photographic', parts: ['pho', 'to', 'gra', 'phic'], stress: 2 },
    { word: 'economic', parts: ['ec', 'o', 'no', 'mic'], stress: 2 },
    { word: 'economy', parts: ['e', 'co', 'no', 'my'], stress: 1 },
    { word: 'industry', parts: ['in', 'dus', 'try'], stress: 0 },
    { word: 'industrial', parts: ['in', 'dus', 'tri', 'al'], stress: 1 },
    { word: 'environmental', parts: ['en', 'vi', 'ron', 'men', 'tal'], stress: 3 },
    { word: 'opportunity', parts: ['op', 'por', 'tu', 'ni', 'ty'], stress: 2 },
    { word: 'communicate', parts: ['com', 'mu', 'ni', 'cate'], stress: 1 },
    { word: 'communication', parts: ['com', 'mu', 'ni', 'ca', 'tion'], stress: 3 },
  ];

  const stressEl = document.getElementById('stress-list');
  stressEl.innerHTML = stressWords.map(w => `
    <div class="stress-word">${w.parts.map((p, i) =>
      i === w.stress ? `<span class="stressed">${p.toUpperCase()}</span>` : p
    ).join('·')}</div>
  `).join('');

  // ---------- Fluency timer ----------
  const display = document.getElementById('timer');
  const startBtn = document.getElementById('t-start');
  const pauseBtn = document.getElementById('t-pause');
  const resetBtn = document.getElementById('t-reset');
  const DURATION = 120;
  let remaining = DURATION;
  let interval = null;
  let running = false;

  function format(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function render() {
    display.textContent = format(remaining);
    display.classList.toggle('warning', remaining <= 30 && remaining > 0);
    display.classList.toggle('done', remaining === 0);
  }

  function tick() {
    if (remaining <= 0) {
      clearInterval(interval); interval = null; running = false;
      startBtn.textContent = 'Start';
      logActivity();
      return;
    }
    remaining--;
    render();
  }

  function start() {
    if (running) return;
    if (remaining === 0) remaining = DURATION;
    running = true;
    startBtn.textContent = 'Running…';
    interval = setInterval(tick, 1000);
  }

  function pause() {
    if (!running) return;
    clearInterval(interval); interval = null; running = false;
    startBtn.textContent = 'Resume';
  }

  function reset() {
    clearInterval(interval); interval = null; running = false;
    remaining = DURATION;
    startBtn.textContent = 'Start';
    render();
  }

  // Best-effort log to backend — silent failure is fine
  async function logActivity() {
    try { await window.api('/api/progress/activity', { method: 'POST', body: { action: 'fluency_completed', detail: '2-minute fluency challenge' } }); } catch (e) {}
  }

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  render();
})();
