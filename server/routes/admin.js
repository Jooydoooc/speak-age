// /api/admin/* — content + user management.
//
// Role model:
//   admin   — full read + write everywhere
//   teacher — read-only browse of every admin-side resource (lists, stats,
//             student table); every write returns 403 Forbidden
//   student — denied at every admin endpoint

const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { sql, ensureInit } = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Video upload — up to 500 MB, mp4 / mov / webm. NOTE: serverless hosts often
// cap request body size (Vercel = 4.5 MB on most plans), so very large videos
// will fail with 413 on the deployed app even though the limit allows it. For
// big-file production use, swap this for a signed direct-to-Cloudinary upload.
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo'
    ]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported video format — use mp4, mov, or webm'));
  }
});

// Role gates
//   staffRead  — admin OR teacher; for read-only browsing of admin content
//                (lists, stats, viewing the users table)
//   adminOnly  — admin only; for any write (POST / PUT / DELETE) and for
//                user-management actions (approve, remove, change role)
const staffRead  = requireRole('admin', 'teacher');
const adminOnly  = requireRole('admin');

// ---------- Site stats ----------
router.get('/site-stats', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users)                                                            AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'admin')                                        AS admins,
        (SELECT COUNT(*)::int FROM users WHERE role = 'teacher')                                      AS teachers,
        (SELECT COUNT(*)::int FROM users WHERE role = 'student')                                      AS students,
        (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days')                AS new_users_week,
        (SELECT COUNT(*)::int FROM topics)                                                            AS total_topics,
        (SELECT COUNT(*)::int FROM topics WHERE draft = FALSE)                                        AS published_topics,
        (SELECT COUNT(*)::int FROM topics WHERE draft = TRUE)                                         AS draft_topics,
        (SELECT COUNT(*)::int FROM shadowing_lessons)                                                 AS total_lessons,
        (SELECT COUNT(*)::int FROM materials)                                                         AS total_materials,
        (SELECT COUNT(*)::int FROM sentences)                                                         AS total_sentences,
        (SELECT COUNT(*)::int FROM exercises)                                                         AS total_exercises
    `;
    // Top 5 lessons by how many distinct users have practiced any of their sentences.
    const mostWatched = await sql`
      SELECT l.id, l.title, COALESCE(COUNT(DISTINCT p.user_id), 0)::int AS practiced_by
      FROM shadowing_lessons l
      LEFT JOIN user_lesson_progress p ON p.lesson_id = l.id
                                       AND COALESCE(array_length(p.sentences_completed, 1), 0) > 0
      GROUP BY l.id, l.title
      ORDER BY practiced_by DESC, l.id ASC
      LIMIT 5
    `;
    // Top 5 topics by total times they appear in activity_log under topic_studied.
    const mostPracticed = await sql`
      SELECT t.id, t.title,
             COALESCE(COUNT(a.id), 0)::int AS times_studied
      FROM topics t
      LEFT JOIN activity_log a
        ON a.action = 'topic_studied' AND a.detail LIKE '%' || t.title || '%'
      GROUP BY t.id, t.title
      ORDER BY times_studied DESC, t.id ASC
      LIMIT 5
    `;
    res.json({
      stats,
      most_watched_lessons: mostWatched,
      most_practiced_topics: mostPracticed
    });
  } catch (e) {
    console.error('admin site-stats', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Users ----------
router.get('/users', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, name, display_name, email, role, status, avatar_url, created_at
      FROM users ORDER BY created_at DESC
    `;
    res.json({ users: rows });
  } catch (e) {
    console.error('admin users', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users/:id/approve', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    await sql`UPDATE users SET status = 'active' WHERE id = ${id}`;
    res.json({ ok: true });
  } catch (e) {
    console.error('admin approve', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users/:id/role', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const { role } = req.body || {};
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be student, teacher, or admin' });
    }
    // Block demoting the only admin so we don't lock the site out.
    const target = await sql`SELECT id, role FROM users WHERE id = ${id}`;
    if (target.length === 0) return res.status(404).json({ error: 'User not found' });
    if (target[0].role === 'admin' && role !== 'admin') {
      const admins = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`;
      if (admins[0].n <= 1) return res.status(400).json({ error: 'Cannot demote the only admin' });
    }
    await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
    res.json({ ok: true, id, role });
  } catch (e) {
    console.error('admin user role', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    // Block deleting the only admin
    const admins = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`;
    const target = await sql`SELECT role FROM users WHERE id = ${id}`;
    if (target[0] && target[0].role === 'admin' && admins[0].n <= 1) {
      return res.status(400).json({ error: 'Cannot remove the only admin' });
    }
    await sql`DELETE FROM users WHERE id = ${id}`;
    res.json({ ok: true });
  } catch (e) {
    console.error('admin delete user', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Topics ----------
// Admin list (includes drafts).
router.get('/topics', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, title, part, category, questions, answer_65, answer_80, draft,
             created_at, updated_at
      FROM topics ORDER BY draft DESC, updated_at DESC
    `;
    res.json({ topics: rows });
  } catch (e) {
    console.error('admin topics list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/topics', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const { title, part, category, questions, answer_65, answer_80, draft } = req.body || {};
    if (!title || !part || !category || !questions || !answer_65 || !answer_80) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (![1, 2, 3].includes(Number(part))) return res.status(400).json({ error: 'Invalid part' });
    const rows = await sql`
      INSERT INTO topics (title, part, category, questions, answer_65, answer_80, draft, created_by)
      VALUES (${title}, ${Number(part)}, ${category}, ${questions}, ${answer_65}, ${answer_80}, ${!!draft}, ${req.user.id})
      RETURNING id
    `;
    res.json({ id: rows[0].id });
  } catch (e) {
    console.error('admin topic add', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/topics/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const { title, part, category, questions, answer_65, answer_80, draft } = req.body || {};
    if (!title || !part || !category || !questions || !answer_65 || !answer_80) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (![1, 2, 3].includes(Number(part))) return res.status(400).json({ error: 'Invalid part' });
    const result = await sql`
      UPDATE topics
      SET title = ${title}, part = ${Number(part)}, category = ${category},
          questions = ${questions}, answer_65 = ${answer_65}, answer_80 = ${answer_80},
          draft = ${!!draft}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Topic not found' });
    res.json({ id: result[0].id });
  } catch (e) {
    console.error('admin topic update', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/topics/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const result = await sql`DELETE FROM topics WHERE id = ${id} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Topic not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin topic delete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Shadowing lessons ----------
// Parses timestamp prefixes like [0:12], [1:23], [1:02:34] from a transcript.
// Each non-empty line becomes one sentence. Lines without a valid timestamp
// inherit the previous timestamp + 1 second (so we never error out on input).
function parseTranscript(transcript) {
  const lines = String(transcript || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const re = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/;
  const sentences = [];
  let lastTs = 0;
  for (const line of lines) {
    const m = line.match(re);
    let ts, text;
    if (m) {
      const h = m[1] ? Number(m[1]) : 0;
      const min = Number(m[2]);
      const sec = Number(m[3]);
      ts = h * 3600 + min * 60 + sec;
      text = m[4].trim();
    } else {
      ts = lastTs + 1;
      text = line;
    }
    if (text) {
      sentences.push({ idx: sentences.length, ts_seconds: ts, text });
      lastTs = ts;
    }
  }
  return sentences;
}

function validateLessonBody(body) {
  const b = body || {};
  if (!b.title || !b.level || !b.transcript) {
    return 'Title, level and transcript are required';
  }
  if (!['Beginner', 'Elementary', 'Pre-IELTS', 'Introduction', 'Graduation'].includes(b.level)) return 'Invalid level';
  const source = b.video_source || 'youtube';
  if (source === 'youtube' && !b.youtube_url) return 'YouTube URL is required';
  if (source === 'cloudinary' && !b.video_url) return 'Upload a video before saving';
  if (source !== 'youtube' && source !== 'cloudinary') return 'Invalid video_source';
  return null;
}

// Transcript offset is a positive (usually) float in seconds. We clamp to a
// generous ±5 min window so an accidental keystroke can't push playback far
// into invalid territory.
function sanitiseOffset(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-300, Math.min(300, n));
}

// Coerce a `phrases` payload into a clean array of {phrase, meaning, example, ts_seconds}.
function normalisePhrases(input) {
  if (!input) return [];
  let arr = input;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map(p => ({
      phrase:     String(p.phrase || '').slice(0, 200).trim(),
      meaning:    String(p.meaning || '').slice(0, 500).trim(),
      example:    String(p.example || '').slice(0, 500).trim(),
      ts_seconds: Number.isFinite(Number(p.ts_seconds)) ? Math.max(0, Math.floor(Number(p.ts_seconds))) : 0
    }))
    .filter(p => p.phrase);
}

router.get('/shadowing', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT l.id, l.title, l.youtube_url, l.level, l.duration, l.topic,
             l.transcript, l.key_phrases, l.phrases, l.created_at,
             l.video_source, l.video_url, l.cloudinary_public_id,
             l.thumbnail_url, l.duration_seconds, l.offset_seconds,
             (SELECT COUNT(*)::int FROM sentences s WHERE s.lesson_id = l.id) AS sentence_count
      FROM shadowing_lessons l ORDER BY l.created_at DESC
    `;
    res.json({ lessons: rows });
  } catch (e) {
    console.error('admin shadowing list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Video upload — uploads to Cloudinary as resource_type=video and returns
// the canonical URL, public_id, duration (seconds), and a JPG thumbnail URL.
router.post('/upload-video', adminOnly, (req, res) => {
  videoUpload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Video exceeds the 500 MB limit' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(500).json({ error: 'Cloudinary not configured on the server' });
      }
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'speak-age/shadowing-lessons',
            quality: 'auto',
            format: 'mp4'
          },
          (e, r) => e ? reject(e) : resolve(r)
        );
        stream.end(req.file.buffer);
      });
      const thumbnail = cloudinary.url(result.public_id, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [{ width: 640, height: 360, crop: 'fill', gravity: 'auto' }]
      });
      res.json({
        url: result.secure_url,
        public_id: result.public_id,
        duration: Math.round(Number(result.duration) || 0),
        thumbnail_url: thumbnail
      });
    } catch (e) {
      console.error('upload-video', e);
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

router.post('/shadowing', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const err = validateLessonBody(req.body);
    if (err) return res.status(400).json({ error: err });

    const b = req.body;
    const phrasesJson = normalisePhrases(b.phrases);
    const source = b.video_source || 'youtube';
    const offsetSeconds = sanitiseOffset(b.offset_seconds);

    const rows = await sql`
      INSERT INTO shadowing_lessons (
        title, youtube_url, level, duration, topic, transcript, key_phrases,
        phrases, video_source, video_url, cloudinary_public_id, thumbnail_url,
        duration_seconds, offset_seconds, created_by
      )
      VALUES (
        ${b.title}, ${b.youtube_url || null}, ${b.level}, ${b.duration || ''},
        ${b.topic || ''}, ${b.transcript}, ${b.key_phrases || ''},
        ${JSON.stringify(phrasesJson)}::jsonb,
        ${source}, ${b.video_url || null}, ${b.cloudinary_public_id || null},
        ${b.thumbnail_url || null}, ${b.duration_seconds || null},
        ${offsetSeconds}, ${req.user.id}
      )
      RETURNING id
    `;
    const lessonId = rows[0].id;

    const parsed = parseTranscript(b.transcript);
    for (const s of parsed) {
      await sql`
        INSERT INTO sentences (lesson_id, idx, ts_seconds, text)
        VALUES (${lessonId}, ${s.idx}, ${s.ts_seconds}, ${s.text})
      `;
    }

    res.json({ id: lessonId, sentence_count: parsed.length });
  } catch (e) {
    console.error('admin lesson add', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/shadowing/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const err = validateLessonBody(req.body);
    if (err) return res.status(400).json({ error: err });

    const b = req.body;
    const phrasesJson = normalisePhrases(b.phrases);
    const source = b.video_source || 'youtube';
    const offsetSeconds = sanitiseOffset(b.offset_seconds);

    const updated = await sql`
      UPDATE shadowing_lessons
      SET title = ${b.title}, youtube_url = ${b.youtube_url || null}, level = ${b.level},
          duration = ${b.duration || ''}, topic = ${b.topic || ''},
          transcript = ${b.transcript}, key_phrases = ${b.key_phrases || ''},
          phrases = ${JSON.stringify(phrasesJson)}::jsonb,
          video_source = ${source},
          video_url = ${b.video_url || null},
          cloudinary_public_id = ${b.cloudinary_public_id || null},
          thumbnail_url = ${b.thumbnail_url || null},
          duration_seconds = ${b.duration_seconds || null},
          offset_seconds = ${offsetSeconds}
      WHERE id = ${id}
      RETURNING id
    `;
    if (updated.length === 0) return res.status(404).json({ error: 'Lesson not found' });

    // Replace sentences in full (simpler than diffing).
    await sql`DELETE FROM sentences WHERE lesson_id = ${id}`;
    const parsed = parseTranscript(b.transcript);
    for (const s of parsed) {
      await sql`
        INSERT INTO sentences (lesson_id, idx, ts_seconds, text)
        VALUES (${id}, ${s.idx}, ${s.ts_seconds}, ${s.text})
      `;
    }

    res.json({ id, sentence_count: parsed.length });
  } catch (e) {
    console.error('admin lesson update', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/shadowing/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const r = await sql`DELETE FROM shadowing_lessons WHERE id = ${id} RETURNING id`;
    if (r.length === 0) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin lesson delete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Materials (PDF upload via Cloudinary) ----------
// ---------- Materials (list + delete) ----------
router.get('/materials', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, title, category, file_url, file_size, created_at
      FROM materials ORDER BY created_at DESC
    `;
    res.json({ materials: rows });
  } catch (e) {
    console.error('admin materials list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/materials/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const r = await sql`DELETE FROM materials WHERE id = ${id} RETURNING id`;
    if (r.length === 0) return res.status(404).json({ error: 'Material not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin material delete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Exercises CRUD ----------
router.get('/exercises', staffRead, async (_req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT id, type, title, content, created_at
      FROM exercises ORDER BY created_at DESC
    `;
    res.json({ exercises: rows });
  } catch (e) {
    console.error('admin exercises list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/exercises', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const { type, title, content } = req.body || {};
    if (!type || !title) return res.status(400).json({ error: 'Type and title required' });
    const safeContent = typeof content === 'object' && content !== null
      ? content
      : { description: String(content || '') };
    const [row] = await sql`
      INSERT INTO exercises (type, title, content)
      VALUES (${type}, ${title}, ${JSON.stringify(safeContent)}::jsonb)
      RETURNING id
    `;
    res.json({ id: row.id });
  } catch (e) {
    console.error('admin exercise add', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/exercises/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const { type, title, content } = req.body || {};
    if (!type || !title) return res.status(400).json({ error: 'Type and title required' });
    const safeContent = typeof content === 'object' && content !== null
      ? content
      : { description: String(content || '') };
    const r = await sql`
      UPDATE exercises SET type = ${type}, title = ${title}, content = ${JSON.stringify(safeContent)}::jsonb
      WHERE id = ${id} RETURNING id
    `;
    if (r.length === 0) return res.status(404).json({ error: 'Exercise not found' });
    res.json({ id });
  } catch (e) {
    console.error('admin exercise update', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/exercises/:id', adminOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    const r = await sql`DELETE FROM exercises WHERE id = ${id} RETURNING id`;
    if (r.length === 0) return res.status(404).json({ error: 'Exercise not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin exercise delete', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/materials', adminOnly, upload.single('file'), async (req, res) => {
  try {
    await ensureInit();
    const { title, category } = req.body || {};
    if (!title || !category || !req.file) return res.status(400).json({ error: 'Title, category and file are required' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDFs are allowed' });

    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(500).json({ error: 'Cloudinary not configured' });

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'speak_age/materials' },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    const sizeKB = Math.round(req.file.size / 1024);
    const sizeLabel = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';

    const rows = await sql`
      INSERT INTO materials (title, category, file_url, file_size, created_by)
      VALUES (${title}, ${category}, ${uploadResult.secure_url}, ${sizeLabel}, ${req.user.id})
      RETURNING id
    `;
    res.json({ id: rows[0].id, file_url: uploadResult.secure_url });
  } catch (e) {
    console.error('admin material upload', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
