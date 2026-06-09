// /api/recordings — student submission + teacher review pipeline.
//
//   POST   /                 student submits an audio recording
//   GET    /mine             student lists own recordings (with feedback)
//   GET    /                 staff inbox (admin or teacher; ?status= filter)
//   GET    /:id              staff fetches one recording + feedback
//   POST   /:id/feedback     admin/teacher scores a recording (5 sub-scores
//                            + estimated band + written feedback + status)
//
// Audio upload uses Cloudinary as resource_type=video (Cloudinary treats
// audio files this way). We cap files at 4 MB so the request body stays under
// Vercel's serverless body limit on Hobby (~4.5 MB).

const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { sql, ensureInit } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  recomputeSpeakingProgress,
  updateStreak,
  checkAndAwardBadges
} = require('../lib/awards');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'
]);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },  // 4 MB — fits under Vercel body cap
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported audio format — use webm, mp3, mp4, m4a, ogg, or wav'));
  }
});

const staffOnly = requireRole('admin', 'teacher');

// ---------- Student: submit ----------
router.post('/', requireAuth, (req, res) => {
  audioUpload.single('audio')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Recording is too large (max 4 MB).' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    try {
      await ensureInit();
      if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
      if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(500).json({ error: 'Cloudinary not configured' });

      const topicId = req.body.topic_id ? Number(req.body.topic_id) : null;
      const part    = req.body.part ? Number(req.body.part) : null;
      if (part !== null && ![1, 2, 3].includes(part)) {
        return res.status(400).json({ error: 'part must be 1, 2, or 3' });
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'video', folder: 'speak-age/recordings' },
          (e, r) => e ? reject(e) : resolve(r)
        );
        stream.end(req.file.buffer);
      });

      const duration = Math.round(Number(uploadResult.duration) || 0);

      const inserted = await sql`
        INSERT INTO recordings (user_id, topic_id, part, cloudinary_url, cloudinary_public_id, duration_sec)
        VALUES (${req.user.id}, ${topicId}, ${part}, ${uploadResult.secure_url}, ${uploadResult.public_id}, ${duration})
        RETURNING id, status, created_at
      `;
      const recording = inserted[0];

      // Activity log + streak + badge checks. These never block the response.
      try {
        await sql`
          INSERT INTO activity_log (user_id, action, detail)
          VALUES (${req.user.id}, 'recording_submitted', ${'Recording #' + recording.id})
        `;
        await updateStreak(req.user.id);
        await recomputeSpeakingProgress(req.user.id);
        const newBadges = await checkAndAwardBadges(req.user.id);
        return res.json({ id: recording.id, status: recording.status, duration_sec: duration, new_badges: newBadges });
      } catch (e) {
        console.error('recording side-effects', e);
        return res.json({ id: recording.id, status: recording.status, duration_sec: duration, new_badges: [] });
      }
    } catch (e) {
      console.error('recordings submit', e);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

// ---------- Student: list own ----------
router.get('/mine', requireAuth, async (req, res) => {
  try {
    await ensureInit();
    const rows = await sql`
      SELECT r.id, r.topic_id, r.part, r.cloudinary_url, r.duration_sec,
             r.status, r.created_at,
             t.title AS topic_title,
             f.fluency, f.pronunciation, f.grammar, f.vocabulary, f.coherence,
             f.estimated_band, f.written_feedback, f.reviewed_at,
             u.display_name AS reviewer_name
      FROM recordings r
      LEFT JOIN topics t ON t.id = r.topic_id
      LEFT JOIN recording_feedback f ON f.recording_id = r.id
      LEFT JOIN users u ON u.id = f.reviewed_by
      WHERE r.user_id = ${req.user.id}
      ORDER BY r.created_at DESC
    `;
    res.json({ recordings: rows });
  } catch (e) {
    console.error('recordings mine', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Staff: inbox ----------
router.get('/', staffOnly, async (req, res) => {
  try {
    await ensureInit();
    const status = req.query.status;
    const allowed = new Set(['submitted', 'reviewed', 'needs_improvement']);

    const rows = (status && allowed.has(status))
      ? await sql`
          SELECT r.id, r.user_id, r.topic_id, r.part, r.cloudinary_url, r.duration_sec,
                 r.status, r.created_at,
                 t.title AS topic_title,
                 u.display_name AS student_name, u.email AS student_email
          FROM recordings r
          LEFT JOIN topics t ON t.id = r.topic_id
          LEFT JOIN users u ON u.id = r.user_id
          WHERE r.status = ${status}
          ORDER BY r.created_at DESC
        `
      : await sql`
          SELECT r.id, r.user_id, r.topic_id, r.part, r.cloudinary_url, r.duration_sec,
                 r.status, r.created_at,
                 t.title AS topic_title,
                 u.display_name AS student_name, u.email AS student_email
          FROM recordings r
          LEFT JOIN topics t ON t.id = r.topic_id
          LEFT JOIN users u ON u.id = r.user_id
          ORDER BY r.created_at DESC
          LIMIT 200
        `;
    res.json({ recordings: rows });
  } catch (e) {
    console.error('recordings staff list', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Staff: one + existing feedback ----------
router.get('/:id', staffOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad id' });
    const rows = await sql`
      SELECT r.id, r.user_id, r.topic_id, r.part, r.cloudinary_url, r.duration_sec,
             r.status, r.created_at,
             t.title AS topic_title, t.questions AS topic_questions,
             u.display_name AS student_name, u.email AS student_email,
             f.fluency, f.pronunciation, f.grammar, f.vocabulary, f.coherence,
             f.estimated_band, f.written_feedback, f.reviewed_at,
             ru.display_name AS reviewer_name
      FROM recordings r
      LEFT JOIN topics t ON t.id = r.topic_id
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN recording_feedback f ON f.recording_id = r.id
      LEFT JOIN users ru ON ru.id = f.reviewed_by
      WHERE r.id = ${id}
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ recording: rows[0] });
  } catch (e) {
    console.error('recordings staff get', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Staff: write feedback ----------
router.post('/:id/feedback', staffOnly, async (req, res) => {
  try {
    await ensureInit();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad id' });

    const b = req.body || {};
    const scoreOrNull = (v) => {
      if (v === '' || v == null) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 9) return 'INVALID';
      return n;
    };
    const fluency       = scoreOrNull(b.fluency);
    const pronunciation = scoreOrNull(b.pronunciation);
    const grammar       = scoreOrNull(b.grammar);
    const vocabulary    = scoreOrNull(b.vocabulary);
    const coherence     = scoreOrNull(b.coherence);
    const band          = scoreOrNull(b.estimated_band);
    for (const v of [fluency, pronunciation, grammar, vocabulary, coherence, band]) {
      if (v === 'INVALID') return res.status(400).json({ error: 'Scores must be numbers between 0 and 9' });
    }

    const written = String(b.written_feedback || '').slice(0, 4000);
    const statusIn = b.status || 'reviewed';
    const allowedStatus = new Set(['reviewed', 'needs_improvement']);
    if (!allowedStatus.has(statusIn)) {
      return res.status(400).json({ error: 'status must be reviewed or needs_improvement' });
    }

    const rec = await sql`SELECT id, user_id FROM recordings WHERE id = ${id}`;
    if (rec.length === 0) return res.status(404).json({ error: 'Recording not found' });
    const studentId = rec[0].user_id;

    await sql`
      INSERT INTO recording_feedback (
        recording_id, fluency, pronunciation, grammar, vocabulary, coherence,
        estimated_band, written_feedback, reviewed_by, reviewed_at
      )
      VALUES (
        ${id}, ${fluency}, ${pronunciation}, ${grammar}, ${vocabulary}, ${coherence},
        ${band}, ${written}, ${req.user.id}, NOW()
      )
      ON CONFLICT (recording_id) DO UPDATE SET
        fluency          = EXCLUDED.fluency,
        pronunciation    = EXCLUDED.pronunciation,
        grammar          = EXCLUDED.grammar,
        vocabulary       = EXCLUDED.vocabulary,
        coherence        = EXCLUDED.coherence,
        estimated_band   = EXCLUDED.estimated_band,
        written_feedback = EXCLUDED.written_feedback,
        reviewed_by      = EXCLUDED.reviewed_by,
        reviewed_at      = NOW()
    `;
    await sql`UPDATE recordings SET status = ${statusIn} WHERE id = ${id}`;
    await sql`
      INSERT INTO activity_log (user_id, action, detail)
      VALUES (${studentId}, 'feedback_received', ${'Feedback on recording #' + id})
    `;

    await recomputeSpeakingProgress(studentId);
    const newBadges = await checkAndAwardBadges(studentId);

    res.json({ ok: true, status: statusIn, new_badges: newBadges });
  } catch (e) {
    console.error('recordings feedback', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
