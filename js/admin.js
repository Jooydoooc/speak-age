// Admin functionality on /profile.html. Only loads behavior for admin/teacher.
// Exposes window.loadAdminContent / loadAdminStudents / loadAdminSiteStats
// which profile.js calls when the corresponding tab is activated.

(async function () {
  // Bail silently if we aren't on a page with the admin shell. This script
  // is included on /profile.html where the shell may be hidden for students.
  if (!document.getElementById('site-stats-grid')) return;

  const user = window._profileUser || (await window.loadCurrentUser());
  if (!user) return;
  if (user.role !== 'admin' && user.role !== 'teacher') return;

  const isAdmin = user.role === 'admin';
  const toast = (t, type) => window.toast(t, type);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div class="alert alert-${type || 'success'}">${esc(text)}</div>`;
    setTimeout(() => { el.innerHTML = ''; }, 4000);
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function autoResize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';
  }

  // =========================================================
  // TOPIC modal
  // =========================================================
  const tEls = {
    id:        document.getElementById('topic-id'),
    title:     document.getElementById('topic-title'),
    part:      document.getElementById('topic-part'),
    category:  document.getElementById('topic-category'),
    questions: document.getElementById('topic-questions'),
    ans65:     document.getElementById('topic-answer-65'),
    ans80:     document.getElementById('topic-answer-80'),
    modalTitle: document.getElementById('modal-topic-title'),
    publish:   document.getElementById('topic-publish')
  };
  [tEls.questions, tEls.ans65, tEls.ans80].forEach(ta => {
    if (ta) ta.addEventListener('input', () => autoResize(ta));
  });

  function resetTopicForm() {
    tEls.id.value = '';
    tEls.title.value = '';
    tEls.part.value = '1';
    tEls.category.value = 'Technology';
    tEls.questions.value = '';
    tEls.ans65.value = '';
    tEls.ans80.value = '';
    [tEls.questions, tEls.ans65, tEls.ans80].forEach(autoResize);
  }
  function fillTopicForm(t) {
    tEls.id.value = t.id;
    tEls.title.value = t.title || '';
    tEls.part.value = String(t.part || 1);
    tEls.category.value = [...tEls.category.options].some(o => o.value === t.category) ? t.category : 'Technology';
    tEls.questions.value = t.questions || '';
    tEls.ans65.value = t.answer_65 || '';
    tEls.ans80.value = t.answer_80 || '';
    tEls.modalTitle.textContent = 'Edit topic';
    tEls.publish.textContent = 'Save changes';
    [tEls.questions, tEls.ans65, tEls.ans80].forEach(autoResize);
  }
  function openTopicModal(t) {
    if (t) fillTopicForm(t);
    else {
      resetTopicForm();
      tEls.modalTitle.textContent = 'Add topic';
      tEls.publish.textContent = 'Publish';
    }
    window.openModal('modal-topic');
  }
  // Quick-action card uses data-open-modal="modal-topic" → main.js opens it
  // but we still want it to start in "add" mode (reset form):
  document.querySelector('[data-open-modal="modal-topic"]')
    ?.addEventListener('click', () => openTopicModal(null));

  document.getElementById('form-topic').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast('Read-only access', 'error');
    const id = tEls.id.value;
    const body = {
      title: tEls.title.value.trim(),
      part: Number(tEls.part.value),
      category: tEls.category.value,
      questions: tEls.questions.value,
      answer_65: tEls.ans65.value,
      answer_80: tEls.ans80.value,
      draft: false
    };
    if (!body.title || !body.questions || !body.answer_65 || !body.answer_80) {
      return showMsg('topic-msg', 'All fields are required', 'error');
    }
    const url = id ? `/api/admin/topics/${id}` : '/api/admin/topics';
    const method = id ? 'PUT' : 'POST';
    const r = await window.api(url, { method, body });
    if (r.ok) {
      window.closeModal('modal-topic');
      toast(id ? 'Topic updated' : 'Topic published');
      loadTopics();
    } else {
      showMsg('topic-msg', r.data.error || 'Failed', 'error');
    }
  });

  // =========================================================
  // LESSON modal — includes Cloudinary upload UI
  // =========================================================
  const lEls = {
    id:           document.getElementById('lesson-id'),
    source:       document.getElementById('lesson-video-source'),
    videoUrl:     document.getElementById('lesson-video-url'),
    pubId:        document.getElementById('lesson-cloudinary-public-id'),
    thumb:        document.getElementById('lesson-thumbnail-url'),
    duration:     document.getElementById('lesson-duration-seconds'),
    title:        document.getElementById('lesson-title-input'),
    ytUrl:        document.getElementById('lesson-yt-url'),
    level:        document.getElementById('lesson-level-input'),
    durTxt:       document.getElementById('lesson-duration'),
    topicTag:     document.getElementById('lesson-topic'),
    transcript:   document.getElementById('lesson-transcript'),
    phrasesText:  document.getElementById('lesson-phrases-text'),
    keyPhrases:   document.getElementById('lesson-key-phrases'),
    modalTitle:   document.getElementById('modal-lesson-title'),
    publish:      document.getElementById('lesson-publish')
  };
  [lEls.transcript, lEls.phrasesText].forEach(ta => {
    if (ta) ta.addEventListener('input', () => autoResize(ta));
  });

  function setVideoSource(src) {
    lEls.source.value = src;
    document.querySelectorAll('.video-source-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.source === src));
    document.querySelectorAll('.video-source-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.sourcePanel === src));
  }
  document.querySelectorAll('.video-source-tab').forEach(tab => {
    tab.addEventListener('click', () => setVideoSource(tab.dataset.source));
  });

  // Drag-and-drop upload state
  const dropZone     = document.getElementById('video-drop-zone');
  const dropEmpty    = document.getElementById('video-drop-empty');
  const dropUploading= document.getElementById('video-drop-uploading');
  const dropDone     = document.getElementById('video-drop-done');
  const fileInput    = document.getElementById('video-file-input');
  const uploadFill   = document.getElementById('upload-fill');
  const uploadStatus = document.getElementById('upload-status');
  const thumbPreview = document.getElementById('video-thumb-preview');
  const doneName     = document.getElementById('upload-done-name');
  const doneInfo     = document.getElementById('upload-done-info');
  let activeXhr = null;

  function showDropState(s) {
    dropEmpty.hidden     = (s !== 'empty');
    dropUploading.hidden = (s !== 'uploading');
    dropDone.hidden      = (s !== 'done');
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    if (n < 1024*1024*1024) return (n/(1024*1024)).toFixed(1) + ' MB';
    return (n/(1024*1024*1024)).toFixed(2) + ' GB';
  }
  function fmtSecs(s) {
    s = Math.round(s || 0);
    const m = Math.floor(s/60), ss = String(s%60).padStart(2,'0');
    return `${m}:${ss}`;
  }
  function clearUpload() {
    lEls.videoUrl.value = '';
    lEls.pubId.value = '';
    lEls.thumb.value = '';
    lEls.duration.value = '';
    showDropState('empty');
    fileInput.value = '';
  }
  function startUpload(file) {
    if (!file) return;
    showDropState('uploading');
    uploadFill.style.width = '0%';
    uploadStatus.textContent = 'Preparing…';
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;
    xhr.open('POST', '/api/admin/upload-video');
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', e => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      uploadFill.style.width = pct + '%';
      uploadStatus.textContent = `Uploading ${pct}% — ${fmtBytes(e.loaded)} / ${fmtBytes(e.total)}`;
    });
    xhr.addEventListener('load', () => {
      activeXhr = null;
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        lEls.videoUrl.value = data.url;
        lEls.pubId.value = data.public_id || '';
        lEls.thumb.value = data.thumbnail_url || '';
        lEls.duration.value = String(data.duration || 0);
        thumbPreview.src = data.thumbnail_url || '';
        doneName.textContent = file.name;
        doneInfo.textContent = `${fmtBytes(file.size)} · ${fmtSecs(data.duration)}`;
        showDropState('done');
      } else {
        showDropState('empty');
        toast(data.error || `Upload failed (${xhr.status})`, 'error');
      }
    });
    xhr.addEventListener('error', () => { activeXhr = null; showDropState('empty'); toast('Network error during upload', 'error'); });
    xhr.addEventListener('abort', () => { activeXhr = null; showDropState('empty'); });
    xhr.send(fd);
  }
  if (dropZone) {
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (dropDone.hidden) fileInput.click();
    });
    ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag'); }));
    dropZone.addEventListener('drop', e => { if (e.dataTransfer.files[0]) startUpload(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) startUpload(fileInput.files[0]); });
    document.getElementById('upload-cancel')?.addEventListener('click', () => { if (activeXhr) activeXhr.abort(); });
    document.getElementById('upload-replace')?.addEventListener('click', clearUpload);
  }

  // Phrases parser
  function parsePhrasesText(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      const parts = line.split('|').map(p => p.trim());
      let ts = 0, phrase = '', meaning = '', example = '';
      const tsMatch = parts[0].match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
      if (tsMatch) {
        ts = (tsMatch[1] ? Number(tsMatch[1]) * 3600 : 0) + Number(tsMatch[2]) * 60 + Number(tsMatch[3]);
        phrase = parts[1] || ''; meaning = parts[2] || ''; example = parts[3] || '';
      } else {
        phrase = parts[0] || ''; meaning = parts[1] || ''; example = parts[2] || '';
      }
      if (phrase) out.push({ ts_seconds: ts, phrase, meaning, example });
    });
    return out;
  }
  function phrasesToText(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(p => {
      const m = Math.floor((p.ts_seconds || 0) / 60);
      const s = String((p.ts_seconds || 0) % 60).padStart(2, '0');
      return [`${m}:${s}`, p.phrase, p.meaning || '', p.example || ''].join(' | ');
    }).join('\n');
  }

  function resetLessonForm() {
    lEls.id.value = '';
    lEls.title.value = '';
    lEls.ytUrl.value = '';
    lEls.level.value = 'beginner';
    lEls.durTxt.value = '';
    lEls.topicTag.value = '';
    lEls.transcript.value = '';
    lEls.phrasesText.value = '';
    lEls.keyPhrases.value = '';
    setVideoSource('youtube');
    clearUpload();
    [lEls.transcript, lEls.phrasesText].forEach(autoResize);
  }
  function fillLessonForm(l) {
    lEls.id.value = l.id;
    lEls.title.value = l.title || '';
    lEls.ytUrl.value = l.youtube_url || '';
    lEls.level.value = l.level || 'beginner';
    lEls.durTxt.value = l.duration || '';
    lEls.topicTag.value = l.topic || '';
    lEls.transcript.value = l.transcript || '';
    lEls.phrasesText.value = phrasesToText(l.phrases);
    lEls.keyPhrases.value = l.key_phrases || '';
    const src = l.video_source || 'youtube';
    setVideoSource(src);
    if (src === 'cloudinary' && l.video_url) {
      lEls.videoUrl.value = l.video_url;
      lEls.pubId.value    = l.cloudinary_public_id || '';
      lEls.thumb.value    = l.thumbnail_url || '';
      lEls.duration.value = String(l.duration_seconds || 0);
      thumbPreview.src    = l.thumbnail_url || '';
      doneName.textContent = 'Existing video';
      doneInfo.textContent = `${fmtSecs(l.duration_seconds)} · ${l.cloudinary_public_id || ''}`;
      showDropState('done');
    } else {
      clearUpload();
    }
    lEls.modalTitle.textContent = 'Edit lesson';
    lEls.publish.textContent = 'Save changes';
    [lEls.transcript, lEls.phrasesText].forEach(autoResize);
  }
  function openLessonModal(l) {
    if (l) fillLessonForm(l);
    else {
      resetLessonForm();
      lEls.modalTitle.textContent = 'Add shadowing lesson';
      lEls.publish.textContent = 'Publish';
    }
    window.openModal('modal-lesson');
  }
  document.querySelector('[data-open-modal="modal-lesson"]')
    ?.addEventListener('click', () => openLessonModal(null));

  document.getElementById('form-lesson').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast('Read-only access', 'error');
    const source = lEls.source.value;
    if (source === 'youtube' && !/youtu/.test(lEls.ytUrl.value || '')) {
      return showMsg('lesson-msg', 'Provide a valid YouTube URL', 'error');
    }
    if (source === 'cloudinary' && !lEls.videoUrl.value) {
      return showMsg('lesson-msg', 'Upload a video file first', 'error');
    }
    const id = lEls.id.value;
    const body = {
      title: lEls.title.value.trim(),
      youtube_url: source === 'youtube' ? lEls.ytUrl.value.trim() : null,
      level: lEls.level.value,
      duration: lEls.durTxt.value.trim(),
      topic: lEls.topicTag.value.trim(),
      transcript: lEls.transcript.value,
      key_phrases: lEls.keyPhrases.value,
      phrases: parsePhrasesText(lEls.phrasesText.value),
      video_source: source,
      video_url: source === 'cloudinary' ? lEls.videoUrl.value : null,
      cloudinary_public_id: source === 'cloudinary' ? lEls.pubId.value : null,
      thumbnail_url: source === 'cloudinary' ? lEls.thumb.value : null,
      duration_seconds: source === 'cloudinary' && lEls.duration.value
        ? Number(lEls.duration.value) : null
    };
    const url = id ? `/api/admin/shadowing/${id}` : '/api/admin/shadowing';
    const method = id ? 'PUT' : 'POST';
    const r = await window.api(url, { method, body });
    if (r.ok) {
      const count = r.data && r.data.sentence_count != null ? ` (${r.data.sentence_count} sentences)` : '';
      window.closeModal('modal-lesson');
      toast((id ? 'Lesson updated' : 'Lesson published') + count);
      loadLessons();
    } else {
      showMsg('lesson-msg', r.data.error || 'Failed', 'error');
    }
  });

  // =========================================================
  // MATERIAL modal (PDF upload, multipart through backend → Cloudinary)
  // =========================================================
  const matDrop = document.getElementById('drop-zone');
  const matFile = document.getElementById('file-input');
  const matFileName = document.getElementById('file-name');
  let pickedPdf = null;
  if (matDrop) {
    matDrop.addEventListener('click', () => matFile.click());
    ['dragenter','dragover'].forEach(ev => matDrop.addEventListener(ev, e => { e.preventDefault(); matDrop.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => matDrop.addEventListener(ev, e => { e.preventDefault(); matDrop.classList.remove('drag'); }));
    matDrop.addEventListener('drop', e => {
      pickedPdf = e.dataTransfer.files[0];
      if (pickedPdf) matFileName.textContent = pickedPdf.name;
    });
    matFile.addEventListener('change', () => {
      pickedPdf = matFile.files[0];
      if (pickedPdf) matFileName.textContent = pickedPdf.name;
    });
  }
  document.querySelector('[data-open-modal="modal-material"]')
    ?.addEventListener('click', () => {
      document.getElementById('form-material').reset();
      pickedPdf = null;
      matFileName.textContent = '';
    });
  document.getElementById('form-material').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast('Read-only access', 'error');
    if (!pickedPdf) return showMsg('material-msg', 'Choose a PDF first', 'error');
    if (pickedPdf.size > 20 * 1024 * 1024) return showMsg('material-msg', 'Max file size 20MB', 'error');
    const fd = new FormData(e.target);
    fd.set('file', pickedPdf);
    try {
      const res = await fetch('/api/admin/materials', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.closeModal('modal-material');
        toast('Material uploaded');
        e.target.reset();
        pickedPdf = null; matFileName.textContent = '';
        loadMaterials();
      } else {
        showMsg('material-msg', data.error || 'Upload failed', 'error');
      }
    } catch (_) {
      showMsg('material-msg', 'Network error', 'error');
    }
  });

  // =========================================================
  // EXERCISE modal
  // =========================================================
  const eEls = {
    id:          document.getElementById('exercise-id'),
    title:       document.getElementById('exercise-title'),
    type:        document.getElementById('exercise-type'),
    description: document.getElementById('exercise-description'),
    modalTitle:  document.getElementById('modal-exercise-title'),
    publish:     document.getElementById('exercise-publish')
  };
  function resetExerciseForm() {
    eEls.id.value = '';
    eEls.title.value = '';
    eEls.type.value = 'minimal-pair';
    eEls.description.value = '';
  }
  function fillExerciseForm(x) {
    eEls.id.value = x.id;
    eEls.title.value = x.title || '';
    eEls.type.value = x.type || 'minimal-pair';
    const desc = x.content && (x.content.description || (typeof x.content === 'string' ? x.content : ''));
    eEls.description.value = desc || '';
    eEls.modalTitle.textContent = 'Edit exercise';
    eEls.publish.textContent = 'Save changes';
  }
  function openExerciseModal(x) {
    if (x) fillExerciseForm(x);
    else {
      resetExerciseForm();
      eEls.modalTitle.textContent = 'Add exercise';
      eEls.publish.textContent = 'Publish';
    }
    window.openModal('modal-exercise');
  }
  document.querySelector('[data-open-modal="modal-exercise"]')
    ?.addEventListener('click', () => openExerciseModal(null));

  document.getElementById('form-exercise').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast('Read-only access', 'error');
    const id = eEls.id.value;
    const body = {
      title: eEls.title.value.trim(),
      type: eEls.type.value,
      content: { description: eEls.description.value.trim() }
    };
    if (!body.title || !body.type) return showMsg('exercise-msg', 'Title and type are required', 'error');
    const url = id ? `/api/admin/exercises/${id}` : '/api/admin/exercises';
    const method = id ? 'PUT' : 'POST';
    const r = await window.api(url, { method, body });
    if (r.ok) {
      window.closeModal('modal-exercise');
      toast(id ? 'Exercise updated' : 'Exercise published');
      loadExercises();
    } else {
      showMsg('exercise-msg', r.data.error || 'Failed', 'error');
    }
  });

  // =========================================================
  // CONTENT — list loaders for the Content tab
  // =========================================================
  let topicsCache = [], lessonsCache = [], materialsCache = [], exercisesCache = [];

  async function loadTopics() {
    const { ok, data } = await window.api('/api/admin/topics');
    const tbody = document.querySelector('#topics-table tbody');
    if (!ok) { tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Could not load.</td></tr>`; return; }
    topicsCache = data.topics || [];
    document.getElementById('topics-count').textContent =
      ` · ${topicsCache.length} total (${topicsCache.filter(t => t.draft).length} drafts)`;
    if (topicsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No topics yet.</td></tr>`; return;
    }
    tbody.innerHTML = topicsCache.map(t => `
      <tr>
        <td>${esc(t.title)}</td>
        <td>${t.part}</td>
        <td>${esc(t.category)}</td>
        <td>${t.draft ? '<span class="badge-draft">Draft</span>' : '<span class="badge-published">Published</span>'}</td>
        <td style="text-align:right">
          ${isAdmin
            ? `<button class="btn btn-ghost btn-sm" data-edit-topic="${t.id}">Edit</button>
               <button class="btn btn-ghost btn-sm" data-del-topic="${t.id}" style="margin-left:6px">Delete</button>`
            : '<span class="muted-inline">view only</span>'}
        </td>
      </tr>
    `).join('');
    if (isAdmin) {
      tbody.querySelectorAll('[data-edit-topic]').forEach(b => b.addEventListener('click', () => {
        const t = topicsCache.find(x => x.id === Number(b.getAttribute('data-edit-topic')));
        if (t) openTopicModal(t);
      }));
      tbody.querySelectorAll('[data-del-topic]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this topic? This cannot be undone.')) return;
        const id = b.getAttribute('data-del-topic');
        const r = await window.api(`/api/admin/topics/${id}`, { method: 'DELETE' });
        if (r.ok) { toast('Topic deleted'); loadTopics(); }
        else toast(r.data.error || 'Delete failed', 'error');
      }));
    }
  }

  async function loadLessons() {
    const { ok, data } = await window.api('/api/admin/shadowing');
    const tbody = document.querySelector('#lessons-table tbody');
    if (!ok) { tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Could not load.</td></tr>`; return; }
    lessonsCache = data.lessons || [];
    document.getElementById('lessons-count').textContent = ` · ${lessonsCache.length} total`;
    if (lessonsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No lessons yet.</td></tr>`; return;
    }
    tbody.innerHTML = lessonsCache.map(l => {
      const src = l.video_source || 'youtube';
      const badge = src === 'cloudinary'
        ? `<span class="src-badge src-cloudinary" title="Cloudinary">☁︎</span>`
        : `<span class="src-badge src-youtube" title="YouTube">YT</span>`;
      const thumb = (src === 'cloudinary' && l.thumbnail_url)
        ? `<img class="row-thumb" src="${esc(l.thumbnail_url)}" alt="">` : '';
      return `
        <tr>
          <td>
            <div class="lesson-row-title">${thumb}
              <div class="lesson-row-title-text">${badge} ${esc(l.title)}</div>
            </div>
          </td>
          <td><span class="badge badge-level-${l.level}">${esc(l.level)}</span></td>
          <td>${l.sentence_count || 0}</td>
          <td>${Array.isArray(l.phrases) ? l.phrases.length : 0}</td>
          <td style="text-align:right">
            <a class="btn btn-ghost btn-sm" href="/shadowing-lesson.html?id=${l.id}" target="_blank">View</a>
            ${isAdmin
              ? `<button class="btn btn-ghost btn-sm" data-edit-lesson="${l.id}" style="margin-left:6px">Edit</button>
                 <button class="btn btn-ghost btn-sm" data-del-lesson="${l.id}" style="margin-left:6px">Delete</button>`
              : ''}
          </td>
        </tr>`;
    }).join('');
    if (isAdmin) {
      tbody.querySelectorAll('[data-edit-lesson]').forEach(b => b.addEventListener('click', () => {
        const l = lessonsCache.find(x => x.id === Number(b.getAttribute('data-edit-lesson')));
        if (l) openLessonModal(l);
      }));
      tbody.querySelectorAll('[data-del-lesson]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this lesson? Sentences cascade.')) return;
        const id = b.getAttribute('data-del-lesson');
        const r = await window.api(`/api/admin/shadowing/${id}`, { method: 'DELETE' });
        if (r.ok) { toast('Lesson deleted'); loadLessons(); }
        else toast(r.data.error || 'Delete failed', 'error');
      }));
    }
  }

  async function loadMaterials() {
    const { ok, data } = await window.api('/api/admin/materials');
    const tbody = document.querySelector('#materials-table tbody');
    if (!ok) { tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Could not load.</td></tr>`; return; }
    materialsCache = data.materials || [];
    document.getElementById('materials-count').textContent = ` · ${materialsCache.length} total`;
    if (materialsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No materials yet.</td></tr>`; return;
    }
    tbody.innerHTML = materialsCache.map(m => `
      <tr>
        <td>${esc(m.title)}</td>
        <td>${esc(m.category)}</td>
        <td>${esc(m.file_size || '')}</td>
        <td>${fmtDate(m.created_at)}</td>
        <td style="text-align:right">
          <a class="btn btn-ghost btn-sm" href="${esc(m.file_url)}" target="_blank" rel="noopener">Open</a>
          ${isAdmin ? `<button class="btn btn-ghost btn-sm" data-del-mat="${m.id}" style="margin-left:6px">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
    if (isAdmin) {
      tbody.querySelectorAll('[data-del-mat]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this material?')) return;
        const id = b.getAttribute('data-del-mat');
        const r = await window.api(`/api/admin/materials/${id}`, { method: 'DELETE' });
        if (r.ok) { toast('Material deleted'); loadMaterials(); }
        else toast(r.data.error || 'Delete failed', 'error');
      }));
    }
  }

  async function loadExercises() {
    const { ok, data } = await window.api('/api/admin/exercises');
    const tbody = document.querySelector('#exercises-table tbody');
    if (!ok) { tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Could not load.</td></tr>`; return; }
    exercisesCache = data.exercises || [];
    document.getElementById('exercises-count').textContent = ` · ${exercisesCache.length} total`;
    if (exercisesCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">No exercises yet.</td></tr>`; return;
    }
    tbody.innerHTML = exercisesCache.map(x => `
      <tr>
        <td>${esc(x.title)}</td>
        <td><span class="muted-inline">${esc(x.type)}</span></td>
        <td>${fmtDate(x.created_at)}</td>
        <td style="text-align:right">
          ${isAdmin
            ? `<button class="btn btn-ghost btn-sm" data-edit-ex="${x.id}">Edit</button>
               <button class="btn btn-ghost btn-sm" data-del-ex="${x.id}" style="margin-left:6px">Delete</button>`
            : '<span class="muted-inline">view only</span>'}
        </td>
      </tr>
    `).join('');
    if (isAdmin) {
      tbody.querySelectorAll('[data-edit-ex]').forEach(b => b.addEventListener('click', () => {
        const x = exercisesCache.find(e => e.id === Number(b.getAttribute('data-edit-ex')));
        if (x) openExerciseModal(x);
      }));
      tbody.querySelectorAll('[data-del-ex]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this exercise?')) return;
        const id = b.getAttribute('data-del-ex');
        const r = await window.api(`/api/admin/exercises/${id}`, { method: 'DELETE' });
        if (r.ok) { toast('Exercise deleted'); loadExercises(); }
        else toast(r.data.error || 'Delete failed', 'error');
      }));
    }
  }

  window.loadAdminContent = function () {
    loadTopics(); loadLessons(); loadMaterials(); loadExercises();
  };

  // =========================================================
  // STUDENTS tab
  // =========================================================
  let studentsCache = [], studentsSearch = '';
  function renderStudents() {
    const tbody = document.querySelector('#students-table tbody');
    const q = studentsSearch.trim().toLowerCase();
    const list = q
      ? studentsCache.filter(u =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.display_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q))
      : studentsCache;
    document.getElementById('students-count').textContent = ` · ${list.length} of ${studentsCache.length}`;
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No matches.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(u => {
      const roleCell = isAdmin
        ? `<select class="role-select" data-role-uid="${u.id}" ${u.id === user.id ? 'disabled' : ''}>
             <option value="student" ${u.role === 'student' ? 'selected' : ''}>student</option>
             <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>teacher</option>
             <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>admin</option>
           </select>`
        : `<span class="role-tag role-${esc(u.role)}">${esc(u.role)}</span>`;
      let actions = '';
      if (isAdmin) {
        if (u.status !== 'active') actions += `<button class="btn btn-ghost btn-sm" data-approve="${u.id}">Approve</button> `;
        if (u.role !== 'admin')    actions += `<button class="btn btn-ghost btn-sm" data-remove="${u.id}">Remove</button>`;
      } else {
        actions = '<span class="muted-inline">view only</span>';
      }
      return `
        <tr>
          <td>${esc(u.display_name || u.name || '—')}</td>
          <td>${esc(u.email)}</td>
          <td>${roleCell}</td>
          <td><span class="status-${u.status === 'active' ? 'active' : 'pending'}">${esc(u.status || 'pending')}</span></td>
          <td>${fmtDate(u.created_at)}</td>
          <td style="text-align:right">${actions}</td>
        </tr>`;
    }).join('');

    if (isAdmin) {
      tbody.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
        const r = await window.api(`/api/admin/users/${b.getAttribute('data-approve')}/approve`, { method: 'POST' });
        if (r.ok) { toast('Approved'); window.loadAdminStudents(); }
        else toast(r.data.error || 'Failed', 'error');
      }));
      tbody.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove this user?')) return;
        const r = await window.api(`/api/admin/users/${b.getAttribute('data-remove')}`, { method: 'DELETE' });
        if (r.ok) { toast('User removed'); window.loadAdminStudents(); }
        else toast(r.data.error || 'Failed', 'error');
      }));
      tbody.querySelectorAll('[data-role-uid]').forEach(sel => sel.addEventListener('change', async () => {
        const r = await window.api(`/api/admin/users/${sel.getAttribute('data-role-uid')}/role`,
          { method: 'POST', body: { role: sel.value } });
        if (r.ok) toast('Role updated');
        else { toast(r.data.error || 'Could not change role', 'error'); window.loadAdminStudents(); }
      }));
    }
  }
  window.loadAdminStudents = async function () {
    const { ok, data } = await window.api('/api/admin/users');
    const tbody = document.querySelector('#students-table tbody');
    if (!ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Could not load.</td></tr>`;
      return;
    }
    studentsCache = data.users || [];
    renderStudents();
  };
  document.getElementById('students-search')?.addEventListener('input', (e) => {
    studentsSearch = e.target.value;
    renderStudents();
  });

  // =========================================================
  // STATS tab — overview + leaderboards
  // =========================================================
  window.loadAdminSiteStats = async function () {
    const grid = document.getElementById('site-stats-grid');
    grid.innerHTML = `<div class="empty-row" style="grid-column:1/-1;padding:24px;text-align:center">Loading…</div>`;
    const { ok, data } = await window.api('/api/admin/site-stats');
    if (!ok) {
      grid.innerHTML = `<div class="empty-row" style="grid-column:1/-1;padding:24px;text-align:center">${esc(data.error || 'Could not load')}</div>`;
      return;
    }
    const s = data.stats;
    const cards = [
      { label: 'Total users',    num: s.total_users,    sub: `+${s.new_users_week} this week` },
      { label: 'Lessons',        num: s.total_lessons,  sub: `${s.total_sentences} sentences` },
      { label: 'Topics',         num: s.total_topics,   sub: `${s.published_topics} published · ${s.draft_topics} drafts` },
      { label: 'Materials',      num: s.total_materials,sub: `${s.total_exercises || 0} exercises` }
    ];
    grid.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-card-label">${esc(c.label)}</div>
        <div class="stat-card-num">${c.num}</div>
        <div class="stat-card-sub">${esc(c.sub)}</div>
      </div>
    `).join('');

    const mw = document.getElementById('most-watched-list');
    const mp = document.getElementById('most-practiced-list');
    if (data.most_watched_lessons && data.most_watched_lessons.length) {
      mw.innerHTML = data.most_watched_lessons.map((l, i) => `
        <div class="leader-row">
          <span class="leader-rank">${i + 1}</span>
          <a href="/shadowing-lesson.html?id=${l.id}" class="leader-title">${esc(l.title)}</a>
          <span class="leader-count">${l.practiced_by} ${l.practiced_by === 1 ? 'user' : 'users'}</span>
        </div>
      `).join('');
    } else {
      mw.innerHTML = `<div class="muted-inline" style="padding:16px;text-align:center">No watch data yet.</div>`;
    }
    if (data.most_practiced_topics && data.most_practiced_topics.length) {
      mp.innerHTML = data.most_practiced_topics.map((t, i) => `
        <div class="leader-row">
          <span class="leader-rank">${i + 1}</span>
          <span class="leader-title">${esc(t.title)}</span>
          <span class="leader-count">${t.times_studied}</span>
        </div>
      `).join('');
    } else {
      mp.innerHTML = `<div class="muted-inline" style="padding:16px;text-align:center">No practice data yet.</div>`;
    }
  };

  // If the user landed directly on a deep-linked tab via #content / #students
  // / #stats before profile.js called the loader, double-check by triggering
  // the right load now.
  const initial = (location.hash || '').replace(/^#/, '');
  if (initial === 'content')  window.loadAdminContent();
  if (initial === 'students') window.loadAdminStudents();
  if (initial === 'stats')    window.loadAdminSiteStats();
})();
